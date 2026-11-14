// POST /api/topic-regeneration/start {content_topic_id} -- docs/14: cria o
// job (pending) e devolve na hora; o trabalho de verdade (chamadas de LLM,
// minutos) roda em background via waitUntil, o frontend faz polling em
// GET /api/topic-regeneration/status?job_id=.
import { getCurrentUser, unauthorized } from "../../_lib/auth";
import { estimateRegeneration } from "../../_lib/topicRegeneration";
import { expireStaleJobs, runRegenerationJob, startRegenerationJob } from "../../_lib/topicRegeneration";
import { Env } from "../../_lib/types";

interface StartBody {
  content_topic_id?: number;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const user = await getCurrentUser({ request, env });
  if (!user) return unauthorized();

  const body = (await request.json()) as StartBody;
  const contentTopicId = body.content_topic_id;
  if (!contentTopicId || !Number.isInteger(contentTopicId)) {
    return Response.json({ error: "content_topic_id é obrigatório" }, { status: 400 });
  }

  const estimate = await estimateRegeneration(env.DB, contentTopicId);
  if (!estimate || estimate.engines.length === 0) {
    return Response.json({ error: "nenhum formato de exercício mapeado pra esse tópico" }, { status: 400 });
  }

  // Fase 4a -- fecha jobs vencidos que ninguem mais consulta (aba fechada).
  await expireStaleJobs(env.DB, user.id);

  const jobId = await startRegenerationJob(env, user.id, contentTopicId);
  waitUntil(runRegenerationJob(env, jobId, contentTopicId));

  return Response.json({ job_id: jobId, status: "pending" });
};
