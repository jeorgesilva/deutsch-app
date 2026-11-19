-- AI-4.1 (Tech DD, 18/11/2026) -- limite de tentativas de login contado no
-- D1. O binding `ratelimits` nao e' aceito em projeto Pages (lista
-- supportedPagesConfigFields do wrangler 4.119), a regra de WAF nao cobre
-- *.pages.dev, e um Worker so' para isso seria mais um servico para operar.
--
-- Uma linha por login que falhou (usuario inexistente, senha errada ou
-- e-mail fora de ALLOWED_EMAILS). login.ts conta as linhas dos ultimos 15
-- minutos por ip e por email ANTES de verificar a senha (_lib/loginThrottle.ts).
-- Tentativa bloqueada nao grava linha, entao cada ip grava no maximo 5 por
-- janela. Sem rotina de limpeza por ora (decisao do usuario, 18/11/2026).
--
-- Idempotente (IF NOT EXISTS), ao contrario da 0001. Aplicar a mao:
--   npx wrangler d1 execute deutsch-db --local  --file=migrations/0014_login_failures.sql
--   npx wrangler d1 execute deutsch-db --remote --file=migrations/0014_login_failures.sql
-- Em producao, ANTES do `wrangler pages deploy` que traz o login.ts novo.
CREATE TABLE IF NOT EXISTS login_failures (
  id INTEGER PRIMARY KEY,
  ip TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- created_at junto no indice: a consulta e' sempre "deste ip/email, dentro
-- da janela".
CREATE INDEX IF NOT EXISTS idx_login_failures_ip ON login_failures(ip, created_at);
CREATE INDEX IF NOT EXISTS idx_login_failures_email ON login_failures(email, created_at);
