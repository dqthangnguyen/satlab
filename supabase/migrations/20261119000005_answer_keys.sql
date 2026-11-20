-- =============================================================================
-- MIGRATION 0005 - Private answer keys                       [tier: Foundation]
-- STATUS : DRAFT for owner review. NOT applied. NOT executed by the author.
-- PURPOSE: The canonical answer key and explanation live ONLY in the `private`
--          schema, which is not exposed through the Supabase API. The key
--          references a choice by ID (never by letter). Grading and key
--          reveal happen only inside SECURITY DEFINER functions (0008).
-- DEPENDS ON: 0002 (private schema), 0003 (question_versions, question_choices).
-- DEVIATION FROM THE PRESENTED SPEC (flagged for review):
--   The composite FK to question_choices is `ON DELETE NO ACTION` as approved,
--   but declared DEFERRABLE INITIALLY DEFERRED. Reason: deleting a DRAFT
--   version cascades to both its choices and its key; with an immediate
--   NO ACTION check, the check on the choice delete can run before the key row
--   is cascade-deleted and wrongly fail. Deferring the check to commit time
--   fixes this without changing the rule (a key may only reference a choice of
--   its own version). Consequence: a bad key is reported at COMMIT, not at the
--   INSERT; tests must run `set constraints ... immediate;` to see it earlier.
--   Please confirm or reject this refinement during review.
-- SUPABASE ASSUMPTIONS: `private` is not in the API's exposed schemas.
-- =============================================================================

create table private.question_answer_keys (
  question_version_id uuid        primary key
                                  references public.question_versions (id) on delete cascade,
  correct_choice_id   uuid        not null,
  explanation         text        not null check (length(btrim(explanation)) > 0),
  created_at          timestamptz not null default now(),
  -- The correct choice must belong to the SAME version as the key.
  constraint question_answer_keys_correct_choice_fk
    foreign key (question_version_id, correct_choice_id)
    references public.question_choices (question_version_id, id)
    on delete no action
    deferrable initially deferred
);

alter table private.question_answer_keys enable row level security;
-- No policies and no grants: only SECURITY DEFINER functions / the owner can read it.
revoke all on private.question_answer_keys from public, anon, authenticated;

/* =============================================================================
ACCEPTANCE CHECKS
  select relrowsecurity from pg_class where oid = 'private.question_answer_keys'::regclass;  -- true
  select has_table_privilege('anon','private.question_answer_keys','select'),
         has_table_privilege('authenticated','private.question_answer_keys','select'),
         has_schema_privilege('authenticated','private','usage');                -- all false
  select count(*) from pg_policies where schemaname = 'private';                  -- 0 (no policies by design)
  -- Not reachable through the REST API (run against the LOCAL stack):
  --   curl "$API_URL/rest/v1/question_answer_keys" -H "apikey: $ANON_KEY" -H "Accept-Profile: private"
  --   expect an error (schema not exposed), never rows.
  -- Composite FK definition:
  select pg_get_constraintdef(oid) from pg_constraint
   where conname = 'question_answer_keys_correct_choice_fk';
   -- expect ... DEFERRABLE INITIALLY DEFERRED and NO ACTION behaviour

SECURITY / CONSTRAINT TESTS (postgres role, local; wrap in begin; ... rollback;)
  -- a) client roles cannot read the key table:
  begin; set local role authenticated; select * from private.question_answer_keys; rollback;
         -- expect: permission denied for schema private
  begin; set local role anon;          select * from private.question_answer_keys; rollback;  -- same
  -- b) a key pointing at ANOTHER version's choice is rejected. Build two draft
  --    versions (v1, v2) each with 4 choices; then:
  --      insert into private.question_answer_keys (question_version_id, correct_choice_id, explanation)
  --        values (<v1>, <a choice id of v2>, 'x');
  --      set constraints question_answer_keys_correct_choice_fk immediate;   -- forces the deferred check
  --    expect: foreign_key_violation
  -- c) deleting a DRAFT version cascades to choices and key without error
  --    (this is the case the deferral exists for):
  --      delete from public.question_versions where id = <draft id with choices + key>;
  --      set constraints all immediate;     -- expect success, no violation
  -- d) blank explanation rejected (check_violation).

ROLLBACK NOTES
    drop table private.question_answer_keys;
  Destroys every answer key: export first on real data. Without it, grading
  (0008) fails with key_missing, so roll back 0008 first.
============================================================================= */
