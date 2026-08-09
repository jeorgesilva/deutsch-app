// GET /api/reading-blocks/:id -- "home por categoria" (docs/12): bloco
// inteiro (texto + sequência ORDENADA de exercícios ligados a ele), pra
// abrir sem misturar com nenhum outro tópico no meio.
import { getCurrentUser, unauthorized } from "../../_lib/auth";
import { getReadingBlockDetail } from "../../_lib/readingBlocks";
import { Env } from "../../_lib/types";

export const onRequestGet: PagesFunction<Env> = async ({ request, params, env }) => {
  const user = await getCurrentUser({ request, env });
  if (!user) return unauthorized();

  const id = Number(params.id);
  if (!Number.isInteger(id)) return Response.json({ error: "id inválido" }, { status: 400 });

  const block = await getReadingBlockDetail(env.DB, user.id, id);
  if (!block) return Response.json({ error: "bloco não encontrado" }, { status: 404 });

  return Response.json(block);
};
