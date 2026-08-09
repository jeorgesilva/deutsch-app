// "Home por categoria" (docs/12) -- hub de Leitura: cada bloco abre com o
// texto inteiro + a sequencia COMPLETA de exercicios ligados a ele, em
// ordem, sem misturar com outro topico no meio (diferente da fila FSRS
// intercalada do resto do app). reading_block_items ja modela a ligacao
// bloco->exercicios em ordem desde a Fase 5 -- so faltava um endpoint de
// entrada proprio.
import { formatExerciseForClient } from "./session";
import { ExerciseRow } from "./types";

export interface ReadingBlockSummary {
  id: number;
  titulo: string;
  total: number;
  done: number;
  status: "new" | "in_progress" | "done";
}

export async function listReadingBlocks(db: D1Database, userId: number): Promise<ReadingBlockSummary[]> {
  // reading_block_items nunca deve ser lido sozinho -- JOIN em
  // servable_exercises, mesma regra do resto do schema (CLAUDE.md). Sem
  // isso "total" contaria itens `rejected` (ex. os 2 do VowelInsertEngine
  // achados na auditoria da Fase 5) que nunca vao aparecer quando o bloco
  // for aberto de verdade.
  const rows = await db
    .prepare(
      `SELECT rb.id, rb.titulo,
              COUNT(DISTINCT rbi.id) as total,
              COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN rbi.id END) as done
       FROM reading_blocks rb
       JOIN reading_block_items rbi ON rbi.reading_block_id = rb.id
       JOIN servable_exercises se ON se.id = rbi.exercise_id
       LEFT JOIN attempts a ON a.exercise_id = rbi.exercise_id AND a.user_id = ?
       GROUP BY rb.id
       ORDER BY rb.id ASC`
    )
    .bind(userId)
    .all<{ id: number; titulo: string; total: number; done: number }>();

  return (rows.results ?? []).map((r) => ({
    ...r,
    status: r.done === 0 ? "new" : r.done < r.total ? "in_progress" : "done",
  }));
}

export interface ReadingBlockDetail {
  id: number;
  titulo: string;
  texto_base: string;
  fonte_factual: string | null;
  fonte_url: string | null;
  items: { ordem: number; attempted: boolean; exercise: ReturnType<typeof formatExerciseForClient> }[];
}

export async function getReadingBlockDetail(
  db: D1Database,
  userId: number,
  blockId: number
): Promise<ReadingBlockDetail | null> {
  const block = await db
    .prepare(`SELECT id, titulo, texto_base, fonte_factual, fonte_url FROM reading_blocks WHERE id = ?`)
    .bind(blockId)
    .first<{ id: number; titulo: string; texto_base: string; fonte_factual: string | null; fonte_url: string | null }>();
  if (!block) return null;

  // reading_block_items nunca deve ser lido sozinho -- JOIN em
  // servable_exercises (nao "exercises" direto), mesma regra estrutural do
  // resto do schema (CLAUDE.md). Blocos podem ter itens `rejected` (ex. os
  // 2 do VowelInsertEngine na auditoria da Fase 5) mantidos so' pra
  // auditoria -- esse JOIN os exclui da sequencia servida ao usuario.
  const rows = await db
    .prepare(
      `SELECT rbi.ordem,
              e.id, e.exercise_template_id, et.nome as template_nome, e.content_topic_id,
              e.prompt, e.accepted_answers, e.source_rule, e.audio_ref,
              vc.url as video_url, vc.start_seconds as video_start_seconds, vc.end_seconds as video_end_seconds,
              (SELECT COUNT(*) FROM attempts a WHERE a.exercise_id = e.id AND a.user_id = ?) as attempted_count
       FROM reading_block_items rbi
       JOIN servable_exercises e ON e.id = rbi.exercise_id
       JOIN exercise_templates et ON et.id = e.exercise_template_id
       LEFT JOIN video_clips vc ON e.video_clip_id = vc.id
       WHERE rbi.reading_block_id = ?
       ORDER BY rbi.ordem ASC`
    )
    .bind(userId, blockId)
    .all<ExerciseRow & { ordem: number; attempted_count: number }>();

  return {
    ...block,
    items: (rows.results ?? []).map((row) => ({
      ordem: row.ordem,
      attempted: row.attempted_count > 0,
      exercise: formatExerciseForClient(row),
    })),
  };
}
