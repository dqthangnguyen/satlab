-- Keep attempt history, but remove the old 3-submission ceiling.
alter table public.question_attempts
  drop constraint if exists question_attempts_attempt_number_check;

alter table public.question_attempts
  alter column attempt_number type bigint using attempt_number::bigint;

alter table public.question_attempts
  add constraint question_attempts_attempt_number_check check (attempt_number >= 1);

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
  v_question_id       uuid;
  v_skill_id          smallint;
  v_difficulty        text;
  v_version_status    text;
  v_attempt_count     bigint;
  v_attempt_number    bigint;
  v_correct_choice_id uuid;
  v_explanation       text;
  v_is_correct        boolean;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  select sq.session_id, sq.question_version_id, sq.revealed_at, ps.status
    into v_session_id, v_version_id, v_revealed_at, v_session_status
  from public.session_questions sq
  join public.practice_sessions ps on ps.id = sq.session_id
  where sq.id = p_session_question_id
    and ps.user_id = v_user
  for update of sq for share of ps;
  if not found then
    raise exception 'item_not_found';
  end if;

  if v_session_status <> 'in_progress' then raise exception 'session_not_in_progress'; end if;
  if v_revealed_at is not null then raise exception 'already_revealed'; end if;

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

  select count(*) into v_attempt_count
  from public.question_attempts a
  where a.session_question_id = p_session_question_id;
  v_attempt_number := v_attempt_count + 1;

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

  if v_is_correct then
    update public.session_questions set revealed_at = now() where id = p_session_question_id;
  end if;

  return jsonb_build_object(
    'result', case when v_is_correct then 'correct' else 'incorrect' end,
    'revealed', v_is_correct,
    'correct_choice_id', case when v_is_correct then v_correct_choice_id end,
    'explanation', case when v_is_correct then v_explanation end
  );
end;
$$;

create or replace function public.completed_session_review(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   uuid := auth.uid();
  v_status text;
  v_items  jsonb;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  select ps.status into v_status
  from public.practice_sessions ps
  where ps.id = p_session_id and ps.user_id = v_user
  for share;
  if not found then
    raise exception 'session_not_found';
  end if;
  if v_status <> 'completed' then
    raise exception 'session_not_completed';
  end if;

  if exists (
    select 1
    from public.session_questions sq
    left join private.question_answer_keys k on k.question_version_id = sq.question_version_id
    where sq.session_id = p_session_id and k.question_version_id is null
  ) then
    raise exception 'key_missing';
  end if;

  if exists (
    select 1
    from public.session_questions sq
    left join public.question_choices c on c.question_version_id = sq.question_version_id
    where sq.session_id = p_session_id
    group by sq.id
    having count(c.id) <> 4
  ) then
    raise exception 'question_choices_incomplete';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', sq.id,
        'question_version_id', qv.id,
        'item_order', sq.item_order,
        'revealed_at', sq.revealed_at,
        'question', jsonb_build_object(
          'id', qv.id,
          'question_id', qv.question_id,
          'version_number', qv.version_number,
          'skill_id', qv.skill_id,
          'difficulty', qv.difficulty,
          'passage', qv.passage,
          'stem', qv.stem,
          'status', qv.status
        ),
        'choices', (
          select jsonb_agg(
            jsonb_build_object(
              'id', c.id,
              'question_version_id', c.question_version_id,
              'display_order', c.display_order,
              'content', c.content
            ) order by c.display_order
          )
          from public.question_choices c
          where c.question_version_id = qv.id
        ),
        'attempts', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', a.id,
              'session_question_id', a.session_question_id,
              'selected_choice_id', a.selected_choice_id,
              'attempt_number', a.attempt_number,
              'is_correct', a.is_correct,
              'submitted_at', a.submitted_at
            ) order by a.attempt_number
          )
          from public.question_attempts a
          where a.session_question_id = sq.id
        ), '[]'::jsonb),
        'review', jsonb_build_object(
          'correct_choice_id', k.correct_choice_id,
          'explanation', k.explanation
        )
      ) order by sq.item_order
    ),
    '[]'::jsonb
  ) into v_items
  from public.session_questions sq
  join public.question_versions qv on qv.id = sq.question_version_id
  join private.question_answer_keys k on k.question_version_id = qv.id
  where sq.session_id = p_session_id;

  return jsonb_build_object('items', v_items);
end;
$$;

revoke all on function public.completed_session_review(uuid) from public, anon, authenticated, service_role;
grant execute on function public.completed_session_review(uuid) to authenticated;

comment on function public.completed_session_review(uuid) is
  'Returns exact immutable version content and private answer-key data only to the authenticated owner of a completed practice session.';

/*
Local verification expectations:
  - old attempt_number values remain unchanged and now accept values above 3;
  - incorrect submissions do not reveal or lock the item;
  - correct submissions still reveal and lock the item;
  - completed_session_review rejects another user's session and in-progress sessions;
  - the session owner receives the exact version, choices, submitted choice IDs,
    correctness values, correct choice and explanation after completion;
  - authenticated clients still cannot select from private.question_answer_keys.
*/
