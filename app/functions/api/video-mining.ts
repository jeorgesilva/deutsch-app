// GET/POST /api/video-mining -- Fase 10, VideoMiningEngine (docs/05 item
// 3). GET so' confirma se ha um plano ativo (gate de implementation
// intention, mesmo padrao dos outros escopos do Grupo B). POST recebe o
// video + notas de UMA sessao inteira de uma vez (o usuario revisa/marca
// candidatos no navegador antes de salvar -- "revisavel antes de
// confirmar", docs/05) -- candidatos marcados tentam enriquecimento via
// Wiktionary e viram entrada em `lexicon`.
import { hasActiveVideoMiningPlan, saveMiningSession, NoteInput } from "../_lib/videoMining";
import { Env } from "../_lib/types";

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const hasPlan = await hasActiveVideoMiningPlan(env.DB);
  return Response.json({ has_plan: hasPlan });
};

interface Body {
  video_url: string;
  notes: NoteInput[];
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const hasPlan = await hasActiveVideoMiningPlan(env.DB);
  if (!hasPlan) {
    return Response.json({ error: "nenhum plano ativo -- preencha quando/onde no planejador primeiro" }, { status: 400 });
  }

  const body = (await request.json()) as Body;
  if (typeof body?.video_url !== "string" || !body.video_url.trim()) {
    return Response.json({ error: "video_url e obrigatorio" }, { status: 400 });
  }
  if (!Array.isArray(body.notes) || body.notes.length === 0) {
    return Response.json({ error: "notes e obrigatorio (array nao vazio)" }, { status: 400 });
  }

  const { notesSaved, candidates } = await saveMiningSession(env.DB, body.video_url, body.notes);

  return Response.json({ notes_saved: notesSaved, candidates });
};
