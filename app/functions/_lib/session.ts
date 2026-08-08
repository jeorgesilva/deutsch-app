// Fase 9 -- composicao de sessao: prioriza itens FSRS vencidos (progress.
// next_review_at <= agora), depois itens nunca vistos (sem linha em
// progress), sempre intercalando template -- CLAUDE.md: "nunca servir o
// mesmo template/modalidade duas vezes seguidas".
import { ExerciseRow, SUPPORTED_TEMPLATES } from "./types";

export async function composeSession(db: D1Database, limit: number): Promise<ExerciseRow[]> {
  const placeholders = SUPPORTED_TEMPLATES.map(() => "?").join(",");
  const now = new Date().toISOString();

  // vencidos primeiro (revisao FSRS), depois novos (nunca tentados) -- pega
  // mais que "limit" de cada balde pra sobrar material pra intercalar
  // (se so 1 template tivesse itens vencidos, intercalar exigiria pular
  // pro balde de novos mesmo assim).
  const due = await db
    .prepare(
      `SELECT e.id, e.exercise_template_id, et.nome as template_nome, e.content_topic_id,
              e.prompt, e.accepted_answers, e.source_rule, e.audio_ref,
              vc.url as video_url, vc.start_seconds as video_start_seconds, vc.end_seconds as video_end_seconds
       FROM servable_exercises e
       JOIN exercise_templates et ON e.exercise_template_id = et.id
       JOIN progress p ON p.exercise_id = e.id
       LEFT JOIN video_clips vc ON e.video_clip_id = vc.id
       WHERE et.nome IN (${placeholders}) AND p.next_review_at <= ?
       ORDER BY p.next_review_at ASC LIMIT 50`
    )
    .bind(...SUPPORTED_TEMPLATES, now)
    .all<ExerciseRow>();

  const novos = await db
    .prepare(
      `SELECT e.id, e.exercise_template_id, et.nome as template_nome, e.content_topic_id,
              e.prompt, e.accepted_answers, e.source_rule, e.audio_ref,
              vc.url as video_url, vc.start_seconds as video_start_seconds, vc.end_seconds as video_end_seconds
       FROM servable_exercises e
       JOIN exercise_templates et ON e.exercise_template_id = et.id
       LEFT JOIN progress p ON p.exercise_id = e.id
       LEFT JOIN video_clips vc ON e.video_clip_id = vc.id
       WHERE et.nome IN (${placeholders}) AND p.id IS NULL
       ORDER BY RANDOM() LIMIT 50`
    )
    .bind(...SUPPORTED_TEMPLATES)
    .all<ExerciseRow>();

  const pool = [...(due.results ?? []), ...(novos.results ?? [])];
  return interleave(pool, limit);
}

// Greedy: percorre o pool em ordem (vencidos > novos), a cada passo pega o
// primeiro item cujo template != template do item anterior escolhido. Se
// nenhum servir (pool ficou so com repeticoes do ultimo template), aceita
// repetir -- e' um fallback raro, melhor que travar a sessao.
function interleave(pool: ExerciseRow[], limit: number): ExerciseRow[] {
  const remaining = [...pool];
  const chosen: ExerciseRow[] = [];
  let lastTemplate: string | null = null;

  while (chosen.length < limit && remaining.length > 0) {
    let idx = remaining.findIndex((ex) => ex.template_nome !== lastTemplate);
    if (idx === -1) idx = 0;
    const [item] = remaining.splice(idx, 1);
    chosen.push(item);
    lastTemplate = item.template_nome;
  }
  return chosen;
}
