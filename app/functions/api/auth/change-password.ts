// POST /api/auth/change-password -- Fase 13 (pendência). body
// {current_password, new_password}. Exige a senha atual (não basta estar
// logado -- mesmo padrão de qualquer troca de senha real) e invalida
// as outras sessões do usuário (qualquer outro dispositivo/aba logado
// precisa entrar de novo) -- comportamento esperado depois de trocar
// senha, não uma sessão nova por engano.
import { getCurrentUser, hashPassword, readCookie, unauthorized, verifyPassword } from "../../_lib/auth";
import { Env } from "../../_lib/types";

interface Body {
  current_password: string;
  new_password: string;
}

interface UserRow {
  password_hash: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getCurrentUser({ request, env });
  if (!user) return unauthorized();

  const body = (await request.json()) as Body;
  if (typeof body?.current_password !== "string" || typeof body?.new_password !== "string") {
    return Response.json({ error: "current_password e new_password são obrigatórios" }, { status: 400 });
  }
  if (body.new_password.length < 8) {
    return Response.json({ error: "senha nova precisa de pelo menos 8 caracteres" }, { status: 400 });
  }

  const row = await env.DB.prepare(`SELECT password_hash FROM users WHERE id = ?`)
    .bind(user.id)
    .first<UserRow>();
  if (!row || !(await verifyPassword(body.current_password, row.password_hash))) {
    return Response.json({ error: "senha atual incorreta" }, { status: 401 });
  }

  const newHash = await hashPassword(body.new_password);
  await env.DB.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).bind(newHash, user.id).run();

  // derruba as outras sessoes (qualquer token que nao seja o desta propria
  // requisicao) -- mesma logica de "trocou a senha, os outros dispositivos
  // precisam entrar de novo" de qualquer app real.
  const currentToken = readCookie(request, "session_token");
  await env.DB.prepare(`DELETE FROM sessions WHERE user_id = ? AND token != ?`)
    .bind(user.id, currentToken ?? "")
    .run();

  return Response.json({ ok: true });
};
