// Fase 13 -- multi-usuario (CLAUDE.md, login/logout tradicional, login
// obrigatorio em todo o app). PBKDF2-SHA256 via crypto.subtle -- zero
// dependencia nova, o Worker ja tem Web Crypto nativo, sem precisar de
// bcrypt/argon2 (que exigiriam WASM/binding nao trivial no runtime do
// Worker). Sessao é uma linha em D1 (nao JWT) -- "trocar de usuario" e'
// logout + login, e revogar uma sessao e' so' apagar a linha.
import { Env } from "./types";

const PBKDF2_ITERATIONS = 100_000;
const SESSION_DAYS = 30;

function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return toHex(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${hash}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  const salt = fromHex(parts[2]);
  const expected = parts[3];
  const actual = await pbkdf2(password, salt, iterations);
  // comparacao em tempo constante -- evita timing attack revelando quantos
  // caracteres do hash bateram.
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export interface CurrentUser {
  id: number;
  email: string;
  display_name: string;
}

const COOKIE_NAME = "session_token";

export function sessionCookieHeader(token: string | null, maxAgeSeconds: number): string {
  const value = token ?? "";
  return `${COOKIE_NAME}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

export async function createSession(env: Env, userId: number): Promise<{ token: string; maxAgeSeconds: number }> {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const maxAgeSeconds = SESSION_DAYS * 24 * 60 * 60;
  const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000).toISOString();
  await env.DB.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`)
    .bind(token, userId, expiresAt)
    .run();
  return { token, maxAgeSeconds };
}

export async function destroySession(env: Env, token: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM sessions WHERE token = ?`).bind(token).run();
}

export async function getCurrentUser({ request, env }: { request: Request; env: Env }): Promise<CurrentUser | null> {
  const token = readCookie(request, COOKIE_NAME);
  if (!token) return null;

  return getUserBySessionToken(env, token);
}

export async function getUserBySessionToken(env: Env, token: string): Promise<CurrentUser | null> {
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.display_name FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ?`
  )
    .bind(token, new Date().toISOString())
    .first<CurrentUser>();
  return row ?? null;
}

// todo handler autenticado abre com:
//   const user = await getCurrentUser({ request, env });
//   if (!user) return unauthorized();
// sem wrapper/throw -- mesmo estilo explicito de check-e-retorna ja usado
// no resto do projeto (ex. "nenhum plano ativo" em varias rotas), este
// projeto nunca teve um framework de middleware.
export function unauthorized(): Response {
  return Response.json({ error: "não autenticado" }, { status: 401 });
}
