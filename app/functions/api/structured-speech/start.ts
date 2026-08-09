// POST /api/structured-speech/start -- cria a sessao de roleplay e ja
// devolve a primeira fala do moderador (o usuario nunca comeca em branco,
// o moderador abre apresentando o tema e pedindo a posicao inicial).
import { getCurrentUser, unauthorized } from "../../_lib/auth";
import { getActiveSpeechPlan, startSession } from "../../_lib/roleplay";
import { Env } from "../../_lib/types";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getCurrentUser({ request, env });
  if (!user) return unauthorized();

  const plan = await getActiveSpeechPlan(env.DB, user.id);
  if (!plan) {
    return Response.json({ error: "nenhum plano ativo -- preencha quando/onde no planejador primeiro" }, { status: 400 });
  }

  try {
    const { sessionId, openingMessage } = await startSession(env, user.id, "StructuredSpeechEngine", "moderador", plan.theme_text);
    return Response.json({ session_id: sessionId, message: openingMessage });
  } catch (err) {
    return Response.json({ error: `falha ao iniciar sessao: ${(err as Error).message}` }, { status: 502 });
  }
};
