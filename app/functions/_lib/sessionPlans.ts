// Fase 10 -- Grupo B: implementation intentions (docs/03) presas ao motor
// semanal. Um "plano ativo" por escopo = a linha mais recente de
// session_plans com completed_at IS NULL; marcar concluido fecha essa
// linha, a proxima captura de quando/onde pro mesmo escopo abre uma nova
// (naturalmente vira "a proxima semana" sem precisar de campo de semana
// explicito no schema).
import { GRUPO_B_SCOPES, SessionPlanRow } from "./types";

export async function listActivePlans(db: D1Database, userId: number): Promise<SessionPlanRow[]> {
  const { results } = await db
    .prepare(`SELECT * FROM session_plans WHERE user_id = ? AND completed_at IS NULL ORDER BY id DESC`)
    .bind(userId)
    .all<SessionPlanRow>();
  const active = results ?? [];

  return GRUPO_B_SCOPES.map(({ scope }) => {
    const existing = active.find((p) => p.scope === scope);
    if (existing) return existing;
    // sentinel: id=0 sinaliza "sem plano ativo ainda pra este escopo" --
    // frontend usa isso pra decidir se mostra o botao "concluido".
    return { id: 0, scope, when_text: null, where_text: null, scheduled_for: null, completed_at: null };
  });
}

export async function upsertPlan(
  db: D1Database,
  userId: number,
  scope: string,
  fields: {
    when_text: string | null;
    where_text: string | null;
    scheduled_for: string | null;
    // so preenchidos pelo escopo opinion_essay (ver types.ts) -- undefined
    // pros outros escopos, upsert nao toca nesses campos nesse caso.
    theme_text?: string | null;
    target_vocabulary?: string | null;
  }
): Promise<void> {
  const existing = await db
    .prepare(
      `SELECT id, theme_text, target_vocabulary FROM session_plans WHERE scope = ? AND user_id = ? AND completed_at IS NULL ORDER BY id DESC LIMIT 1`
    )
    .bind(scope, userId)
    .first<{ id: number; theme_text: string | null; target_vocabulary: string | null }>();

  // seguro editar o tema/vocabulario a qualquer momento, mesmo depois do
  // exercicio dinamico ja criado -- opinion-essay.ts sempre le o tema
  // AO VIVO de session_plans na hora de corrigir, nunca do snapshot
  // congelado em exercises.prompt (esse so existe pra satisfazer o FK de
  // attempts, nunca e' relido).
  const themeText = fields.theme_text !== undefined ? fields.theme_text : (existing?.theme_text ?? null);
  const targetVocabulary =
    fields.target_vocabulary !== undefined ? fields.target_vocabulary : (existing?.target_vocabulary ?? null);

  if (existing) {
    await db
      .prepare(
        `UPDATE session_plans SET when_text = ?, where_text = ?, scheduled_for = ?, theme_text = ?, target_vocabulary = ? WHERE id = ?`
      )
      .bind(fields.when_text, fields.where_text, fields.scheduled_for, themeText, targetVocabulary, existing.id)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO session_plans (scope, user_id, when_text, where_text, scheduled_for, theme_text, target_vocabulary)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(scope, userId, fields.when_text, fields.where_text, fields.scheduled_for, themeText, targetVocabulary)
      .run();
  }
}

export async function completePlan(db: D1Database, userId: number, scope: string): Promise<void> {
  await db
    .prepare(
      `UPDATE session_plans SET completed_at = ? WHERE id = (
         SELECT id FROM session_plans WHERE scope = ? AND user_id = ? AND completed_at IS NULL ORDER BY id DESC LIMIT 1
       )`
    )
    .bind(new Date().toISOString(), scope, userId)
    .run();
}
