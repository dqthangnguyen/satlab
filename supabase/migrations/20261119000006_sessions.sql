-- =============================================================================
-- MIGRATION 0006 - Sessions, session items, attempts              [tier: MVP]
-- STATUS : DRAFT for owner review. NOT applied. NOT executed by the author.
-- PURPOSE: practice_sessions (one per Practice run; guests included),
--          session_questions (questions assigned to a session + reveal lock),
--          question_attempts (append-only graded submissions).
--          Four composite foreign keys make the DATABASE guarantee that an
--          attempt's owner, session, item, version, choice and snapshots are
--          mutually consistent, regardless of function bugs.
-- DEPENDS ON: 0001 (skills), 0003 (versions, choices), auth.users.
--             0007 adds the "approved versions only" trigger on session_questions.
-- NOTES:
--   * Practice only: mode is limited to 'practice' (Test/Adaptive are Future).
--   * question_attempts has NO standalone FK to auth.users or skills: user_id
--     is covered by FK 1 (via practice_sessions) and skill_id by FK 4 (via
--     question_versions).
-- =============================================================================

create table public.practice_sessions (
  id                        uuid        primary key default gen_random_uuid(),
  user_id                   uuid        not null references auth.users (id) on delete cascade,
  mode                      text        not null default 'practice' check (mode = 'practice'),
  status                    text        not null default 'in_progress'
                            check (status in ('in_progress', 'completed')),
  max_attempts_per_question smallint   not null default 1
                            check (max_attempts_per_question between 1 and 3),
  config                    jsonb       not null default '{}'::jsonb,
  started_at                timestamptz not null default now(),
  completed_at              timestamptz,
  summary                   jsonb,
  -- Target of question_attempts FK 1 (attempt owner = session owner).
  constraint practice_sessions_id_user_uq unique (id, user_id),
  constraint practice_sessions_completed_ck check (
        ((status = 'completed') = (completed_at is not null))
    and ((completed_at is not null) = (summary is not null))
  )
);
create index practice_sessions_user_started_idx
  on public.practice_sessions (user_id, started_at desc);

create table public.session_questions (
  id                  uuid        primary key default gen_random_uuid(),
  session_id          uuid        not null references public.practice_sessions (id) on delete cascade,
  question_version_id uuid        not null references public.question_versions (id) on delete restrict,
  item_order          smallint    not null check (item_order >= 1),
  revealed_at         timestamptz,                       -- the reveal lock
  constraint session_questions_session_order_uq   unique (session_id, item_order),
  constraint session_questions_session_version_uq unique (session_id, question_version_id),
  -- Target of question_attempts FK 2 (item belongs to this session AND this version).
  constraint session_questions_attempt_fk_uq      unique (id, session_id, question_version_id)
);
create index session_questions_version_idx on public.session_questions (question_version_id);

create table public.question_attempts (
  id                  uuid        primary key default gen_random_uuid(),
  session_id          uuid        not null,
  session_question_id uuid        not null,
  user_id             uuid        not null,
  question_id         uuid        not null,   -- snapshot (see FK 4)
  question_version_id uuid        not null,
  selected_choice_id  uuid        not null,   -- MVP is multiple choice only
  attempt_number      smallint    not null check (attempt_number between 1 and 3),
  is_correct          boolean     not null,   -- written by server functions only
  skill_id            smallint    not null,   -- snapshot (see FK 4)
  difficulty          text        not null check (difficulty in ('easy', 'medium', 'hard')),  -- snapshot
  submitted_at        timestamptz not null default now(),

  constraint question_attempts_item_attempt_uq unique (session_question_id, attempt_number),

  -- FK 1: the attempt's owner is the session's owner.
  constraint question_attempts_owner_fk
    foreign key (session_id, user_id)
    references public.practice_sessions (id, user_id) on delete cascade,
  -- FK 2: the item belongs to this session and this version.
  constraint question_attempts_item_fk
    foreign key (session_question_id, session_id, question_version_id)
    references public.session_questions (id, session_id, question_version_id) on delete cascade,
  -- FK 3: the selected choice belongs to the assigned version.
  constraint question_attempts_choice_fk
    foreign key (question_version_id, selected_choice_id)
    references public.question_choices (question_version_id, id) on delete restrict,
  -- FK 4: question_id / skill_id / difficulty snapshots equal the source version.
  constraint question_attempts_version_fk
    foreign key (question_version_id, question_id, skill_id, difficulty)
    references public.question_versions (id, question_id, skill_id, difficulty) on delete restrict
);
create index question_attempts_user_submitted_idx
  on public.question_attempts (user_id, submitted_at desc);
-- Metric B (first-ever accuracy per user+question): ordered by submitted_at, then id.
create index question_attempts_first_ever_idx
  on public.question_attempts (user_id, question_id, submitted_at, id) where attempt_number = 1;
create index question_attempts_session_idx on public.question_attempts (session_id);

-- Deny by default (policies/grants in 0009).
alter table public.practice_sessions enable row level security;
alter table public.session_questions enable row level security;
alter table public.question_attempts enable row level security;
revoke all on public.practice_sessions from anon, authenticated;
revoke all on public.session_questions from anon, authenticated;
revoke all on public.question_attempts from anon, authenticated;

/* =============================================================================
ACCEPTANCE CHECKS
  select relname, relrowsecurity from pg_class
   where oid in ('public.practice_sessions'::regclass, 'public.session_questions'::regclass,
                 'public.question_attempts'::regclass);                    -- all true
  -- the four composite FKs exist with the intended delete behaviour:
  select conname, confdeltype      -- 'c' = cascade, 'r' = restrict
    from pg_constraint
   where conrelid = 'public.question_attempts'::regclass and contype = 'f'
   order by conname;
   -- question_attempts_choice_fk r | question_attempts_item_fk c |
   -- question_attempts_owner_fk c  | question_attempts_version_fk r
  -- no standalone FK to auth.users or skills on attempts (exactly 4 FKs):
  select count(*) from pg_constraint
   where conrelid = 'public.question_attempts'::regclass and contype = 'f';   -- 4
  -- the partial index for metric B:
  select indexdef from pg_indexes where indexname = 'question_attempts_first_ever_idx';
   -- ... (user_id, question_id, submitted_at, id) WHERE (attempt_number = 1)
  select has_table_privilege('authenticated','public.question_attempts','insert');  -- false

SECURITY / CONSTRAINT TESTS
  -- Behavioural tests that need approved versions (owner mismatch, wrong
  -- choice, wrong snapshots, duplicate attempt_number, cascade from session)
  -- run in the 0008 test block, after the fixture and functions exist.
  -- Structural test here (postgres role, wrap in begin; ... rollback;):
  do $$ begin
    insert into public.practice_sessions (user_id, status) values (gen_random_uuid(), 'completed');
    raise exception 'TEST FAILED: expected foreign_key_violation or check_violation';
  exception when foreign_key_violation or check_violation then
    raise notice 'PASS: bad session rejected (unknown user / completed without summary)';
  end $$;
  do $$ begin
    insert into public.practice_sessions (user_id, max_attempts_per_question)
      values ((select id from auth.users limit 1), 4);
    raise exception 'TEST FAILED: expected check_violation';
  exception when check_violation then raise notice 'PASS: max_attempts 4 rejected'; end $$;

ROLLBACK NOTES (reverse order)
    drop table public.question_attempts;
    drop table public.session_questions;
    drop table public.practice_sessions;
  Destroys all practice history (guest and registered). Export first on real
  data. Drop 0008 functions that reference these tables before rolling back.
============================================================================= */
