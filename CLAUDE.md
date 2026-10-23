# CLAUDE.md

App pessoal de alemão B2/C1+ construído sobre 3 planilhas curadas (`data/raw/`, não editar). O usuário tem TDAH desatento e ansiedade social (LSAS=76); o design comportamental é estrutural, não UX opcional — ver `docs/03-fundamentacao-comportamental.md`.

Arquivos filhos carregam por diretório: `app/CLAUDE.md`, `pipeline/CLAUDE.md`, `services/CLAUDE.md`. Mapa de arquitetura e "onde mexer": `docs/architecture.md`. Histórico completo de decisões por fase (o porquê de tudo): `docs/18-historico-decisoes.md`. Especificação de cada engine: `docs/05-engines-por-exercicio.xlsx`.

## Stack

- **App**: Cloudflare Pages + Pages Functions (TypeScript), frontend vanilla JS sem bundler, D1 (SQLite), R2 (mídia TTS), FSRS via `ts-fsrs`.
- **Pipeline**: Python offline — geração em lote via LLM (Hugging Face/DeepSeek-V3 na prática), validação (spaCy + LanguageTool), TTS Piper, yt-dlp, reconhecimento fonético (wav2vec2, faster-whisper).
- **Containers**: dois Cloudflare Containers que rodam código do pipeline (correção fonética; geração sob demanda + batch diário via cron).

## Layout

```
app/        Worker + frontend + migrations D1
pipeline/   pacote Python deutsch_pipeline (geração, validação, TTS, vídeo, fonética)
services/   generation-container/, phonetic-container/ (cada um: Worker TS + imagem Python)
data/raw/   planilhas-fonte (não editar)
docs/       planejamento e decisões; mockups/ protótipos HTML
.github/workflows/  deploy dos containers + verify.yml
```

## Comandos (verificados em 23/10/2026)

- `cd app && npx tsc --noEmit` — passa. É o único gate real.
- `cd app && npm test` — falha: não existe nenhum teste no repo (nem TS nem Python).
- Pipeline: o pacote **não** está instalado na `.venv` da raiz. Rodar com `PYTHONPATH=pipeline/src .venv/bin/python -m deutsch_pipeline.<pkg>.<mod>`.
- `cd app && npm run dev` (`wrangler pages dev`) — não verificado nesta revisão; depende de `app/.dev.vars`, que não existe hoje.
- CI (`verify.yml`): vulture, promptfoo e depcheck não protegem de fato (depcheck tem `|| true`; promptfoo só checa nome de campo).

## Convenções que divergem do padrão

- Código, comentários e docs em português.
- Trabalhar em fatias pequenas e **parar para o usuário aprovar** depois de cada fase/sub-tarefa. Commit só quando pedido.
- Geração de exercício é sempre em lote/offline e constrained pela KB (regra + exemplo curados como few-shot); o LLM varia vocabulário/contexto, nunca inventa a regra.
- Três mecanismos de correção, nunca misturar: determinístico (`accepted_answers`), LLM com rubrica (erros **e** pontos fortes), LLM roleplay multi-turno.
- Feedback de exposição (`showed_up`) e de idioma (`correction_json`) sempre separados, também visualmente. Pronúncia e palavra certa também nunca num score só.
- O app lê exercícios só pela view `servable_exercises`, nunca `exercises` direto.
- Sessão intercala template; nunca o mesmo formato duas vezes seguidas. Item fecha em < ~2 min.
- Chaves de objeto R2 sempre ASCII puro (NFKD sem diacríticos, nada de IPA).
- Feedback de linguagem usa verde/âmbar, nunca vermelho.

## Decisões fechadas (não reabrir sem motivo forte)

- D1, não Postgres/Hyperdrive. TTS → R2; áudio **gravado pelo usuário** → Google Drive (não mudar sem perguntar).
- Grupo C fora de escopo sem itens nomeados pelo usuário.
- Grupo D: texto por padrão, voz opcional por sessão; hostilidade só profissional (escada de exposição).
- Home por categoria (decisão de 09/08, revê `docs/09`); "Revisão de hoje" (FSRS) é opção, não único fluxo.
- Tópicos de regência fixa de Dativo e `Funktionsverbgefüge` exigem revisão humana — fraqueza do padrão, reproduzida em vários modelos.
- Geração diária de vídeo/leitura sem curadoria por item (Fase 15, decisão do usuário).
- Léxico: não importar lista de frequência básica; semear das frases curadas. Vetores só quando virar feature real.

## O que NÃO fazer

- Copiar texto literal de DW/ZDF/Nachrichtenleicht; mostrar transcrição antes da tentativa; baixar/re-hospedar vídeo; usar a YouTube Data API para legendas de terceiros (usar yt-dlp).
- Usar CrewAI/framework multiagente no roleplay.
- Remover a variante sem correção do `ShadowingEngine`.

## Armadilhas estruturais

- `services/phonetic-container/service.py` é um mock que nunca entra na imagem. O serviço real é `pipeline/src/deutsch_pipeline/phonetics/service.py`.
- Código do pipeline chega aos containers por cópia (`vendor/`) via lista manual em `prepare-vendor.sh` — arquivo novo no pipeline pode não chegar ao container.
- Três listas de dependências Python divergentes: `pipeline/pyproject.toml` (incompleta), `requirements.txt` da raiz (gerada por pipreqs), e uma por container.
- `.env.example` foi apagado; não existe lista única de variáveis. O mesmo token HF aparece como `HF_TOKEN`, `hugging_face_api_key` e `HUGGINGFACE_API_KEY` conforme o lugar (ver os CLAUDE.md filhos).
- Ambiente local do wrangler: D1/R2 locais podem divergir entre `wrangler pages dev` e a CLI — ver `app/CLAUDE.md` antes de confiar em query local.
