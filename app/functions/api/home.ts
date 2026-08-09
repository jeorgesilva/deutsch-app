// GET /api/home -- "home por categoria" (docs/12): resumo agregado pros
// 6 cards de grupo + o card opcional "Revisao de hoje". Mesmo padrao de
// autenticacao dos outros endpoints (getCurrentUser + unauthorized()).
import { getCurrentUser, unauthorized } from "../_lib/auth";
import { getHomeOverview } from "../_lib/home";
import { Env } from "../_lib/types";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getCurrentUser({ request, env });
  if (!user) return unauthorized();

  const overview = await getHomeOverview(env.DB, user.id);
  return Response.json(overview);
};
