// GET/POST /api/quick-opinion -- Fase 11, QuickOpinionSpeechEngine (docs/05
// item 103). Flash prompt sem session_plans -- GET gera um tópico novo a
// cada chamada, POST grava um exercício dinâmico de uso único (0010_quick_
// opinion.sql, id 26) + a tentativa corrigida via rubrica leve. Diferente
// do OpinionEssayEngine, não há "ensure/reaproveita" -- cada tentativa é
// um tópico novo, não existe "o mesmo tema da semana" pra reaproveitar.
import { getCurrentUser, unauthorized } from "../_lib/auth";
import { generateQuickOpinionTopic, gradeQuickOpinion } from "../_lib/quickOpinion";
import { Env } from "../_lib/types";

const QUICK_OPINION_TEMPLATE_ID = 26;

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getCurrentUser({ request, env });
  if (!user) return unauthorized();

  try {
    const topic = await generateQuickOpinionTopic(env);
    return Response.json({ topic });
  } catch (err) {
    return Response.json({ error: `falha ao gerar tópico: ${(err as Error).message}` }, { status: 502 });
  }
};

interface Body {
  topic: string;
  text: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getCurrentUser({ request, env });
  if (!user) return unauthorized();

  const body = (await request.json()) as Body;
  if (typeof body?.topic !== "string" || !body.topic.trim()) {
    return Response.json({ error: "topic é obrigatório" }, { status: 400 });
  }
  if (typeof body?.text !== "string" || !body.text.trim()) {
    return Response.json({ error: "text é obrigatório" }, { status: 400 });
  }

  let rubric;
  try {
    rubric = await gradeQuickOpinion(env, body.topic, body.text);
  } catch (err) {
    return Response.json({ error: `correção via LLM falhou: ${(err as Error).message}` }, { status: 502 });
  }

  const exerciseResult = await env.DB.prepare(
    `INSERT INTO exercises (exercise_template_id, prompt, accepted_answers, generated_by) VALUES (?, ?, '[]', 'user_plan')`
  )
    .bind(QUICK_OPINION_TEMPLATE_ID, JSON.stringify({ topic: body.topic }))
    .run();
  const exerciseId = exerciseResult.meta.last_row_id as number;

  await env.DB.prepare(
    `INSERT INTO attempts (exercise_id, user_response, showed_up, correction_json, user_id) VALUES (?, ?, 1, ?, ?)`
  )
    .bind(exerciseId, body.text, JSON.stringify(rubric), user.id)
    .run();

  return Response.json({ correction: rubric });
};
