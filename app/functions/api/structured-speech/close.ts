// POST /api/structured-speech/close -- body {session_id}. Encerra a
// sessao e roda a avaliacao de fechamento (unico ponto que corrige/avalia
// idioma neste engine).
import { closeSession } from "../../_lib/roleplay";
import { Env } from "../../_lib/types";

interface Body {
  session_id: number;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = (await request.json()) as Body;
  if (!body?.session_id) {
    return Response.json({ error: "session_id e obrigatorio" }, { status: 400 });
  }

  try {
    const evaluation = await closeSession(env, body.session_id);
    return Response.json({ evaluation });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
};
