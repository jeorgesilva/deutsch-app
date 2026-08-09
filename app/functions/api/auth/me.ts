// GET /api/auth/me -- Fase 13. Frontend chama no boot pra saber se ja esta
// logado (200 + dados do usuario) ou precisa mostrar a tela de login (401).
import { getCurrentUser, unauthorized } from "../../_lib/auth";
import { Env } from "../../_lib/types";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getCurrentUser({ request, env });
  if (!user) return unauthorized();
  return Response.json({ user });
};
