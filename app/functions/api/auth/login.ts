// POST /api/auth/login -- Fase 13. body {email, password}.
import { createSession, sessionCookieHeader, verifyPassword } from "../../_lib/auth";
import { Env } from "../../_lib/types";

interface Body {
  email: string;
  password: string;
}

interface UserRow {
  id: number;
  email: string;
  display_name: string;
  password_hash: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = (await request.json()) as Body;
  const email = body?.email?.trim().toLowerCase();
  const password = body?.password;

  if (!email || typeof password !== "string") {
    return Response.json({ error: "email e senha são obrigatórios" }, { status: 400 });
  }

  const user = await env.DB.prepare(`SELECT id, email, display_name, password_hash FROM users WHERE email = ?`)
    .bind(email)
    .first<UserRow>();

  // mesma mensagem genérica pros dois casos (email inexistente ou senha
  // errada) -- não revelar se um email está cadastrado ou não.
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return Response.json({ error: "email ou senha incorretos" }, { status: 401 });
  }

  const { token, maxAgeSeconds } = await createSession(env, user.id);

  return new Response(JSON.stringify({ id: user.id, email: user.email, display_name: user.display_name }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": sessionCookieHeader(token, maxAgeSeconds),
    },
  });
};
