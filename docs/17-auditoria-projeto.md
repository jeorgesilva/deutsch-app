# 17 — Auditoria do projeto (2026-08-10)

Auditoria pontual, não recorrente: conferi documentação contra código, código contra dado real no D1, e segurança de segredos. Metodologia — nada abaixo é opinião sobre o que "parece" certo; cada achado foi verificado via `git log`, leitura de arquivo, ou query direta no sqlite local (`app/.wrangler/state/v3/d1/...`, integridade confirmada via `PRAGMA integrity_check` antes de confiar nos números).

## 1. CRÍTICO — CLAUDE.md está 13 commits desatualizado

`git log -1 -- CLAUDE.md` aponta pro commit `dae155f` (09/08 19:14, "home por categoria substitui fila FSRS única"). HEAD atual é `83ddf92` (10/08 12:00). Entre os dois: **13 commits**, incluindo features inteiras que o arquivo nunca menciona (`grep -c "Fase 13\|Fase 14" CLAUDE.md` = 0, `grep -c "docs/1[3-6]" CLAUDE.md` = 0):

- Login/multi-usuário obrigatório (Fase 13 — tabela `users`, `POST /api/auth/*`, troca de senha).
- Dashboard de progresso + geração de exercícios sob demanda (Fase 14, `docs/14`/`docs/15`) — `attempts.correct`, `exercise_lexicon_refs`, `topic_regeneration_jobs`, 4 endpoints de agregação, tela de Progresso.
- Redesenho pedagógico inteiro da categoria Vídeo (`eae17c2`) — o dado real mostra 33 `video_clips` e 30 exercícios `VideoTaskEngine` no D1 hoje; o `CLAUDE.md` ainda descreve o estado da Fase 6 (1 vídeo, 7 exercícios).
- `services/generation-container/` inteiro — o container Cloudflare de geração sob demanda, incluindo toda a saga de debug desta sessão (storage de Durable Object poluído por config de outbound persistida, `ContainerProxy` exigido por engano, `max_instances=1` colidindo com ID randômico, crash-loop por falta de `[observability]`) — capturada em código e em `docs/16`, mas não dobrada de volta pro resumo executivo.

Isso é o oposto do que o próprio arquivo pede de si mesmo ("Leia isso inteiro antes de escrever qualquer código"): uma sessão nova lendo só o `CLAUDE.md` hoje não saberia que o app tem login, que existe um container de geração em produção (com lições caras já pagas sobre como configurá-lo), ou que a categoria Vídeo foi refeita. Risco concreto, não hipotético: é exatamente o tipo de lacuna que já causou retrabalho nesta sessão.

`docs/16` também está parcialmente desatualizado dentro do próprio propósito dele — foi escrito como checklist PRÉ-deploy ("Pré-requisito não verificado nesta sessão: o build Docker em si nunca rodou") e nunca ganhou o post-mortem do que de fato aconteceu quando rodou de verdade.

## 2. Segurança de segredos — auditado, limpo, mas com um ponto de atenção

`.gitignore` cobre `.env`, `.dev.vars`, `client_secret*.json`, `*credentials*.json`, `openai.json`. Os três arquivos sensíveis na raiz (`.env`, `client_secret_2_...json`, `openai.json`) aparecem como `!!` (ignorado) no `git status --porcelain --ignored` — nenhum está rastreado. `git log --all --full-history` pra esses padrões de nome (incluindo `.env`) retorna vazio: **nunca foram commitados, nem no passado** — o incidente que o `CLAUDE.md` registra foi pego antes de qualquer commit, não depois. Os dois workflows de CI (`.github/workflows/deploy-*.yml`) só injetam `CLOUDFLARE_API_TOKEN` via `secrets.*` do GitHub, nada hardcoded. `.env.example` não vaza valor real.

Ponto de atenção (não é uma exposição, é uma lacuna de documentação): `.env.example` nunca ganhou a linha `HUGGINGFACE_API_KEY`, apesar de Hugging Face ter virado o provedor primário/fallback mais usado do projeto a partir da Fase 3-4. Quem clonar o repo do zero seguindo só `.env.example` não sabe que precisa dessa chave.

## 3. Schema vs. migrations — uma linha de catálogo nasceu fora do sistema de migration

`exercise_templates` tem 26 linhas hoje, todas com pelo menos 1 exercício vinculado (nenhum template órfão, nenhum `exercise_template_id` órfão em `exercises` — conferido via `LEFT JOIN`). Mas a linha 23 (`ShadowingEngine`) não vem de nenhum `app/migrations/*.sql` — ela é criada em runtime por `pipeline/.../generation/generate_shadowing_batch.py` (`INSERT INTO exercise_templates (nome, grupo, mecanismo_correcao, requires_audio) VALUES ('ShadowingEngine', ...)`, sem `id` explícito, dependendo do autoincrement). Isso quebra a reprodutibilidade: rodar só `wrangler d1 migrations apply` num D1 novo não recria essa linha, e se `generate_shadowing_batch.py` rodar em ordem diferente numa reconstrução do zero, o id 23 pode sair diferente — qualquer lugar que hardcode esse id (se existir) quebraria silenciosamente. Todo o resto do catálogo (as outras 25 linhas) vem de migration versionada.

5 exercícios estão com `validation_status='pending'` (nunca terminaram de passar pelo harness) — não é erro do harness em si, mas vale achar de qual lote/tópico são e resolver (rodar o harness neles ou descartar), já que "pending" não deveria ser um estado de repouso permanente.

## 4. Conteúdo que nunca escalou além do piloto

Dado real do D1: `reading_blocks` = 1 (só o piloto Artemis da Fase 5), `video_clips` = 33 (esse sim escalou, via o redesenho não documentado do item 1), mas dentro de Grupo A vários templates ligados ao bloco de leitura único ainda têm exatamente 1 exercício cada (`ParagraphOrderEngine`, `PunctuationCapsEngine` — ambos derivados mecanicamente do mesmo texto único). `ReadAloudEngine`/`SpokenGapFillEngine` também têm exatamente 1 exercício cada — ainda a mesma frase de teste ("Der Staat hat...") usada pra validar o serviço fonético na Fase 8/Fase 9-fatia-fonética, nunca um lote real. Isso não é bug — é trabalho de "gerar mais um bloco de leitura"/"gerar mais frases de ditado fonético" que ficou pendente e não está registrado como pendência em lugar nenhum (nem `CLAUDE.md`, nem `docs/`).

## 5. Geração sob demanda: feature ainda não fechada ponta a ponta

`topic_regeneration_jobs` está vazio (0 linhas) — a feature nunca rodou pelo fluxo real (clicar no dashboard → job → polling), só via chamada direta ao container/serviço durante o debug desta sessão (`docs/16`, Passo 3). `app/.dev.vars` confirma: `GENERATION_SERVICE_URL=http://127.0.0.1:5006` — ainda aponta pro serviço Python local, não pra URL pública do container (`docs/16`, Passo 4/5, nunca executado). Isso é continuação direta do que fechamos nesta sessão: container sem crash-loop é pré-requisito, mas depois disso ainda faltam — trocar `GENERATION_SERVICE_URL`/`GENERATION_SHARED_SECRET` locais, rodar `wrangler pages secret put` dos dois em produção, e o checklist ponta a ponta do Passo 6 (login → Progresso → gerar → conferir D1 → testar caminho de erro).

Risco conhecido e já registrado em `docs/16`, mas sem fix: job que trava em `running` pra sempre se o isolate do Worker reciclar no meio de uma geração longa — sem timeout/watchdog. O próprio doc já propõe a query certa (`status='running' AND requested_at < now - 10min` → tratar como falha na leitura), só não foi implementado.

## 6. Duplicação de código — a única real é intencional, mas frágil por construção

`services/generation-container/vendor/` e `services/phonetic-container/vendor/` são cópias literais de partes de `pipeline/src/deutsch_pipeline/` (necessário — `docker build` não alcança fora do diretório de build). O mecanismo que mantém isso sincronizado (`prepare-vendor.sh`, chamado por `npm run deploy` e pelo passo de CI) está correto e é rodado automaticamente nos dois caminhos de deploy que encontrei. O risco que fica: qualquer `wrangler deploy` rodado à mão sem passar por `npm run deploy` primeiro (ex. copiando o comando de um checklist antigo) deploya código vendorizado desatualizado sem avisar — não aconteceu, mas é uma pistola carregada em cima da mesa. Não fiz uma varredura de duplicação de lógica fora desses diretórios vendor (ferramenta tipo `jscpd` não rodou) — o que segue abaixo é o que apareceu por inspeção, não uma garantia de cobertura total.

## 7. Erro real desta sessão, já corrigido — registrado por transparência

Meu primeiro fix em `services/generation-container/wrangler.toml` (adicionar `[observability]`) colocou o bloco ANTES de `main = "src/index.ts"` sem perceber que isso faz o TOML interpretar `main` como pertencente à tabela `[observability]` em vez de ficar no nível raiz. O commit seguinte (`99b3d59`, já aplicado) corrigiu a ordem. Fica registrado aqui só para reforçar a lição pro projeto: em `wrangler.toml`, qualquer `[tabela]` "engole" toda `chave = valor` solta que vier depois dela até a próxima `[tabela]` — vale conferir isso sempre que uma seção nova for adicionada a um TOML já existente.

## 8. Pendências já conhecidas pelo próprio projeto, nunca retomadas

- `docs/10-prompt-falko-merlin-mbart.md`: pacote de 4 tarefas (auditoria de calibração assistida por mBART, gate de GEC adicional no harness, distratores autênticos do Falko-MERLIN pro `TrueFalseEngine`/`BinaryChoiceEngine`, validação maior do `model_routing.py`) — escrito explicitamente como "rodar só depois de todas as fases 0-12 aprovadas". Fases 0-12 estão aprovadas há tempo; isso nunca foi retomado, e o próprio doc já avisa que pode estar desatualizado.
- `docs/09`/`docs/12`: itens P1 que o próprio `CLAUDE.md` já lista como "genuinamente ausentes" — toggle "modo com apoio"/"modo prova", tipografia dedicada pra IPA, `source_rule` sob demanda, `SkipButton`, linha de base de acessibilidade (contraste/foco/teclado). O dashboard (Fase 14) cobriu o `MasteryTrail` que era o maior item dessa lista, mas os outros continuam de fora.
- Tópico 19 (`Wann ist Passiv möglich, wann nicht?`) permanece mapeado a `StructuralTransformEngine` sem servir conteúdo (`structural_mismatch` correto, não bug) — já documentado como "marcado pra recuradoria futura", ainda sem essa recuradoria.

## O que está OK (conferido, não só assumido)

Integridade referencial do D1 limpa (nenhum `exercise_template_id` órfão, `servable_exercises` bate exatamente com `auto_ok + human_reviewed` = 974). Todos os 26 templates cadastrados têm conteúdo real — nenhum registro morto. Nenhum segredo nunca chegou a ser commitado, em nenhum momento da história do repo. `exercise_lexicon_refs` populado (5774 linhas) — o passo 2 do `docs/15` rodou de verdade. `.dev.vars`/`client_secret*`/`openai.json` seguem corretamente fora do controle de versão apesar de guardarem valor real.

## Números de referência (D1 local, 10/08)

1114 exercícios totais (919 `auto_ok`, 55 `human_reviewed`, 85 `flagged`, 50 `rejected`, 5 `pending`) — 974 servíveis. 136 `content_topics`, 133 com pelo menos 1 exercício servível. 203 linhas em `topic_template_map`. 26 `phonetic_points` cadastrados (CLAUDE.md registra 24 mapeados ao `DictationEngine` na Fase 7 — os outros 2 não confirmados nesta auditoria, não investigado a fundo). 1 usuário, 50 `attempts` (44 com `correct` preenchido), 8 sessões de roleplay, 1 bloco de leitura, 33 clipes de vídeo.
