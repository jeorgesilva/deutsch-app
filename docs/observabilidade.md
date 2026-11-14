# Observabilidade (Fase 6, 14/11/2026)

Motivo: o cron diário ficou parado de 10/10 a 14/11/2026 sem nenhum sinal (ver `docs/known-issues.md`). Este documento lista o que passou a avisar sozinho e o que ainda depende de configuração manual num painel.

## O que foi automatizado

| Sinal | Onde está | O que dispara | Sem configuração |
|---|---|---|---|
| Heartbeat do cron diário (6.1) | `scheduled()` em `services/generation-container/src/index.ts` | GET em `HEALTHCHECKS_PING_URL` no sucesso; `HEALTHCHECKS_PING_URL/fail` se o batch rejeitar, algum item der erro ou nada novo entrar. O healthchecks.io também alerta quando **nenhum** ping chega no período (cobre o cron nem disparar). | Loga um aviso e segue o job |
| Log do batch diário (PR #6) | mesmo `scheduled()` | `daily batch ok` / `daily batch com erros` / `daily batch sem item novo` / `daily batch falhou antes do loop`, com o resumo em JSON. Ver com `npx wrangler tail` em `services/generation-container/` ou no painel de Workers Logs. | Sempre ativo |
| Gate de aprovação (6.2) | `environment: production` no job `deploy` dos dois workflows de container | Deploy espera aprovação manual | Não bloqueia nada até haver reviewer |
| Aviso de deploy (6.3) | step `Notify Slack` dos dois workflows de container | Mensagem com workflow, branch, status e link do run, em sucesso **e** em falha | Step pulado (`continue-on-error`) |
| Revisão semanal por agente (6.7) | `.github/workflows/revisao-semanal.yml` | Segunda 07:00 UTC (`schedule`) e `workflow_dispatch` avulso. Relatório do agente (só leitura) no Slack, com aviso também em falha e em semana sem commit | Sem `CLAUDE_CODE_OAUTH_TOKEN` válido o step do Claude falha e o Slack avisa com o texto do erro |

O `/run-daily-batch` manual não pinga o healthchecks: só o cron, para o período do check refletir o agendamento. O `/health` do Worker continua respondendo `ok` sem tocar no container — não serve como prova de que o container sobe (camada 2 da prevenção, ainda pendente no plano).

O deploy do app (Pages) não passa pelo Actions: o projeto `deutsch-app` não tem Git conectado e é publicado à mão com `wrangler pages deploy`. Nenhum dos sinais acima cobre esse deploy.

## O que depende de você num painel

- [x] Criar conta healthchecks.io, criar 1 check, colar a URL como
      secret HEALTHCHECKS_PING_URL no container de geração
- [ ] Settings → Environments → production → Required reviewers
      (me adicionar) nos 2-3 repos/workflows de deploy
- [x] Criar Incoming Webhook no Slack, colar como secret
      SLACK_WEBHOOK_URL no repo
- [ ] Cloudflare Dashboard → Workers & Pages → [worker] →
      Integrations → Sentry → conectar (precisa de conta Sentry free)
- [x] (6.7) `claude setup-token` no terminal local, colar o token como
      secret CLAUDE_CODE_OAUTH_TOKEN no repo, rodar "Revisao semanal
      (agente)" à mão em Actions e só então descomentar o `schedule`
      (feito em 14/11/2026; o token vale ~1 ano, então renovar perto de
      11/2027 — o sintoma é um 401 no aviso do Slack)

### Correções à lista acima

- **Healthchecks:** o secret vai no **Worker `deutsch-generation-service`**, não no container — quem pinga é o `scheduled()` do Worker TS. Comando, em `services/generation-container/`: `npx wrangler secret put HEALTHCHECKS_PING_URL`. Como só o Worker lê o secret, não precisa de redeploy da imagem.
- **Período do check:** o cron roda em `0 4 * * *` UTC (`services/generation-container/wrangler.toml`). Configurar o check como cron `0 4 * * *` em UTC (ou período de 1 dia) com tolerância de algumas horas — o batch faz até 20 chamadas sequenciais de LLM/yt-dlp e pode demorar.
- **Environments:** os workflows de deploy são 2, no mesmo repo (`deploy-generation-service.yml` e `deploy-phonetic-service.yml`). O environment `production` só aparece em Settings depois do primeiro run que o referencia.
- **Slack:** o secret `SLACK_WEBHOOK_URL` já existe no repo (gravado em 14/11/2026 00:42 UTC); o usuário conferiu o formato em 14/11. Ainda falta um teste real: o primeiro deploy de container depois do merge da 6.3. Se a mensagem não chegar, o log do step `Notify Slack` mostra o erro do `curl`.

### Estado em 14/11/2026

- **Healthchecks:** feito. O secret foi gravado no Worker `deutsch-generation-service` às ~02:00 UTC. O primeiro ping de verdade será o cron das 04:00 UTC de 14/11.
- **Environment:** o revisor foi adicionado ao environment **`copilot`**, que é o do agente do GitHub Copilot, não o dos deploys. Os workflows usam `environment: production`, que ainda não tem revisor. Falta criar `production` (Settings → Environments → New environment) e se adicionar como revisor. Avaliar também tirar o revisor do `copilot`, que pode passar a travar o Copilot.
- **Sentry: o caminho do checklist não existe mais.** A aba *Integrations* dos Workers foi removida do painel da Cloudflare em 09/06/2025 (changelog "Workers native integrations were removed"). Hoje há dois caminhos, e os dois exigem mudança no repo, ou seja, redeploy do Worker:
  - exportar por OpenTelemetry: painel → **Observability → Destinations**, com o endpoint OTLP do Sentry, e depois ligar o export no `wrangler.toml` do Worker;
  - o SDK `@sentry/cloudflare` no código do Worker.

  Fica como opcional. O heartbeat mais o log do `scheduled()` já cobrem o incidente que motivou a Fase 6.

## Identidade por papel no Slack (6.6)

O payload da 6.3 já manda `username` e `icon_emoji` por mensagem, lidos de `SLACK_USERNAME`/`SLACK_ICON_EMOJI` no `env` do step. Um step que reporte o resultado de um papel (por exemplo `🔒 Segurança` / `:lock:` ou `🧪 QA` / `:test_tube:`) só troca essas duas variáveis — mesmo webhook, mesmo secret. Não há caso concreto hoje, então nada foi implementado.

Ressalva **não verificada**: webhooks criados por um app do Slack (o formato atual) costumam ignorar `username`/`icon_emoji` e mostrar sempre o nome e o ícone do app; só os webhooks "legacy" respeitam o override. Conferir com uma mensagem real antes de contar com a identidade por papel.
