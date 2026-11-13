# Bugs conhecidos

Verificados lendo o código em 23/10/2026. Remover a entrada quando corrigir.

> ⚠️ Reproduzir os itens da seção "Lacunas de verificação" que chamam API de LLM tem custo e grava no D1 — local por padrão, **remoto se `D1_REMOTE` ou `D1_HTTP_API_TOKEN` estiverem definidos**. Conferir o ambiente antes.

## Resolvidos (02/11/2026)

Os 4 bugs abaixo foram corrigidos por edição direta de código (verificado por leitura + `tsc --noEmit` limpo; gate completo `scripts/verify.sh` — tsc, vitest, ruff, pytest — confirmado localmente em 13/11/2026).

1. **`pilot.generate_for_topic` ignorava `schema_class`** — a chamada a `chat_structured` usava sempre `FillBlankBatchResponse`, qualquer que fosse o `schema_class` recebido. Fix: `pilot.py` agora usa `schema_class or FillBlankBatchResponse`; `generate_batch.ENGINE_SCHEMAS` ganhou entradas reais pra `StructuralTransformEngine`/`RegisterReformulationEngine` (`StructuralTransformBatchResponse`, novo em `schemas.py`) e `WordBankGuessEngine` (`WordBankGuessBatchResponse`, novo em `schemas.py`). Em 13/11/2026 o mesmo mapa `ENGINE_SCHEMAS` entrou em `generation/service.py` (container), que agora passa `schema_class` a `generate_for_topic`.

## Container de geração quebrava no boot (achado em 13/11/2026)

`pilot.py` importa `from .schemas import ...` no nível de módulo desde `4cc3cee` (18/10/2026), mas `schemas.py` não estava na lista explícita de `services/generation-container/prepare-vendor.sh` → `service.py` → `pilot.py` → `ModuleNotFoundError` antes de abrir a porta. Reproduzido offline simulando o vendor (com e sem `schemas.py`). Fix: `schemas.py` adicionado à lista. **Pendente:** confirmar o redeploy em produção (`/health`) e se o cron diário de vídeo/leitura ficou parado desde 18/10.
2. **CLI `generate_batch` não usava o modelo resolvido por `model_routing`** — `generate_for_topic_chunked` recebia `model=args.model` em vez de `model=model_for_topic`. Fix: linha trocada.
3. **Checkpoint `.lt.json` fora do loop** — `all_exercises.extend(exercises)` e `lt_path.write_text(...)` estavam dentro do `if processed:` que segue o loop. Fix: `extend` movido pra dentro do loop (acumula por tópico); `write_text` movido pra fora do `if processed:` (grava sempre, mesmo com zero itens lematizados).
4. **`getWordOfTheDay` lia `exercises` direto, ignorando `servable_exercises`** — fix: `JOIN exercises e` → `JOIN servable_exercises e` em `app/functions/_lib/dashboard.ts`.

## Lacunas de verificação (não são bugs, mas mascaram bugs)

- `npm test` (vitest) sai com código 1: não há arquivo de teste.
- `verify.yml`: depcheck com `|| true`; promptfoo só testa VowelInsert e só checa se o texto contém nomes de campo.
- `llm_client.chat()` e `chat_structured()` têm listas de prefixo diferentes — risco de manutenção, não bug ativo hoje: `use_structured` em `pilot.py` já espelha a lista de `chat_structured`. Provedor novo precisa entrar nos três lugares.
