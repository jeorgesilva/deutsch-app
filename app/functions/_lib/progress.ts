// Fase 9 -- upsert de progress via FSRS, extraido de attempts.ts pra ser
// reaproveitado pelo fluxo de tentativa fonetica (ReadAloudEngine/
// SpokenGapFillEngine) sem duplicar o if/else insert-ou-update.
import { scheduleNext } from "./fsrs";
import { Env, ProgressRow } from "./types";

export async function recordProgress(env: Env, userId: number, exerciseId: number, correct: boolean) {
  const progress = await env.DB.prepare(`SELECT * FROM progress WHERE exercise_id = ? AND user_id = ?`)
    .bind(exerciseId, userId)
    .first<ProgressRow>();

  const next = scheduleNext(progress, correct);

  if (progress) {
    await env.DB.prepare(
      `UPDATE progress SET stability = ?, difficulty = ?, last_review_at = ?, next_review_at = ?, reps = ?, lapses = ?
       WHERE exercise_id = ? AND user_id = ?`
    )
      .bind(next.stability, next.difficulty, next.last_review_at, next.next_review_at, next.reps, next.lapses, exerciseId, userId)
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO progress (exercise_id, user_id, stability, difficulty, last_review_at, next_review_at, reps, lapses)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(exerciseId, userId, next.stability, next.difficulty, next.last_review_at, next.next_review_at, next.reps, next.lapses)
      .run();
  }

  return next;
}
