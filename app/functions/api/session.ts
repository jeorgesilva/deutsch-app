// GET /api/session?limit=10 -- Fase 9 (CLAUDE.md): sessao intercalada,
// vencidos FSRS primeiro, depois novos. Le SEMPRE de servable_exercises
// (nunca exercises direto) -- ponto estrutural unico de leitura, CLAUDE.md.
import { composeSession } from "../_lib/session";
import { AUDIO_FIRST_TEMPLATES, Env, TARGET_AUDIO_HIDDEN_TEMPLATES } from "../_lib/types";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 10), 30);

  const exercises = await composeSession(env.DB, limit);

  return Response.json({
    exercises: exercises.map((ex) => {
      const audioFirst = AUDIO_FIRST_TEMPLATES.has(ex.template_nome);
      const audioHidden = TARGET_AUDIO_HIDDEN_TEMPLATES.has(ex.template_nome);
      return {
        id: ex.id,
        template: ex.template_nome,
        // audio-primeiro nunca expoe a frase-fonte antes da tentativa --
        // regra do projeto (mesma do bloco de leitura/video).
        prompt: audioFirst ? null : ex.prompt,
        // audio-ALVO (TTS) de ReadAloudEngine/SpokenGapFillEngine so
        // aparece na resposta de POST /api/attempts, nunca aqui.
        audio_url: ex.audio_ref && !audioHidden ? `/media/${ex.audio_ref}` : null,
        video_url: ex.video_url,
        video_start_seconds: ex.video_start_seconds,
        video_end_seconds: ex.video_end_seconds,
        content_topic_id: ex.content_topic_id,
      };
    }),
  });
};
