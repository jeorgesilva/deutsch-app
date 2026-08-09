// GET /api/dashboard/mastery?group=grammar|phonetics -- barra de acerto por
// card de topico (docs/14): fracao do lote com pelo menos 1 correct=1, nao
// percentual historico bruto.
import { getCurrentUser, unauthorized } from "../../_lib/auth";
import { getTopicMastery } from "../../_lib/dashboard";
import { Env } from "../../_lib/types";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getCurrentUser({ request, env });
  if (!user) return unauthorized();

  const group = new URL(request.url).searchParams.get("group");
  if (group !== "grammar" && group !== "phonetics") {
    return Response.json({ error: "group inválido (use grammar ou phonetics)" }, { status: 400 });
  }

  const topics = await getTopicMastery(env.DB, user.id, group);
  return Response.json({ topics });
};
