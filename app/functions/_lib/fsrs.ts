// Fase 9 -- integracao com ts-fsrs. progress.* mapeia direto pros campos do
// Card do ts-fsrs; elapsed_days/scheduled_days/state nao sao persistidos
// (schema do projeto so guarda stability/difficulty/last_review_at/
// next_review_at/reps/lapses) -- reconstruidos a cada chamada a partir do
// que esta salvo, com valores neutros pro que falta (simplificacao aceita
// pro "minimo" desta fase: nao distingue Learning/Relearning de Review,
// so New vs. ja visto).
import { Card, createEmptyCard, fsrs, Rating, State } from "ts-fsrs";
import { ProgressRow } from "./types";

const scheduler = fsrs();

function toCard(progress: ProgressRow | null, now: Date): Card {
  if (!progress || progress.reps === 0) {
    return createEmptyCard(now);
  }
  return {
    due: new Date(progress.next_review_at!),
    stability: progress.stability!,
    difficulty: progress.difficulty!,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: progress.reps,
    lapses: progress.lapses,
    state: State.Review,
    last_review: progress.last_review_at ? new Date(progress.last_review_at) : undefined,
  };
}

export function scheduleNext(progress: ProgressRow | null, correct: boolean, now: Date = new Date()) {
  const card = toCard(progress, now);
  const rating = correct ? Rating.Good : Rating.Again;
  const result = scheduler.next(card, now, rating);
  return {
    stability: result.card.stability,
    difficulty: result.card.difficulty,
    last_review_at: now.toISOString(),
    next_review_at: result.card.due.toISOString(),
    reps: result.card.reps,
    lapses: result.card.lapses,
  };
}
