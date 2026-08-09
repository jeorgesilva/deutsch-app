// GET /api/topic-regeneration/estimate?content_topic_id=N -- docs/14: antes
// de disparar, mostra uma confirmação com estimativa de chamadas de LLM.
import { getCurrentUser, unauthorized } from "../../_lib/auth";
import { estimateRegeneration } from "../../_lib/topicRegeneration";
import { Env } from "../../_lib/types";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getCurrentUser({ request, env });
  if (!user) return unauthorized();

  const idParam = new URL(request.url).searchParams.get("content_topic_id");
  const contentTopicId = idParam ? Number(idParam) : NaN;
  if (!Number.isInteger(contentTopicId)) {
    return Response.json({ error: "content_topic_id inválido" }, { status: 400 });
  }

  const estimate = await estimateRegeneration(env.DB, contentTopicId);
  if (!estimate) return Response.json({ error: "tópico não encontrado" }, { status: 404 });
  if (estimate.engines.length === 0) {
    return Response.json({ error: "nenhum formato de exercício mapeado pra esse tópico" }, { status: 400 });
  }

  return Response.json(estimate);
};
