// GET /api/reading-blocks -- "home por categoria" (docs/12): hub de
// Leitura, lista de blocos com status (novo/em andamento/concluído).
import { getCurrentUser, unauthorized } from "../_lib/auth";
import { listReadingBlocks } from "../_lib/readingBlocks";
import { Env } from "../_lib/types";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getCurrentUser({ request, env });
  if (!user) return unauthorized();

  const blocks = await listReadingBlocks(env.DB, user.id);
  return Response.json({ blocks });
};
