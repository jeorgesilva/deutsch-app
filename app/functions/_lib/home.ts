// "Home por categoria" (docs/12) -- overview agregado pros 6 cards de grupo
// + o card opcional "Revisao de hoje". Cada numero aqui e' so' um COUNT
// barato, nao SELECT * -- a home nunca precisa da lista completa, so' do
// resumo (a lista de verdade vem do endpoint do grupo quando o usuario
// entra nele).
import { GRAMMAR_TEMPLATES, PHONETICS_TEMPLATES } from "./types";

export interface HomeOverview {
  fsrs_due_count: number;
  grammar: { due_count: number };
  phonetics: { due_count: number };
  reading: { new_count: number; in_progress_count: number; done_count: number };
  video: { available_count: number };
}

async function countDueByTemplates(db: D1Database, userId: number, templates: readonly string[]): Promise<number> {
  const placeholders = templates.map(() => "?").join(",");
  const row = await db
    .prepare(
      `SELECT COUNT(*) as n
       FROM servable_exercises e
       JOIN exercise_templates et ON e.exercise_template_id = et.id
       JOIN progress p ON p.exercise_id = e.id AND p.user_id = ?
       WHERE et.nome IN (${placeholders}) AND p.next_review_at <= ?`
    )
    .bind(userId, ...templates, new Date().toISOString())
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function getHomeOverview(db: D1Database, userId: number): Promise<HomeOverview> {
  const now = new Date().toISOString();

  const fsrsDueRow = await db
    .prepare(
      `SELECT COUNT(*) as n FROM progress p
       JOIN servable_exercises e ON e.id = p.exercise_id
       WHERE p.user_id = ? AND p.next_review_at <= ?`
    )
    .bind(userId, now)
    .first<{ n: number }>();

  const grammarDue = await countDueByTemplates(db, userId, GRAMMAR_TEMPLATES);
  const phoneticsDue = await countDueByTemplates(db, userId, PHONETICS_TEMPLATES);

  // status por bloco: 0 tentados -> novo; entre 0 e o total -> em andamento;
  // todos -> concluido. Calculado em TS (poucos blocos, nao vale a
  // complexidade de um CASE WHEN em SQL pra isso).
  // reading_block_items nunca deve ser lido sozinho -- JOIN em
  // servable_exercises, mesma regra do resto do schema (CLAUDE.md,
  // functions/_lib/readingBlocks.ts).
  const blocks = await db
    .prepare(
      `SELECT rb.id,
              COUNT(DISTINCT rbi.id) as total,
              COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN rbi.id END) as done
       FROM reading_blocks rb
       JOIN reading_block_items rbi ON rbi.reading_block_id = rb.id
       JOIN servable_exercises se ON se.id = rbi.exercise_id
       LEFT JOIN attempts a ON a.exercise_id = rbi.exercise_id AND a.user_id = ?
       GROUP BY rb.id`
    )
    .bind(userId)
    .all<{ id: number; total: number; done: number }>();

  let newCount = 0;
  let inProgressCount = 0;
  let doneCount = 0;
  for (const b of blocks.results ?? []) {
    if (b.done === 0) newCount++;
    else if (b.done < b.total) inProgressCount++;
    else doneCount++;
  }

  // so conta url de video que tem pelo menos 1 exercicio servivel -- mesma
  // regra de nunca ler reading_block_items/video_clips sem passar por
  // servable_exercises (CLAUDE.md, functions/_lib/videoGroups.ts).
  const videoRow = await db
    .prepare(
      `SELECT COUNT(DISTINCT vc.url) as n
       FROM video_clips vc
       JOIN servable_exercises e ON e.video_clip_id = vc.id`
    )
    .first<{ n: number }>();

  return {
    fsrs_due_count: fsrsDueRow?.n ?? 0,
    grammar: { due_count: grammarDue },
    phonetics: { due_count: phoneticsDue },
    reading: { new_count: newCount, in_progress_count: inProgressCount, done_count: doneCount },
    video: { available_count: videoRow?.n ?? 0 },
  };
}
