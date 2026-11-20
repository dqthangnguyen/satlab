-- =============================================================================
-- MIGRATION 0009 - RLS policies and table grants          [tier: Foundation]
-- STATUS : DRAFT for owner review. NOT applied. NOT executed by the author.
-- PURPOSE: Opens read access exactly as the approved RLS matrix says. RLS was
--          already ENABLED on every table in its own migration and all client
--          privileges were REVOKED, so until this migration the database is
--          deny-by-default. This migration grants SELECT only (no INSERT /
--          UPDATE / DELETE to any client role, ever) and adds SELECT policies.
-- DEPENDS ON: 0001-0008 (is_admin() from 0002 must be executable by `authenticated`).
-- SUPABASE ASSUMPTIONS:
--   * Guests (anonymous sign-ins) use the `authenticated` role; `anon` (no
--     session) gets nothing. The app signs in anonymously on load.
--   * `usage` on schema public is already granted to anon/authenticated.
--   * Policy expressions run as the querying role, so is_admin() needs EXECUTE
--     for `authenticated` (granted in 0002). Policies call it as
--     (select public.is_admin()) so Postgres evaluates it once per query.
--   * private.question_answer_keys deliberately gets NO grant and NO policy.
-- WRITES: none from clients. Writes happen only through the SECURITY DEFINER
--   functions in 0008, the service role (drafts), or SQL (taxonomy, tags,
--   official references, user_roles).
-- =============================================================================

-- ------------------------------------------------------------- grants --------
grant select on
  public.domains, public.skills, public.tags,
  public.official_references, public.official_reference_links,
  public.questions, public.question_tags,
  public.question_versions, public.question_choices,
  public.question_sources, public.question_reviews,
  public.user_roles,
  public.practice_sessions, public.session_questions, public.question_attempts
to authenticated;

-- ----------------------------------------------------- reference / taxonomy ---
create policy domains_select on public.domains
  for select to authenticated using (true);
create policy skills_select on public.skills
  for select to authenticated using (true);
create policy tags_select on public.tags
  for select to authenticated using (true);

create policy official_references_select_active on public.official_references
  for select to authenticated using (is_active);
create policy official_references_select_admin on public.official_references
  for select to authenticated using ((select public.is_admin()));

create policy official_reference_links_select_active on public.official_reference_links
  for select to authenticated
  using (exists (
    select 1 from public.official_references r
    where r.id = official_reference_links.reference_id and r.is_active));
create policy official_reference_links_select_admin on public.official_reference_links
  for select to authenticated using ((select public.is_admin()));

-- ------------------------------------------------------------ question bank ---
-- Students: approved versions only. Admins: everything.
create policy question_versions_select_approved on public.question_versions
  for select to authenticated using (status = 'approved');
create policy question_versions_select_admin on public.question_versions
  for select to authenticated using ((select public.is_admin()));

create policy question_choices_select_approved on public.question_choices
  for select to authenticated
  using (exists (
    select 1 from public.question_versions v
    where v.id = question_choices.question_version_id and v.status = 'approved'));
create policy question_choices_select_admin on public.question_choices
  for select to authenticated using ((select public.is_admin()));

create policy questions_select_approved on public.questions
  for select to authenticated
  using (exists (
    select 1 from public.question_versions v
    where v.question_id = questions.id and v.status = 'approved'));
create policy questions_select_admin on public.questions
  for select to authenticated using ((select public.is_admin()));

create policy question_tags_select_approved on public.question_tags
  for select to authenticated
  using (exists (
    select 1 from public.question_versions v
    where v.question_id = question_tags.question_id and v.status = 'approved'));
create policy question_tags_select_admin on public.question_tags
  for select to authenticated using ((select public.is_admin()));

-- ------------------------------------------------ provenance / review (admin) ---
create policy question_sources_select_admin on public.question_sources
  for select to authenticated using ((select public.is_admin()));
create policy question_reviews_select_admin on public.question_reviews
  for select to authenticated using ((select public.is_admin()));

-- ----------------------------------------------------------------- roles ------
create policy user_roles_select_own on public.user_roles
  for select to authenticated using (user_id = (select auth.uid()));
create policy user_roles_select_admin on public.user_roles
  for select to authenticated using ((select public.is_admin()));

-- ------------------------------------------------- sessions, items, attempts ---
-- Owner-only. A row whose version is no longer approved stays visible here, but
-- the embedded question_versions row is not (the app treats that as "unavailable").
create policy practice_sessions_select_own on public.practice_sessions
  for select to authenticated using (user_id = (select auth.uid()));

create policy session_questions_select_own on public.session_questions
  for select to authenticated
  using (exists (
    select 1 from public.practice_sessions ps
    where ps.id = session_questions.session_id and ps.user_id = (select auth.uid())));

create policy question_attempts_select_own on public.question_attempts
  for select to authenticated using (user_id = (select auth.uid()));

/* =============================================================================
ACCEPTANCE CHECKS
  -- 1. All 16 tables have RLS enabled:
  select c.oid::regclass as tbl, c.relrowsecurity
    from pg_class c
   where c.oid in (
     'public.domains'::regclass, 'public.skills'::regclass, 'public.questions'::regclass,
     'public.question_versions'::regclass, 'public.question_choices'::regclass,
     'public.tags'::regclass, 'public.question_tags'::regclass,
     'public.official_references'::regclass, 'public.official_reference_links'::regclass,
     'public.question_sources'::regclass, 'public.question_reviews'::regclass,
     'public.user_roles'::regclass, 'public.practice_sessions'::regclass,
     'public.session_questions'::regclass, 'public.question_attempts'::regclass,
     'private.question_answer_keys'::regclass);                       -- 16 rows, all true
  -- 2. No client role has any write privilege on any table:
  select grantee, table_schema, table_name, privilege_type
    from information_schema.role_table_grants
   where grantee in ('anon','authenticated')
     and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER');   -- 0 rows
  -- 3. anon has no table privileges at all; authenticated has SELECT only:
  select grantee, count(*) from information_schema.role_table_grants
   where grantee in ('anon','authenticated') and table_schema in ('public','private')
   group by grantee;                       -- anon: no rows | authenticated: 15 (SELECT only)
  -- 4. The private key table has no grants and no policies:
  select count(*) from information_schema.role_table_grants
   where table_schema = 'private' and grantee in ('anon','authenticated','public');  -- 0
  select count(*) from pg_policies where schemaname = 'private';                      -- 0
  -- 5. Policy inventory matches the matrix:
  select tablename, policyname, cmd, roles from pg_policies where schemaname = 'public' order by 1, 2;
     -- every row: cmd = SELECT, roles = {authenticated}

SECURITY TESTS (local; fixture A from the 0007 test block; wrap in begin; ... rollback;)
  Guests: a001 / a002 (is_admin = false). Admin: ad01 (non-anonymous, has a role row).
  Impersonate:  set local role authenticated;
                select set_config('request.jwt.claims','{"sub":"<uuid>","role":"authenticated","is_anonymous":<bool>}', true);
  -- No session (anon role): every table -> permission denied.
  -- Guest A:
  --   select id, status from question_versions;            -- ONLY ...0003 (approved); never draft/pending/rejected/archived
  --   select * from question_choices;                       -- only the 4 choices of ...0003
  --   select id from questions;                             -- only question ...0003
  --   select * from question_tags;                          -- only tags of questions with an approved version
  --   select * from question_sources;  select * from question_reviews;   -- 0 rows
  --   select * from user_roles;                             -- 0 rows (guest has no role row)
  --   insert / update / delete on ANY table                 -- permission denied
  --   select * from private.question_answer_keys;           -- permission denied for schema private
  --   select * from official_references;                    -- active rows only
  -- Isolation: create a session as guest A (public.create_session). As guest B:
  --   select * from practice_sessions / session_questions / question_attempts  -- 0 rows
  --   public.submit_answer(<A's item>, <choice>)            -- item_not_found
  -- Admin ad01 (non-anonymous):
  --   select status from question_versions;                 -- all 5 statuses visible
  --   select * from question_sources / question_reviews;    -- visible
  --   select * from private.question_answer_keys;           -- STILL permission denied (admins use get_answer_key)
  --   public.get_answer_key('20000000-0000-0000-0000-000000000003')   -- returns key
  --   admin directly inserting/updating a table            -- permission denied
  -- Anonymous token that wrongly has a user_roles row (is_anonymous = true):
  --   behaves as a plain guest (is_admin() false): sees only approved versions.
  -- No permission errors for normal guests:
  --   select count(*) from question_versions; select count(*) from questions;
  --   (these policies call is_admin(); they must succeed, proving EXECUTE for authenticated works)
  -- Unavailable-item visibility: guest A creates a session, admin withdraws that version;
  --   guest A still selects the session_questions row, but the embedded version/choices
  --   (select ... from question_versions where id = <that id>) return 0 rows.
  -- REST exposure (local stack): GET /rest/v1/question_answer_keys with Accept-Profile: private -> error.

ROLLBACK NOTES
  Policies and grants are independent of the data:
    drop policy <name> on <table>;  (all names above; list with: select policyname, tablename from pg_policies where schemaname='public';)
    revoke select on <the 15 public tables> from authenticated;
  Rolling back returns the database to deny-by-default (clients see nothing), which is safe.
  NEVER "fix" access problems by disabling RLS or granting write privileges to client roles.
============================================================================= */
