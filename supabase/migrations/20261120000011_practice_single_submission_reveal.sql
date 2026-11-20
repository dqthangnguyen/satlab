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
  if exists (
    select 1
    from public.question_attempts a
    where a.session_question_id = p_session_question_id
  ) then
    raise exception 'already_answered';
  end if;

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
    p_choice_id, 1, v_is_correct, v_skill_id, v_difficulty);

  update public.session_questions
  set revealed_at = now()
  where id = p_session_question_id;

  return jsonb_build_object(
    'result', case when v_is_correct then 'correct' else 'incorrect' end,
    'revealed', true,
    'correct_choice_id', v_correct_choice_id,
    'explanation', v_explanation
  );
end;
$$;

comment on function public.submit_answer(uuid, uuid) is
  'Accepts one answer for an owned in-progress Practice item, then reveals the authoritative correct answer and explanation.';
