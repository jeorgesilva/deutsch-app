// POST /api/structured-speech/message -- body {session_id, text}. Manda o
// turno do usuario, devolve a resposta do moderador. Nunca corrige/avalia
// aqui -- so' no /close (evita quebrar a imersao no meio da conversa).
import { getCurrentUser, unauthorized } from "../../_lib/auth";
import { postMessage } from "../../_lib/roleplay";
import { Env } from "../../_lib/types";

interface Body {
  session_id: number;
  text: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getCurrentUser({ request, env });
  if (!user) return unauthorized();

  const body = (await request.json()) as Body;
  if (!body?.session_id) {
    return Response.json({ error: "session_id e obrigatorio" }, { status: 400 });
  }
  if (typeof body.text !== "string" || !body.text.trim()) {
    return Response.json({ error: "text e obrigatorio" }, { status: 400 });
  }

  try {
    const reply = await postMessage(env, user.id, body.session_id, body.text);
    return Response.json({ message: reply });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
};
