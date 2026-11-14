# Plano de follow-up — fases 1 a 6 (iniciado em 13/11/2026)

Documento de passagem entre sessões. Uma sessão nova lê este arquivo, o
`CLAUDE.md` raiz e o `docs/known-issues.md` e continua da primeira fase ainda
não concluída. **Atualizar a tabela de estado ao fim de cada sub-fase.**

## Como usar numa aba nova

Prompt de partida sugerido:

> Leia `docs/19-plano-follow-up-fases.md`, `CLAUDE.md` e `docs/known-issues.md`.
> Confira `git log --oneline -5 origin/main` contra a seção "Estado do repo".
> Se algo divergir, pare e me avise. Depois, me diga qual é a próxima
> sub-fase pendente e o que você vai fazer, e espere eu confirmar.

Regras que valem para todas as fases (do `CLAUDE.md` raiz e do pedido original):

- Branch nova a partir de `main` para cada leva de trabalho; nunca direto em `main`.
- Fatias pequenas; **parar e esperar aprovação** depois de cada fase ou sub-fase, mostrando o diff.
- Commit só quando o usuário pedir. Código, comentários e docs em português.
- Não reabrir "Decisões fechadas" do `CLAUDE.md` sem motivo forte.
- Não editar `services/phonetic-container/service.py`: é um mock e editá-lo dispara um redeploy.
- Qualquer commit em `pipeline/src/deutsch_pipeline/**` ou `services/<container>/**` que chegue a `main` dispara o deploy do container correspondente (os dois workflows observam `pipeline/src/**`).
- O `.env` da raiz é bloqueado por regra de permissão; não tentar ler.

## Estado do repo (14/11/2026)

- `origin/main` em `aece0c8` (merge do PR #6).
- PR #5 (`424b12f`): fix do `schema_class` no container, `schemas.py` no vendor, `vendor-files.txt` + `pipeline/tests/test_vendor_manifest.py`.
- PR #6 (`554601b`): `scheduled()` passa a logar o resumo do batch diário e as falhas; aviso quando `CLOUDFLARE_API_TOKEN` está ausente. Feito em outra sessão.
- Branch de trabalho deste documento: `chore/plano-fases`.
- Ferramentas disponíveis na máquina: `gh` autenticado (`jeorgesilva`); `wrangler` autenticado; MCP do Cloudflare configurado (só carrega numa sessão nova).

## Fatos já confirmados (não re-derivar)

- **Cron diário parado desde 10/10/2026.** O último `reading_blocks` é de 09/10 04:16 UTC e nenhuma linha de `exercises` foi gravada depois. Causa: conta Cloudflare com pagamento em atraso, que bloqueou Cloudflare Containers. Pagamento regularizado em 14/11. Logo depois, `wrangler containers list` ainda respondia `Account is not authorized`.
- **Nenhum deploy de container passou desde 12/08/2026.** Nos workflows, o script do Worker sobe ("Uploaded …"), mas o envio da imagem recebe `Unauthorized`. Consequências:
  - A imagem em produção é anterior ao `4cc3cee`, então o crash do `schemas.py` **nunca chegou a produção**.
  - Mudanças **só no Worker TS** (`src/index.ts`) chegam a produção mesmo com o deploy falhando, porque o upload do script acontece antes do envio da imagem.
- O segredo `CLOUDFLARE_DEPLOY_API_TOKEN` **não existe** no GitHub. O workflow cai sempre em `CLOUDFLARE_API_TOKEN` (trocado em 18/10). Só existem `CLOUDFLARE_API_TOKEN` e `HF_TOKEN`.
- Duração típica dos runs: `verify.yml` ~50 s; deploy de geração ~1 min 30 s quando falha (3–6 min quando passa); deploy de fonética ~2 min 30 s quando falha.
- O cron de 04:00 UTC roda no `scheduled()` do **Worker TS** ([services/generation-container/src/index.ts](../services/generation-container/src/index.ts)), que chama o container item por item (`/generate-video-item`, `/generate-reading-item`). Não há loop de cron em Python.
- `video_clips` não tem `created_at`. Para datar o conteúdo diário, usar `exercises.created_at` (com `video_clip_id`) e `reading_blocks.created_at`.
- O `/health` do Worker responde `ok` sem tocar no container; ele não prova que o container sobe.

## Tabela de estado

| Fase | Item | Estado |
|---|---|---|
| 1 | Tirar a ressalva do `verify.sh` do known-issues | ✅ PR #5 |
| 2 | `ENGINE_SCHEMAS` + `schema_class` no `generation/service.py`; `schemas.py` no vendor | ✅ código em `main` · ⏳ deploy depende de Containers voltar |
| 2+ | Prevenção camada 1: manifesto de vendor + teste | ✅ PR #5 |
| 2+ | Cron falhando em silêncio: logs no `scheduled()` | ✅ PR #6 |
| 0 | **Bloqueador:** acesso a Cloudflare Containers voltar e um deploy de container passar | 🟡 acesso ok + deploy de geração ok (13/11 23:42 UTC) · ⏳ deploy de fonética · ⏳ cron de 14/11 gravar |
| 3 | Lacunas de documentação | ✅ branch `docs/fase-3-lacunas` (aguarda aprovação) |
| 4a | Watchdog de jobs presos em `running` | ⬜ |
| 4b | Filtro editorial mínimo no RSS de notícias | ⬜ |
| 4c | Geração sob demanda ponta a ponta | ⬜ (depende do bloqueador) |
| 4d | Templates que nunca escalaram além do piloto | ⬜ |
| 5a | Métricas no model card do corretor | ⬜ (só depois de 1–4) |
| 5b | Demo sem fricção do corretor | ⬜ |
| 5c | Corretor como feature do deutsch-app | ⬜ |
| 6.1 | Dead man's switch no cron | ✅ branch `docs/fase-3-lacunas` (aguarda aprovação) · ⏳ usuário criar o check e o secret |
| 6.2 | `environment: production` nos deploys | ✅ branch `ci/environment-production` (aguarda aprovação) · ⏳ usuário configurar reviewer na UI |
| 6.3 | Notificação de deploy no Slack | ✅ branch `ci/slack-deploy` (aguarda aprovação) · ⏳ usuário criar o webhook e o secret |
| 6.4 | `docs/observabilidade.md` | ✅ branch `docs/observabilidade` (aguarda aprovação) |
| 6.5 | Subagentes no nível de projeto | 🟡 16 agentes + skill `sast-configuration` em `.claude/` (branch `chore/subagentes-projeto`, aguarda aprovação) · ⏳ commands/skills dos plugins não lidos · ⏳ decisão sobre Cloudflare no escopo de projeto |
| 6.6 | Identidade por papel nas mensagens do Slack | ✅ só documentado em `docs/observabilidade.md` (sem caso concreto; ressalva: webhook de app pode ignorar `username`/`icon_emoji`) |

Ordem sugerida: o bloqueador corre em paralelo (é do usuário). Depois vêm a Fase 3, a 6.1–6.4 (fecham a observabilidade que faltou neste incidente), a Fase 4, a 6.5–6.6 e por último a Fase 5. O usuário pode reordenar; a Fase 5 continua presa ao fechamento das Fases 1–4.

---

## Fase 0 — bloqueador (do usuário)

- [x] Cloudflare → Billing: confirmar o Workers Paid ativo.
- [x] `npx wrangler containers list` responde (verificado 14/11 00:00 UTC): os dois containers `ready`; o de geração com `LAST MODIFIED` 13/11 23:45, o de fonética ainda em 09/08.
- [x] `deploy-generation-service.yml` passou no push do merge do PR #6 (13/11 23:42 UTC).
- [ ] Fonética: o último run (13/11 23:18 UTC) falhou **antes** do acesso voltar. Rodar de novo: `gh workflow run deploy-phonetic-service.yml`.
- [ ] No dia seguinte, confirmar no D1 remoto que o cron gravou:
  ```bash
  cd app && npx wrangler d1 execute deutsch-db --remote --command \
    "SELECT max(created_at) FROM reading_blocks"
  ```
- Opcional: criar o segredo `CLOUDFLARE_DEPLOY_API_TOKEN` com permissão de Containers, ou tirar o fallback do workflow. Hoje o primeiro ramo nunca roda.

## Fase 3 — lacunas de documentação

1. `CLAUDE.md` raiz, seção "Comandos": a nota diz que `npm test` falha por não ter `--passWithNoTests`. Já foi corrigido (`app/package.json` tem `vitest run --passWithNoTests`). Ajustar a nota.
2. `docs/known-issues.md`, "Lacunas de verificação": a linha "`npm test` (vitest) sai com código 1" está desatualizada pelo mesmo motivo. Revisar as outras linhas da seção.
3. `docs/known-issues.md`, **estrutura quebrada**: as seções "Container de geração quebraria no boot" e "Cron diário parado desde 10/10/2026" foram inseridas no meio da lista "Resolvidos (02/11/2026)". Hoje os itens 2–4 aparecem debaixo do título do cron. Devolver os itens 2–4 para baixo do item 1 e mover as duas seções para depois da lista. Não mudar o conteúdo.
4. Conferir se `pipeline/CLAUDE.md` ("Não há testes") e o `verify.yml` ("vulture não foi verificado") ainda batem com a realidade. O commit `30359fa` mexeu no vulture.

Feito em 14/11/2026: as quatro notas foram corrigidas (`npm test` sai com 0; vulture está na `.venv` e passa; `pipeline/CLAUDE.md` passa a citar os testes e as dependências que ainda faltam no `pyproject.toml`, que são `pydantic`, `piper` e `soundfile`). Achado fora do escopo, ainda **não corrigido**: a 1ª linha do `vulture_whitelist.py` é `cat << 'EOF' > vulture_whitelist.py`, sobra de um heredoc de shell. É Python sintaticamente válido (deslocamento e comparação), por isso o vulture não reclama, mas é lixo.

## Fase 4 — pendências estruturais (uma sub-tarefa por vez)

- **4a. Watchdog para jobs de geração travados em `running`.** Hoje não existe. Primeiro levantar onde o status `running` é gravado (tabela de jobs da geração sob demanda) e propor um critério de timeout e o lugar onde roda (o próprio `scheduled()` é um candidato).
- **4b. Filtro editorial mínimo no RSS diário** (`generation/reading_sources.py`). Hoje não há curadoria e pode entrar tema pesado sem triagem. Coerente com a decisão fechada "geração diária sem curadoria por item": o filtro é automático (lista de exclusão ou classificação), não uma revisão humana por item. Testar contra dados reais antes de travar qualquer gate (regra do `pipeline/CLAUDE.md`).
- **4c. Geração sob demanda ponta a ponta.** Nunca rodou em produção (`docs/17-auditoria-projeto.md`). Depende da Fase 0. Documentar o resultado real, inclusive se falhar.
- **4d. Templates/engines que nunca escalaram além do piloto.** Levantar e **propor** se escalam ou são descontinuados, sem decidir sozinho.
- **Prevenção camadas 2 e 3** (do incidente de 13/11):
  - Camada 2, checagem do `/health` depois do deploy: o `/health` atual não toca no container, então primeiro criar uma rota que exija o container de pé (por exemplo `/health/container`) e só então checá-la no workflow. Pode se juntar à 6.3.
  - Camada 3, aviso de conteúdo velho: **a 6.1 (healthchecks.io) cobre isso por fora**. Um indicador na home ("último item diário em DD/MM", em âmbar) fica opcional.

## Fase 5 — visibilidade do portfólio (só depois das Fases 1–4)

- **5a.** Calcular e publicar no model card de `jeorgesilva/llama3.1-german-corrector-q4` (Hugging Face) métricas de acurácia comparativas contra o LanguageTool e o GPT-4o-mini, num conjunto de teste pequeno mas real. Hoje o card só tem tags.
- **5b.** Demo sem fricção (um HF Space simples ou uma tela dedicada no deutsch-app) que alguém teste em segundos, sem configurar nada.
- **5c.** Integrar o corretor como feature real do deutsch-app (endpoint + UI). Respeitar os três mecanismos de correção separados e o feedback verde/âmbar, nunca vermelho.

## Fase 6 — observabilidade, processo e time de agentes

Definida numa sessão de planejamento externa. Implementar direto, em fatias. **Parar depois de cada sub-fase (6.1–6.6)** e mostrar o diff (na 6.5, a lista de agentes). Não commitar sem pedido.

### 6.1 — Dead man's switch no cron diário

- No ponto de entrada do job diário, duas chamadas HTTP:
  - sucesso: GET em `$HEALTHCHECKS_PING_URL` (variável de ambiente, nada hardcoded);
  - falha: GET em `$HEALTHCHECKS_PING_URL/fail`.
- Sem `HEALTHCHECKS_PING_URL` definida: logar um aviso e seguir, sem falhar o job.
- Documentar em `known-issues.md`: "ping de heartbeat adicionado; requer HEALTHCHECKS_PING_URL configurada como secret no container — pendente eu criar a conta em healthchecks.io e colar a URL".
- **Ajuste já verificado:** o ponto de entrada é o `scheduled()` do Worker TS ([index.ts](../services/generation-container/src/index.ts)), não Python. O equivalente do `except/finally` são os dois ramos do `.then(...)` que o PR #6 criou. Consequências:
  - o secret vai **no Worker** (`wrangler secret put HEALTHCHECKS_PING_URL`, mais o campo no `Env`), não no container. O texto do known-issues deve dizer "secret no Worker `deutsch-generation-service`";
  - como só muda o Worker, isso chega a produção mesmo com o deploy da imagem falhando (ver "Fatos confirmados").
- **Decidido pelo usuário (14/11/2026):** `/fail` se o batch rejeitar **ou** se houver algum erro por item **ou** se nada novo entrar (`video_ok + reading_ok == 0`, mesmo quando as duas fontes só devolvem `skipped`). Um sucesso parcial com erros manda `/fail`, para não esconder a degradação.
- O `/run-daily-batch` manual **não** pinga: só o cron, para o período do check refletir o agendamento.
- Usar `ctx.waitUntil` no ping, para o Worker não terminar antes da chamada sair.

### 6.2 — Gate de aprovação antes de produção

- Adicionar `environment: production` no job de deploy de `.github/workflows/deploy-generation-service.yml` e de `deploy-phonetic-service.yml`. Não há workflow separado de deploy do app (só existem esses dois mais o `verify.yml`). O deploy do app (Pages) não passa pelo Actions: `wrangler pages project list` (14/11/2026) mostra `deutsch-app` sem Git conectado ("Git Provider: No"), então é upload direto manual (`wrangler pages deploy`), último há ~3 meses. Fica fora do gate.
- Não mexer em branch protection nem em Settings via `gh`; fica como pendência na UI.
- Atenção: sem reviewer configurado, o environment não bloqueia nada. Com reviewer, todo push em `main` que toque `pipeline/src/**` passa a esperar aprovação manual.

### 6.3 — Notificação de deploy no Slack

- Step final `if: always()` em cada workflow de deploy, com `curl` simples (sem Action de terceiro) para `secrets.SLACK_WEBHOOK_URL`, no formato de incoming webhook (JSON com `text`).
- Conteúdo: nome do workflow, branch, status (sucesso/falha) e link para o run.
- `username` e `icon_emoji` fixos (`🚀 Deploy Bot` / `:rocket:`), declarados como variáveis fáceis de trocar, porque a 6.6 reusa o formato.
- `continue-on-error: true` até o secret existir.
- Montar o JSON com `jq -n` ou `python -c json.dumps` para não quebrar com aspas no nome do commit.

### 6.4 — Documentação

Criar `docs/observabilidade.md` com o que foi automatizado (6.1–6.3) e o que depende do usuário num painel. Colar literalmente:

```
- [ ] Criar conta healthchecks.io, criar 1 check, colar a URL como
      secret HEALTHCHECKS_PING_URL no container de geração
- [ ] Settings → Environments → production → Required reviewers
      (me adicionar) nos 2-3 repos/workflows de deploy
- [ ] Criar Incoming Webhook no Slack, colar como secret
      SLACK_WEBHOOK_URL no repo
- [ ] Cloudflare Dashboard → Workers & Pages → [worker] →
      Integrations → Sentry → conectar (precisa de conta Sentry free)
```

Abaixo da lista literal, registrar à parte a correção da 6.1: o secret vai no Worker `deutsch-generation-service`, não no container. Mencionar também que o cron roda em `0 4 * * *` UTC (`wrangler.toml`; configurar o check no healthchecks.io com esse período e uma tolerância de algumas horas).

### 6.5 — Subagentes especializados (arquiteto, revisor, segurança, python, ts, dba, qa)

- Instalar no nível de **projeto** (`.claude/` deste repo), não global, para ficar versionado.
- Primeiro tentar via CLI:
  ```
  claude plugin marketplace add wshobson/agents
  claude plugin install comprehensive-review@claude-code-workflows
  claude plugin install python-development@claude-code-workflows
  claude plugin install javascript-typescript@claude-code-workflows
  claude plugin install database-cloud-optimization@claude-code-workflows
  claude plugin install unit-testing@claude-code-workflows
  claude plugin install agent-teams@claude-code-workflows
  ```
  Verificar antes se o `claude plugin install` aceita um escopo de projeto. Se não aceitar, ou se não funcionar fora do modo interativo, usar o método manual: clonar `github.com/wshobson/agents` num diretório temporário (scratchpad) e copiar só `agents/`, `commands/` e `skills/` desses plugins para `.claude/`, sem o resto do marketplace.
- A lista acima tem **6 plugins** (o texto original diz "6" e lista 6). `unit-testing` cobre QA/Test Engineer.
- **Ler o conteúdo de cada agente antes de deixá-lo instalado.** É código de terceiro que vira instrução para o modelo.
- Não commitar. Mostrar a lista de agentes carregados (nome + descrição) e esperar a decisão de versionar.
- Não instalar nada de Ops/SRE/incident-response (já coberto pelos skills `engineering:*`) nem de UX/design.
- **Guardrail permanente:** nenhum agente decide regra gramatical, regência (Dativo, `Funktionsverbgefüge`) ou qualidade de conteúdo curado. Isso exige revisão humana, conforme o `CLAUDE.md`. Se algum agente tocar em `data/raw/` ou nas regras few-shot da geração, parar e avisar em vez de aplicar. Registrar esse guardrail num `CLAUDE.md` ou num README dentro de `.claude/`, para os agentes herdarem.
- O `agent-teams` é ferramenta de desenvolvimento. Não conflita com a regra "não usar framework multiagente no roleplay", que é sobre o produto.

### 6.6 — Identidade por papel nas notificações do Slack

- Reusar o webhook e o payload da 6.3, sem endpoint nem secret novos.
- Quando um step reportar o resultado de um papel (por exemplo, `security-auditor` ou `unit-testing`), usar `username`/`icon_emoji` do papel (`🔒 Segurança` / `:lock:`, `🧪 QA` / `:test_tube:`).
- É só rótulo visual: a mesma identidade de bot por baixo. Nada de @menção por agente nem resposta bidirecional.
- Se não houver caso concreto agora (o mais provável), pular a implementação e só registrar em `docs/observabilidade.md` que o payload já aceita `username`/`icon_emoji` por mensagem.
