// POST /api/auth/login -- Fase 13. body {email, password}.
import { createSession, DUMMY_PASSWORD_HASH, isEmailAllowed, sessionCookieHeader, verifyPassword } from "../../_lib/auth";
import { clientIp, isLoginBlocked, LOGIN_WINDOW_MINUTES, recordLoginFailure } from "../../_lib/loginThrottle";
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

  // AI-4.1: limite de tentativas ANTES da senha -- tentativa bloqueada não
  // gasta PBKDF2 nem grava linha (ver _lib/loginThrottle.ts). Se a tabela
  // não existir (migration 0014 não aplicada), falha fechada com erro
  // legível em vez de liberar o login sem limite.
  const ip = clientIp(request);
  try {
    if (await isLoginBlocked(env.DB, ip, email)) {
      return Response.json(
        { error: `muitas tentativas de login; espere ${LOGIN_WINDOW_MINUTES} minutos e tente de novo` },
        { status: 429, headers: { "Retry-After": String(LOGIN_WINDOW_MINUTES * 60) } }
      );
    }
  } catch (err) {
    console.error("login: falha ao consultar login_failures", err);
    return Response.json({ error: "login temporariamente indisponível" }, { status: 503 });
  }

  const user = await env.DB.prepare(`SELECT id, email, display_name, password_hash FROM users WHERE email = ?`)
    .bind(email)
    .first<UserRow>();

  // mesma mensagem genérica pros dois casos (email inexistente ou senha
  // errada) -- não revelar se um email está cadastrado ou não.
  // AI-4.1: conta fora de ALLOWED_EMAILS cai na mesma mensagem. A checagem
  // vem depois da senha, então o tempo de resposta não denuncia a lista.
  // O PBKDF2 roda SEMPRE: sem usuário, contra DUMMY_PASSWORD_HASH -- senão
  // o e-mail inexistente responderia mais rápido e o tempo revelaria quem
  // tem conta. O `!user` continua na condição: o hash de mentira nunca loga.
  const passwordOk = await verifyPassword(password, user?.password_hash ?? DUMMY_PASSWORD_HASH);
  if (!user || !passwordOk || !isEmailAllowed(env, user.email)) {
    await recordLoginFailure(env.DB, ip, email);
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
