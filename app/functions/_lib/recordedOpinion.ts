// Fase 10 -- RecordedOpinionEngine (docs/05 itens 5/25). Mesmo padrao do
// OpinionEssayEngine (opinionEssay.ts): exercicio dinamico criado a partir
// do session_plans ativo do escopo, nunca passa por composeSession/
// SUPPORTED_TEMPLATES (nao e' multiplicado por topico). Diferente do
// essay, o "roteiro" (session_plans.theme_text reaproveitado) e' OPCIONAL
// aqui -- item 25 "Audio journal" e' a mesma engine sem tema fixo, entao
// um plano ativo sem roteiro preenchido ainda e' valido (reflexao livre).
import { SessionPlanRow } from "./types";

export const RECORDED_OPINION_TEMPLATE_ID = 25;

export async function getActiveAudioPlan(db: D1Database): Promise<SessionPlanRow | null> {
  return db
    .prepare(`SELECT * FROM session_plans WHERE scope = 'opinion_audio' AND completed_at IS NULL ORDER BY id DESC LIMIT 1`)
    .first<SessionPlanRow>();
}

export async function ensureAudioExercise(db: D1Database, plan: SessionPlanRow): Promise<number> {
  if (plan.exercise_id) return plan.exercise_id;

  const promptPayload = JSON.stringify({ roteiro: plan.theme_text });

  const result = await db
    .prepare(
      `INSERT INTO exercises (exercise_template_id, prompt, accepted_answers, generated_by)
       VALUES (?, ?, '[]', 'user_plan')`
    )
    .bind(RECORDED_OPINION_TEMPLATE_ID, promptPayload)
    .run();
  const exerciseId = result.meta.last_row_id as number;

  await db.prepare(`UPDATE session_plans SET exercise_id = ? WHERE id = ?`).bind(exerciseId, plan.id).run();
  return exerciseId;
}
