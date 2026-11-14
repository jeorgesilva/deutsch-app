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

- **Board:** o GitHub Project [deutsch-app — fases](https://github.com/users/jeorgesilva/projects/2) (#2) espelha a tabela de estado, com um cartão por linha, campo `Status` (Todo / Em andamento / Bloqueado / Feito) e campo `Origem` (seção do doc). O doc é a fonte de verdade. Todo commit que muda o estado de uma linha também atualiza o cartão correspondente no mesmo PR (`gh project item-edit`), e linha nova ganha cartão novo. Os cartões são draft items, sem issue, e nada os move sozinho.
- Branch nova a partir de `main` para cada leva de trabalho; nunca direto em `main`.
- Fatias pequenas; **parar e esperar aprovação** depois de cada fase ou sub-fase, mostrando o diff.
- Commit só quando o usuário pedir. Código, comentários e docs em português.
- Não reabrir "Decisões fechadas" do `CLAUDE.md` sem motivo forte.
- Não editar `services/phonetic-container/service.py`: é um mock e editá-lo dispara um redeploy.
- Qualquer commit em `pipeline/src/deutsch_pipeline/**` ou `services/<container>/**` que chegue a `main` dispara o deploy do container correspondente (os dois workflows observam `pipeline/src/**`).
- O `.env` da raiz é bloqueado por regra de permissão; não tentar ler.

## Estado do repo (14/11/2026)

- `origin/main` em `01b1dc6` (merge do PR #15, 14/11/2026 ~02:10 UTC).
- PR #5 (`424b12f`): fix do `schema_class` no container, `schemas.py` no vendor, `vendor-files.txt` + `pipeline/tests/test_vendor_manifest.py`.
- PR #6 (`554601b`): `scheduled()` passa a logar o resumo do batch diário e as falhas; aviso quando `CLOUDFLARE_API_TOKEN` está ausente. Feito em outra sessão.
- PR #7: este plano.
- PRs #8–#15 (14/11), uma branch por fatia: Fase 3, 6.1, 6.2, 6.3, 6.4, 6.5+6.6, 4a e 4b.
- **Deploys de 14/11:** fonética passou às 01:48 UTC (disparo manual; a imagem anterior era de 09/08); geração passou com o merge do #9 (heartbeat). O Pages **não** foi publicado: o watchdog da 4a está em `main`, mas ainda não está no ar.
- Merge de PR empilhado: fazer o merge, mudar a base do PR seguinte para `main` e **só depois** apagar a branch. Apagar antes faz o GitHub fechar o PR seguinte. Depois de mudar a base, fechar e reabrir o PR, porque o `verify.yml` não dispara com a troca de base.
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
- **O cron diário roda de novo desde 14/11** (5 `reading_blocks` e 179 `exercises` entre 04:02 e 04:15 UTC). Mas ele **é cortado aos 15 min todo dia**: o limite de duração de um Cron Trigger é 15 min (docs da Cloudflare, Workers → Limits). O último registro sai sempre entre 04:13 e 04:17, hoje e de 05/10 a 09/10. Cada bloco de leitura leva ~2,5 min, então entram 4–6 por dia, nunca os 10 que o código pretende. Como a execução morre no meio, o `.then(...)` do `scheduled()` não roda: **não sai o log do resumo nem o ping do healthchecks** (o check fica "atrasado" todo dia). Isso é estrutural e existe desde o início do cron; não é regressão.
  - Confirmado nos Workers Logs de 14/11: a invocação `scheduled` terminou com `outcome = canceled` e `wallTime = 899.323 ms`, que dá 14 min 59 s. Houve 6 chamadas a `/generate-reading-item`: 5 ok (até 168 s cada) e 1 `canceled`. Nenhuma mensagem `daily batch …`.
- **Vídeo em 14/11: 0 itens, 10 de 10 erros.** As 10 chamadas a `/generate-video-item` voltaram com erro em ≤ 8,4 s cada (Workers Logs, `level = error`). O service responde `502 "falha ingerindo vídeo: <exceção>"` para qualquer exceção, mas o texto **não ficou em log**: `runDailyBatch` guarda o erro no array e só o logaria no resumo, que o corte impediu, e o stdout do Python não aparece nos Workers Logs. Em 09/10 ainda entravam ~56 exercícios de vídeo por dia.
  - **Erro real (chamada manual, 14/11 ~12:00 UTC):** `falha ingerindo vídeo: ERROR: Unable to download video subtitles for 'de': HTTP Error 429: Too Many Requests`. A listagem da playlist funciona; o YouTube devolve 429 no download da legenda para o IP do container (IP de datacenter; em 09/10, com a imagem antiga, ainda funcionava). O download da legenda acontece antes de qualquer escrita no D1 (`daily_batch.py`), então a falha não deixa nada parcial. A YouTube Data API está fora pelo `CLAUDE.md` (legenda de terceiros só via `yt-dlp`).
  - **Causa raiz:** o YouTube devolve 429 especificamente no download da legenda (endpoint `timedtext`), não na listagem da playlist, que continua funcionando. O motivo é a reputação do IP de datacenter do container.
  - **Fonte da causa: relatos de terceiros online (2026), não teste nosso.** Esses relatos descrevem o mesmo sintoma (a legenda falha, o resto funciona). Neles, espera entre tentativas, backoff exponencial, cookies e a versão de pré-lançamento do `yt-dlp` não resolveram, porque o problema é o IP e não o timing ou o token. Também não testamos proxy residencial nem PO token: a decisão foi não depender de contornos de reputação. A YouTube Data API está fora por dois motivos: o `CLAUDE.md` proíbe usá-la para legenda de terceiros, e, segundo os mesmos relatos, ela só libera legenda do canal do próprio usuário autenticado.
- **Decisões do usuário (14/11/2026), não reabrir sem achado novo:**
  1. **O batch diário sai do limite de 15 min do cron** (opção "c"). Fatia 1: `DailyBatchWorkflow` (Cloudflare Workflows com `schedules`), um step por item, erro logado na hora, heartbeat no último step. Mesma decisão de arquitetura da 4c.
  2. **O vídeo sai do batch automático na nuvem.** É remoção, não feature flag: não existe cenário em que o vídeo automático funcione do IP do container hoje. A leitura continua 100% automática.
  3. **A ingestão de vídeo vira um script local**, rodado à mão pelo usuário do IP residencial, em lote (vários candidatos por execução; semanal basta, já que existem ~1.000 clipes). O script reaproveita o pipeline existente sem duplicar lógica e grava no D1 de produção pelo `wrangler --remote`, com a sessão OAuth local, sem `D1_HTTP_API_TOKEN`.
  - O environment `production` foi criado com o usuário como revisor (14/11).

## Tabela de estado

| Fase | Item | Estado |
|---|---|---|
| 1 | Tirar a ressalva do `verify.sh` do known-issues | ✅ PR #5 |
| 2 | `ENGINE_SCHEMAS` + `schema_class` no `generation/service.py`; `schemas.py` no vendor | ✅ código em `main` · ⏳ deploy depende de Containers voltar |
| 2+ | Prevenção camada 1: manifesto de vendor + teste | ✅ PR #5 |
| 2+ | Cron falhando em silêncio: logs no `scheduled()` | ✅ PR #6 |
| 0 | **Bloqueador:** acesso a Cloudflare Containers voltar e um deploy de container passar | ✅ acesso ok · deploys de geração e fonética ok (14/11) · cron gravou 5 `reading_blocks` no D1 em 14/11 |
| 3 | Lacunas de documentação | ✅ PR #8 |
| 4a | Watchdog de jobs presos em `running` | ✅ PR #14 · timeout 90 s **depende da arquitetura**: revisar na 4c |
| 4b | Filtro editorial mínimo no RSS de notícias | ✅ decidido **sem filtro** (usuário, 14/11): todos os temas ficam; ver `docs/18` |
| 4c | Geração sob demanda ponta a ponta | ⬜ bloqueador resolvido · `start.ts` ainda em `waitUntil`; mesma decisão de arquitetura do `DailyBatchWorkflow`, mas outro código (Pages Function) |
| 4d | Templates que nunca escalaram além do piloto | 🟡 levantamento feito (branch `docs/fase-4d-templates`) · ⏳ decisão do usuário por grupo |
| 5a | Métricas no model card do corretor | ⬜ (só depois de 1–4) |
| 5b | Demo sem fricção do corretor | ⬜ |
| 5c | Corretor como feature do deutsch-app | ⬜ |
| 6.1 | Dead man's switch no cron | ✅ PR #9 · check e secret configurados (14/11) |
| 6.2 | `environment: production` nos deploys | ✅ PR #10 · environment `production` com o usuário como revisor (14/11) |
| 6.3 | Notificação de deploy no Slack | ✅ PR #11 · webhook funcionando (14/11) |
| 6.4 | `docs/observabilidade.md` | ✅ PR #12 · ⏳ Sentry (caminho novo em `docs/observabilidade.md`) |
| 6.5 | Subagentes no nível de projeto | ✅ PR #13 · commands/skills escolhidos e Cloudflare no escopo de usuário (`.claude/CLAUDE.md`) |
| 6.6 | Identidade por papel nas mensagens do Slack | ✅ só documentado em `docs/observabilidade.md` (sem caso concreto; ressalva: webhook de app pode ignorar `username`/`icon_emoji`) |
| 6.7 | Revisão semanal de commits por agente, no Slack | ✅ v1 rodando: run manual ok em 14/11 (run 43611649525), `schedule` ativo · ⏳ v1.1 e 6.8 anotadas |
| 6.7 v1.1 | Prompt via `comprehensive-review-code-reviewer`, com sonnet | ⬜ |
| 6.8 | Passada de segurança periódica | ⬜ fase futura |
| 429-a | Incidente do vídeo: batch diário vira `DailyBatchWorkflow` | 🟡 PR #17, deploy ok 14/11 · ⏳ conferir o 1º run agendado (15/11 04:00 UTC) |
| 429-b | Incidente do vídeo: ingestão de vídeo local | 🟡 PR #18 · ⏳ primeira execução real pelo usuário |
| Prev. 2 | Prevenção camada 2: `/health/container` checado no deploy | ⬜ |
| Aud. §3 | `ShadowingEngine` nasce fora das migrations (`docs/17` §3) | ⬜ conferido 14/11: nenhuma migration insere a linha |
| Aud. §8 | Backlog antigo da auditoria (`docs/17` §8) | ⬜ histórico, não em andamento |
| Rev. 14/11 | Achados da 1ª revisão semanal (Slack, run 43611649525) | ⬜ do agente, não verificados no código |

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
  - **Levantamento (14/11/2026):**
    - Tabela: `topic_regeneration_jobs` (migration 0013). Tem só `requested_at` e `completed_at`, sem `started_at`.
    - Fluxo: `POST /api/topic-regeneration/start` grava `pending`, responde e roda `runRegenerationJob` dentro de `waitUntil`. O job grava `running`, chama `/generate-topic` uma vez por engine (até 6, cada chamada sem timeout) e termina em `done`/`failed`.
    - Frontend: `pollRegenerationJob` (`app.js`) refaz o polling a cada 4 s **sem limite** enquanto o status for `pending` ou `running`.
    - D1 remoto: a tabela está **vazia**, nunca houve job em produção.
    - **Causa provável do job preso:** `waitUntil` só estende a execução por **30 s depois da resposta** e depois cancela as promises pendentes (docs da Cloudflare, Workers → Context). Um lote real leva minutos (R1 levou ~230 s para 4 itens). Então o job é cancelado no meio, o `catch` nunca roda e o status fica em `running`. Num job de tamanho real isso é o esperado, não um caso raro. O watchdog só trata o sintoma; a correção de fundo é tirar o trabalho do `waitUntil` (Queues, Workflows ou o próprio container gravando no D1) e pertence à 4c.
- **4b. Filtro editorial mínimo no RSS diário** (`generation/reading_sources.py`). Hoje não há curadoria e pode entrar tema pesado sem triagem. Coerente com a decisão fechada "geração diária sem curadoria por item": o filtro é automático (lista de exclusão ou classificação), não uma revisão humana por item. Testar contra dados reais antes de travar qualquer gate (regra do `pipeline/CLAUDE.md`).
  - **Levantamento (14/11/2026):**
    - `<category>` do RSS é a **seção** do site (Welt, Deutschland, Aktuelles, Sport, Kultur, Wirtschaft, Wissenschaft, Gesundheit, NRS-Import), não o tema. Tema pesado aparece espalhado por Aktuelles, Welt e Deutschland, então filtrar por categoria **não serve**.
    - Base real: 275 blocos da DW no D1 (12/08–09/10) e o feed de 14/11 (91 itens; o código só olha os 30 primeiros).
    - Lista de palavras-chave em 5 níveis: (A) morte/violência, (B) violência sexual, (C) desastre, (D) epidemia, (E) combate (ataque aéreo, drone, bombardeio), **sem** o `Krieg` genérico. Medida, ela exclui **8%** do D1 (23/275) e **7%** do feed (6/91). Com `Krieg`/`Angriff`/`Kampf` genéricos subia para 16%, com falsos positivos como "Cyber-Angriff", "Microsoft kämpft" e "Kampf für Freiheit".
    - **Decisão do usuário (14/11/2026): sem filtro.** Todos os temas são igualmente importantes do ponto de vista linguístico. Nada foi implementado; os números abaixo ficam só como registro.
    - Erros vistos: ~8 dos 23 excluídos são de fronteira (sabotagem do Nord Stream, crítica de série sobre o Breitscheidplatz, lembrança do Holocausto), ou seja, o filtro erra para o lado de excluir demais. Furos: `töten`, `Todesfälle`, `sterben`, `Gewalt gegen …`.
- **4c. Geração sob demanda ponta a ponta.** Nunca rodou em produção (`docs/17-auditoria-projeto.md`). Depende da Fase 0. Documentar o resultado real, inclusive se falhar.
  - Esperado pelo levantamento da 4a: na arquitetura atual (`waitUntil`) o job morre ~30 s depois da resposta e o watchdog o marca `failed` em 90 s. Escolher com o usuário para onde o job vai (Queues, Workflows ou o próprio container gravando no D1) e, **na mesma mudança**, subir `JOB_TIMEOUT_SECONDS` (`topicRegeneration.ts`) e `REGEN_POLL_MAX_MS` (`app.js`) para a duração real de um lote (ordem de 15 min).
- **4d. Templates/engines que nunca escalaram além do piloto.** Levantar e **propor** se escalam ou são descontinuados, sem decidir sozinho.
  - **Levantamento (14/11/2026, D1 remoto):** a foto da auditoria de 10/08 (`docs/17`, seção 4) mudou. O cron diário fez **escalar** tudo o que deriva de leitura e vídeo: `ParagraphOrderEngine` tem 273 itens servíveis, `PunctuationCapsEngine` 247, e `PredictThenVerify`, `VowelInsert`, `LetterAnagram`, `BinaryChoice`, `TrueFalse`, `ComprehensionQA`, `CompoundSegmentation` e `VideoTask` estão entre 790 e 1.636 cada.
    - **(a) Piloto que nunca escalou:** `ReadAloudEngine` e `SpokenGapFillEngine`, com 1 item cada, a mesma frase de teste ("Der Staat hat die Stadt finanziell unterstützt."). Já há matéria-prima e gerador: 26 `phonetic_points` e os scripts `phonetics/create_readaloud_exercise.py` e `create_spokengapfill_exercise.py`. Uso: 6 e 4 tentativas.
    - **(b) Grupo A por tópico parado no lote de 05/08:** FillBlank (277), WordBankGuess (123), Unscramble (105), StructuralTransform (101), GapFillGovernance (82), RegisterReformulation (10), Reaction e Transition (18 cada). Nenhum item novo desde 05/08, porque a geração sob demanda (4c) nunca rodou. O `RegisterReformulationEngine` teve **17 de 28 rejeitados na revisão humana** (61%; todos tinham passado no gate automático): problema de qualidade antes de volume.
    - **(c) Na spec (`docs/05`, Grupo B, "em escopo v1 = Sim") e nunca construídos, sem código e sem decisão registrada:** `GuidedImitationEngine` ("Make a similar"), `OpenPromptEngine` (4 exercícios: Completing, 5 opiniões, Consequências em cadeia…) e `PersonalReferenceEngine` (Notebook, How do you say it?, List). `TutorSessionEngine` ficou sem engine de propósito (correção humana, `types.ts`); `SpacedReviewEngine` é a própria sessão FSRS; `VideoStimulusEngine` é o estímulo, não uma tarefa.
    - **(d) Não é problema:** os 5 `exercises` em `pending` que a auditoria apontou são os de `OpinionEssay` (2), `QuickOpinionSpeech` (2) e `RecordedOpinion` (1). Essas linhas são criadas por plano do usuário e não passam por `servable_exercises` por design (`opinionEssay.ts`).
    - **Uso real:** ~100 tentativas no total, no máximo 20 por template; **última tentativa em 04/09/2026**. São ~14 mil itens servíveis para ~100 tentativas.
- **Prevenção camadas 2 e 3** (do incidente de 13/11):
  - Camada 2, checagem do `/health` depois do deploy: o `/health` atual não toca no container, então primeiro criar uma rota que exija o container de pé (por exemplo `/health/container`) e só então checá-la no workflow. Pode se juntar à 6.3.
  - Camada 3, aviso de conteúdo velho: **a 6.1 (healthchecks.io) cobre isso por fora**. Um indicador na home ("último item diário em DD/MM", em âmbar) fica opcional.

## Fase 5 — visibilidade do portfólio (só depois das Fases 1–4)

- **5a.** Calcular e publicar no model card de `jeorgesilva/llama3.1-german-corrector-q4` (Hugging Face) métricas de acurácia comparativas contra o LanguageTool e o GPT-4o-mini, num conjunto de teste pequeno mas real. Hoje o card só tem tags.
- **5b.** Demo sem fricção (um HF Space simples ou uma tela dedicada no deutsch-app) que alguém teste em segundos, sem configurar nada.
- **5c.** Integrar o corretor como feature real do deutsch-app (endpoint + UI). Respeitar os três mecanismos de correção separados e o feedback verde/âmbar, nunca vermelho.

## Fase 6 — observabilidade, processo e time de agentes

Definida numa sessão de planejamento externa. Implementar direto, em fatias. **Parar depois de cada sub-fase (6.1–6.7)** e mostrar o diff (na 6.5, a lista de agentes). Não commitar sem pedido.

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

### 6.7 — Revisão semanal de commits por agente, com aviso no Slack

Definida com o usuário em 14/11/2026, fatiada em v1 → v1.1 → 6.8.

**Regra fixa para qualquer job periódico de agente (vale além da 6.7):** só leitura. `permissions: contents: read`, sem Edit/Write, sem abrir PR nem comentar. O guardrail de `data/raw/` e dos prompts few-shot vale pela permissão do token, não pela instrução do prompt, que é mais fácil de furar por acidente.

**v1 (feita):** `.github/workflows/revisao-semanal.yml`.

- Prompt genérico ("revise os commits dos últimos 7 dias no `main`, aponte problemas de qualidade/padrão"), **sem** referenciar `.claude/agents/*.md`. É o teste de fumaça do token, do Slack e da permissão.
- Autenticação pela assinatura Pro: `claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}` (gerado com `claude setup-token`), não `ANTHROPIC_API_KEY`. `github_token` é o `GITHUB_TOKEN` padrão, então não precisa do GitHub App do Claude.
- `--model sonnet`, `--max-turns 30`, `timeout-minutes: 20`. Ferramentas: `Read`, `Grep`, `Glob` e só `git log`/`git show`/`git diff` no Bash.
- Semana sem commit não chama o Claude: só avisa no Slack.
- Slack: mesmo webhook e payload da 6.3, com identidade `🔍 Revisão semanal` / `:mag:`. Sai em sucesso, falha e semana vazia. O relatório é cortado em 3500 caracteres.
- `display_report: "false"`: o repo é **público**, então o relatório vai só para o Slack, não para o Step Summary do run.
- Frequência: semanal, segunda 07:00 UTC (`0 7 * * 1`). O `schedule` ficou comentado até um `workflow_dispatch` passar e foi ativado depois do run ok de 14/11.
- Primeiro teste (14/11/2026): os dois runs iniciais deram `401 OAuth access token is invalid` porque o secret tinha um valor errado, e não por bug do caminho OAuth. Com o token regenerado, o run 43611649525 passou: 28 s, 5 turnos, `total_cost_usd` 0,19 (equivalente de API; na assinatura sai do crédito), sem negação de permissão e com 10 achados no Slack. Desde o PR #19, a mensagem de falha no Slack traz o texto do erro, que o action esconde no log.
- Não verificado: o teto do crédito mensal de uso via `claude -p`/Agent SDK nos planos de assinatura. Acompanhar o consumo nas primeiras semanas.

**v1.1 (próximo passo, depois que a v1 rodar):** trocar o prompt genérico por uma referência explícita a `comprehensive-review-code-reviewer` (já no `main` desde a PR #13), **mantendo `--model sonnet`** em vez do `opus` do frontmatter do agente. O `opus` fica para o `/full-review` manual.

### 6.8 — Passada de segurança periódica (fase futura, não agora)

- Job separado, mensal ou quinzenal, com `comprehensive-review-security-auditor` + a skill `sast-configuration`.
- Identidade `🔒 Segurança` / `:lock:` da 6.6, agora com uso real e distinto da revisão semanal.
- Mesma regra fixa de só leitura da 6.7.
