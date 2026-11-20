-- =============================================================================
-- MIGRATION 0002 - Private schema, user_roles, is_admin()      [tier: Foundation]
-- STATUS : DRAFT for owner review. NOT applied. NOT executed by the author.
-- PURPOSE: Creates the `private` schema (home of the answer key, never exposed
--          through the API), the user_roles table (multi-admin ready) and the
--          is_admin() helper used by RLS policies and admin functions.
-- DEPENDS ON: Supabase `auth` schema (auth.users, auth.uid(), auth.jwt()).
--             Migration order otherwise independent of 0001.
-- SUPABASE ASSUMPTIONS:
--   * `private` is NOT listed in the API's exposed schemas (default config is
--     public + graphql_public). Verify in supabase/config.toml [api] schemas
--     and in the hosted project's API settings.
--   * auth.jwt() returns the request's JWT claims as jsonb and anonymous
--     sign-ins carry the claim is_anonymous = true.
--   * RLS expressions run with the privileges of the querying role, so
--     is_admin() needs EXECUTE for `authenticated` (granted below). It is
--     SECURITY DEFINER so it can read user_roles regardless of that table's
--     own policy (avoids a policy that depends on itself).
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.user_roles (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  role       text        not null check (role in ('admin')),
  granted_at timestamptz not null default now(),
  granted_by uuid        references auth.users (id) on delete set null,
  primary key (user_id, role)
);

alter table public.user_roles enable row level security;
revoke all on public.user_roles from anon, authenticated;

-- True only for a signed-in, NON-anonymous user that has an admin role row.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    auth.uid() is not null
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and exists (
      select 1
      from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role = 'admin'
    ),
    false
  );
$$;

-- Supabase grants EXECUTE on new functions to anon/authenticated/service_role by
-- default; revoke everything first, then grant only what the design allows.
revoke all on function public.is_admin() from public, anon, authenticated, service_role;
grant execute on function public.is_admin() to authenticated;

/* =============================================================================
ACCEPTANCE CHECKS
  select schema_name from information_schema.schemata where schema_name = 'private';   -- 1 row
  select relrowsecurity from pg_class where oid = 'public.user_roles'::regclass;       -- true
  select has_function_privilege('authenticated','public.is_admin()','execute'),        -- true
         has_function_privilege('anon','public.is_admin()','execute'),                 -- false
         has_function_privilege('service_role','public.is_admin()','execute');         -- false
  select proconfig from pg_proc where proname = 'is_admin';   -- contains search_path=""
  -- `private` must not be exposed: supabase/config.toml [api] schemas must not list it.

SECURITY TESTS (local only; uses throwaway users inside a transaction)
  -- Harness: users are inserted as postgres, then we impersonate via JWT claims.
  begin;
    insert into auth.users (id, aud, role) values
      ('00000000-0000-0000-0000-00000000a001','authenticated','authenticated'),
      ('00000000-0000-0000-0000-00000000ad01','authenticated','authenticated');
    insert into public.user_roles (user_id, role) values
      ('00000000-0000-0000-0000-00000000ad01','admin'),
      ('00000000-0000-0000-0000-00000000a001','admin');  -- guest wrongly given a role row
    -- 1) real admin (non-anonymous) -> true
    set local role authenticated;
    select set_config('request.jwt.claims',
      '{"sub":"00000000-0000-0000-0000-00000000ad01","role":"authenticated","is_anonymous":false}', true);
    select public.is_admin();                                  -- expect true
    -- 2) anonymous token, even WITH a role row -> false
    select set_config('request.jwt.claims',
      '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated","is_anonymous":true}', true);
    select public.is_admin();                                  -- expect false
    -- 3) no sub claim -> false
    select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
    select public.is_admin();                                  -- expect false
    -- 4) anon role cannot call it
    reset role; set local role anon;
    select public.is_admin();                                  -- expect: permission denied for function
  rollback;
  -- NOTE: if auth.uid() on your Supabase version reads request.jwt.claim.sub
  -- instead of request.jwt.claims, also set that GUC. Check the installed
  -- auth.uid() definition: select pg_get_functiondef('auth.uid()'::regprocedure);

ROLLBACK NOTES (reverse order; only after 0003+ are rolled back)
    drop function public.is_admin();
    drop table public.user_roles;
    drop schema private;      -- fails if private objects still exist (0005 first)
  Dropping user_roles removes every admin grant; re-grant by SQL afterwards.
============================================================================= */
