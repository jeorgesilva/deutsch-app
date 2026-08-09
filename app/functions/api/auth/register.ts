// POST /api/auth/register -- Fase 13. body {email, password, display_name}.
// Cria a conta, ja abre sessao (mesmo Set-Cookie do /login) -- registro
// nao exige login separado logo em seguida.
import { createSession, hashPassword, sessionCookieHeader } from "../../_lib/auth";
import { Env } from "../../_lib/types";

interface Body {
  email: string;
  password: string;
  display_name: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = (await request.json()) as Body;
  const email = body?.email?.trim().toLowerCase();
  const displayName = body?.display_name?.trim();
  const password = body?.password;

  if (!email || !email.includes("@")) {
    return Response.json({ error: "email inválido" }, { status: 400 });
  }
  if (!displayName) {
    return Response.json({ error: "display_name é obrigatório" }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 8) {
    return Response.json({ error: "senha precisa de pelo menos 8 caracteres" }, { status: 400 });
  }

  const existing = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first<{ id: number }>();
  if (existing) {
    return Response.json({ error: "já existe uma conta com esse email" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const result = await env.DB.prepare(`INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)`)
    .bind(email, passwordHash, displayName)
    .run();
  const userId = result.meta.last_row_id as number;

  const { token, maxAgeSeconds } = await createSession(env, userId);

  return new Response(JSON.stringify({ id: userId, email, display_name: displayName }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": sessionCookieHeader(token, maxAgeSeconds),
    },
  });
};
