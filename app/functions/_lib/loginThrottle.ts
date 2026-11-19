// AI-4.1 (Tech DD, 18/11/2026) -- limite de tentativas de login, contado na
// tabela login_failures (migration 0014). Por que D1 e nao o binding
// `ratelimits`: Pages nao aceita esse binding, a regra de WAF nao cobre
// *.pages.dev, e um Worker so' para isso seria mais um servico para operar.
// O D1 tem um primario so', entao a contagem e' exata -- o binding nativo
// conta por local da Cloudflare, de forma aproximada.
//
// Conta por ip E por email: o teto por ip segura um atacante numa origem so';
// o por email segura quem troca de ip mirando a mesma conta. Custo aceito: quem
// insistir no e-mail do dono trava o login dele por ate' 15 minutos.

export const LOGIN_WINDOW_MINUTES = 15;
export const MAX_FAILURES_PER_IP = 5;
export const MAX_FAILURES_PER_EMAIL = 20;

export interface FailureCounts {
  by_ip: number;
  by_email: number;
}

export function isOverLimit(counts: FailureCounts): boolean {
  return counts.by_ip >= MAX_FAILURES_PER_IP || counts.by_email >= MAX_FAILURES_PER_EMAIL;
}

// CF-Connecting-IP vem sempre em producao. Sem ele (dev local), todas as
// tentativas dividem a mesma chave -- erra para o lado de bloquear.
export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "sem-ip";
}

const WINDOW_MODIFIER = `-${LOGIN_WINDOW_MINUTES} minutes`;

export async function isLoginBlocked(db: D1Database, ip: string, email: string): Promise<boolean> {
  const counts = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM login_failures WHERE ip = ? AND created_at > datetime('now', ?)) AS by_ip,
         (SELECT COUNT(*) FROM login_failures WHERE email = ? AND created_at > datetime('now', ?)) AS by_email`
    )
    .bind(ip, WINDOW_MODIFIER, email, WINDOW_MODIFIER)
    .first<FailureCounts>();
  return isOverLimit(counts ?? { by_ip: 0, by_email: 0 });
}

export async function recordLoginFailure(db: D1Database, ip: string, email: string): Promise<void> {
  await db.prepare(`INSERT INTO login_failures (ip, email) VALUES (?, ?)`).bind(ip, email).run();
}
