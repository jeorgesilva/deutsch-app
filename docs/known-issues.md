# Bugs conhecidos

Verificados lendo o código em 23/10/2026. Nenhum tem teste automatizado. Remover a entrada quando corrigir.

> ⚠️ Reproduzir os itens 1–3 chama API de LLM (custo) e grava no D1 — local por padrão, **remoto se `D1_REMOTE` ou `D1_HTTP_API_TOKEN` estiverem definidos**. Conferir o ambiente antes.

## 1. `pilot.generate_for_topic` ignora `schema_class`

- **Arquivo:** `pipeline/src/deutsch_pipeline/generation/pilot.py`
- **Sintoma:** para modelos `hf:`, `gemini*`, `gemma*` ou `azure:`, a chamada a `chat_structured` usa sempre `FillBlankBatchResponse`, qualquer que seja o `schema_class` recebido. Os outros prefixos vão por `chat()` + `extract_json_array`, sem schema nenhum.
- **Afetados:** Unscramble, StructuralTransform, RegisterReformulation e WordBankGuess recebem campos de lacuna (`sentence_full`/`gap_answer`) no lugar dos seus. GapFillGovernance e FillBlank funcionam.
- **Agravante:** `generation/service.py` (container) nem passa `schema_class`, então corrigir só o pilot não basta.
- **Reproduzir:** `PYTHONPATH=pipeline/src .venv/bin/python -m deutsch_pipeline.generation.generate_batch --engine UnscrambleEngine --model hf:deepseek-ai/DeepSeek-V3 --n-per-topic 1 --items-per-call 1 --topic-ids <id>`. Esperado: itens sem os campos do Unscramble, pulados ou marcados no `write_to_d1`. (Não executado na verificação.)

## 2. CLI `generate_batch` não usa o modelo resolvido por `model_routing`

- **Arquivo:** `pipeline/src/deutsch_pipeline/generation/generate_batch.py`
- **Sintoma:** `resolve_model(topic, args.model)` é calculado e o log diz "forcando gemini-2.5-flash", mas `generate_for_topic_chunked` recebe `model=args.model`. Tópicos de Dativo fixo e `Funktionsverbgefüge` são gerados pelo modelo fraco, e o log mostra um modelo que não foi usado.
- **Não afeta:** o container — `generation/service.py` passa `model_used` adiante.
- **Reproduzir:** rodar com `--model hf:...` num tópico de Dativo fixo e conferir `exercises.generated_by` no D1: vem o modelo `hf:`, não o Gemini.

## 3. `generate_batch`: checkpoint `.lt.json` e resumo fora do loop

- **Arquivo:** `pipeline/src/deutsch_pipeline/generation/generate_batch.py`
- **Causa:** `all_exercises.extend(exercises)` e `lt_path.write_text(...)` estão depois do loop de tópicos, dentro do `if processed:` que segue `link_new_exercises()`.
- **Sintomas:**
  - Com `processed` verdadeiro: `.lt.json` e resumo final contêm só o último tópico.
  - Com `processed == 0` (nenhum exercício novo para lematizar): nenhum `.lt.json` é gravado e o resumo sai vazio, mas a mensagem "Checkpoint final salvo em …" aparece mesmo assim.
  - Com zero tópicos e `processed` verdadeiro: `NameError` em `exercises`.
- **Não afeta:** a gravação no D1, que é feita por tópico dentro do loop.
- **Reproduzir:** rodar com `--topic-ids a,b` e comparar o `.lt.json` com `SELECT ... WHERE generated_by = '<model>'` no D1.
- **Extra:** o arquivo tem um bloco de imports duplicado (inofensivo).

## 4. `getWordOfTheDay` lê `exercises` direto, ignorando `servable_exercises`

- **Arquivo:** `app/functions/_lib/dashboard.ts`
- **Sintoma:** a query da "Palavra do dia" faz `JOIN exercises` em vez de `JOIN servable_exercises`. A view só deixa passar `validation_status IN ('auto_ok', 'human_reviewed')`; sem ela, um exercício quarentenado (`flagged`/`rejected`) pode aparecer no dashboard, com `prompt` e `accepted_answers`.
- **Reproduzir:** pegar o `exercise_id` devolvido por `getWordOfTheDay` e rodar `SELECT id FROM servable_exercises WHERE id = <exercise_id>;` — se não voltar linha, o item exposto está em quarentena.

## Lacunas de verificação (não são bugs, mas mascaram bugs)

- `npm test` (vitest) sai com código 1: não há arquivo de teste.
- `verify.yml`: depcheck com `|| true`; promptfoo só testa VowelInsert e só checa se o texto contém nomes de campo.
- `llm_client.chat()` e `chat_structured()` têm listas de prefixo diferentes — risco de manutenção, não bug ativo hoje: `use_structured` em `pilot.py` já espelha a lista de `chat_structured`. Provedor novo precisa entrar nos três lugares.
