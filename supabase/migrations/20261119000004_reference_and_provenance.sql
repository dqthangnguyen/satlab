-- =============================================================================
-- MIGRATION 0004 - Official references, provenance, reviews
--                                   [tiers: official_* = MVP; sources/reviews = Foundation]
-- STATUS : DRAFT for owner review. NOT applied. NOT executed by the author.
-- PURPOSE: official_references (+ links to a domain OR a skill) store ONLY
--          references (title, URL, type) - never question text.
--          question_sources records provenance per version (AI model, prompt
--          version, batch, spec followed). question_reviews is the append-only
--          admin decision log (append-only enforcement trigger is in 0007).
-- DEPENDS ON: 0001 (domains, skills), 0003 (question_versions), auth.users.
-- =============================================================================

create table public.official_references (
  id               uuid        primary key default gen_random_uuid(),
  title            text        not null check (length(btrim(title)) > 0),
  url              text        not null unique check (url like 'https://%'),
  resource_type    text        not null check (resource_type in (
                     'practice_test', 'question_bank', 'assessment_framework',
                     'scoring_guide', 'skill_specification', 'other')),
  provider         text        not null default 'College Board',
  description      text,
  last_verified_on date,
  is_active        boolean     not null default true,
  created_at       timestamptz not null default now()
);

create table public.official_reference_links (
  id           uuid     primary key default gen_random_uuid(),
  reference_id uuid     not null references public.official_references (id) on delete cascade,
  domain_id    smallint references public.domains (id) on delete cascade,
  skill_id     smallint references public.skills  (id) on delete cascade,
  -- Exactly one target: true only when precisely one of the two is set.
  constraint official_reference_links_one_target_ck
    check ((domain_id is null) <> (skill_id is null))
);
create unique index official_reference_links_ref_domain_uq
  on public.official_reference_links (reference_id, domain_id) where domain_id is not null;
create unique index official_reference_links_ref_skill_uq
  on public.official_reference_links (reference_id, skill_id)  where skill_id  is not null;
create index official_reference_links_domain_idx on public.official_reference_links (domain_id);
create index official_reference_links_skill_idx  on public.official_reference_links (skill_id);

create table public.question_sources (
  question_version_id uuid        primary key
                                  references public.question_versions (id) on delete cascade,  -- 1:1
  source_type         text        not null check (source_type in ('ai_generated', 'human_authored', 'human_revised')),
  ai_model            text,
  prompt_version      text,
  generation_batch_id uuid,
  spec_reference_id   uuid        references public.official_references (id) on delete set null,
  notes               text,
  created_at          timestamptz not null default now(),
  constraint question_sources_ai_model_ck
    check (source_type <> 'ai_generated' or ai_model is not null)
);
create index question_sources_batch_idx
  on public.question_sources (generation_batch_id) where generation_batch_id is not null;

create table public.question_reviews (
  id                    uuid        primary key default gen_random_uuid(),
  question_version_id   uuid        not null references public.question_versions (id) on delete restrict,
  reviewer_id           uuid        not null references auth.users (id) on delete restrict,  -- admins with history cannot be deleted
  decision              text        not null check (decision in ('approved', 'rejected', 'withdrawn')),
  notes                 text,
  originality_confirmed boolean     not null default false,
  created_at            timestamptz not null default now(),
  -- Approval requires confirming the content is original (copyright rule).
  constraint question_reviews_originality_ck check (decision <> 'approved' or originality_confirmed),
  -- Rejections and withdrawals need a written reason.
  constraint question_reviews_notes_ck
    check (decision = 'approved' or length(btrim(coalesce(notes, ''))) > 0)
);
create index question_reviews_version_created_idx
  on public.question_reviews (question_version_id, created_at);

-- Deny by default (policies/grants in 0009).
alter table public.official_references      enable row level security;
alter table public.official_reference_links enable row level security;
alter table public.question_sources         enable row level security;
alter table public.question_reviews         enable row level security;
revoke all on public.official_references      from anon, authenticated;
revoke all on public.official_reference_links from anon, authenticated;
revoke all on public.question_sources          from anon, authenticated;
revoke all on public.question_reviews          from anon, authenticated;

/* =============================================================================
ACCEPTANCE CHECKS
  select relname, relrowsecurity from pg_class
   where oid in ('public.official_references'::regclass, 'public.official_reference_links'::regclass,
                 'public.question_sources'::regclass,    'public.question_reviews'::regclass);  -- all true
  select conname from pg_constraint where conrelid = 'public.official_reference_links'::regclass;
        -- includes official_reference_links_one_target_ck
  select conname from pg_constraint where conrelid = 'public.question_reviews'::regclass
   and contype = 'c';   -- ..._originality_ck, ..._notes_ck (plus decision check)
  select count(*) from information_schema.columns
   where table_schema = 'public' and table_name = 'official_references'
     and column_name in ('question_text','stem','body','content');   -- expect 0 (references only)

SECURITY / CONSTRAINT TESTS (postgres role, local; wrap in begin; ... rollback;)
  -- a) link with BOTH targets rejected:
  do $$ declare r uuid; begin
    insert into public.official_references (title, url, resource_type)
      values ('Test ref', 'https://example.org/a', 'other') returning id into r;
    insert into public.official_reference_links (reference_id, domain_id, skill_id)
      values (r, (select min(id) from public.domains), (select min(id) from public.skills));
    raise exception 'TEST FAILED: expected check_violation';
  exception when check_violation then raise notice 'PASS: both targets rejected'; end $$;
  -- b) link with NEITHER target rejected:
  do $$ declare r uuid; begin
    insert into public.official_references (title, url, resource_type)
      values ('Test ref', 'https://example.org/b', 'other') returning id into r;
    insert into public.official_reference_links (reference_id) values (r);
    raise exception 'TEST FAILED: expected check_violation';
  exception when check_violation then raise notice 'PASS: no target rejected'; end $$;
  -- c) non-https URL rejected:
  do $$ begin insert into public.official_references (title, url, resource_type)
      values ('Bad', 'http://example.org/c', 'other');
    raise exception 'TEST FAILED: expected check_violation';
  exception when check_violation then raise notice 'PASS: non-https URL rejected'; end $$;
  -- d) AI source without a model rejected (needs a draft version; build one first):
  --    insert into public.question_sources (question_version_id, source_type)
  --      values (<draft version id>, 'ai_generated');   -- expect check_violation
  -- e) approval review without originality confirmation rejected, rejection
  --    without notes rejected (needs a version id and an auth.users row):
  --    insert into public.question_reviews (question_version_id, reviewer_id, decision)
  --      values (<version>, <admin>, 'approved');         -- expect check_violation
  --    insert into public.question_reviews (question_version_id, reviewer_id, decision)
  --      values (<version>, <admin>, 'rejected');         -- expect check_violation
  -- f) client roles have no access (before 0009):
  begin; set local role authenticated; select * from public.question_reviews; rollback;  -- permission denied

ROLLBACK NOTES (reverse order; after 0005-0009 are rolled back)
    drop table public.question_reviews;   -- destroys the audit trail: export first on real data
    drop table public.question_sources;
    drop table public.official_reference_links;
    drop table public.official_references;
============================================================================= */
