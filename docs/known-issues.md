# Bugs conhecidos

Verificados lendo o código em 23/10/2026. Remover a entrada quando corrigir.

> ⚠️ Reproduzir os itens da seção "Lacunas de verificação" que chamam API de LLM tem custo e grava no D1 — local por padrão, **remoto se `D1_REMOTE` ou `D1_HTTP_API_TOKEN` estiverem definidos**. Conferir o ambiente antes.

## Resolvidos (02/11/2026)

Os 4 bugs abaixo foram corrigidos por edição direta de código (verificado por leitura + `tsc --noEmit` limpo; gate completo `scripts/verify.sh` — tsc, vitest, ruff, pytest — confirmado localmente em 13/11/2026).

1. **`pilot.generate_for_topic` ignorava `schema_class`** — a chamada a `chat_structured` usava sempre `FillBlankBatchResponse`, qualquer que fosse o `schema_class` recebido. Fix: `pilot.py` agora usa `schema_class or FillBlankBatchResponse`; `generate_batch.ENGINE_SCHEMAS` ganhou entradas reais pra `StructuralTransformEngine`/`RegisterReformulationEngine` (`StructuralTransformBatchResponse`, novo em `schemas.py`) e `WordBankGuessEngine` (`WordBankGuessBatchResponse`, novo em `schemas.py`). Em 13/11/2026 o mesmo mapa `ENGINE_SCHEMAS` entrou em `generation/service.py` (container), que agora passa `schema_class` a `generate_for_topic`.
2. **CLI `generate_batch` não usava o modelo resolvido por `model_routing`** — `generate_for_topic_chunked` recebia `model=args.model` em vez de `model=model_for_topic`. Fix: linha trocada.
3. **Checkpoint `.lt.json` fora do loop** — `all_exercises.extend(exercises)` e `lt_path.write_text(...)` estavam dentro do `if processed:` que segue o loop. Fix: `extend` movido pra dentro do loop (acumula por tópico); `write_text` movido pra fora do `if processed:` (grava sempre, mesmo com zero itens lematizados).
4. **`getWordOfTheDay` lia `exercises` direto, ignorando `servable_exercises`** — fix: `JOIN exercises e` → `JOIN servable_exercises e` em `app/functions/_lib/dashboard.ts`.

## Container de geração quebraria no boot (achado em 13/11/2026)

`pilot.py` importa `from .schemas import ...` no nível de módulo desde `4cc3cee` (18/10/2026), mas `schemas.py` não estava na lista explícita de `services/generation-container/prepare-vendor.sh` → `service.py` → `pilot.py` → `ModuleNotFoundError` antes de abrir a porta. Reproduzido offline simulando o vendor (com e sem `schemas.py`). Fix: `schemas.py` adicionado à lista (hoje em `vendor-files.txt`, coberto por `pipeline/tests/test_vendor_manifest.py`). **Nunca chegou a produção:** nenhum deploy de container passou desde 12/08 (envio da imagem recebe `Unauthorized`, ver a seção abaixo), então a imagem em produção é anterior ao import quebrado. O próximo deploy que passar já leva o fix (PR #5). **Pendente:** confirmar esse deploy.

## Cron diário parado desde 10/10/2026 — conta com pagamento em atraso

Consulta ao D1 remoto em 13/11/2026: o último `reading_blocks` é de 09/10 04:16 UTC e nenhuma linha de `exercises` foi gravada depois disso. Causa (informada pelo usuário em 14/11/2026): pagamento da conta Cloudflare em atraso, que bloqueou Cloudflare Containers — os deploys de container recebiam `Unauthorized` no envio da imagem desde 12/08, e `wrangler containers list` respondia `Account is not authorized`. A imagem já publicada continuou rodando até 09/10. O pagamento foi regularizado em 14/11; logo depois, `wrangler containers list` ainda respondia `Account is not authorized` (propagação?). A hipótese do `D1_HTTP_API_TOKEN` expirado não foi descartada por log (os logs de 10/10 já estavam fora da retenção de 7 dias), só ficou sem motivo.

Por que ficou um mês sem sinal: `scheduled()` descartava o resultado de `runDailyBatch` (erros por item ficavam no array, nunca no log) e o `/health` do Worker responde `ok` sem tocar no container. Fix: `scheduled()` agora loga o resumo do batch e a falha antes do loop, e o Worker loga quando `CLOUDFLARE_API_TOKEN` está ausente (o container receberia `D1_HTTP_API_TOKEN=""`, que `write_exercises.py` trata como "fora do container" e cai no `npx wrangler`, inexistente na imagem). **Pendente:** acesso a Containers voltar, deploy passar e o cron seguinte gravar no D1.

## Heartbeat do cron diário (14/11/2026)

Ping de heartbeat adicionado no `scheduled()`: GET em `HEALTHCHECKS_PING_URL` quando o batch dá certo, `HEALTHCHECKS_PING_URL/fail` quando o batch rejeita, quando algum item dá erro ou quando nada novo entra. Requer `HEALTHCHECKS_PING_URL` configurada como secret no Worker `deutsch-generation-service` (`wrangler secret put HEALTHCHECKS_PING_URL` em `services/generation-container/`), não no container. **Pendente:** o usuário criar a conta em healthchecks.io e colar a URL. Sem o secret, o Worker loga um aviso e o job segue normalmente.

## Lacunas de verificação (não são bugs, mas mascaram bugs)

- Não há teste TS: `npm test` (vitest `--passWithNoTests`) sai com 0 sem testar nada do Worker nem do frontend.
- `verify.yml`: depcheck com `|| true`; promptfoo só testa VowelInsert e só checa se o texto contém nomes de campo.
- `llm_client.chat()` e `chat_structured()` têm listas de prefixo diferentes — risco de manutenção, não bug ativo hoje: `use_structured` em `pilot.py` já espelha a lista de `chat_structured`. Provedor novo precisa entrar nos três lugares.
