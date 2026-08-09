// GET /api/dashboard/word-of-the-day -- banner de palavra do dia (docs/14):
// origem (tentativa errada) e' logica de selecao nos bastidores, nunca
// rotulo visivel -- resposta so' traz palavra + exemplo, sem "voce errou
// isso" em lugar nenhum do payload.
import { getCurrentUser, unauthorized } from "../../_lib/auth";
import { getWordOfTheDay } from "../../_lib/dashboard";
import { Env } from "../../_lib/types";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getCurrentUser({ request, env });
  if (!user) return unauthorized();

  const word = await getWordOfTheDay(env.DB, user.id);
  return Response.json({ word });
};
