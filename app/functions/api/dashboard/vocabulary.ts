// GET /api/dashboard/vocabulary[?pos=Substantiv] -- contador de vocabulario
// contatado (docs/14): lemmas distintos com pelo menos 1 attempt correct=1.
// Sem `pos`, devolve so o total + detalhamento por classe gramatical
// (clicavel no frontend); com `pos`, devolve tambem a lista de palavras
// daquela classe.
import { getCurrentUser, unauthorized } from "../../_lib/auth";
import { getVocabularyStats } from "../../_lib/dashboard";
import { Env } from "../../_lib/types";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getCurrentUser({ request, env });
  if (!user) return unauthorized();

  const pos = new URL(request.url).searchParams.get("pos");
  const stats = await getVocabularyStats(env.DB, user.id, pos);
  return Response.json(stats);
};
