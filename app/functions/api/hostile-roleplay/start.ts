// POST /api/hostile-roleplay/start -- body {persona}. Cria a sessao e ja
// devolve a primeira fala da persona (usuario nunca comeca em branco).
// Diferente do StructuredSpeechEngine, nao depende de session_plans -- o
// usuario escolhe o cenario na hora, via escada de exposicao, sem
// implementation intention previa (Grupo D e' separado do motor semanal
// de Grupo B, CLAUDE.md). `engine` gravado em roleplay_sessions vem da
// propria persona (getGrupoDPersona) -- AssignedPositionSpeechEngine
// (item 99) grava engine diferente de HostileRoleplayEngine (95-98) mesmo
// passando pelo mesmo endpoint/mecanismo.
import { getCurrentUser, unauthorized } from "../../_lib/auth";
import { getGrupoDPersona, startSession } from "../../_lib/roleplay";
import { Env } from "../../_lib/types";

interface Body {
  persona: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getCurrentUser({ request, env });
  if (!user) return unauthorized();

  const body = (await request.json()) as Body;
  if (typeof body?.persona !== "string") {
    return Response.json({ error: "persona é obrigatório" }, { status: 400 });
  }

  let persona;
  try {
    persona = getGrupoDPersona(body.persona);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }

  try {
    const { sessionId, openingMessage } = await startSession(env, user.id, persona.engine, persona.key, null);
    return Response.json({ session_id: sessionId, message: openingMessage });
  } catch (err) {
    return Response.json({ error: `falha ao iniciar sessao: ${(err as Error).message}` }, { status: 502 });
  }
};
