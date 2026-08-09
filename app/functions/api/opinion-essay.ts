// GET/POST /api/opinion-essay -- Fase 10, OpinionEssayEngine (docs/05 item
// 4). GET devolve o tema/vocabulario-alvo ativo (do planejador) e a ultima
// tentativa, se houver. POST recebe o texto, chama a correcao via rubrica
// LLM (Hugging Face) e grava a tentativa -- mesmo padrao de showed_up=1 +
// correction_json ja usado no schema (attempts), so que este e' o primeiro
// engine a de fato preencher correction_json.
import { getCurrentUser, unauthorized } from "../_lib/auth";
import { gradeOpinionEssay } from "../_lib/llm";
import { ensureEssayExercise, getActiveEssayPlan, latestEssayAttempt, parseTargetVocabulary, WORD_TARGET } from "../_lib/opinionEssay";
import { Env } from "../_lib/types";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getCurrentUser({ request, env });
  if (!user) return unauthorized();

  const plan = await getActiveEssayPlan(env.DB, user.id);
  if (!plan) {
    return Response.json({ has_theme: false });
  }

  const targetVocabulary = parseTargetVocabulary(plan.target_vocabulary);
  const previous = plan.exercise_id ? await latestEssayAttempt(env.DB, user.id, plan.exercise_id) : null;

  return Response.json({
    has_theme: true,
    theme: plan.theme_text,
    target_vocabulary: targetVocabulary,
    word_target: WORD_TARGET,
    previous: previous
      ? { user_response: previous.user_response, correction: JSON.parse(previous.correction_json ?? "null") }
      : null,
  });
};

interface Body {
  text: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getCurrentUser({ request, env });
  if (!user) return unauthorized();

  const plan = await getActiveEssayPlan(env.DB, user.id);
  if (!plan) {
    return Response.json({ error: "nenhum tema ativo -- preencha o tema no planejador primeiro" }, { status: 400 });
  }

  const body = (await request.json()) as Body;
  if (typeof body?.text !== "string" || !body.text.trim()) {
    return Response.json({ error: "text e obrigatorio" }, { status: 400 });
  }

  const exerciseId = await ensureEssayExercise(env.DB, plan);
  const targetVocabulary = parseTargetVocabulary(plan.target_vocabulary);

  let rubric;
  try {
    rubric = await gradeOpinionEssay(env, plan.theme_text!, targetVocabulary, body.text);
  } catch (err) {
    return Response.json({ error: `correcao via LLM falhou: ${(err as Error).message}` }, { status: 502 });
  }

  await env.DB.prepare(
    `INSERT INTO attempts (exercise_id, user_response, showed_up, correction_json, user_id) VALUES (?, ?, 1, ?, ?)`
  )
    .bind(exerciseId, body.text, JSON.stringify(rubric), user.id)
    .run();

  return Response.json({ correction: rubric });
};
