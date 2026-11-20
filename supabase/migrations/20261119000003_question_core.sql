-- =============================================================================
-- MIGRATION 0003 - Question core                                 [tier: MVP]
-- STATUS : DRAFT for owner review. NOT applied. NOT executed by the author.
-- PURPOSE: questions (stable identity), question_versions (content + lifecycle
--          status), question_choices (4 options, no correctness flag), tags,
--          question_tags (tags attach to QUESTIONS, not versions).
-- DEPENDS ON: 0001 (skills), Supabase auth.users.
-- NOTES:
--   * Lifecycle rules (transitions, timestamp stamping, locking, four-choice
--     completeness) are enforced by triggers in 0007, not here. The CHECK
--     constraints below are the structural backstop.
--   * Statuses/difficulty are text + CHECK (not enum types): easier to change.
-- SUPABASE ASSUMPTIONS: gen_random_uuid() is built in (PostgreSQL 13+).
-- =============================================================================

create table public.questions (
  id            uuid        primary key default gen_random_uuid(),
  question_type text        not null default 'multiple_choice'
                            check (question_type = 'multiple_choice'),  -- MVP; relaxed later
  created_by    uuid        references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

create table public.question_versions (
  id                       uuid        primary key default gen_random_uuid(),
  question_id              uuid        not null references public.questions (id) on delete restrict,
  version_number           integer     not null check (version_number >= 1),
  skill_id                 smallint    not null references public.skills (id) on delete restrict,
  difficulty               text        not null check (difficulty in ('easy', 'medium', 'hard')),
  passage                  text        check (passage is null or length(btrim(passage)) > 0),
  stem                     text        not null check (length(btrim(stem)) > 0),
  status                   text        not null default 'draft'
                           check (status in ('draft', 'pending_review', 'approved', 'rejected', 'archived')),
  created_by               uuid        references auth.users (id) on delete set null,
  created_at               timestamptz not null default now(),
  submitted_at             timestamptz,
  approved_at              timestamptz,
  rejected_at              timestamptz,
  archived_at              timestamptz,
  superseded_by_version_id uuid        references public.question_versions (id) on delete restrict,

  constraint question_versions_question_version_uq unique (question_id, version_number),
  -- Target of question_attempts FK 4 (snapshot columns must equal the version row).
  constraint question_versions_attempt_snapshot_uq unique (id, question_id, skill_id, difficulty),

  -- Which timestamps must be set / null in each status.
  constraint question_versions_state_timestamps_ck check (
    case status
      when 'draft'          then submitted_at is null     and approved_at is null     and rejected_at is null     and archived_at is null
      when 'pending_review' then submitted_at is not null and approved_at is null     and rejected_at is null     and archived_at is null
      when 'approved'       then submitted_at is not null and approved_at is not null and rejected_at is null     and archived_at is null
      when 'rejected'       then submitted_at is not null and approved_at is null     and rejected_at is not null and archived_at is null
      when 'archived'       then submitted_at is not null and approved_at is not null and rejected_at is null     and archived_at is not null
      else false
    end
  ),
  -- Timestamps must be in chronological order where present.
  constraint question_versions_timestamp_order_ck check (
        (submitted_at is null or submitted_at >= created_at)
    and (approved_at  is null or approved_at  >= submitted_at)
    and (rejected_at  is null or rejected_at  >= submitted_at)
    and (archived_at  is null or archived_at  >= approved_at)
  ),
  -- A successor may only be recorded on an archived version.
  constraint question_versions_superseded_ck check (
    superseded_by_version_id is null or status = 'archived'
  )
);

-- At most ONE approved version per question (the one students see).
create unique index question_versions_one_approved_uq
  on public.question_versions (question_id) where status = 'approved';
-- At most ONE open (draft or pending_review) version per question.
create unique index question_versions_one_open_uq
  on public.question_versions (question_id) where status in ('draft', 'pending_review');
-- Practice filter path.
create index question_versions_practice_filter_idx
  on public.question_versions (skill_id, difficulty) where status = 'approved';

create table public.question_choices (
  id                  uuid     primary key default gen_random_uuid(),
  question_version_id uuid     not null references public.question_versions (id) on delete cascade,
  display_order       smallint not null check (display_order between 1 and 4),  -- maps to A-D in the UI
  content             text     not null check (length(btrim(content)) > 0),
  constraint question_choices_version_order_uq unique (question_version_id, display_order),
  -- Target of composite FKs (answer key, attempts): a choice must belong to the stated version.
  constraint question_choices_version_id_uq    unique (question_version_id, id)
);

create table public.tags (
  id         integer     generated always as identity primary key,
  slug       text        not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name       text        not null unique check (length(btrim(name)) > 0),
  created_at timestamptz not null default now()
);

create table public.question_tags (
  question_id uuid    not null references public.questions (id) on delete cascade,
  tag_id      integer not null references public.tags (id)      on delete cascade,
  primary key (question_id, tag_id)
);
create index question_tags_tag_question_idx on public.question_tags (tag_id, question_id);

-- Deny by default (policies/grants in 0009).
alter table public.questions         enable row level security;
alter table public.question_versions enable row level security;
alter table public.question_choices  enable row level security;
alter table public.tags              enable row level security;
alter table public.question_tags     enable row level security;
revoke all on public.questions         from anon, authenticated;
revoke all on public.question_versions from anon, authenticated;
revoke all on public.question_choices  from anon, authenticated;
revoke all on public.tags              from anon, authenticated;
revoke all on public.question_tags     from anon, authenticated;

/* =============================================================================
ACCEPTANCE CHECKS
  -- 5 tables exist with RLS on and no client privileges:
  select c.relname, c.relrowsecurity,
         has_table_privilege('anon', c.oid, 'select')          as anon_select,
         has_table_privilege('authenticated', c.oid, 'select') as auth_select
    from pg_class c
   where c.oid in ('public.questions'::regclass, 'public.question_versions'::regclass,
                   'public.question_choices'::regclass, 'public.tags'::regclass,
                   'public.question_tags'::regclass);     -- rls true, both selects false
  -- Partial unique indexes exist:
  select indexname from pg_indexes where tablename = 'question_versions'
   and indexname in ('question_versions_one_approved_uq','question_versions_one_open_uq',
                     'question_versions_practice_filter_idx');                -- 3 rows
  -- Constraints present:
  select conname from pg_constraint where conrelid = 'public.question_versions'::regclass
   order by 1;   -- includes ..._state_timestamps_ck, ..._timestamp_order_ck, ..._superseded_ck,
                 --          ..._attempt_snapshot_uq, ..._question_version_uq
  -- No correctness column anywhere in public so far:
  select table_name, column_name from information_schema.columns
   where table_schema = 'public' and column_name ilike '%correct%';   -- expect 0 rows

SECURITY / CONSTRAINT TESTS (postgres role, local; triggers from 0007 do not exist yet)
  -- Skill fixture: (select min(id) from public.skills)
  -- a) display_order outside 1..4 rejected:
  do $$ declare q uuid; v uuid; begin
    insert into public.questions default values returning id into q;
    insert into public.question_versions (question_id, version_number, skill_id, difficulty, stem)
      values (q, 1, (select min(id) from public.skills), 'easy', 'stem') returning id into v;
    insert into public.question_choices (question_version_id, display_order, content) values (v, 5, 'x');
    raise exception 'TEST FAILED: expected check_violation';
  exception when check_violation then raise notice 'PASS: display_order 5 rejected'; end $$;
  -- b) inconsistent timestamps rejected (draft with approved_at set):
  do $$ declare q uuid; begin
    insert into public.questions default values returning id into q;
    insert into public.question_versions (question_id, version_number, skill_id, difficulty, stem, approved_at)
      values (q, 1, (select min(id) from public.skills), 'easy', 'stem', now());
    raise exception 'TEST FAILED: expected check_violation';
  exception when check_violation then raise notice 'PASS: draft with approved_at rejected'; end $$;
  -- c) two open versions for one question rejected (unique partial index):
  do $$ declare q uuid; begin
    insert into public.questions default values returning id into q;
    insert into public.question_versions (question_id, version_number, skill_id, difficulty, stem)
      values (q, 1, (select min(id) from public.skills), 'easy', 'a'),
             (q, 2, (select min(id) from public.skills), 'easy', 'b');
    raise exception 'TEST FAILED: expected unique_violation';
  exception when unique_violation then raise notice 'PASS: second open version rejected'; end $$;
  -- d) bad tag slug rejected:
  do $$ begin insert into public.tags (slug, name) values ('Bad Slug', 'Bad');
    raise exception 'TEST FAILED: expected check_violation';
  exception when check_violation then raise notice 'PASS: tag slug format enforced'; end $$;
  -- e) client roles have no access:
  begin; set local role authenticated; select * from public.question_versions; rollback;  -- permission denied
  -- (Rows created by a-d are rolled back automatically only inside a wrapping
  --  transaction: wrap this whole block in begin; ... rollback;)

ROLLBACK NOTES (reverse order; only after 0004-0009 are rolled back)
    drop table public.question_tags;
    drop table public.tags;
    drop table public.question_choices;
    drop table public.question_versions;
    drop table public.questions;
  Destroys all question content: take a backup/export first on any database
  holding real data. Local-only drafts can be dropped freely.
============================================================================= */
