// POST /api/roleplay-voice/synthesize -- body {text}. Sintetiza QUALQUER
// texto de resposta da persona em audio, em tempo real, via servico
// fonetico local (Piper). Usado pra falar a mensagem de abertura de uma
// sessao de roleplay quando o usuario escolhe modo voz -- start.ts (texto
// e voz) continua devolvendo so' texto, este endpoint e' quem sintetiza,
// desacoplado (evita duplicar o /start pra cada modo). Devolve o WAV cru
// (Content-Type: audio/wav), nao JSON com base64 -- e' audio puro, sem
// mais nada pra combinar na resposta (diferente de /roleplay-voice/message,
// que precisa devolver texto + audio juntos).
import { synthesizeSpeech } from "../../_lib/phonetics";
import { Env } from "../../_lib/types";

interface Body {
  text: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const serviceUrl = env.PHONETIC_SERVICE_URL;
  if (!serviceUrl) {
    return Response.json({ error: "PHONETIC_SERVICE_URL não configurado" }, { status: 500 });
  }

  const body = (await request.json()) as Body;
  if (typeof body?.text !== "string" || !body.text.trim()) {
    return Response.json({ error: "text é obrigatório" }, { status: 400 });
  }

  try {
    const { audio_base64 } = await synthesizeSpeech(serviceUrl, body.text);
    const bytes = Uint8Array.from(atob(audio_base64), (c) => c.charCodeAt(0));
    return new Response(bytes, { headers: { "Content-Type": "audio/wav" } });
  } catch (err) {
    return Response.json(
      { error: `serviço fonético local indisponível -- ele está rodando? (${(err as Error).message})` },
      { status: 502 }
    );
  }
};
