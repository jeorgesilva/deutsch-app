// POST /api/hostile-roleplay/message -- body {session_id, text}. Mesmo
// mecanismo generico de postMessage() do StructuredSpeechEngine (opera
// so' sobre session_id, resolve a persona pela linha em roleplay_sessions)
// -- nunca corrige/avalia aqui, so' no /close (evita quebrar a imersao no
// meio da conversa).
import { postMessage } from "../../_lib/roleplay";
import { Env } from "../../_lib/types";

interface Body {
  session_id: number;
  text: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = (await request.json()) as Body;
  if (!body?.session_id) {
    return Response.json({ error: "session_id é obrigatório" }, { status: 400 });
  }
  if (typeof body.text !== "string" || !body.text.trim()) {
    return Response.json({ error: "text é obrigatório" }, { status: 400 });
  }

  try {
    const reply = await postMessage(env, body.session_id, body.text);
    return Response.json({ message: reply });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
};
