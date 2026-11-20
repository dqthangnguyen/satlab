-- =============================================================================
-- MIGRATION 0007 - Triggers                                  [tier: Foundation]
-- STATUS : DRAFT for owner review. NOT applied. NOT executed by the author.
-- PURPOSE: Four database-level safeguards (defence in depth - they hold even
--          if a function has a bug or someone writes directly with the
--          service role / SQL editor):
--   T1  session_questions: only APPROVED versions may be assigned.
--   T2  question_versions lifecycle: insert as draft only; allowed status
--       transitions only; content locked after draft; timestamps stamped by
--       the trigger (callers cannot supply them); exactly four choices + key +
--       source required on draft -> pending_review; supersession validated;
--       only drafts can be deleted.
--   T3  choices / answer keys / sources can change only while their version
--       is draft.
--   T4  question_reviews is append-only (UPDATE / DELETE / TRUNCATE blocked).
-- DEPENDS ON: 0003, 0004, 0005, 0006.
-- SUPABASE ASSUMPTIONS: trigger functions are SECURITY DEFINER with an empty
--   search_path and owned by `postgres`, so they can read the private schema.
-- ERROR CODES (message text): version_not_approved, invalid_initial_status,
--   version_not_deletable, immutable_column, version_locked, invalid_transition,
--   incomplete_draft, superseded_by_locked, invalid_successor, reviews_are_append_only
-- =============================================================================

-- ---------------------------------------------------------------- T1 --------
create or replace function public.trg_session_questions_require_approved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.question_versions v
    where v.id = new.question_version_id and v.status = 'approved'
  ) then
    raise exception 'version_not_approved'
      using detail = 'Session items may only reference approved question versions.';
  end if;
  return new;
end;
$$;

create trigger session_questions_require_approved
before insert or update of question_version_id on public.session_questions
for each row execute function public.trg_session_questions_require_approved();

-- ---------------------------------------------------------------- T2 --------
create or replace function public.trg_question_versions_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_choice_count integer;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'invalid_initial_status'
        using detail = 'New versions must be inserted as draft.';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'version_not_deletable'
        using detail = 'Only draft versions can be deleted.';
    end if;
    return old;
  end if;

  -- ---- UPDATE ----
  if new.id is distinct from old.id
     or new.question_id is distinct from old.question_id
     or new.version_number is distinct from old.version_number then
    raise exception 'immutable_column'
      using detail = 'id, question_id and version_number never change.';
  end if;

  -- Timestamps are system-managed: discard whatever the caller supplied.
  new.submitted_at := old.submitted_at;
  new.approved_at  := old.approved_at;
  new.rejected_at  := old.rejected_at;
  new.archived_at  := old.archived_at;

  -- Content is locked once the version leaves draft.
  if old.status <> 'draft' and (
       new.skill_id, new.difficulty, new.passage, new.stem, new.created_by, new.created_at
     ) is distinct from (
       old.skill_id, old.difficulty, old.passage, old.stem, old.created_by, old.created_at
     ) then
    raise exception 'version_locked'
      using detail = 'Content of a non-draft version cannot change; create a new version.';
  end if;

  -- Status transitions.
  if new.status is distinct from old.status then
    if not (
         (old.status = 'draft'          and new.status = 'pending_review')
      or (old.status = 'pending_review' and new.status in ('approved', 'rejected'))
      or (old.status = 'approved'       and new.status = 'archived')
    ) then
      raise exception 'invalid_transition'
        using detail = format('%s -> %s is not an allowed transition.', old.status, new.status);
    end if;

    if new.status = 'pending_review' then
      new.submitted_at := now();
      select count(*) into v_choice_count
      from public.question_choices c
      where c.question_version_id = new.id;
      if v_choice_count <> 4
         or not exists (select 1 from private.question_answer_keys k where k.question_version_id = new.id)
         or not exists (select 1 from public.question_sources s     where s.question_version_id = new.id)
      then
        raise exception 'incomplete_draft'
          using detail = 'A version needs exactly four choices, an answer key and a source record before review.';
      end if;
    elsif new.status = 'approved' then
      new.approved_at := now();
    elsif new.status = 'rejected' then
      new.rejected_at := now();
    elsif new.status = 'archived' then
      new.archived_at := now();
    end if;
  end if;

  -- superseded_by_version_id may change only on approved -> archived, and the
  -- successor must be a LATER version of the SAME question.
  if new.superseded_by_version_id is distinct from old.superseded_by_version_id then
    if not (old.status = 'approved' and new.status = 'archived') then
      raise exception 'superseded_by_locked'
        using detail = 'A successor can only be recorded when an approved version is archived.';
    end if;
    if new.superseded_by_version_id is not null and not exists (
      select 1 from public.question_versions s
      where s.id = new.superseded_by_version_id
        and s.question_id = new.question_id
        and s.version_number > new.version_number
    ) then
      raise exception 'invalid_successor'
        using detail = 'The successor must be a later version of the same question.';
    end if;
  end if;

  return new;
end;
$$;

create trigger question_versions_lifecycle
before insert or update or delete on public.question_versions
for each row execute function public.trg_question_versions_lifecycle();

-- ---------------------------------------------------------------- T3 --------
-- Shared by question_choices, private.question_answer_keys, question_sources:
-- all three carry question_version_id.
create or replace function public.trg_draft_only_children()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version_id uuid;
  v_status     text;
begin
  if tg_op = 'DELETE' then
    v_version_id := old.question_version_id;
  else
    v_version_id := new.question_version_id;
  end if;

  select v.status into v_status from public.question_versions v where v.id = v_version_id;
  -- v_status is null when the parent is already gone (cascade delete of a draft): allow.
  if v_status is not null and v_status <> 'draft' then
    raise exception 'version_locked'
      using detail = format('Rows in %s can only change while the version is draft.', tg_table_name);
  end if;

  -- Moving a row between versions: the old parent must be draft too.
  if tg_op = 'UPDATE' and old.question_version_id is distinct from new.question_version_id then
    select v.status into v_status from public.question_versions v where v.id = old.question_version_id;
    if v_status is not null and v_status <> 'draft' then
      raise exception 'version_locked'
        using detail = format('Rows in %s can only change while the version is draft.', tg_table_name);
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger question_choices_draft_only
before insert or update or delete on public.question_choices
for each row execute function public.trg_draft_only_children();

create trigger question_answer_keys_draft_only
before insert or update or delete on private.question_answer_keys
for each row execute function public.trg_draft_only_children();

create trigger question_sources_draft_only
before insert or update or delete on public.question_sources
for each row execute function public.trg_draft_only_children();

-- ---------------------------------------------------------------- T4 --------
create or replace function public.trg_question_reviews_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'reviews_are_append_only'
    using detail = 'question_reviews rows can never be updated, deleted or truncated.';
  return null;
end;
$$;

create trigger question_reviews_no_change
before update or delete on public.question_reviews
for each row execute function public.trg_question_reviews_append_only();

create trigger question_reviews_no_truncate
before truncate on public.question_reviews
for each statement execute function public.trg_question_reviews_append_only();

-- Trigger functions are never called directly; remove default EXECUTE grants.
revoke all on function public.trg_session_questions_require_approved() from public, anon, authenticated, service_role;
revoke all on function public.trg_question_versions_lifecycle()        from public, anon, authenticated, service_role;
revoke all on function public.trg_draft_only_children()                from public, anon, authenticated, service_role;
revoke all on function public.trg_question_reviews_append_only()       from public, anon, authenticated, service_role;

/* =============================================================================
ACCEPTANCE CHECKS
  select tgname, tgrelid::regclass from pg_trigger where not tgisinternal
   and tgname in ('session_questions_require_approved','question_versions_lifecycle',
                  'question_choices_draft_only','question_answer_keys_draft_only',
                  'question_sources_draft_only','question_reviews_no_change',
                  'question_reviews_no_truncate');           -- 7 rows
  select has_function_privilege('authenticated','public.trg_question_versions_lifecycle()','execute');  -- false

SHARED TEST FIXTURE ("fixture A" - re-run at the top of each test transaction in
0007/0008/0009; local database only; wrap everything in begin; ... rollback;)
  -- Users: two guests and one admin.
  insert into auth.users (id, aud, role) values
    ('00000000-0000-0000-0000-00000000a001','authenticated','authenticated'),   -- guest A
    ('00000000-0000-0000-0000-00000000a002','authenticated','authenticated'),   -- guest B
    ('00000000-0000-0000-0000-00000000ad01','authenticated','authenticated');   -- admin
  insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-00000000ad01','admin');

  -- Builds a version with 4 choices (choice 2 is correct), a key and a source, then
  -- walks it to the requested status with plain UPDATEs (exercising T2).
  create or replace function pg_temp.mk_version(p_q uuid, p_v uuid, p_n int, p_target text)
  returns void language plpgsql as $f$
  declare i int; c uuid; correct uuid;
  begin
    insert into public.questions (id) values (p_q) on conflict do nothing;
    insert into public.question_versions (id, question_id, version_number, skill_id, difficulty, stem)
      values (p_v, p_q, p_n, (select min(id) from public.skills), 'easy', '[DEV SAMPLE] stem ' || p_target);
    for i in 1..4 loop
      insert into public.question_choices (question_version_id, display_order, content)
        values (p_v, i, 'choice ' || i) returning id into c;
      if i = 2 then correct := c; end if;
    end loop;
    insert into private.question_answer_keys (question_version_id, correct_choice_id, explanation)
      values (p_v, correct, 'because');
    insert into public.question_sources (question_version_id, source_type, notes)
      values (p_v, 'human_authored', 'DEV SAMPLE - not production content');
    if p_target in ('pending_review','approved','rejected','archived') then
      update public.question_versions set status = 'pending_review' where id = p_v; end if;
    if p_target in ('approved','archived') then
      update public.question_versions set status = 'approved' where id = p_v; end if;
    if p_target = 'rejected' then
      update public.question_versions set status = 'rejected' where id = p_v; end if;
    if p_target = 'archived' then
      update public.question_versions set status = 'archived' where id = p_v; end if;
  end $f$;

  select pg_temp.mk_version('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',1,'draft');
  select pg_temp.mk_version('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002',1,'pending_review');
  select pg_temp.mk_version('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000003',1,'approved');
  select pg_temp.mk_version('10000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000004',1,'rejected');
  select pg_temp.mk_version('10000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000005',1,'archived');
  -- Ids: ...0001 draft, ...0002 pending, ...0003 approved, ...0004 rejected, ...0005 archived.
  -- Run `set constraints all immediate;` after building to confirm deferred key checks pass.

SECURITY / LIFECYCLE TESTS (postgres role, after fixture A; each DO block must print PASS)
  -- T2 insert rule
  do $$ begin
    insert into public.question_versions (question_id, version_number, skill_id, difficulty, stem, status)
      values ('10000000-0000-0000-0000-000000000003', 9, (select min(id) from public.skills), 'easy', 'x', 'approved');
    raise exception 'TEST FAILED';
  exception when raise_exception then
    if sqlerrm = 'invalid_initial_status' then raise notice 'PASS: must insert as draft'; else raise; end if;
  end $$;
  -- T2 illegal transition draft -> approved
  do $$ begin
    update public.question_versions set status = 'approved' where id = '20000000-0000-0000-0000-000000000001';
    raise exception 'TEST FAILED';
  exception when raise_exception then
    if sqlerrm = 'invalid_transition' then raise notice 'PASS: draft->approved blocked'; else raise; end if;
  end $$;
  -- T2 content locked after draft
  do $$ begin
    update public.question_versions set stem = 'changed' where id = '20000000-0000-0000-0000-000000000003';
    raise exception 'TEST FAILED';
  exception when raise_exception then
    if sqlerrm = 'version_locked' then raise notice 'PASS: approved content locked'; else raise; end if;
  end $$;
  -- T2 four-choice rule even via direct UPDATE (3 choices)
  do $$ declare v uuid := gen_random_uuid(); begin
    insert into public.question_versions (id, question_id, version_number, skill_id, difficulty, stem)
      values (v, '10000000-0000-0000-0000-000000000004', 2, (select min(id) from public.skills), 'easy', 'three choices');
    insert into public.question_choices (question_version_id, display_order, content)
      select v, g, 'c' || g from generate_series(1,3) g;
    update public.question_versions set status = 'pending_review' where id = v;
    raise exception 'TEST FAILED';
  exception when raise_exception then
    if sqlerrm = 'incomplete_draft' then raise notice 'PASS: 3 choices cannot enter review'; else raise; end if;
  end $$;
  -- T2 timestamps stamped by trigger, caller values ignored
  do $$ declare t timestamptz; begin
    update public.question_versions set status = 'pending_review', submitted_at = '2000-01-01'
     where id = '20000000-0000-0000-0000-000000000001';
    select submitted_at into t from public.question_versions where id = '20000000-0000-0000-0000-000000000001';
    if t < now() - interval '1 minute' then raise exception 'TEST FAILED: caller timestamp kept'; end if;
    raise notice 'PASS: submitted_at stamped by trigger';
  end $$;
  -- one approved version per question (unique partial index): add a second draft->pending->approved
  do $$ declare v uuid := gen_random_uuid(); begin
    perform pg_temp.mk_version('10000000-0000-0000-0000-000000000003', v, 2, 'draft');
    update public.question_versions set status = 'pending_review' where id = v;
    update public.question_versions set status = 'approved'       where id = v;
    raise exception 'TEST FAILED';
  exception when unique_violation then raise notice 'PASS: second approved version rejected'; end $$;
  -- T3 children locked after draft (also test UPDATE of a choice and of the key the same way)
  do $$ begin
    delete from public.question_choices where question_version_id = '20000000-0000-0000-0000-000000000003';
    raise exception 'TEST FAILED';
  exception when raise_exception then
    if sqlerrm = 'version_locked' then raise notice 'PASS: choices of approved version locked'; else raise; end if;
  end $$;
  -- T3 cascade delete of a DRAFT still works (deferred key FK)
  do $$ begin
    delete from public.question_versions where id = '20000000-0000-0000-0000-000000000001';
    set constraints all immediate;
    raise notice 'PASS: draft version deleted with its choices/key/source';
  end $$;
  -- T2 non-draft cannot be deleted
  do $$ begin
    delete from public.question_versions where id = '20000000-0000-0000-0000-000000000005';
    raise exception 'TEST FAILED';
  exception when raise_exception then
    if sqlerrm = 'version_not_deletable' then raise notice 'PASS: archived not deletable'; else raise; end if;
  end $$;
  -- T4 reviews append-only
  do $$ declare r uuid; begin
    insert into public.question_reviews (question_version_id, reviewer_id, decision, notes)
      values ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000ad01', 'rejected', 'why')
      returning id into r;
    update public.question_reviews set notes = 'edited' where id = r;
    raise exception 'TEST FAILED';
  exception when raise_exception then
    if sqlerrm = 'reviews_are_append_only' then raise notice 'PASS: review update blocked'; else raise; end if;
  end $$;
  -- T1 only approved versions in sessions
  do $$ declare s uuid := gen_random_uuid(); begin
    insert into public.practice_sessions (id, user_id) values (s, '00000000-0000-0000-0000-00000000a001');
    insert into public.session_questions (session_id, question_version_id, item_order)
      values (s, '20000000-0000-0000-0000-000000000002', 1);          -- pending_review
    raise exception 'TEST FAILED';
  exception when raise_exception then
    if sqlerrm = 'version_not_approved' then raise notice 'PASS: non-approved version cannot be assigned'; else raise; end if;
  end $$;
  -- (repeat T1 for draft/rejected/archived ids ...0001/0004/0005; accepted for ...0003)

ROLLBACK NOTES
    drop trigger session_questions_require_approved on public.session_questions;
    drop trigger question_versions_lifecycle        on public.question_versions;
    drop trigger question_choices_draft_only        on public.question_choices;
    drop trigger question_answer_keys_draft_only    on private.question_answer_keys;
    drop trigger question_sources_draft_only        on public.question_sources;
    drop trigger question_reviews_no_change         on public.question_reviews;
    drop trigger question_reviews_no_truncate       on public.question_reviews;
    drop function public.trg_session_questions_require_approved();
    drop function public.trg_question_versions_lifecycle();
    drop function public.trg_draft_only_children();
    drop function public.trg_question_reviews_append_only();
  Rolling back removes lifecycle protection: do not leave a database in this
  state with real content, and never roll back on production without a backup.
============================================================================= */
