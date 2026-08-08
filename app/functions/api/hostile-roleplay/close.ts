// POST /api/hostile-roleplay/close -- body {session_id}. Encerra a sessao
// e roda a avaliacao de fechamento (unico ponto que corrige/avalia idioma
// neste engine) -- saida SEM avaliar tambem e' possivel, o usuario so'
// nunca chama este endpoint nesse caso (docs/09, ExitConversationAffordance:
// saida sempre visivel, nunca precisa passar por aqui pra sair da
// conversa).
import { closeSession } from "../../_lib/roleplay";
import { Env } from "../../_lib/types";

interface Body {
  session_id: number;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = (await request.json()) as Body;
  if (!body?.session_id) {
    return Response.json({ error: "session_id é obrigatório" }, { status: 400 });
  }

  try {
    const evaluation = await closeSession(env, body.session_id);
    return Response.json({ evaluation });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
};
