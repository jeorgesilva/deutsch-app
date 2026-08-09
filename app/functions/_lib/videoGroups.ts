// "Home por categoria" (docs/12) -- hub de Vídeo: mesmo padrão do hub de
// Leitura (readingBlocks.ts), mas agrupando por video_clips.url em vez de
// reading_block_id -- não existe uma tabela "video source" própria, cada
// citação/ditado autêntico ganha sua própria linha em video_clips
// (start_seconds/end_seconds), então a URL do YouTube é a chave natural de
// agrupamento (Fase 6/8).
import { formatExerciseForClient } from "./session";
import { ExerciseRow } from "./types";

// Rotulo amigavel por tarefa -- nao existe uma coluna de "subtipo" no
// schema; a distincao legendar/citar (VideoTaskEngine) vem de ter ou nao
// uma janela propria (start_seconds NULL = clipe inteiro = legendar).
function taskLabel(templateNome: string, startSeconds: number | null): string {
  if (templateNome === "DictationEngine") return "Ditado";
  if (templateNome === "VideoTaskEngine") return startSeconds == null ? "Legendar" : "Citar";
  return templateNome;
}

interface RawRow {
  url: string;
  exercise_id: number;
  template_nome: string;
  start_seconds: number | null;
  attempted_count: number;
}

export interface VideoGroupSummary {
  url: string;
  total: number;
  done: number;
  status: "new" | "in_progress" | "done";
  task_labels: string[];
}

async function fetchGroupedRows(db: D1Database, userId: number): Promise<RawRow[]> {
  const rows = await db
    .prepare(
      `SELECT vc.url as url, e.id as exercise_id, et.nome as template_nome, vc.start_seconds as start_seconds,
              (SELECT COUNT(*) FROM attempts a WHERE a.exercise_id = e.id AND a.user_id = ?) as attempted_count
       FROM video_clips vc
       JOIN servable_exercises e ON e.video_clip_id = vc.id
       JOIN exercise_templates et ON et.id = e.exercise_template_id
       ORDER BY vc.url ASC, (vc.start_seconds IS NULL) DESC, vc.start_seconds ASC`
    )
    .bind(userId)
    .all<RawRow>();
  return rows.results ?? [];
}

export async function listVideoGroups(db: D1Database, userId: number): Promise<VideoGroupSummary[]> {
  const rows = await fetchGroupedRows(db, userId);

  const byUrl = new Map<string, RawRow[]>();
  for (const row of rows) {
    if (!byUrl.has(row.url)) byUrl.set(row.url, []);
    byUrl.get(row.url)!.push(row);
  }

  return [...byUrl.entries()].map(([url, groupRows]) => {
    const done = groupRows.filter((r) => r.attempted_count > 0).length;
    const total = groupRows.length;
    return {
      url,
      total,
      done,
      status: done === 0 ? "new" : done < total ? "in_progress" : "done",
      task_labels: groupRows.map((r) => taskLabel(r.template_nome, r.start_seconds)),
    };
  });
}

export interface VideoGroupDetail {
  url: string;
  items: { attempted: boolean; exercise: ReturnType<typeof formatExerciseForClient> }[];
}

export async function getVideoGroupDetail(db: D1Database, userId: number, url: string): Promise<VideoGroupDetail | null> {
  const rows = await db
    .prepare(
      `SELECT e.id, e.exercise_template_id, et.nome as template_nome, e.content_topic_id,
              e.prompt, e.accepted_answers, e.source_rule, e.audio_ref,
              vc.url as video_url, vc.start_seconds as video_start_seconds, vc.end_seconds as video_end_seconds,
              (SELECT COUNT(*) FROM attempts a WHERE a.exercise_id = e.id AND a.user_id = ?) as attempted_count
       FROM video_clips vc
       JOIN servable_exercises e ON e.video_clip_id = vc.id
       JOIN exercise_templates et ON et.id = e.exercise_template_id
       WHERE vc.url = ?
       ORDER BY (vc.start_seconds IS NULL) DESC, vc.start_seconds ASC`
    )
    .bind(userId, url)
    .all<ExerciseRow & { attempted_count: number }>();

  if (!rows.results || rows.results.length === 0) return null;

  return {
    url,
    items: rows.results.map((row) => ({
      attempted: row.attempted_count > 0,
      exercise: formatExerciseForClient(row),
    })),
  };
}
