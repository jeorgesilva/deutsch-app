// docs/14 -- geração sob demanda: dispara SEMPRE por ação explícita do
// usuário (nunca automática ao detectar domínio, ver dashboard.ts
// TopicMasteryRow.dominated), com confirmação mostrando estimativa de
// chamadas de LLM antes. topic_regeneration_jobs (migration 0013) segue
// pending -> running -> done|failed -- o frontend faz polling, nunca trava
// esperando síncrono (um lote real pode levar dezenas de segundos a
// minutos, R1 sozinho levou ~230s pra 4 itens numa sessão anterior).
import { generateTopicExercises, GenerationTopicInput } from "./generationContainer";
import { Env } from "./types";

// Só os 6 engines de Grupo A ancorados a content_topic_id têm geração sob
// demanda (mesmo registro de generation/service.py::ENGINE_PROMPTS) --
// reading_blocks/video_clips ficam de fora de graça (docs/14: são um eixo
// estruturalmente separado de content_topic_id, mastery-por-tópico nunca os
// enxerga).
export const REGENERATION_ENGINES = [
  "GapFillGovernanceEngine",
  "FillBlankEngine",
  "UnscrambleEngine",
  "StructuralTransformEngine",
  "RegisterReformulationEngine",
  "WordBankGuessEngine",
] as const;

// hf:deepseek-ai/DeepSeek-V3 como padrão (CLAUDE.md: "fallback confiável",
// Gemini tem histórico de estourar cota diária nesta sessão) --
// model_routing.resolve_model (dentro do container) ainda força Gemini pros
// padrões historicamente fracos (Dativ/Funktionsverbgefüge) independente
// disso, mesmo comportamento de generate_batch.py.
const DEFAULT_MODEL = "hf:deepseek-ai/DeepSeek-V3";
const N_PER_TOPIC = 5;

export interface RegenerationEstimate {
  content_topic_id: number;
  topico: string;
  engines: string[];
  calls_estimate: number;
}

async function mappedEngines(
  db: D1Database,
  contentTopicId: number
): Promise<{ id: number; nome: string }[]> {
  const placeholders = REGENERATION_ENGINES.map(() => "?").join(",");
  const rows = await db
    .prepare(
      `SELECT DISTINCT et.id as id, et.nome as nome
       FROM topic_template_map ttm
       JOIN exercise_templates et ON ttm.exercise_template_id = et.id
       WHERE ttm.content_topic_id = ? AND et.nome IN (${placeholders})`
    )
    .bind(contentTopicId, ...REGENERATION_ENGINES)
    .all<{ id: number; nome: string }>();
  return rows.results ?? [];
}

export async function estimateRegeneration(
  db: D1Database,
  contentTopicId: number
): Promise<RegenerationEstimate | null> {
  const topicRow = await db
    .prepare(`SELECT id, topico FROM content_topics WHERE id = ?`)
    .bind(contentTopicId)
    .first<{ id: number; topico: string }>();
  if (!topicRow) return null;

  const engines = await mappedEngines(db, contentTopicId);
  // 1 chamada de LLM por engine mapeado (n_per_topic=items_per_call=5, sem
  // fatiar -- ver N_PER_TOPIC acima).
  return {
    content_topic_id: contentTopicId,
    topico: topicRow.topico,
    engines: engines.map((e) => e.nome),
    calls_estimate: engines.length,
  };
}

export async function startRegenerationJob(
  env: Env,
  userId: number,
  contentTopicId: number
): Promise<number> {
  const result = await env.DB.prepare(
    `INSERT INTO topic_regeneration_jobs (user_id, content_topic_id, status) VALUES (?, ?, 'pending')`
  )
    .bind(userId, contentTopicId)
    .run();
  return result.meta.last_row_id as number;
}

// Roda em background via ctx.waitUntil -- o endpoint que chama isso já
// respondeu ao navegador com { job_id } antes desta função terminar.
export async function runRegenerationJob(env: Env, jobId: number, contentTopicId: number): Promise<void> {
  try {
    const serviceUrl = env.GENERATION_SERVICE_URL;
    if (!serviceUrl) throw new Error("GENERATION_SERVICE_URL não configurado");

    await env.DB.prepare(`UPDATE topic_regeneration_jobs SET status = 'running' WHERE id = ?`)
      .bind(jobId)
      .run();

    const topicRow = await env.DB.prepare(
      `SELECT id, categoria, topico, nivel, regra, exemplo, fonte FROM content_topics WHERE id = ?`
    )
      .bind(contentTopicId)
      .first<GenerationTopicInput>();
    if (!topicRow) throw new Error("tópico não encontrado");

    const engines = await mappedEngines(env.DB, contentTopicId);
    if (engines.length === 0) throw new Error("nenhum engine de Grupo A mapeado pra esse tópico");

    for (const engine of engines) {
      const result = await generateTopicExercises(
        serviceUrl,
        env.GENERATION_SHARED_SECRET,
        engine.nome,
        DEFAULT_MODEL,
        topicRow,
        N_PER_TOPIC
      );
      for (const ex of result.exercises) {
        await env.DB.prepare(
          `INSERT INTO exercises (exercise_template_id, content_topic_id, variation_number, prompt,
                                   accepted_answers, source_rule, generated_by, validation_status,
                                   flag_reason, flag_detail)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            engine.id,
            contentTopicId,
            ex.variation_number,
            ex.prompt,
            JSON.stringify(ex.accepted_answers),
            ex.source_rule,
            ex.generated_by,
            ex.validation_status,
            ex.flag_reason,
            ex.flag_detail != null ? JSON.stringify(ex.flag_detail) : null
          )
          .run();
      }
    }

    await env.DB.prepare(
      `UPDATE topic_regeneration_jobs SET status = 'done', completed_at = datetime('now') WHERE id = ?`
    )
      .bind(jobId)
      .run();
  } catch (err) {
    await env.DB.prepare(
      `UPDATE topic_regeneration_jobs SET status = 'failed', error = ?, completed_at = datetime('now') WHERE id = ?`
    )
      .bind(String((err as Error).message ?? err).slice(0, 500), jobId)
      .run();
  }
}
