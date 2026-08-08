// Fase 10 -- OpinionEssayEngine (docs/05 item 4). Diferente do Grupo A, o
// exercicio nao vem do pipeline offline -- e' criado dinamicamente a partir
// do session_plans do escopo 'opinion_essay' (tema + vocabulario-alvo
// digitados pelo usuario no planejador). Por isso nunca passa por
// servable_exercises nem entra em composeSession/SUPPORTED_TEMPLATES: essa
// regra e' sobre a sessao intercalada do Grupo A, nao se aplica aqui (nao
// e' multiplicado por topico, e' um unico exercicio por tema semanal).
import { SessionPlanRow } from "./types";

export const OPINION_ESSAY_TEMPLATE_ID = 24;
export const WORD_TARGET = 230;

export function parseTargetVocabulary(raw: string | null): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function getActiveEssayPlan(db: D1Database): Promise<SessionPlanRow | null> {
  const plan = await db
    .prepare(`SELECT * FROM session_plans WHERE scope = 'opinion_essay' AND completed_at IS NULL ORDER BY id DESC LIMIT 1`)
    .first<SessionPlanRow>();
  if (!plan || !plan.theme_text?.trim()) return null;
  return plan;
}

// cria o exercicio dinamico na primeira submissao do tema; reaproveita nas
// seguintes (reenvio do mesmo tema nao deveria multiplicar linhas em
// `exercises`). prompt guarda {theme, target_vocabulary} como JSON -- esse
// engine nunca e' lido por composeSession, entao o formato so precisa fazer
// sentido pra este modulo.
export async function ensureEssayExercise(db: D1Database, plan: SessionPlanRow): Promise<number> {
  if (plan.exercise_id) return plan.exercise_id;

  const promptPayload = JSON.stringify({
    theme: plan.theme_text,
    target_vocabulary: parseTargetVocabulary(plan.target_vocabulary),
  });

  const result = await db
    .prepare(
      `INSERT INTO exercises (exercise_template_id, prompt, accepted_answers, generated_by)
       VALUES (?, ?, '[]', 'user_plan')`
    )
    .bind(OPINION_ESSAY_TEMPLATE_ID, promptPayload)
    .run();
  const exerciseId = result.meta.last_row_id as number;

  await db.prepare(`UPDATE session_plans SET exercise_id = ? WHERE id = ?`).bind(exerciseId, plan.id).run();
  return exerciseId;
}

export interface EssayAttemptRow {
  user_response: string | null;
  correction_json: string | null;
  attempted_at: string;
}

export async function latestEssayAttempt(db: D1Database, exerciseId: number): Promise<EssayAttemptRow | null> {
  return db
    .prepare(
      `SELECT user_response, correction_json, attempted_at FROM attempts
       WHERE exercise_id = ? ORDER BY attempted_at DESC, id DESC LIMIT 1`
    )
    .bind(exerciseId)
    .first<EssayAttemptRow>();
}
