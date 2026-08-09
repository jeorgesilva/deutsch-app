// GET/POST /api/session-plans -- Fase 10 (Grupo B, CLAUDE.md): captura de
// implementation intentions. GET lista o plano ativo (ou um placeholder
// vazio) pra cada um dos 5 escopos do motor semanal. POST faz upsert de
// quando/onde/data, ou marca concluido (body.complete = true).
import { getCurrentUser, unauthorized } from "../_lib/auth";
import { completePlan, listActivePlans, upsertPlan } from "../_lib/sessionPlans";
import { Env, GRUPO_B_SCOPES } from "../_lib/types";

const VALID_SCOPES = new Set<string>(GRUPO_B_SCOPES.map((s) => s.scope));

function withLabels(plans: Awaited<ReturnType<typeof listActivePlans>>) {
  return plans.map((p) => ({
    ...p,
    label: GRUPO_B_SCOPES.find((s) => s.scope === p.scope)!.label,
  }));
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getCurrentUser({ request, env });
  if (!user) return unauthorized();

  const plans = await listActivePlans(env.DB, user.id);
  return Response.json({ plans: withLabels(plans) });
};

interface Body {
  scope: string;
  when_text?: string | null;
  where_text?: string | null;
  scheduled_for?: string | null;
  theme_text?: string | null;
  target_vocabulary?: string | null;
  complete?: boolean;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getCurrentUser({ request, env });
  if (!user) return unauthorized();

  const body = (await request.json()) as Body;
  if (!body?.scope || !VALID_SCOPES.has(body.scope)) {
    return Response.json({ error: "scope invalido" }, { status: 400 });
  }

  if (body.complete) {
    await completePlan(env.DB, user.id, body.scope);
  } else {
    await upsertPlan(env.DB, user.id, body.scope, {
      when_text: body.when_text?.trim() || null,
      where_text: body.where_text?.trim() || null,
      scheduled_for: body.scheduled_for || null,
      theme_text: body.theme_text !== undefined ? body.theme_text?.trim() || null : undefined,
      target_vocabulary: body.target_vocabulary !== undefined ? body.target_vocabulary?.trim() || null : undefined,
    });
  }

  const plans = await listActivePlans(env.DB, user.id);
  return Response.json({ plans: withLabels(plans) });
};
