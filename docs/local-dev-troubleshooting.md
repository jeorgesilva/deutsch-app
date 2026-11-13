# Ambiente local do wrangler — problemas e procedimentos

Observado com wrangler 4.119.0. Histórico completo: `docs/18-historico-decisoes.md` (Fases 9–10). Passos marcados **⚠️ DESTRUTIVO** apagam ou sobrescrevem dados locais.

## 1. D1 local: `pages dev` e CLI em arquivos SQLite diferentes

**Sintoma.** `wrangler pages dev` e `wrangler d1 execute --local` resolvem arquivos `.sqlite` diferentes em `app/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/`. Dados gravados pelo app não aparecem na CLI, ou o contrário.

**Gatilhos conhecidos.**
- Trocar o `database_id` no `wrangler.toml`: o nome do arquivo local deriva do `database_id`, não do nome do banco.
- Adicionar `[vars]` ao `wrangler.toml`. Remover depois **não** desfaz.
- Mudanças em `functions/`/`public/` entre sessões de `pages dev` (causa exata não isolada).

A CLI resolve sempre pelo `database_id`; quem muda é o `pages dev`. Trate como característica estável do ambiente, não como bug pontual.

**Prevenção.**
- Nunca criar `[vars]`; usar `app/.dev.vars`.
- Antes de trocar `database_id`, copiar o `.sqlite` atual para o arquivo correspondente ao novo ID (procedimento de reconciliação abaixo).

**Diagnóstico** (sempre antes de confiar numa query da CLI depois de usar o app local):
1. Listar os arquivos por data de modificação: `ls -lt app/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite`. O mais recente é, em geral, o do `pages dev`.
2. Contar linhas das tabelas relevantes em cada arquivo (`sqlite3 <arquivo> "SELECT COUNT(*) FROM attempts;"` etc.) e comparar com `npx wrangler d1 execute deutsch-db --local --command "SELECT COUNT(*) FROM attempts;"`. Assim se descobre qual arquivo é o da CLI.
3. **Comparar contagem de linhas, nunca bytes/checksum.** Arquivos com dados idênticos têm checksums diferentes (só ler já gera escrita interna do SQLite).
4. Contagens iguais → nada a fazer.

**Reconciliação** (contagens diferentes):
1. Parar o `wrangler pages dev`. *(Prudência; não registrado no incidente original.)*
2. Fazer backup dos dois arquivos para fora de `.wrangler/`. *(Prudência; não registrado no incidente original.)*
3. **⚠️ DESTRUTIVO** — `rm` do arquivo destino (o desatualizado).
4. `cp` do arquivo com os dados certos para o nome do destino.
   **Nunca `cp` por cima de um arquivo existente/em uso** — já corrompeu o banco ("database disk image is malformed").
5. `sqlite3 <destino> "PRAGMA integrity_check;"` → precisa responder `ok`.
6. Repetir o diagnóstico: contagens iguais nos dois.

## 2. R2 local

### 2a. Chave com caractere não-ASCII some

**Sintoma.** `wrangler r2 object put --local` com chave acentuada ou com IPA (ex. `não`, `ɛ`) responde "Upload complete", mas o objeto nunca é recuperável: nem pela CLI, nem por `/media/`.

**Regra permanente.** Chave R2 sempre ASCII: `unicodedata.normalize('NFKD', s)` e descartar diacríticos e não-ASCII. Todo gerador de chave novo segue esse padrão (`safe_slug` em `generate_dictation_batch.py`, `create_readaloud_exercise.py`, `create_spokengapfill_exercise.py`).

**Correção de dados já gravados.**
1. Gerar a chave ASCII nova.
2. Sintetizar o áudio de novo (Piper) se o original nunca subiu.
3. Subir com a chave nova (ver 2b se o destino for o binding local).
4. **⚠️ DESTRUTIVO (D1)** — atualizar `exercises.audio_ref` para a chave nova.
5. Verificar com GET real em `/media/<chave>` → 200.

### 2b. CLI e binding do Worker enxergam metadados diferentes

**Sintoma.** `wrangler r2 object get --local` encontra o objeto; `env.MEDIA.get()` no `pages dev` devolve 404/`null`. `list()` do binding pode vir vazio.

**Não funciona.** Copiar o arquivo SQLite de metadados como no D1: `list()`/`head()` passam a funcionar, mas `get()` continua devolvendo `null` sem erro.

**Procedimento que funcionou:** reescrever cada objeto pelo próprio binding.
1. Criar endpoint temporário (ex. `app/functions/api/migrate-r2.ts`) que recebe bytes brutos e faz `env.MEDIA.put(key, bytes)`.
2. Script baixa cada objeto com `npx wrangler r2 object get deutsch-media/<key> --local --file <tmp>` (a leitura pela CLI sempre funcionou) e faz POST para o endpoint.
3. Conferir cada chave com GET real em `/media/<key>` → 200.
4. **Apagar o endpoint temporário** — ele grava no R2 sem autenticação.

### 2c. Upload `--remote` não aparece local

`tts/upload_r2.py` sobe com `--remote`; isso não aparece no `/media/` do `pages dev`. Para testar local, subir pelo binding (2b).

## 3. Regra geral de teste de áudio

Só conta como testado com GET real em `/media/...`. A URL aparecer no JSON não prova nada.
