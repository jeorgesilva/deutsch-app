# CLAUDE.md

App pessoal de alemão B2/C1+ construído sobre 3 planilhas curadas (`data/raw/`, não editar). O design comportamental é estrutural e deriva de necessidades específicas do usuário, documentadas em `docs/03-fundamentacao-comportamental.md` — não é UX opcional.

Contexto por diretório: `app/CLAUDE.md`, `pipeline/CLAUDE.md`, `services/CLAUDE.md`. Arquitetura e "onde mexer": `docs/architecture.md`. Bugs conhecidos: `docs/known-issues.md`. Problemas do wrangler local: `docs/local-dev-troubleshooting.md`. Histórico de decisões: `docs/18-historico-decisoes.md`. Spec das engines: `docs/05-engines-por-exercicio.xlsx`.

## Stack

- App: Cloudflare Pages + Pages Functions (TS), frontend vanilla JS sem bundler, D1, R2 (mídia TTS), FSRS via `ts-fsrs`.
- Pipeline: Python offline — geração em lote via LLM, validação (spaCy + LanguageTool), TTS Piper, yt-dlp, fonética (wav2vec2, faster-whisper).
- Dois Cloudflare Containers rodam código do pipeline: correção fonética; geração sob demanda + batch diário (cron).

## Layout

```
app/            Worker (functions/) + frontend (public/) + migrations D1
pipeline/       pacote Python deutsch_pipeline
services/       generation-container/, phonetic-container/
data/raw/       planilhas-fonte (não editar)
docs/           planejamento, decisões, mockups/
.github/workflows/  deploy dos containers + verify.yml
```

## Comandos

- `cd app && npx tsc --noEmit` — passa; é o único gate que bloqueia de fato.
- `cd app && npm test` (vitest) — falha hoje: não há arquivo de teste. Também não há testes Python.
- Não há Makefile.
- Pipeline (não instalado como pacote): `PYTHONPATH=pipeline/src .venv/bin/python -m deutsch_pipeline.<pkg>.<mod>`, a partir da raiz.
- `cd app && npm run dev` — exige `app/.dev.vars` (gitignored, não existe no checkout).
- Migrations: os scripts `db:*` do `package.json` cobrem só as três primeiras; as demais são aplicadas à mão (ver `app/CLAUDE.md`).
- CI (`verify.yml`): depcheck tem `|| true`; promptfoo só checa nome de campo; vulture não foi verificado localmente (não está na `.venv`).

## Convenções que divergem do padrão

- Código, comentários e docs em português.
- Fatias pequenas; **parar para o usuário aprovar** após cada fase/sub-tarefa. Commit só quando pedido.
- Geração sempre em lote/offline e presa à KB (regra + exemplo curados como few-shot); o LLM varia vocabulário/contexto, nunca inventa a regra.
- Três mecanismos de correção, nunca misturar: determinístico (`accepted_answers`), LLM com rubrica (erros **e** pontos fortes), LLM roleplay multi-turno.
- Feedback de exposição (`showed_up`) e de idioma (`correction_json`) sempre separados, também visualmente. Pronúncia e palavra certa nunca num score só.
- Sessão intercala template, nunca o mesmo formato duas vezes seguidas. Item fecha em < ~2 min.
- Feedback de linguagem em verde/âmbar, nunca vermelho.
- Chaves de objeto R2 sempre ASCII puro (NFKD sem diacríticos, nada de IPA).

## Armadilhas estruturais

- O frontend real é `app/public/` (`index.html`, `app.js`, `style.css`). `app/src/` não é usado.
- A fonética real é `pipeline/src/deutsch_pipeline/phonetics/service.py`. `services/phonetic-container/service.py` é um mock que nunca entra na imagem — e editá-lo **dispara um redeploy** do container (o workflow observa `services/phonetic-container/**`).
- O app lê exercícios só pela view `servable_exercises`, nunca pela tabela `exercises` direto.
- Migrations são aplicadas à mão com `wrangler d1 execute`; `0001_init.sql` não é idempotente.
- Código do pipeline chega aos containers por cópia (`vendor/`) via `prepare-vendor.sh`; arquivo novo no pipeline pode não chegar ao container.
- Três listas de dependências Python divergentes: `pipeline/pyproject.toml` (incompleta), `requirements.txt` da raiz, e uma por container.
- O token HF tem três nomes conforme o lugar — ver `.env.example`.
- D1/R2 locais podem divergir entre `wrangler pages dev` e a CLI — ler `docs/local-dev-troubleshooting.md` antes de confiar em query local.

## Decisões fechadas (não reabrir sem motivo forte)

- D1, não Postgres/Hyperdrive. TTS → R2; áudio **gravado pelo usuário** → Google Drive (não mudar sem perguntar).
- Grupo C fora de escopo sem itens nomeados pelo usuário.
- Grupo D: texto por padrão, voz opcional por sessão; hostilidade só profissional (escada de exposição).
- Home por categoria; "Revisão de hoje" (FSRS) é opção, não único fluxo.
- Tópicos de regência fixa de Dativo e `Funktionsverbgefüge` exigem revisão humana.
- Geração diária de vídeo/leitura sem curadoria por item.
- Léxico: semear das frases curadas, sem lista de frequência básica. Vetores só quando virar feature real.

## O que NÃO fazer

- Copiar texto literal de DW/ZDF/Nachrichtenleicht; mostrar transcrição antes da tentativa; baixar/re-hospedar vídeo; usar a YouTube Data API para legendas de terceiros (usar yt-dlp).
- Usar CrewAI/framework multiagente no roleplay.
- Remover a variante sem correção do `ShadowingEngine`.
