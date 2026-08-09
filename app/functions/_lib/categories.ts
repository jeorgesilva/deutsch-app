// "Home por categoria" (docs/12) -- grid de categorias reais das planilhas
// curadas (content_topics.categoria / phonetic_points.categoria), cada uma
// com contagem de topicos, pendentes FSRS e um indicador de dominio
// (mastery_pct). Formula do mastery e' heuristica de primeira versao,
// registrada no plano de implementacao -- ajustavel depois de ver uso real,
// mesmo padrao de "testar contra dado real, nao travar regra de antemao"
// ja usado no resto do projeto:
//   por exercicio com progress do usuario: min(stability_dias / 21, 1)
//   (21 dias ~ 3 semanas de retencao como proxy de "dominado"); exercicio
//   nunca tentado conta como 0.
//   por topico: media desse valor entre seus exercicios servíveis.
//   por categoria: media simples entre os topicos que tem pelo menos 1
//   exercicio servivel (topico sem conteudo servivel nao entra na conta,
//   nao puxa a media pra 0).
import { GRAMMAR_TEMPLATES, PHONETICS_TEMPLATES } from "./types";

const MASTERY_TARGET_DAYS = 21;

export interface CategoryRow {
  categoria: string;
  topic_count: number;
  due_count: number;
  mastery_pct: number;
}

interface RawRow {
  categoria: string;
  topic_id: number;
  exercise_id: number;
  stability: number | null;
  next_review_at: string | null;
}

export async function listCategories(
  db: D1Database,
  userId: number,
  group: "grammar" | "phonetics"
): Promise<CategoryRow[]> {
  const templates = group === "grammar" ? GRAMMAR_TEMPLATES : PHONETICS_TEMPLATES;
  const sourceTable = group === "grammar" ? "content_topics" : "phonetic_points";
  const topicIdCol = group === "grammar" ? "content_topic_id" : "phonetic_point_id";
  const placeholders = templates.map(() => "?").join(",");

  const rows = await db
    .prepare(
      `SELECT src.categoria as categoria, src.id as topic_id, e.id as exercise_id,
              p.stability as stability, p.next_review_at as next_review_at
       FROM ${sourceTable} src
       JOIN servable_exercises e ON e.${topicIdCol} = src.id
       JOIN exercise_templates et ON et.id = e.exercise_template_id
       LEFT JOIN progress p ON p.exercise_id = e.id AND p.user_id = ?
       WHERE et.nome IN (${placeholders})
       ORDER BY src.id ASC`
    )
    .bind(userId, ...templates)
    .all<RawRow>();

  const now = new Date().toISOString();

  // categoria -> topic_id -> mastery de cada exercicio; ordem de insercao
  // preserva a ordem numerica das categorias (ORDER BY src.id acima).
  const byCategoria = new Map<string, { topics: Map<number, number[]>; dueCount: number }>();

  for (const row of rows.results ?? []) {
    if (!byCategoria.has(row.categoria)) byCategoria.set(row.categoria, { topics: new Map(), dueCount: 0 });
    const entry = byCategoria.get(row.categoria)!;

    if (!entry.topics.has(row.topic_id)) entry.topics.set(row.topic_id, []);
    const exerciseMastery = row.stability != null ? Math.min(row.stability / MASTERY_TARGET_DAYS, 1) : 0;
    entry.topics.get(row.topic_id)!.push(exerciseMastery);

    if (row.next_review_at != null && row.next_review_at <= now) entry.dueCount++;
  }

  const result: CategoryRow[] = [];
  for (const [categoria, entry] of byCategoria) {
    const topicMasteries = [...entry.topics.values()].map(
      (masteries) => masteries.reduce((a, b) => a + b, 0) / masteries.length
    );
    const mastery =
      topicMasteries.length > 0 ? topicMasteries.reduce((a, b) => a + b, 0) / topicMasteries.length : 0;

    result.push({
      categoria,
      topic_count: entry.topics.size,
      due_count: entry.dueCount,
      mastery_pct: Math.round(mastery * 100),
    });
  }
  return result;
}
