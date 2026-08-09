// GET /api/dashboard/calendar -- heatmap de uso por dia (docs/14: rampa do
// --accent, nunca verde -- isso ja' significa "resposta certa" em outro
// lugar do app; dia sem uso fica neutro, nunca cor de falha).
import { getCurrentUser, unauthorized } from "../../_lib/auth";
import { getUsageCalendar } from "../../_lib/dashboard";
import { Env } from "../../_lib/types";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getCurrentUser({ request, env });
  if (!user) return unauthorized();

  const days = await getUsageCalendar(env.DB, user.id);
  return Response.json({ days });
};
