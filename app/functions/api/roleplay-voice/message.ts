// POST /api/roleplay-voice/message -- body {session_id, audio_base64}.
// Turno de voz completo: transcreve (STT local), manda pro mesmo
// postMessage() generico do modo texto (_lib/roleplay.ts -- reusa
// StructuredSpeechEngine E HostileRoleplayEngine/AssignedPositionSpeechEngine
// sem duplicar nenhuma logica de persona/LLM), sintetiza a resposta.
// user_text volta na resposta pra o usuario CONFERIR o que foi entendido
// -- transparencia sobre o STT, nao so' um "confie em mim".
import { getCurrentUser, unauthorized } from "../../_lib/auth";
import { transcribeAudio, synthesizeSpeech } from "../../_lib/phonetics";
import { postMessage } from "../../_lib/roleplay";
import { Env } from "../../_lib/types";

interface Body {
  session_id: number;
  audio_base64: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getCurrentUser({ request, env });
  if (!user) return unauthorized();

  const serviceUrl = env.PHONETIC_SERVICE_URL;
  if (!serviceUrl) {
    return Response.json({ error: "PHONETIC_SERVICE_URL não configurado" }, { status: 500 });
  }

  const body = (await request.json()) as Body;
  if (!body?.session_id) {
    return Response.json({ error: "session_id é obrigatório" }, { status: 400 });
  }
  if (typeof body?.audio_base64 !== "string" || !body.audio_base64) {
    return Response.json({ error: "audio_base64 é obrigatório" }, { status: 400 });
  }

  let userText: string;
  try {
    const transcribed = await transcribeAudio(serviceUrl, env.PHONETIC_SHARED_SECRET, body.audio_base64);
    userText = transcribed.text.trim();
  } catch (err) {
    return Response.json({ error: `serviço fonético indisponível (${(err as Error).message})` }, { status: 502 });
  }
  if (!userText) {
    return Response.json({ error: "não entendi nada na gravação -- tente de novo, falando um pouco mais alto" }, { status: 422 });
  }

  let replyText: string;
  try {
    replyText = await postMessage(env, user.id, body.session_id, userText);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }

  try {
    const { audio_base64 } = await synthesizeSpeech(serviceUrl, env.PHONETIC_SHARED_SECRET, replyText);
    return Response.json({ user_text: userText, message: replyText, audio_base64 });
  } catch (err) {
    // so' a sintese falhou -- o turno de conversa (texto) ja foi gravado
    // com sucesso, nao vale jogar fora; usuario so' perde o audio desta
    // resposta e ve o texto normalmente.
    return Response.json({ user_text: userText, message: replyText, audio_base64: null, tts_error: (err as Error).message });
  }
};
