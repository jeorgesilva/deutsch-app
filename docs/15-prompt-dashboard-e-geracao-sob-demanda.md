# Prompt para o Claude Code — dashboard de progresso e geração sob demanda

Abra o repositório no Claude Code (`cd deutsch-app && claude`) e cole o texto abaixo. Ele implementa o que `docs/14-dashboard-progresso-e-geracao-sob-demanda.md` decidiu. Mesma regra do `docs/04`/`docs/13`: fatias pequenas, parar pra revisão a cada passo numerado, não pular pro próximo sem eu confirmar.

---

Vou implementar o dashboard de progresso e o mecanismo de geração sob demanda que `docs/14-dashboard-progresso-e-geracao-sob-demanda.md` já decidiu. Antes de escrever qualquer código, leia nesta ordem: `CLAUDE.md`, `docs/14` inteiro, `app/migrations/0001_init.sql` e `0011_users.sql` (schema real, incluindo o achado de que `attempts` não tem coluna de acerto/erro e não existe ligação entre `exercises` e `lexicon`), `app/functions/_lib/grading.ts` (as funções de correção por template — precisa reaproveitar exatamente essas, não reimplementar), e `pipeline/src/deutsch_pipeline/phonetics/service.py` (o precedente do serviço Python local que o passo 5 vai estender). Se `docs/12`/`docs/13` já tiverem sido implementados quando você começar, confira também onde os cards de categoria vivem hoje — é lá que o botão de regeneração do passo 5 entra.

## Passo 1 — migration

Três coisas novas: `attempts.correct` (`INTEGER`, nullable — NULL pra engines sem correção binária tipo Shadowing/RecordedOpinion/rubrica de LLM, não `false`), tabela `exercise_lexicon_refs` (`exercise_id`, `lexicon_id` — sem `user_id`, é conteúdo compartilhado, mesma régua de `topic_template_map`), tabela `topic_regeneration_jobs` (`id`, `user_id`, `content_topic_id`, `status`, `requested_at`, `completed_at`, `error`). Pare aqui, mostre a migration aplicada.

## Passo 2 — backfill e fluxo daqui pra frente

**`correct`**: escreva um script que reprocessa os attempts já existentes, reaplicando a MESMA lógica de correção por template que `grading.ts` já usa — não um string-match genérico. Várias engines têm comparação própria (pares do `MatchingEngine`, comparação case-sensitive do `PunctuationCapsEngine`, conjunto de chips do `UnscrambleEngine`/`ParagraphOrderEngine`) e um backfill ingênuo vai errar exatamente essas. Pra engines sem correção binária, deixe `correct` NULL. Depois do backfill, mude `POST /api/attempts` pra gravar essa coluna direto no momento em que já decide o rating do FSRS — daqui pra frente não precisa de backfill de novo.

**`exercise_lexicon_refs`**: escreva um script que lematiza o texto de cada exercício (spaCy, mesma dependência já usada no resto do pipeline) contra os lemmas de `lexicon`. Cuidado: `exercises.prompt` nem sempre é texto plano — `UnscrambleEngine`/`ParagraphOrderEngine` guardam array de tokens embaralhados, `WordBankGuessEngine` guarda JSON com `prompt_gapped`+`word_bank`. Reconstrua o texto certo por engine antes de lematizar (confira se já existe lógica de reconstrução reaproveitável nos módulos `generation/prompts_*.py` ou no harness antes de escrever uma nova). Rode retroativo nos exercícios existentes, e adicione esse passo no pipeline de geração (`generation/`) pra lotes novos já nascerem tageados.

Pare aqui e mostre: quantos attempts ficaram com `correct` preenchido (e quantos NULL, com a razão), quantos exercícios ganharam pelo menos 1 `exercise_lexicon_refs`.

## Passo 3 — backend do dashboard

Endpoints de agregação, todos escopados por `user_id` onde tocam `attempts`/`progress`:
- Acerto por tópico: fração do lote com pelo menos 1 `correct=1` por exercício, não percentual histórico bruto.
- Calendário de uso: `attempts.attempted_at` agrupado por dia.
- Vocabulário contatado: lemmas distintos de `lexicon` com pelo menos 1 attempt `correct=1` num exercício referenciado via `exercise_lexicon_refs`, com filtro opcional por `lexicon.pos`.
- Palavra do dia: mesma junção de cima, filtrando `correct=0` em exercício ligado por `reading_block_items`.

Pare aqui, teste cada endpoint via `curl`.

## Passo 4 — frontend do dashboard

Uma tela própria (é o "Perfil & Motivo"/`MasteryTrail` que `docs/09` já previa como pendência P1, nunca desenhado — não precisa reinventar onde isso mora na navegação, só implementar dentro da estrutura que `docs/12` já define). Os 4 elementos, seguindo as decisões de cor do `docs/14`: barra de acerto sem vermelho puro (`--caution` âmbar pro erro, ou só o track neutro sem cor nenhuma no "errado"); calendário na rampa do `--accent`, não verde (verde já significa resposta certa no resto do app); dias sem uso em branco/neutro, nunca uma cor de falha; banner de palavra do dia sem rótulo de erro — só palavra, definição, exemplo, do jeito mais neutro possível. Pare aqui, mostre via `wrangler pages dev`.

## Passo 5 — geração sob demanda

Endpoint novo no serviço Python local (estenda `phonetics/service.py` ou crie um irmão dele) que recebe um `content_topic_id`, roda a geração escopada a esse tópico (mesmo harness de validação de sempre, mesmos engines mapeados via `topic_template_map` — excluindo qualquer coisa ligada a `reading_blocks`/`video_clips`, que tem processo próprio), e grava direto no D1. O Worker dispara via `topic_regeneration_jobs` (`pending` → `running` → `done`/`failed`) e o frontend faz polling — nunca trava esperando resposta síncrona, geração real leva de dezenas de segundos a minutos. Mastery é sempre calculado por query (todo exercício do tópico com `correct=1` em pelo menos 1 attempt), nunca um flag armazenado. Quando detectado, mostre um botão explícito no card da categoria — nunca dispare sozinho. Antes de disparar, mostre uma confirmação com estimativa de quantas chamadas de LLM isso vai fazer (um por engine mapeado ao tópico). Trate erro de cota estourada (Gemini e Hugging Face já bateram nisso nesta sessão) como erro legível no job, nunca travamento silencioso.

Pare aqui e teste ponta a ponta com um tópico real — inclusive simulando falha de geração — antes de considerar pronto.

## Sobre o ritmo, como sempre

Depois de cada passo: rode algo que eu possa ver (curl, `wrangler pages dev`, ou os dois), descreva em poucas linhas o que decidiu, espere eu confirmar. Se aparecer uma decisão de design que não está no `docs/14` nem no `CLAUDE.md` — principalmente qualquer coisa que reintroduza vermelho puro em feedback, ou que torne a geração sob demanda automática em vez de opt-in — pare e pergunte em vez de assumir.
