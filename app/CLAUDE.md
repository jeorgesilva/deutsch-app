# app/ — Worker (Pages Functions) + frontend + D1

## Functions

- Roteamento por arquivo em `functions/api/**` (sem framework). `functions/_lib/` (prefixo `_` fica fora do roteamento) concentra a lógica; os arquivos de rota são finos.
- Módulos centrais de `_lib`: `session.ts` (composição + `interleave`), `grading.ts` (correção por **formato de dado**, não por engine), `fsrs.ts`, `progress.ts` (`recordProgress`, upsert de `progress`), `types.ts` (`Env`, `SUPPORTED_TEMPLATES`, `AUDIO_FIRST_TEMPLATES`, `TARGET_AUDIO_HIDDEN_TEMPLATES`, `GRUPO_B_SCOPES`), `auth.ts` (PBKDF2 via Web Crypto, sessão em D1).
- LLM no Worker: `llmClient.ts` só implementa Hugging Face (`DEFAULT_CHAT_MODEL = hf:deepseek-ai/DeepSeek-V3`); Gemini/Claude são stubs. Usado por `llm.ts`/`opinionEssay.ts`/`quickOpinion.ts` (rubrica), `roleplay.ts` (personas Grupo B/D) e `explain.ts`.
- `explain.ts`: parágrafo de feedback por LLM após cada tentativa do Grupo A, roda em paralelo à correção em `api/attempts.ts`; devolve `null` se falhar (nunca bloqueia a tentativa).
- Serviços externos via HTTP com `Bearer`: `phonetics.ts` → phonetic-container, `generationContainer.ts` → generation-container. Sem o serviço no ar, a rota responde 502 legível.
- Ao adicionar template: `types.ts` (`SUPPORTED_TEMPLATES` e conjuntos de áudio), `grading.ts` (o `switch` não é exaustivo — esquecer um case só aparece como 500 em runtime), e o renderizador em `public/app.js`.
- `user_id` existe em `attempts`/`progress`/`session_plans`/`roleplay_sessions`/`video_mining_notes`. Tabelas de conteúdo não têm dono. `phoneme_scores` herda o dono via JOIN com `attempts`.
- `attempts.correct` é `NULL` (não `false`) para engines sem correção binária.
- `topic_regeneration_jobs`: o job roda em `waitUntil`, que a Cloudflare corta ~30 s depois da resposta, então lote real morre no meio. Watchdog preguiçoso (`expireStaleJobs`, chamado em `status.ts` e `start.ts`) marca `failed` o que passar de `JOB_TIMEOUT_SECONDS` (90 s). Esse número depende de onde o job roda: subir junto quando a Fase 4c tirar o job do `waitUntil`.

## Frontend (`public/`)

- `index.html` + `app.js` (monolítico, sem módulos) + `style.css`. Servido direto, sem build (`pages_build_output_dir = "public"`).
- Os conjuntos `TEXT_INPUT_TEMPLATES`, `CHIP_CHOICE_TEMPLATES`, `ASSEMBLY_TEMPLATES` ficam em `app.js`, não em `types.ts`.
- Avanço após feedback é sempre por clique ("Continuar →"), nunca timer.
- CSS: tokens em `:root`; regras `@media` precisam vir **depois** da regra base da mesma classe. Breakpoints de desktop em 48rem/64rem; `.card`/texto de leitura mantêm largura de leitura própria.
- Gabarito/transcrição só aparecem na resposta de `POST /api/attempts`, nunca no `GET /api/session`.

## Migrations

- Numeradas à mão (`00NN_*.sql`). O `package.json` só tem scripts para as três primeiras; as demais se aplicam manualmente com `npx wrangler d1 execute deutsch-db --local|--remote --file=migrations/00NN_x.sql`.
- `0001_init.sql` **não** é idempotente (sem `IF NOT EXISTS`): `npm run db:migrate:local` falha/conflita num banco existente.
- Linha de `exercise_templates` do `ShadowingEngine` nasceu fora de migration (criada por script do pipeline); reconstruir o D1 do zero pode mudar o id.

## Ambiente local — quirks

- Configuração local em `app/.dev.vars` (gitignored) — **o arquivo não existe hoje**. Variáveis lidas pelo Worker: `PHONETIC_SERVICE_URL`, `PHONETIC_SHARED_SECRET`, `HUGGINGFACE_API_KEY`, `GENERATION_SERVICE_URL`, `GENERATION_SHARED_SECRET`. Bindings: `DB` (D1), `MEDIA` (R2).

Quatro regras (procedimentos completos em `docs/local-dev-troubleshooting.md`):

1. Comparar D1 local entre `pages dev` e CLI por **contagem de linhas**, nunca por bytes/checksum.
2. Nunca copiar por cima de um `.sqlite` em uso: `rm` antes do `cp`, depois `PRAGMA integrity_check`.
3. Nunca criar `[vars]` em `wrangler.toml`; config local vai em `.dev.vars`.
4. Chave R2 sempre ASCII, sem diacríticos nem IPA.

- Teste de áudio só conta com GET real em `/media/...`, não com a URL aparecendo no JSON.
