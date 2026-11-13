# pipeline/ — geração, validação e mídia (Python, offline)

## Rodar

- Não está instalado como pacote: `PYTHONPATH=pipeline/src .venv/bin/python -m deutsch_pipeline.<pkg>.<mod>` a partir da raiz do repo.
- `pyproject.toml` não declara várias dependências usadas (pydantic, google-genai, openai, anthropic, python-dotenv, piper, soundfile e outras). Não há testes.
- Saídas locais em `pipeline/output/` (gitignored); modelo de voz Piper em `pipeline/models/tts/` (gitignored).

## llm_client

- `.env` é carregado da **raiz do repo** (dotenv).
- `chat(model, system, user)` roteia por prefixo: `azure:` → Azure OpenAI, `hf:` → Hugging Face, `publicai:` → Public AI, `gemini*`/`gemma*` → Gemini, `claude*` → Anthropic, qualquer outro → Ollama local.
- `chat_structured(model, system, user, schema_class)` (Pydantic v2) aceita **só** `azure:`, `hf:`, `gemini*`/`gemma*`; os demais levantam `ValueError`. As duas listas de prefixo são diferentes — ao adicionar provedor, atualizar ambas.
- `pilot.generate_for_topic` escolhe `chat_structured` (temperatura 0.4) para os prefixos suportados e `chat` + `extract_json_array` (0.7) para o resto.
- Variáveis de ambiente (nomes e qual delas cada caminho lê): `.env.example` na raiz.

## Geração

- Engine novo do Grupo A: `generation/prompts_<engine>.py` (`SYSTEM_PROMPT`, `TEMPLATE_NAME`, `build_user_prompt`, opcionalmente um builder de campos) e registro em `generate_batch.py` (`ENGINE_PROMPTS`, `EXERCISE_FIELD_BUILDERS`, `ENGINE_SCHEMAS`) e, se o container precisar, em `services/generation-container/vendor-files.txt` (o `test_vendor_manifest.py` acusa se faltar).
- O LLM autora `sentence_full` + `gap_answer`; o programa recorta o prompt com lacuna (`build_prompt_gapped`). Nunca pedir ao LLM duas strings independentes que precisem bater.
- `model_routing.resolve_model` força o modelo mais forte em tópicos de Dativo fixo e `Funktionsverbgefüge` (aplicado pelo container; ver `docs/known-issues.md` para o CLI).
- Quando um gate mecânico novo for proposto, testar contra dados reais antes de travá-lo — gate mal calibrado já empurrou o modelo a inventar palavras.

## Validação (`validation/harness.py`)

- `validate_batch(exercises)` aplica, em ordem: estrutural, aderência de caso (spaCy `de_core_news_lg`, via `rule_adherence.infer_expected_case` pelo nome do tópico), LanguageTool de-DE sobre `sentence_full`, e respostas alternativas (`find_bad_alternates` reconstrói a frase com cada resposta aceita; se sobrar ao menos `gap_answer`, o item vira `repaired_alternate`). As docstrings internas ainda falam em "4 gates"/`check_alternate_answers` (nome antigo).
- `flag_reason` (fino) → `validation_status` (schema) via `DB_STATUS`: `auto_ok`/`repaired_alternate` → `auto_ok`; o resto → `flagged`. `human_reviewed` e `rejected` vêm da revisão humana.
- LanguageTool não pega bem seleção de auxiliar haben/sein, concordância com sujeito distante nem morfema citado solto — por isso as auditorias manuais.

## Revisão humana e NaN

- Ciclo: `validation/export_review_queue.py` (D1 → `.xlsx`) → revisão → `validation/import_review_decisions.py` (`.xlsx` → D1).
- Célula vazia do Excel vira `NaN` do pandas, e `NaN` é **truthy** em Python (`not float('nan')` é `False`; `str(nan)` vira `'nan'`). Já corrompeu `accepted_answers` para `["nan"]`. Toda leitura de célula passa por `_clean_cell` (trata `None`/`NaN` como vazio); nunca usar `if not raw` sozinho.

## Escrita no D1 e R2

- `ingest/write_exercises.py`: com `D1_HTTP_API_TOKEN` definido usa a D1 HTTP API (caminho do container); sem ele, `wrangler d1 execute` local, ou `--remote` com `D1_REMOTE`.
- `tts/upload_r2.py` sobe com `--remote`; isso não aparece no R2 local do `wrangler pages dev`.
- Chaves R2 sempre ASCII: geradores usam `unicodedata.normalize('NFKD', ...)` e descartam diacríticos. Manter isso em qualquer gerador novo.

Bugs conhecidos: `docs/known-issues.md`.
