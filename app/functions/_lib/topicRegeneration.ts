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

// Fase 4a -- watchdog. O job roda em waitUntil (start.ts), que a Cloudflare
// cancela ~30 s depois da resposta; o catch abaixo nunca roda e o status
// ficaria em pending/running pra sempre. 90 s = 30 s do waitUntil + margem
// de cold start/round-trip -- passado isso o job JA morreu, nao ha trabalho
// legitimo a esperar. DEPENDE DA ARQUITETURA: quando a 4c tirar o job do
// waitUntil (Queues/Workflows/container), um lote real leva minutos e este
// numero precisa subir (ordem de 15 min). Revisar junto com a 4c.
export const JOB_TIMEOUT_SECONDS = 90;

// Marca como failed os jobs vencidos; o filtro de status no proprio UPDATE
// evita sobrescrever um job que terminou no mesmo instante. Sem jobId,
// varre todos os jobs vencidos do usuario.
export async function expireStaleJobs(db: D1Database, userId: number, jobId?: number): Promise<void> {
  await db
    .prepare(
      `UPDATE topic_regeneration_jobs
       SET status = 'failed', error = 'timeout (watchdog): o job parou sem concluir', completed_at = datetime('now')
       WHERE user_id = ? AND (? IS NULL OR id = ?)
         AND status IN ('pending', 'running')
         AND requested_at < datetime('now', ?)`
    )
    .bind(userId, jobId ?? null, jobId ?? null, `-${JOB_TIMEOUT_SECONDS} seconds`)
    .run();
}

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

    // status = 'pending' no WHERE: nunca ressuscita um job que o watchdog ja
    // marcou como failed.
    await env.DB.prepare(`UPDATE topic_regeneration_jobs SET status = 'running' WHERE id = ? AND status = 'pending'`)
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
