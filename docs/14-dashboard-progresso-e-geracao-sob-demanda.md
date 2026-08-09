# 14 — Dashboard de progresso e geração de exercícios sob demanda

*Registro de decisão. Diferente do `docs/12`, este não é só julgamento sobre conversa — as duas peças de schema que faltam abaixo vieram de inspecionar `app/migrations/0001_init.sql` e `0011_users.sql` de verdade, não de suposição.*

## O que foi pedido

Um dashboard de progresso com quatro elementos — barra de acerto/erro por card de tópico, calendário de uso estilo GitHub (heatmap por dia), contador de vocabulário com o qual o usuário teve contato (clicável, com detalhamento por classe gramatical), banner de "palavra do dia" tirado de erros dos exercícios de notícia — mais um mecanismo pra gerar um novo lote de exercícios de um tópico quando o usuário "domina" o lote atual (definição do usuário: todo item do lote já foi respondido corretamente pelo menos uma vez).

## Achado: faltam duas peças de schema, e as duas são usadas por mais de um item acima

`attempts` não tem coluna de acerto/erro — só `showed_up` (exposição) e `correction_json` (rubrica de LLM). O Worker já decide certo/errado toda vez que escolhe `Rating.Good` ou `Rating.Again` pro FSRS, só nunca persiste esse booleano. Sem ele, nem a barra de acerto, nem a definição de "dominado", nem "palavra errada" do banner são computáveis sem reprocessar a lógica de correção toda vez.

Também não existe nenhuma ligação entre `exercises` e `lexicon` — hoje são tabelas independentes. Sem essa ligação, "vocabulário com o qual o usuário teve contato" não tem como ser calculado.

Os dois achados acima sustentam quatro dos cinco itens pedidos — vale corrigir uma vez só, na raiz, em vez de gambiarra por feature.

## Decisões por elemento

**Barra de acerto/erro.** Não usar vermelho puro — mesmo raciocínio que já tirou vermelho do feedback de erro na Fase 12 (LSAS=76: cor de alarme fixa e sempre visível é pior que um flash de feedback que passa). Usar `--caution` âmbar pro segmento de erro, ou preferencialmente nem colorir o "errado" — só o verde cresce, o resto fica no track neutro. E a métrica não deveria ser "% de acerto histórico bruto" (crava erro do primeiro dia pra sempre, mesmo depois de dominado) — deveria ser fração do lote já dominada (quantos dos ~10 itens já têm pelo menos 1 acerto registrado), que é o mesmo `MasteryTrail` que o `docs/09` já queria e nunca desenhou.

**Calendário de uso.** Usar a rampa do `--accent` (azul), não verde — verde já significa "resposta certa" no resto do app; reusar pra "usei o app esse dia" mistura dois sinais diferentes. Dia sem uso fica neutro/em branco, nunca uma cor de falha — sem pressão de manter sequência, diferente do streak com chama que a gente já descartou na conversa sobre estilo visual. Isso não é widget solto: é a tela "Perfil & Motivo" que o `docs/09` listou como pendência P1 e nunca chegou a desenhar — faz sentido virar uma tela própria, alcançada a partir da home do `docs/12`, não algo injetado no meio do fluxo de exercício.

**Contador de vocabulário.** Precisa de uma tabela nova, `exercise_lexicon_refs` (exercise_id + lexicon_id) — de conteúdo, sem `user_id`, mesma régua já usada em `topic_template_map`. Povoada via spaCy lematizando o texto de cada exercício contra os lemmas já existentes em `lexicon` (mesma ferramenta que já semeia o léxico, sem infraestrutura nova) — precisa rodar uma vez retroativo nos exercícios já existentes e entrar como passo novo no pipeline de geração daqui pra frente. "Tipo de palavra" mapeia direto pra `lexicon.pos`, que já existe, sem precisar de categorização nova. "Contato" com a definição que o usuário deu (respondeu certo) é uma contagem de lemmas distintos, não de eventos — léxico onde existe pelo menos uma tentativa certa num exercício referenciando aquela palavra.

**Palavra do dia.** Mesma tabela nova de cima, filtrando por tentativa errada em exercício ligado a `reading_block_items` — é assim que "vem da sessão de notícias" fica preciso, sem coluna nova. Cuidado de apresentação: a origem (resposta errada) é lógica de seleção nos bastidores, não deve virar rótulo visível — o banner mostra palavra + definição + exemplo do mesmo jeito neutro que qualquer palavra do dia, nunca "você errou isso". Mesmo princípio que já rege o `DictationEngine`: fonte do dado não é a mesma coisa que exposição do erro.

**Geração sob demanda ao dominar um lote.** "Dominado" = todo exercício do tópico tem pelo menos 1 acerto registrado, não necessariamente de primeira — a leitura mais dura (acerto de primeira em todos) puniria aprendizado normal, mesma armadilha da barra de acerto. Geração continua sendo LLM + LanguageTool + spaCy em Python — a regra "nunca dentro do Worker" (`CLAUDE.md`, já testada e válida) não muda. O caminho é reaproveitar o padrão que o projeto já resolveu uma vez pro mesmo tipo de problema: o serviço Flask local que hoje atende `ReadAloudEngine`/roleplay de voz. Um endpoint novo nesse serviço (ou um irmão dele) recebe um `content_topic_id`, roda a geração escopada a esse tópico, grava direto no D1. Como isso não é instantâneo (dezenas de segundos a minutos, dependendo do modelo — R1 sozinho levou ~230s pra 4 itens numa sessão anterior), precisa de uma tabela de job (`topic_regeneration_jobs`) pro frontend mostrar "gerando..." e conferir depois, sem travar esperando síncrono. Disparo é sempre por ação explícita do usuário (nunca automático ao detectar domínio) — e como Gemini e Hugging Face já estouraram cota nesta sessão duas vezes cada, e um lote cobre todos os engines do tópico de uma vez (várias chamadas de LLM por disparo), vale uma confirmação mostrando a estimativa antes de disparar. Lote novo se soma ao antigo — nada é descartado, mesma regra de nunca apagar linha que já vale pro resto do projeto. A exclusão de notícias/vídeo sai de graça: esses exercícios são ligados por `reading_block_id`/`video_clip_id`, um eixo estruturalmente separado de `content_topic_id`, então mastery-por-tópico nunca os enxerga.

## Schema novo, resumido

- `attempts.correct` — coluna nova, `INTEGER` nullable (NULL pra engines sem correção binária: Shadowing, RecordedOpinion, rubrica de LLM). Gravada no mesmo ponto onde o Worker já decide o rating do FSRS.
- `exercise_lexicon_refs` — tabela nova, `exercise_id` + `lexicon_id`, sem `user_id` (conteúdo, não estado de usuário).
- `topic_regeneration_jobs` — tabela nova, `id`, `user_id`, `content_topic_id`, `status`, `requested_at`, `completed_at`, `error`.
- Endpoint novo no serviço Python local (mesmo processo da Fase 8/11, ou um irmão dele).

## O que não muda

O loop de revisão espaçada (FSRS) continua exatamente como está — geração sob demanda é aditiva, não substitui a reciclagem via `next_review_at`. O princípio "geração é sempre offline, nunca num Worker" continua intacto — o serviço local é uma exceção já aceita, não uma nova. O pipeline separado de notícia/vídeo (`docs/06`/`docs/07`) não é tocado por nenhum item aqui.

## Fontes

Internas, não pesquisa nova: `app/migrations/0001_init.sql` e `0011_users.sql` (schema real, lidos nesta sessão), `CLAUDE.md` (princípio de geração offline, incidentes de cota Gemini/HF já documentados, padrão do serviço Flask local da Fase 8/11), `docs/09` (pendência P1 "Perfil & Motivo"/`MasteryTrail`), `docs/12` (onde a tela de dashboard se encaixa na navegação por categoria).
