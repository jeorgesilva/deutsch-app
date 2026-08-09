# 16 — Checklist de deploy: geração sob demanda (`services/generation-container/`)

Runbook operacional, não registro de decisão (isso já está no `docs/14`). Serve pra levar o container novo do estado "construído e testado localmente" (fim da sessão que implementou o docs/14) pro ar, sem repetir a descoberta de por que cada passo existe.

## Estado local atual

`app/.dev.vars` (gitignored, nunca commitado) já tem a chave nova:

```
GENERATION_SERVICE_URL=http://127.0.0.1:5006
```

Isso aponta pro serviço Python rodando direto na máquina (`python -m deutsch_pipeline.generation.service`), não pro container publicado — é assim que a Fase 5 (docs/14) foi testada ponta a ponta sem precisar built/deploy do Docker. **Depois do deploy real do container, trocar esse valor pela URL pública do Worker do container** (passo 4 abaixo) — senão `wrangler pages dev` local continua funcionando (bom pra debug), mas o app publicado (`wrangler pages deploy`) não tem `GENERATION_SERVICE_URL` nenhum configurado ainda (isso vive em secret do Pages, não em `.dev.vars`, que é só pro `pages dev` local — ver passo 5).

Não existe `[vars]` no `wrangler.toml` principal de propósito — adicionar uma seção lá já corrompeu o D1 local uma vez nesta sessão (hash do arquivo SQLite diverge entre `wrangler pages dev` e `wrangler d1 execute --local`, achado documentado no CLAUDE.md). Toda URL/segredo do app principal fica em `.dev.vars` (local) ou `wrangler pages secret put` (produção), nunca em `[vars]`.

## Pré-requisito não verificado nesta sessão

O `Dockerfile` de `services/generation-container/` segue exatamente o padrão já comprovado do `phonetic-container` (mesma base, mesmo jeito de vendorizar, mesmo pré-download em build-time), e cada peça nova dele (Java, spaCy, LanguageTool) foi testada rodando direto na máquina, fora de container. Mas o **build Docker em si nunca rodou** — não havia daemon Docker disponível na sessão. Antes do primeiro deploy:

```bash
cd services/generation-container
npm run vendor          # copia o subconjunto de pipeline/ pra vendor/
docker build -t deutsch-generation-service:test .
```

Se isso falhar, o ponto mais provável é o nome do pacote apt (`default-jre-headless`) ou algum passo de download em build-time (`spacy download`, `LanguageTool('de-DE')`) precisando de mais memória/tempo do que o ambiente de build permite — nenhum dos dois é esperado, mas nenhum foi confirmado de verdade.

## Passo 1 — segredos do container (`services/generation-container/`)

Três segredos, nenhum tem default nem fallback silencioso:

```bash
cd services/generation-container
npx wrangler secret put GENERATION_SHARED_SECRET
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put HUGGINGFACE_API_KEY
```

- `GENERATION_SHARED_SECRET`: qualquer string aleatória longa nova (ex. `openssl rand -hex 32`) — é o Bearer token que `src/index.ts` exige antes de repassar pro container. Guardar o mesmo valor pro passo 3.
- `GEMINI_API_KEY`: mesma chave já usada no pipeline (`app-root/.env`, `GEMINI_API_KEY`) — é a que `model_routing.resolve_model` força pros padrões fracos (Dativ, Funktionsverbgefüge).
- `HUGGINGFACE_API_KEY`: mesma chave já usada no pipeline (`app-root/.env`, `hugging_face_api_key`) — note que o nome da variável aqui (secret do Worker) é `HUGGINGFACE_API_KEY` maiúsculo; `src/index.ts` já traduz pro nome exato que `llm_client.py` espera (`hugging_face_api_key`, minúsculo) na hora de montar `envVars` do container. Não precisa (nem deve) duplicar essa tradução em nenhum outro lugar.

Nenhuma outra chave do `.env` do pipeline (Claude, Azure, Public AI, Ollama) é necessária — o container só chama Gemini/HF, mesmo escopo de `allowedHosts` em `src/index.ts`.

## Passo 2 — deploy do container

```bash
cd services/generation-container
npm run deploy    # roda `npm run vendor` primeiro, depois `wrangler deploy`
```

Isso é um `wrangler deploy` de verdade — sobe o Worker + a imagem Docker pra Cloudflare Containers, custo real (pequeno, mas real: build/armazenamento de imagem + tempo de execução do container quando ativo). Confirmar antes de rodar se ainda não tiver feito isso deliberadamente.

Anotar a URL pública que o deploy imprime (algo como `https://deutsch-generation-service.<subdomínio>.workers.dev`).

## Passo 3 — verificação direta do container

Antes de plugar no app principal, confirmar que o container responde sozinho:

```bash
curl https://<url-do-deploy>/health
# esperado: {"status":"ok"}

curl -X POST https://<url-do-deploy>/generate-topic \
  -H "Authorization: Bearer <GENERATION_SHARED_SECRET do passo 1>" \
  -H "Content-Type: application/json" \
  -d '{
    "engine": "GapFillGovernanceEngine",
    "model": "hf:deepseek-ai/DeepSeek-V3",
    "topic": {
      "id": 20, "categoria": "4. Präpositionen", "topico": "Wechselpräpositionen",
      "nivel": "B2", "regra": "Regem Akkusativ (movimento, pergunta wohin?) ou Dativ (posição, pergunta wo?) conforme o contexto.",
      "exemplo": "Er stellt das Buch in den Schrank. Das Buch steht im Schrank.", "fonte": "Grammatik aktiv B2-C1 (Cornelsen)"
    },
    "n_per_topic": 1, "items_per_call": 1
  }'
# esperado: JSON com "exercises": [...] e "model_used"
```

O primeiro request depois de um cold start demora mais (container "dorme" depois de 30min ocioso, `sleepAfter` em `src/index.ts`) — normal, não é falha.

Se o segundo comando voltar 401: segredo errado. Se voltar 520: `allowedHosts` bloqueou um host que não devia (não deveria acontecer, já que a única chamada saindo é pro provedor de LLM pedido) — checar `src/index.ts` contra o host real que `google-genai`/`openai` SDK usaram.

## Passo 4 — apontar o app principal pro container

Local (`app/.dev.vars`, já tem a linha, só trocar o valor):

```
GENERATION_SERVICE_URL=https://<url-do-deploy>
GENERATION_SHARED_SECRET=<mesmo valor do passo 1>
```

## Passo 5 — segredos do app principal em produção

```bash
cd app
npx wrangler pages secret put GENERATION_SERVICE_URL
npx wrangler pages secret put GENERATION_SHARED_SECRET
```

(Mesmo mecanismo que já deve ter sido usado pra `PHONETIC_SERVICE_URL`/`PHONETIC_SHARED_SECRET`/`HUGGINGFACE_API_KEY` quando o `phonetic-container` foi ao ar — `wrangler pages secret put`, nunca `[vars]` no `wrangler.toml`, pelo motivo já registrado acima.)

## Passo 6 — verificação ponta a ponta em produção

1. Login no app publicado, abrir Progresso → Domínio por tópico.
2. Achar (ou fabricar temporariamente, como nesta sessão) um tópico com `dominado` — 100% dos exercícios do lote já com pelo menos 1 acerto.
3. Clicar "Gerar mais exercícios" → confirmar que a estimativa aparece (não pode travar nem pular direto pra geração).
4. Confirmar → job deve ir pending → running → done em menos de ~1min pra 1-2 engines (mais se o tópico mapear vários engines, ou se cair no padrão que força Gemini).
5. Conferir no D1 (`wrangler d1 execute deutsch-db --remote --command=...`) que os exercícios novos entraram com `content_topic_id` certo e `generated_by` condizente com o modelo esperado.
6. Testar o caminho de erro: derrubar o segredo de propósito (valor errado num dos dois lados) e confirmar que o job vira `failed` com uma mensagem legível em `topic_regeneration_jobs.error`, nunca um travamento silencioso no frontend.

## Riscos conhecidos, não bloqueantes

- **Cota de provedor**: Gemini e Hugging Face já estouraram cota nesta sessão do projeto (histórico em `CLAUDE.md`) — um job pode falhar por isso, não por bug. O job fica `failed` com o erro do provedor anexado (`generation/service.py`, bloco `except Exception`), o usuário vê a mensagem real, não um genérico.
- **`waitUntil` e execução longa**: o job roda em background via `ctx.waitUntil` no Worker do Pages — se o processo/isolate for reciclado no meio de um job muito longo (múltiplos engines mapeados a um tópico, ou o padrão que força Gemini em todos), o job pode ficar preso em `running` pra sempre sem nunca virar `failed`. Não implementado: nenhum timeout/watchdog que force esse caso pra `failed` depois de N minutos — se isso acontecer na prática, é o próximo ajuste óbvio (ex. `status='running' AND requested_at < datetime('now','-10 minutes')` → tratar como falho na consulta do frontend).
- **Estimativa de itens**: "gera mais ~5 exercícios por formato" é aproximado de propósito (por isso o "~") — `generate_for_topic` não corta a resposta do LLM em exatamente N itens se o modelo devolver mais que o pedido (comportamento herdado do pipeline existente, não nasceu nesta fatia). Pode gerar 6-8 itens onde a estimativa disse 5. Não é bug, é a mesma tolerância que o resto do pipeline de geração em lote já tem.
