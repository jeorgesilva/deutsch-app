// AI-4.1 (Tech DD, 18/11/2026) -- limite de tentativas de login, contado na
// tabela login_failures (migration 0014). Por que D1 e nao o binding
// `ratelimits`: Pages nao aceita esse binding, a regra de WAF nao cobre
// *.pages.dev, e um Worker so' para isso seria mais um servico para operar.
//
// Conta por ip E por email: o teto por ip segura um atacante numa origem so';
// o por email segura quem troca de ip mirando a mesma conta. Custo aceito: quem
// insistir no e-mail do dono trava o login dele por ate' 15 minutos.
//
// Reserva atomica (achado da revisao de seguranca do push, 20/11/2026): a
// primeira versao contava as falhas, verificava a senha e so' depois gravava
// a falha. N requests simultaneos passavam todos pela contagem antes de
// qualquer gravacao -- reproduzido: 20 tentativas ao mesmo tempo, 20 senhas
// testadas. Agora um unico INSERT ... SELECT WHERE so' grava a linha se ainda
// houver vaga. O D1 executa cada statement de forma atomica, entao a
// contagem e a reserva nao podem ser intercaladas por outro request.

export const LOGIN_WINDOW_MINUTES = 15;
export const MAX_FAILURES_PER_IP = 5;
export const MAX_FAILURES_PER_EMAIL = 20;

// CF-Connecting-IP vem sempre em producao. Sem ele (dev local), todas as
// tentativas dividem a mesma chave -- erra para o lado de bloquear.
export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "sem-ip";
}

const WINDOW_MODIFIER = `-${LOGIN_WINDOW_MINUTES} minutes`;

// Reserva a vaga ANTES de verificar a senha. Devolve o id da linha reservada
// (a tentativa conta como falha ate' ser liberada) ou null se o limite ja foi
// atingido -- nesse caso nada e' gravado, entao o bloqueio nao se renova.
export async function reserveLoginAttempt(db: D1Database, ip: string, email: string): Promise<number | null> {
  const result = await db
    .prepare(
      `INSERT INTO login_failures (ip, email)
       SELECT ?, ?
       WHERE (SELECT COUNT(*) FROM login_failures WHERE ip = ? AND created_at > datetime('now', ?)) < ?
         AND (SELECT COUNT(*) FROM login_failures WHERE email = ? AND created_at > datetime('now', ?)) < ?`
    )
    .bind(ip, email, ip, WINDOW_MODIFIER, MAX_FAILURES_PER_IP, email, WINDOW_MODIFIER, MAX_FAILURES_PER_EMAIL)
    .run();
  return result.meta.changes > 0 ? Number(result.meta.last_row_id) : null;
}

// Login certo: a tentativa reservada nao foi falha e sai da contagem.
export async function releaseLoginAttempt(db: D1Database, attemptId: number): Promise<void> {
  await db.prepare(`DELETE FROM login_failures WHERE id = ?`).bind(attemptId).run();
}
