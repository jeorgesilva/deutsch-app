// POST /api/auth/logout -- Fase 13. É o mecanismo de "trocar de usuário":
// sai da conta atual, o frontend volta pra tela de login pra entrar com a
// outra conta.
import { destroySession, readCookie, sessionCookieHeader } from "../../_lib/auth";
import { Env } from "../../_lib/types";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const token = readCookie(request, "session_token");
  if (token) await destroySession(env, token);

  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": sessionCookieHeader(null, 0),
    },
  });
};
