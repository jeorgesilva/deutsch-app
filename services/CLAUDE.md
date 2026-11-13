# services/ — Cloudflare Containers

Dois projetos independentes, cada um com Worker TS (`src/index.ts`, Durable Object que controla o container), `Dockerfile`, `run.py` (waitress na 8080) e `requirements.txt` próprio. A lógica Python vem do pipeline; não há rota duplicada aqui.

- `phonetic-container/`: serve `deutsch_pipeline.phonetics.service` (correção fonética, STT, TTS). `enableInternet = false`, modelos wav2vec2/faster-whisper embutidos na imagem.
- `generation-container/`: serve `deutsch_pipeline.generation.service` (geração sob demanda por tópico, item diário de vídeo/leitura). Cron diário dispara `/run-daily-batch` via `scheduled()`. `enableInternet = true`.

## vendor/ e prepare-vendor.sh

- Docker `COPY` não alcança fora do diretório do container, então `prepare-vendor.sh` copia código do pipeline para `vendor/` (gitignored) antes de buildar. `npm run deploy`/`npm run dev` rodam o vendor primeiro; o CI chama o script direto.
- **generation-container**: lista **explícita, arquivo por arquivo** (generation, validation, video, ingest). Módulo novo no pipeline que o serviço importe (direto ou transitivamente) precisa entrar nessa lista, senão o container quebra no boot com `ImportError` — e um import que falha no nível de módulo derruba o processo antes de abrir a porta ("Container crashed while checking for ports").
- **phonetic-container**: copia `phonetics/*.py` e `tts/*.py` inteiros, mais o modelo Piper (baixa do HF Hub se não existir localmente).
- O `Dockerfile` copia caminhos específicos de `vendor/`; pasta nova no vendor também precisa de `COPY`.
- Dependência Python nova usada pelo código vendorizado vai no `requirements.txt` **do container**, não só no `pyproject.toml`. Confirmar com um venv limpo contendo apenas esse arquivo.
- `phonetic-container/service.py` (na raiz do container) é um mock que não entra na imagem — editá-lo não muda produção, **mas dispara um redeploy** (o workflow observa `services/phonetic-container/**`).

## Durable Object / wrangler

- Generation usa id fixo `generation-v1-clean`. Nunca id aleatório por request (briga com `max_instances = 1`). Config de outbound gravada no storage de um DO sobrevive a redeploy — por isso o id antigo foi abandonado.
- Sem `allowedHosts`/`ContainerProxy` (outbound interception exige exportar `ContainerProxy`).
- `wrangler.toml`: chaves raiz (`main` etc.) antes de qualquer `[tabela]`; em TOML, chave escrita depois de um cabeçalho pertence àquela tabela.
- Secrets do Worker repassados ao container via `envVars`, com nomes traduzidos: `HUGGINGFACE_API_KEY` → `hugging_face_api_key`, `CLOUDFLARE_API_TOKEN` → `D1_HTTP_API_TOKEN`, mais `GEMINI_API_KEY`. Autenticação de entrada: `Bearer` com `GENERATION_SHARED_SECRET` / `PHONETIC_SHARED_SECRET` (só `/health` é aberto). Lista de nomes em `.env.example`.

## CI

- `deploy-generation-service.yml` / `deploy-phonetic-service.yml`: push em `main` com mudança em `services/<container>/**` **ou** `pipeline/src/deutsch_pipeline/**`, ou disparo manual. Build em `ubuntu-latest` (amd64; build local em Mac arm64 não é viável).
- Token de deploy: `CLOUDFLARE_DEPLOY_API_TOKEN` (com fallback para `CLOUDFLARE_API_TOKEN`) — o token antigo dava 403 na API de containers.
