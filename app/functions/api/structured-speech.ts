// GET /api/structured-speech -- Fase 10, StructuredSpeechEngine (docs/05
// item 7). So' confirma se ha' plano ativo (gate de implementation
// intention, mesmo padrao dos outros escopos do Grupo B) e devolve o tema
// (session_plans.theme_text reaproveitado, mesmo padrao do roteiro do
// RecordedOpinionEngine -- opcional, o moderador inventa um tema se vazio).
import { getActiveSpeechPlan } from "../_lib/roleplay";
import { Env } from "../_lib/types";

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const plan = await getActiveSpeechPlan(env.DB);
  if (!plan) {
    return Response.json({ has_plan: false });
  }
  return Response.json({ has_plan: true, topic: plan.theme_text });
};
