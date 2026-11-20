-- =============================================================================
-- MIGRATION 0008 - Server functions                     [tier: Foundation + MVP]
-- STATUS : DRAFT for owner review. NOT applied. NOT executed by the author.
-- PURPOSE: All client writes go through these functions; no client role has
--          INSERT/UPDATE/DELETE on any table. Student functions: create_session,
--          submit_answer, reveal_answer, complete_session. Admin / pipeline
--          functions: create_draft_version, submit_for_review, review_version,
--          get_answer_key. (is_admin() already exists from 0002.)
-- DEPENDS ON: 0001-0007.
-- CONVENTIONS:
--   * SECURITY DEFINER, `set search_path = ''`, every object schema-qualified.
--   * The caller always comes from auth.uid(); never from a parameter.
--   * Errors are raised as short codes in the message (e.g. 'item_not_found');
--     the frontend maps codes to text.
--   * Required-but-missing payload fields in create_draft_version surface as the
--     underlying constraint error (not_null_violation / check_violation).
-- DEVIATION FROM THE PRESENTED SPEC (flagged): create_session and
--   create_draft_version return a JSON object instead of a table row. Same
--   content; avoids PL/pgSQL name clashes between OUT columns and table columns.
-- SUPABASE ASSUMPTIONS:
--   * Supabase grants EXECUTE on new functions to anon/authenticated/service_role
--     by default; every function below revokes that first, then grants exactly
--     the roles listed in the spec's function-privilege table.
--   * service_role requests carry JWT claim role = 'service_role'.
--   * Functions run as the owner (`postgres`), which bypasses RLS.
-- =============================================================================

-- ------------------------------------------------------------ create_session
create or replace function public.create_session(
  p_question_count integer,
  p_section        text     default null,
  p_domain_id      smallint default null,
  p_skill_id       smallint default null,
  p_difficulty     text     default null,
  p_tag_slug       text     default null,
  p_max_attempts   smallint default 1
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user       uuid := auth.uid();
  v_session_id uuid;
  v_inserted   integer;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;
  if p_question_count is null or p_question_count < 1 or p_question_count > 50
     or p_max_attempts is null or p_max_attempts < 1 or p_max_attempts > 3
     or (p_section is not null and p_section not in ('reading_writing', 'math'))
     or (p_difficulty is not null and p_difficulty not in ('easy', 'medium', 'hard')) then
    raise exception 'invalid_parameters';
  end if;
  if p_domain_id is not null and not exists (
    select 1 from public.domains d where d.id = p_domain_id
  ) then
    raise exception 'invalid_parameters';
  end if;
  if p_skill_id is not null and not exists (
    select 1 from public.skills s where s.id = p_skill_id
  ) then
    raise exception 'invalid_parameters';
  end if;
  if p_domain_id is not null and p_skill_id is not null and not exists (
    select 1 from public.skills s where s.id = p_skill_id and s.domain_id = p_domain_id
  ) then
    raise exception 'invalid_parameters';
  end if;
  if p_domain_id is not null and p_section is not null and not exists (
    select 1 from public.domains d where d.id = p_domain_id and d.section = p_section
  ) then
    raise exception 'invalid_parameters';
  end if;
  if p_skill_id is not null and p_section is not null and not exists (
    select 1
    from public.skills s
    join public.domains d on d.id = s.domain_id
    where s.id = p_skill_id and d.section = p_section
  ) then
    raise exception 'invalid_parameters';
  end if;

  insert into public.practice_sessions (user_id, max_attempts_per_question, config)
  values (
    v_user, p_max_attempts,
    jsonb_strip_nulls(jsonb_build_object(
      'question_count', p_question_count, 'section', p_section, 'domain_id', p_domain_id,
      'skill_id', p_skill_id, 'difficulty', p_difficulty, 'tag', p_tag_slug))
  )
  returning id into v_session_id;

  -- The client never supplies question ids: only approved versions are eligible.
  insert into public.session_questions (session_id, question_version_id, item_order)
  select v_session_id, c.id, c.rn::smallint
  from (
    select v.id, row_number() over (order by random()) as rn
    from public.question_versions v
    join public.skills  s on s.id = v.skill_id
    join public.domains d on d.id = s.domain_id
    where v.status = 'approved'
      and (p_section    is null or d.section   = p_section)
      and (p_domain_id  is null or s.domain_id = p_domain_id)
      and (p_skill_id   is null or v.skill_id  = p_skill_id)
      and (p_difficulty is null or v.difficulty = p_difficulty)
      and (p_tag_slug   is null or exists (
            select 1
            from public.question_tags qt
            join public.tags t on t.id = qt.tag_id
            where qt.question_id = v.question_id and t.slug = p_tag_slug))
  ) c
  where c.rn <= p_question_count;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    raise exception 'no_questions_found';   -- aborts the transaction, so the empty session is not kept
  end if;

  return jsonb_build_object('session_id', v_session_id, 'question_count', v_inserted);
end;
$$;

-- ------------------------------------------------------------- submit_answer
create or replace function public.submit_answer(p_session_question_id uuid, p_choice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user              uuid := auth.uid();
  v_session_id        uuid;
  v_version_id        uuid;
  v_revealed_at       timestamptz;
  v_session_status    text;
  v_max_attempts      smallint;
  v_question_id       uuid;
  v_skill_id          smallint;
  v_difficulty        text;
  v_version_status    text;
  v_attempts          integer;
  v_attempt_number    smallint;
  v_correct_choice_id uuid;
  v_explanation       text;
  v_is_correct        boolean;
  v_reveal            boolean;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  -- Lock the item (serialises double-clicks / two tabs) and share-lock the session
  -- (so complete_session cannot slip in between). Foreign or missing items give
  -- the same generic error.
  select sq.session_id, sq.question_version_id, sq.revealed_at, ps.status, ps.max_attempts_per_question
    into v_session_id, v_version_id, v_revealed_at, v_session_status, v_max_attempts
  from public.session_questions sq
  join public.practice_sessions ps on ps.id = sq.session_id
  where sq.id = p_session_question_id
    and ps.user_id = v_user
  for update of sq for share of ps;
  if not found then
    raise exception 'item_not_found';
  end if;

  if v_session_status <> 'in_progress' then raise exception 'session_not_in_progress'; end if;
  if v_revealed_at is not null          then raise exception 'already_revealed';       end if;

  select v.question_id, v.skill_id, v.difficulty, v.status
    into v_question_id, v_skill_id, v_difficulty, v_version_status
  from public.question_versions v
  where v.id = v_version_id;
  if v_version_status <> 'approved' then
    raise exception 'item_unavailable';
  end if;

  if not exists (
    select 1 from public.question_choices c
    where c.id = p_choice_id and c.question_version_id = v_version_id
  ) then
    raise exception 'invalid_choice';
  end if;

  -- The attempt count (not a stored counter) is the source of truth.
  select count(*) into v_attempts
  from public.question_attempts a
  where a.session_question_id = p_session_question_id;
  if v_attempts >= v_max_attempts then
    raise exception 'no_attempts_left';
  end if;
  v_attempt_number := (v_attempts + 1)::smallint;

  select k.correct_choice_id, k.explanation
    into v_correct_choice_id, v_explanation
  from private.question_answer_keys k
  where k.question_version_id = v_version_id;
  if not found then
    raise exception 'key_missing';
  end if;

  v_is_correct := (p_choice_id = v_correct_choice_id);

  insert into public.question_attempts (
    session_id, session_question_id, user_id, question_id, question_version_id,
    selected_choice_id, attempt_number, is_correct, skill_id, difficulty)
  values (
    v_session_id, p_session_question_id, v_user, v_question_id, v_version_id,
    p_choice_id, v_attempt_number, v_is_correct, v_skill_id, v_difficulty);

  -- A correct answer, or the last allowed attempt, reveals and locks the item.
  v_reveal := v_is_correct or v_attempt_number >= v_max_attempts;
  if v_reveal then
    update public.session_questions set revealed_at = now() where id = p_session_question_id;
  end if;

  return jsonb_build_object(
    'result',             case when v_is_correct then 'correct' else 'incorrect' end,
    'attempt_number',     v_attempt_number,
    'attempts_remaining', case when v_reveal then 0 else v_max_attempts - v_attempt_number end,
    'revealed',           v_reveal,
    'correct_choice_id',  case when v_reveal then v_correct_choice_id end,
    'explanation',        case when v_reveal then v_explanation end
  );
end;
$$;

-- ------------------------------------------------------------- reveal_answer
create or replace function public.reveal_answer(p_session_question_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user              uuid := auth.uid();
  v_version_id        uuid;
  v_revealed_at       timestamptz;
  v_session_status    text;
  v_version_status    text;
  v_correct_choice_id uuid;
  v_explanation       text;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  select sq.question_version_id, sq.revealed_at, ps.status
    into v_version_id, v_revealed_at, v_session_status
  from public.session_questions sq
  join public.practice_sessions ps on ps.id = sq.session_id
  where sq.id = p_session_question_id
    and ps.user_id = v_user
  for update of sq for share of ps;
  if not found then
    raise exception 'item_not_found';
  end if;
  if v_session_status <> 'in_progress' then
    raise exception 'session_not_in_progress';
  end if;

  if v_revealed_at is null then            -- idempotent: a second call changes nothing
    select v.status into v_version_status
    from public.question_versions v
    where v.id = v_version_id;
    if v_version_status <> 'approved' then
      raise exception 'item_unavailable';
    end if;

    v_revealed_at := now();
    update public.session_questions set revealed_at = v_revealed_at where id = p_session_question_id;
  end if;

  select k.correct_choice_id, k.explanation
    into v_correct_choice_id, v_explanation
  from private.question_answer_keys k
  where k.question_version_id = v_version_id;
  if not found then
    raise exception 'key_missing';
  end if;

  -- Revealing without answering creates NO attempt row.
  return jsonb_build_object(
    'correct_choice_id', v_correct_choice_id,
    'explanation',       v_explanation,
    'revealed_at',       v_revealed_at);
end;
$$;

-- ----------------------------------------------------------- complete_session
create or replace function public.complete_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user          uuid := auth.uid();
  v_status        text;
  v_summary       jsonb;
  v_total         integer;
  v_attempted     integer;
  v_revealed_only integer;
  v_skipped       integer;
  v_unavailable   integer;
  v_first_correct integer;
  v_scorable      integer;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  select ps.status, ps.summary into v_status, v_summary
  from public.practice_sessions ps
  where ps.id = p_session_id and ps.user_id = v_user
  for update;
  if not found then
    raise exception 'session_not_found';
  end if;

  if v_status = 'completed' then
    return v_summary;                       -- frozen at the first completion
  end if;

  with items as (
    select sq.id,
           sq.revealed_at,
           (v.status = 'approved') as available,
           (select count(*) from public.question_attempts a
             where a.session_question_id = sq.id) as n_attempts,
           exists (select 1 from public.question_attempts a
                    where a.session_question_id = sq.id
                      and a.attempt_number = 1 and a.is_correct) as first_correct
    from public.session_questions sq
    join public.question_versions v on v.id = sq.question_version_id
    where sq.session_id = p_session_id
  )
  select count(*),
         count(*) filter (where n_attempts > 0),
         count(*) filter (where n_attempts = 0 and revealed_at is not null),
         count(*) filter (where n_attempts = 0 and revealed_at is null and available),
         count(*) filter (where n_attempts = 0 and revealed_at is null and not available),
         count(*) filter (where first_correct)
    into v_total, v_attempted, v_revealed_only, v_skipped, v_unavailable, v_first_correct
  from items;

  v_scorable := v_total - v_unavailable;

  v_summary := jsonb_build_object(
    'total_items',                    v_total,
    'unavailable_items',              v_unavailable,
    'scorable_items',                 v_scorable,
    'attempted_items',                v_attempted,
    'skipped_items',                  v_skipped,
    'revealed_without_attempt_items', v_revealed_only,
    'first_attempt_correct',          v_first_correct,
    'score',                  case when v_scorable  > 0 then round(v_first_correct::numeric / v_scorable,  4) end,
    'first_attempt_accuracy', case when v_attempted > 0 then round(v_first_correct::numeric / v_attempted, 4) end
  );

  update public.practice_sessions
     set status = 'completed', completed_at = now(), summary = v_summary
   where id = p_session_id;

  return v_summary;
end;
$$;

-- ------------------------------------------------------- create_draft_version
-- Payload keys: question_id (omit to create a new question), skill_id, difficulty,
-- passage, stem, choices (array of exactly 4 texts), correct_choice_index (1-4),
-- explanation, source_type, ai_model, prompt_version, batch_id, spec_reference_id,
-- notes, tag_slugs (array; NEW questions only).
create or replace function public.create_draft_version(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user              uuid := auth.uid();
  v_is_service        boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_question_id       uuid;
  v_version_id        uuid;
  v_version_number    integer;
  v_choices           jsonb;
  v_correct_index     integer;
  v_skill_id          smallint;
  v_batch_id          uuid;
  v_spec_reference_id uuid;
  v_choice_id         uuid;
  v_correct_choice_id uuid;
  v_slug              text;
  v_tag_id            integer;
  v_i                 integer;
begin
  if not (v_is_service or public.is_admin()) then
    raise exception 'not_authorized';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_payload';
  end if;

  v_choices := p_payload -> 'choices';
  if jsonb_typeof(v_choices) is distinct from 'array' then
    raise exception 'invalid_payload' using detail = 'choices must be an array of exactly 4 texts';
  end if;
  if jsonb_array_length(v_choices) <> 4 then
    raise exception 'invalid_payload' using detail = 'choices must be an array of exactly 4 texts';
  end if;
  for v_i in 0..3 loop
    if jsonb_typeof(v_choices -> v_i) is distinct from 'string'
       or length(btrim(v_choices ->> v_i)) = 0 then
      raise exception 'invalid_payload' using detail = 'choices must contain four non-blank texts';
    end if;
  end loop;

  if jsonb_typeof(p_payload -> 'correct_choice_index') is distinct from 'number'
     or (p_payload ->> 'correct_choice_index') !~ '^[1-4]$' then
    raise exception 'invalid_payload' using detail = 'correct_choice_index must be an integer from 1 to 4';
  end if;
  if p_payload ? 'skill_id'
     and (jsonb_typeof(p_payload -> 'skill_id') is distinct from 'number'
          or (p_payload ->> 'skill_id') !~ '^[0-9]+$') then
    raise exception 'invalid_payload' using detail = 'skill_id must be an integer';
  end if;

  if p_payload ? 'tag_slugs' then
    if jsonb_typeof(p_payload -> 'tag_slugs') is distinct from 'array' then
      raise exception 'invalid_payload' using detail = 'tag_slugs must be an array of text slugs';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(p_payload -> 'tag_slugs') as tags(value)
      where jsonb_typeof(tags.value) is distinct from 'string'
         or (tags.value #>> '{}') !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    ) then
      raise exception 'invalid_payload' using detail = 'tag_slugs must contain valid text slugs';
    end if;
  end if;

  begin
    v_correct_index := (p_payload ->> 'correct_choice_index')::integer;
    v_skill_id := (p_payload ->> 'skill_id')::smallint;
    v_batch_id := (p_payload ->> 'batch_id')::uuid;
    v_spec_reference_id := (p_payload ->> 'spec_reference_id')::uuid;
    if p_payload ->> 'question_id' is not null then
      v_question_id := (p_payload ->> 'question_id')::uuid;
    end if;
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'invalid_payload' using detail = 'Payload contains a malformed number or UUID';
  end;
  if v_correct_index is null or v_correct_index < 1 or v_correct_index > 4 then
    raise exception 'invalid_payload' using detail = 'correct_choice_index must be between 1 and 4';
  end if;

  if p_payload ->> 'question_id' is null then
    -- New question (version 1) plus optional tags.
    insert into public.questions (created_by) values (v_user) returning id into v_question_id;
    v_version_number := 1;
    if jsonb_typeof(p_payload -> 'tag_slugs') = 'array' then
      for v_slug in select jsonb_array_elements_text(p_payload -> 'tag_slugs') loop
        select t.id into v_tag_id from public.tags t where t.slug = v_slug;
        if not found then
          raise exception 'tag_not_found' using detail = v_slug;
        end if;
        insert into public.question_tags (question_id, tag_id)
        values (v_question_id, v_tag_id)
        on conflict do nothing;
      end loop;
    end if;
  else
    -- New version of an existing question.
    if p_payload ? 'tag_slugs' then
      raise exception 'invalid_payload'
        using detail = 'tag_slugs is only allowed when creating a new question';
    end if;
    perform 1 from public.questions q where q.id = v_question_id for update;   -- serialise
    if not found then
      raise exception 'question_not_found';
    end if;
    if exists (
      select 1 from public.question_versions v
      where v.question_id = v_question_id and v.status in ('draft', 'pending_review')
    ) then
      raise exception 'open_version_exists';
    end if;
    select coalesce(max(v.version_number), 0) + 1 into v_version_number
    from public.question_versions v where v.question_id = v_question_id;
  end if;

  insert into public.question_versions (
    question_id, version_number, skill_id, difficulty, passage, stem, created_by)
  values (
    v_question_id, v_version_number,
    v_skill_id, p_payload ->> 'difficulty',
    nullif(p_payload ->> 'passage', ''), p_payload ->> 'stem', v_user)
  returning id into v_version_id;

  for v_i in 1..4 loop
    insert into public.question_choices (question_version_id, display_order, content)
    values (v_version_id, v_i, v_choices ->> (v_i - 1))
    returning id into v_choice_id;
    if v_i = v_correct_index then
      v_correct_choice_id := v_choice_id;
    end if;
  end loop;

  insert into private.question_answer_keys (question_version_id, correct_choice_id, explanation)
  values (v_version_id, v_correct_choice_id, p_payload ->> 'explanation');

  insert into public.question_sources (
    question_version_id, source_type, ai_model, prompt_version,
    generation_batch_id, spec_reference_id, notes)
  values (
    v_version_id, p_payload ->> 'source_type', p_payload ->> 'ai_model', p_payload ->> 'prompt_version',
    v_batch_id, v_spec_reference_id, p_payload ->> 'notes');

  return jsonb_build_object(
    'question_id', v_question_id, 'version_id', v_version_id, 'version_number', v_version_number);
end;
$$;

-- ----------------------------------------------------------- submit_for_review
-- The completeness rules (exactly four choices, key, source) are enforced by the
-- lifecycle trigger (0007); this function only requests the transition.
create or replace function public.submit_for_review(p_version_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_status     text;
begin
  if not (v_is_service or public.is_admin()) then
    raise exception 'not_authorized';
  end if;

  select v.status into v_status
  from public.question_versions v
  where v.id = p_version_id
  for update;
  if not found then
    raise exception 'version_not_found';
  end if;
  if v_status <> 'draft' then
    raise exception 'not_draft';
  end if;

  update public.question_versions set status = 'pending_review' where id = p_version_id;
  return 'pending_review';
end;
$$;

-- -------------------------------------------------------------- review_version
create or replace function public.review_version(
  p_version_id            uuid,
  p_decision              text,
  p_notes                 text    default null,
  p_originality_confirmed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user        uuid := auth.uid();
  v_question_id uuid;
  v_status      text;
  v_prev_id     uuid;
  v_new_status  text;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  if p_decision is null or p_decision not in ('approved', 'rejected', 'withdrawn') then
    raise exception 'invalid_decision';
  end if;

  select v.question_id into v_question_id from public.question_versions v where v.id = p_version_id;
  if not found then
    raise exception 'version_not_found';
  end if;

  -- Lock order: question first, then version (serialises reviews per question).
  perform 1 from public.questions q where q.id = v_question_id for update;
  select v.status into v_status from public.question_versions v where v.id = p_version_id for update;

  if p_decision in ('approved', 'rejected') and v_status <> 'pending_review' then
    raise exception 'invalid_state';
  end if;
  if p_decision = 'withdrawn' and v_status <> 'approved' then
    raise exception 'invalid_state';
  end if;
  if p_decision = 'approved' and not coalesce(p_originality_confirmed, false) then
    raise exception 'originality_required';
  end if;
  if p_decision <> 'approved' and length(btrim(coalesce(p_notes, ''))) = 0 then
    raise exception 'notes_required';
  end if;

  insert into public.question_reviews (
    question_version_id, reviewer_id, decision, notes, originality_confirmed)
  values (
    p_version_id, v_user, p_decision,
    nullif(btrim(coalesce(p_notes, '')), ''), coalesce(p_originality_confirmed, false));

  if p_decision = 'approved' then
    -- Archive the previously approved version FIRST (partial unique index), then approve.
    select v.id into v_prev_id
    from public.question_versions v
    where v.question_id = v_question_id and v.status = 'approved'
    for update;
    if v_prev_id is not null then
      update public.question_versions
         set status = 'archived', superseded_by_version_id = p_version_id
       where id = v_prev_id;
    end if;
    update public.question_versions set status = 'approved' where id = p_version_id;
    v_new_status := 'approved';
  elsif p_decision = 'rejected' then
    update public.question_versions set status = 'rejected' where id = p_version_id;
    v_new_status := 'rejected';
  else  -- withdrawn: archive with no successor
    update public.question_versions set status = 'archived' where id = p_version_id;
    v_new_status := 'archived';
  end if;

  return jsonb_build_object(
    'version_id', p_version_id, 'status', v_new_status, 'archived_version_id', v_prev_id);
end;
$$;

-- -------------------------------------------------------------- get_answer_key
create or replace function public.get_answer_key(p_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_choice_id    uuid;
  v_display      smallint;
  v_explanation  text;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  select k.correct_choice_id, c.display_order, k.explanation
    into v_choice_id, v_display, v_explanation
  from private.question_answer_keys k
  join public.question_choices c
    on c.question_version_id = k.question_version_id and c.id = k.correct_choice_id
  where k.question_version_id = p_version_id;
  if not found then
    raise exception 'key_not_found';
  end if;

  return jsonb_build_object(
    'correct_choice_id', v_choice_id, 'correct_display_order', v_display, 'explanation', v_explanation);
end;
$$;

-- ------------------------------------------------------- execute privileges ---
-- Exactly as in the spec's function-privilege table.
revoke all on function public.create_session(integer, text, smallint, smallint, text, text, smallint) from public, anon, authenticated, service_role;
revoke all on function public.submit_answer(uuid, uuid)                from public, anon, authenticated, service_role;
revoke all on function public.reveal_answer(uuid)                      from public, anon, authenticated, service_role;
revoke all on function public.complete_session(uuid)                   from public, anon, authenticated, service_role;
revoke all on function public.create_draft_version(jsonb)              from public, anon, authenticated, service_role;
revoke all on function public.submit_for_review(uuid)                  from public, anon, authenticated, service_role;
revoke all on function public.review_version(uuid, text, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.get_answer_key(uuid)                     from public, anon, authenticated, service_role;

grant execute on function public.create_session(integer, text, smallint, smallint, text, text, smallint) to authenticated;
grant execute on function public.submit_answer(uuid, uuid)             to authenticated;
grant execute on function public.reveal_answer(uuid)                   to authenticated;
grant execute on function public.complete_session(uuid)                to authenticated;
grant execute on function public.get_answer_key(uuid)                  to authenticated;   -- admin check inside
grant execute on function public.review_version(uuid, text, text, boolean) to authenticated; -- admin check inside; NOT service_role
grant execute on function public.create_draft_version(jsonb)           to authenticated, service_role;  -- admin-or-service check inside
grant execute on function public.submit_for_review(uuid)               to authenticated, service_role;  -- admin-or-service check inside

/* =============================================================================
ACCEPTANCE CHECKS
  select p.proname, p.prosecdef as security_definer, p.proconfig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in
     ('create_session','submit_answer','reveal_answer','complete_session',
      'create_draft_version','submit_for_review','review_version','get_answer_key','is_admin');
     -- 9 rows, security_definer true, proconfig contains search_path=""
  -- EXECUTE privilege matrix (expected):  anon: all false | authenticated: all true
  --   | service_role: true ONLY for create_draft_version and submit_for_review
  select p.proname,
         has_function_privilege('anon',          p.oid, 'execute') as anon,
         has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
         has_function_privilege('service_role',  p.oid, 'execute') as service_role
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in
     ('create_session','submit_answer','reveal_answer','complete_session',
      'create_draft_version','submit_for_review','review_version','get_answer_key','is_admin')
   order by 1;

FUNCTIONAL + SECURITY TESTS (local; fixture A from the 0007 test block; wrap in
begin; ... rollback;). Impersonate with:
    set local role authenticated;
    select set_config('request.jwt.claims',
      '{"sub":"<uuid>","role":"authenticated","is_anonymous":<true|false>}', true);
  Guest A = ...a001 (anonymous), guest B = ...a002 (anonymous), admin = ...ad01 (non-anonymous).
  Approved versions available in fixture A: ...0003 (one question). Build 2-3 more via
  pg_temp.mk_version if a test needs several. Choice 2 of each version is the correct one.

 Practice behaviour
  1  create_session as guest A: returns session_id + question_count; only approved
     versions assigned (never ...0001/0002/0004/0005). Call 20 times: never a non-approved id.
  2  create_session with no approved questions matching -> error no_questions_found,
     and select count(*) from practice_sessions is unchanged.
  3  max_attempts=1: wrong first answer -> revealed=true, correct_choice_id and explanation present,
     item locked; a further submit_answer -> already_revealed.
  4  max_attempts=3: wrong, wrong -> result incorrect, attempts_remaining 2 then 1,
     correct_choice_id and explanation ABSENT (null) in both responses;
     third wrong -> revealed=true. Attempt numbers stored: 1,2,3.
  5  correct first answer -> revealed=true, locked; later submit -> already_revealed.
  6  reveal_answer: returns the key, creates no question_attempts row; second call
     returns the same revealed_at and changes nothing.
     Repeat after the version is withdrawn: the prior reveal remains idempotently
     readable; an item not previously revealed still returns item_unavailable.
  7  guest B calling submit_answer / reveal_answer / complete_session on guest A's ids
     -> item_not_found / session_not_found (identical generic errors).
  8  choice id from another version -> invalid_choice.
  9  concurrency (two connections, same item, max_attempts=3, both submit simultaneously):
     attempt numbers are distinct (1 and 2), or one call fails cleanly; never duplicates.
 10  withdraw the approved version (admin review_version 'withdrawn'): unattempted item ->
     submit_answer/reveal_answer return item_unavailable; complete_session counts it under
     unavailable_items and excludes it from scorable_items.
 11  complete_session: counts satisfy attempted + revealed_without_attempt + skipped + unavailable = total;
     second call returns the identical stored summary even after a later withdrawal.

 Lifecycle / admin functions
 12  as admin: create_draft_version (new question, 4 choices, correct_choice_index 2, tags) ->
     submit_for_review -> review_version approved (originality true) -> appears in create_session.
 13  submit_for_review on a draft built with 3 choices -> incomplete_draft.
 14  review_version rejected without notes -> notes_required; approved without
     originality -> originality_required; approving a draft -> invalid_state.
 15  new draft of an approved question + approve: old version archived with
     superseded_by_version_id = new id and archived_at = new approved_at;
     question_reviews has the approving row; create_draft_version while a
     draft is open -> open_version_exists.
 16  guest (anonymous token) calling create_draft_version / submit_for_review / review_version /
     get_answer_key -> not_authorized / not_authorized / not_admin / not_admin. (The
     `authenticated` role HAS execute on these four, so the rejection comes from the
     admin check inside each function.)
 17  service_role (claims '{"role":"service_role"}', as role service_role):
     create_draft_version and submit_for_review succeed; review_version and get_answer_key
     -> permission denied for function (no EXECUTE grant).
 18  anon role: every function -> permission denied.
 19  create_draft_version rejects choices that are not exactly four non-blank
    JSON strings; rejects non-integer/out-of-range correct_choice_index and
    malformed numeric/UUID casts as invalid_payload.
 20  create_draft_version rejects non-array tag_slugs and arrays containing
    non-text or invalid slugs as invalid_payload; unknown valid slugs return
    tag_not_found; supplying tag_slugs for an existing question returns invalid_payload.
 21  create_session returns invalid_parameters for unknown domain/skill IDs,
    a skill outside the selected domain, or a domain/skill outside p_section.

 Attempts: foreign-key consistency (postgres role, direct inserts; each DO block must PASS)
  22  insert into question_attempts with user_id = guest B on guest A's session -> foreign_key_violation (FK 1)
  23  selected_choice_id from a different version -> foreign_key_violation (FK 3)
  24  wrong question_id, or wrong skill_id / difficulty snapshot -> foreign_key_violation (FK 4)
  25  session_question_id from another session -> foreign_key_violation (FK 2)
  26  duplicate (session_question_id, attempt_number) -> unique_violation
  27  delete the session -> items and attempts cascade away.

ROLLBACK NOTES
    drop function public.get_answer_key(uuid);
    drop function public.review_version(uuid, text, text, boolean);
    drop function public.submit_for_review(uuid);
    drop function public.create_draft_version(jsonb);
    drop function public.complete_session(uuid);
    drop function public.reveal_answer(uuid);
    drop function public.submit_answer(uuid, uuid);
    drop function public.create_session(integer, text, smallint, smallint, text, text, smallint);
  Dropping them leaves the database fully locked (no client write path): safe,
  and the app's Practice stops working until they are re-applied.
============================================================================= */
