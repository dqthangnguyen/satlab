-- =============================================================================
-- MIGRATION 0001 - Taxonomy (domains, skills)                  [tier: MVP]
-- STATUS : DRAFT for owner review. NOT applied anywhere. NOT executed against
--          any PostgreSQL server by the author (no server was available), so
--          syntax is unverified until `supabase db reset` is run locally.
-- PURPOSE: Seeded lookup tables for the SAT content taxonomy. Questions point
--          at a skill; the skill points at a domain; the domain carries the
--          section (reading_writing | math).
-- DEPENDS ON: nothing (first migration).
-- SUPABASE ASSUMPTIONS:
--   * Roles anon, authenticated, service_role exist; migrations run as the
--     `postgres` role, which owns the tables (owner bypasses RLS).
--   * Supabase historically grants broad privileges on new public tables to
--     anon/authenticated, so this migration REVOKES them explicitly. Table
--     access is granted back in migration 0009.
-- SEED DATA SOURCE: College Board "Content Domains" page for the SAT Suite
--   (satsuite.collegeboard.org/higher-ed-professionals/sat-validity/
--   content-domains), retrieved 2026-11-19. The owner must re-verify against
--   the current Assessment Framework before applying. Modelling choice to
--   confirm: "Command of Evidence" lists two sub-skills (Textual,
--   Quantitative); they are modelled here as two skills.
-- RULE: never re-point an existing skill to a different domain. If the
--   official taxonomy changes, add a NEW skill row (historical statistics
--   depend on the skill -> domain mapping staying stable).
-- =============================================================================

create table public.domains (
  id         smallint generated always as identity primary key,
  section    text     not null check (section in ('reading_writing', 'math')),
  code       text     not null unique,
  name       text     not null,
  sort_order smallint not null default 0,
  unique (section, name)
);

create table public.skills (
  id         smallint generated always as identity primary key,
  domain_id  smallint not null references public.domains (id) on delete restrict,
  code       text     not null unique,
  name       text     not null,
  sort_order smallint not null default 0,
  unique (domain_id, name)
);

create index skills_domain_id_idx on public.skills (domain_id);

-- Deny by default: RLS on, no client privileges. Policies/grants arrive in 0009.
alter table public.domains enable row level security;
alter table public.skills  enable row level security;
revoke all on public.domains from anon, authenticated;
revoke all on public.skills  from anon, authenticated;

-- ----------------------------- seed: domains ---------------------------------
insert into public.domains (section, code, name, sort_order) values
  ('reading_writing', 'information_and_ideas',            'Information and Ideas',             1),
  ('reading_writing', 'craft_and_structure',              'Craft and Structure',               2),
  ('reading_writing', 'expression_of_ideas',              'Expression of Ideas',               3),
  ('reading_writing', 'standard_english_conventions',     'Standard English Conventions',      4),
  ('math',            'algebra',                          'Algebra',                           1),
  ('math',            'advanced_math',                    'Advanced Math',                     2),
  ('math',            'problem_solving_and_data_analysis','Problem-Solving and Data Analysis', 3),
  ('math',            'geometry_and_trigonometry',        'Geometry and Trigonometry',         4);

-- ----------------------------- seed: skills ----------------------------------
insert into public.skills (domain_id, code, name, sort_order)
select d.id, v.code, v.name, v.sort_order
from (values
  -- Reading and Writing
  ('information_and_ideas', 'central_ideas_and_details',          'Central Ideas and Details',          1),
  ('information_and_ideas', 'command_of_evidence_textual',        'Command of Evidence: Textual',       2),
  ('information_and_ideas', 'command_of_evidence_quantitative',   'Command of Evidence: Quantitative',  3),
  ('information_and_ideas', 'inferences',                         'Inferences',                         4),
  ('craft_and_structure',   'words_in_context',                   'Words in Context',                   1),
  ('craft_and_structure',   'text_structure_and_purpose',         'Text Structure and Purpose',         2),
  ('craft_and_structure',   'cross_text_connections',             'Cross-Text Connections',             3),
  ('expression_of_ideas',   'rhetorical_synthesis',               'Rhetorical Synthesis',               1),
  ('expression_of_ideas',   'transitions',                        'Transitions',                        2),
  ('standard_english_conventions', 'boundaries',                  'Boundaries',                         1),
  ('standard_english_conventions', 'form_structure_and_sense',    'Form, Structure, and Sense',         2),
  -- Math
  ('algebra', 'linear_equations_one_variable',        'Linear equations in one variable',                          1),
  ('algebra', 'linear_equations_two_variables',       'Linear equations in two variables',                         2),
  ('algebra', 'linear_functions',                     'Linear functions',                                          3),
  ('algebra', 'systems_two_linear_equations',         'Systems of two linear equations in two variables',          4),
  ('algebra', 'linear_inequalities',                  'Linear inequalities in one or two variables',               5),
  ('advanced_math', 'equivalent_expressions',         'Equivalent expressions',                                    1),
  ('advanced_math', 'nonlinear_equations_and_systems','Nonlinear equations in one variable and systems of equations in two variables', 2),
  ('advanced_math', 'nonlinear_functions',            'Nonlinear functions',                                       3),
  ('problem_solving_and_data_analysis', 'ratios_rates_proportional_units', 'Ratios, rates, proportional relationships, and units', 1),
  ('problem_solving_and_data_analysis', 'percentages',                     'Percentages',                                           2),
  ('problem_solving_and_data_analysis', 'one_variable_data',               'One-variable data: Distributions and measures of center and spread', 3),
  ('problem_solving_and_data_analysis', 'two_variable_data',               'Two-variable data: Models and scatterplots',            4),
  ('problem_solving_and_data_analysis', 'probability_conditional',         'Probability and conditional probability',               5),
  ('problem_solving_and_data_analysis', 'inference_sample_statistics_moe', 'Inference from sample statistics and margin of error',  6),
  ('problem_solving_and_data_analysis', 'evaluating_statistical_claims',   'Evaluating statistical claims: Observational studies and experiments', 7),
  ('geometry_and_trigonometry', 'area_and_volume',                'Area and volume',                    1),
  ('geometry_and_trigonometry', 'lines_angles_triangles',         'Lines, angles, and triangles',       2),
  ('geometry_and_trigonometry', 'right_triangles_trigonometry',   'Right triangles and trigonometry',   3),
  ('geometry_and_trigonometry', 'circles',                        'Circles',                            4)
) as v (domain_code, code, name, sort_order)
join public.domains d on d.code = v.domain_code;

/* =============================================================================
ACCEPTANCE CHECKS (run locally after applying)
  select count(*) from public.domains;                        -- expect 8
  select count(*) from public.skills;                         -- expect 30
  select d.code, count(*) from public.skills s join public.domains d on d.id = s.domain_id
   group by d.code order by 1;
     -- expect: information_and_ideas 4, craft_and_structure 3,
     --         expression_of_ideas 2, standard_english_conventions 2,
     --         algebra 5, advanced_math 3,
     --         problem_solving_and_data_analysis 7, geometry_and_trigonometry 4
  select relname, relrowsecurity from pg_class
   where oid in ('public.domains'::regclass, 'public.skills'::regclass);  -- both true
  select has_table_privilege('anon','public.domains','select'),
         has_table_privilege('authenticated','public.domains','select'),
         has_table_privilege('authenticated','public.skills','insert');   -- all false

SECURITY TESTS (after 0001; the SELECT grant for authenticated arrives in 0009)
  -- As anon or authenticated, every access must be denied or return no rows:
  begin; set local role anon;          select * from public.domains; rollback;  -- permission denied
  begin; set local role authenticated; select * from public.skills;  rollback;  -- permission denied (until 0009)
  begin; set local role authenticated; insert into public.domains (section, code, name)
         values ('math','x','x'); rollback;                                      -- permission denied (also after 0009)

ROLLBACK NOTES
  Run rollbacks in REVERSE order (0009 -> 0001); later migrations depend on this one.
    drop table public.skills;
    drop table public.domains;
  Destroys seed data; re-applying the migration restores it. Safe only while
  no question_versions rows exist (they reference skills with ON DELETE RESTRICT).
============================================================================= */
