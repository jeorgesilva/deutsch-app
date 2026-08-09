// GET/POST /api/recorded-opinion -- Fase 10, RecordedOpinionEngine (docs/05
// itens 5/25). Upload pro Google Drive acontece direto no navegador (Google
// Identity Services, decisao do usuario -- nao precisa do servico Python
// local, diferente da correcao fonetica). Este endpoint so entra DEPOIS do
// upload: recebe o drive_file_id ja pronto e grava a tentativa. Canal
// separado de sempre -- so valida exposicao (showed_up=1), sem correcao de
// idioma nesta fatia (mesmo mecanismo do ShadowingEngine).
import { getCurrentUser, unauthorized } from "../_lib/auth";
import { ensureAudioExercise, getActiveAudioPlan } from "../_lib/recordedOpinion";
import { Env } from "../_lib/types";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getCurrentUser({ request, env });
  if (!user) return unauthorized();

  const plan = await getActiveAudioPlan(env.DB, user.id);
  if (!plan) {
    return Response.json({ has_plan: false });
  }
  return Response.json({ has_plan: true, roteiro: plan.theme_text });
};

interface Body {
  drive_file_id: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getCurrentUser({ request, env });
  if (!user) return unauthorized();

  const plan = await getActiveAudioPlan(env.DB, user.id);
  if (!plan) {
    return Response.json({ error: "nenhum plano ativo -- preencha quando/onde no planejador primeiro" }, { status: 400 });
  }

  const body = (await request.json()) as Body;
  if (typeof body?.drive_file_id !== "string" || !body.drive_file_id.trim()) {
    return Response.json({ error: "drive_file_id e obrigatorio" }, { status: 400 });
  }

  const exerciseId = await ensureAudioExercise(env.DB, plan);

  await env.DB.prepare(`INSERT INTO attempts (exercise_id, audio_ref, showed_up, user_id) VALUES (?, ?, 1, ?)`)
    .bind(exerciseId, body.drive_file_id, user.id)
    .run();

  return Response.json({ ok: true });
};
