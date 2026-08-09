// GET /api/hostile-roleplay/scenarios -- Fase 11, catalogo do Grupo D
// (docs/05 itens 95-99): 4 personas hostis + "posicao atribuida" (nao
// hostil, mas listada junto no mesmo catalogo/escada por docs/09). Ordem
// SUGERIDA, nunca bloqueada (docs/09 achado #8: sobrecarga de escolha
// pre-exposicao e' cara, mas travar rigidamente seria contraproducente
// pra exposicao graduada controlada pelo proprio usuario). times_completed
// vem de sessoes ja FECHADAS (com avaliacao), so' informativo.
import { getCurrentUser, unauthorized } from "../../_lib/auth";
import { countClosedSessionsByPersona, GRUPO_D_PERSONAS } from "../../_lib/roleplay";
import { Env } from "../../_lib/types";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getCurrentUser({ request, env });
  if (!user) return unauthorized();

  const counts = await countClosedSessionsByPersona(env.DB, user.id);
  const scenarios = GRUPO_D_PERSONAS.map((p) => ({
    key: p.key,
    label: p.label,
    group: p.group,
    description: p.description,
    intensity: p.intensity ?? null,
    times_completed: counts[p.key] ?? 0,
  }));
  return Response.json({ scenarios });
};
