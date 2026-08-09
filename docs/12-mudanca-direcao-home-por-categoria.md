# 12 — Mudança de direção: home por categoria substitui fila única

*Registro de decisão, não uma nova análise de evidência. `docs/09` e `docs/11` continuam sendo a fundamentação de UX/acessibilidade/design system do projeto — quase tudo neles continua valendo. Este documento existe só pra registrar onde e por que uma parte específica daqueles dois documentos foi revertida, a pedido direto do usuário, e qual estrutura substitui.*

## O que mudou

O usuário esclareceu que a visão original do app sempre foi uma **home com cards por tipo/categoria de exercício, onde o usuário escolhe o que praticar** — como Duolingo, Busuu e Babbel organizam a entrada por unidade/skill — e que os exercícios ligados a um mesmo texto de leitura devem abrir **dentro de um único card**, em sequência contida, nunca espalhados e intercalados às cegas com tópicos não relacionados. O modelo implementado (e recomendado por `docs/09`) é o oposto: um único "próximo item" decidido pelo sistema, fila de exercícios auto-composta pelo FSRS, sem tela de navegação/escolha.

Antes de desenhar qualquer coisa nova, os docs `01`–`04`, `06`, `09`, `10` e o `CLAUDE.md` foram revisados em busca dessa visão por escrito. **Não foi encontrada.** `docs/09` (Seção 3, Achado #12; mapa de telas, linha "Hoje (home)") recomenda explicitamente o modelo de "próxima ação única", citando a Lei de Hick (custo de decisão cresce com número de opções) como justificativa pra esconder navegação por tópico. Ou seja: isso não era uma divergência entre o código e um plano escrito — era uma divergência entre o código (e minha própria análise anterior) e uma intenção que só existia na cabeça do usuário / em conversa que não virou documento. Registrar isso aqui não é sobre "quem errou", é pra fechar o buraco: a partir de agora essa intenção está por escrito.

## A decisão

Estrutura completa, incluindo justificativa por peça, no protótipo clicável **`mockups/home-redesign-mockup.html`** (aprovado pelo usuário — abrir no navegador, tem toggle Desktop/Mobile no topo). Resumo:

**Home**: 6 cards de grupo — Gramática & Vocabulário, Fonética, Leitura, Vídeo, Prática semanal, Conversas. Mais um card opcional, "Revisão de hoje", que preserva o fluxo FSRS atual (o sistema escolhe) como uma OPÇÃO a mais, não o único ponto de entrada.

**Gramática & Vocabulário e Fonética**: cada card de grupo abre num grid de categorias — as 18 categorias reais de `Planilha_Gramatica_Alema_B2C1.xlsx` (Wortpositionen im Satz, Konjunktiv II, Passiv, Präpositionen, etc.) e as 8 de `Planilha_Fonetica_Pronuncia_Alema.xlsx` (Vokale, Konsonanten, Der Knacklaut, etc.) — não uma lista genérica, vieram direto da fonte curada. Cada categoria mostra um indicador de domínio (agregado de `progress.stability`/`difficulty` do FSRS por tópico — o mesmo dado que `docs/09` já queria expor como `MasteryTrail`, agora com um lugar certo pra morar). Dentro de uma categoria, os formatos de exercício (Lacuna, Reordenar, Transformação, Fala, etc.) se intercalam normalmente — a regra de nunca repetir o mesmo formato duas vezes seguidas continua valendo, só que agora *dentro do escopo escolhido*, não no pool inteiro. Um filtro opcional deixa restringir a um formato específico se o usuário quiser.

**Leitura e Vídeo**: cada card de grupo abre num hub — lista de blocos/clipes disponíveis, com status (novo / em andamento / concluído). Abrir um bloco mostra o texto (ou vídeo) e a sequência INTEIRA de exercícios ligados a ele, em ordem, sem nenhum outro tópico misturado no meio até o bloco terminar. Isso é a correção direta da queixa concreta do usuário: hoje um exercício de compreensão de um texto pode aparecer isolado na fila, cercado de exercícios de gramática sem nenhuma relação, sem o usuário nunca ver o texto inteiro de uma vez.

**Prática semanal e Conversas**: continuam abrindo as telas que já existem — o Planejador (8 cartões quando/onde/data) e a escada de exposição do Grupo D (Jornalista, Concorrente, Interrogador técnico, Tribunal, Posição atribuída) + Speech rápido. `docs/11` (auditoria ao vivo) já confirmou as duas bem executadas — não precisam de redesenho, só passam a ser alcançadas a partir da home em vez de um link solto no topo da tela.

## Por que reverter a recomendação de `docs/09` — e por que isso é razoável, não só "o cliente mandou"

A Lei de Hick não estava errada como princípio geral — o erro foi aplicá-la sem checar se o usuário realmente queria menos escolha aqui. Duolingo, Busuu e Babbel são produtos com ordens de magnitude mais dado de uso real testando exatamente esse trade-off (navegação por unidade vs. fila auto-composta), e os três convergiram pra navegação browsable por padrão — o que é evidência indireta de que esconder a escolha inteiramente é conservador demais pra esse tipo de produto, pelo menos pra um público dotado de motivação intrínseca real (que é exatamente o perfil deste usuário: adulto autodirigido, com meta C1 clara, que é também quem constrói o próprio app). A recomendação de `docs/09` fazia sentido pra reduzir sobrecarga de decisão num usuário passivo, mas presumiu passividade onde na verdade havia uma preferência explícita por agência e contexto — e essa preferência sempre vem antes de uma heurística geral quando as duas conflitam.

## O que fica superado em `docs/09`

| Local em `docs/09` | O que dizia | Status agora |
|---|---|---|
| Seção 3, Achado #12 | "Navegação por tópico é secundária/opt-in... entrada primária é sempre decidida pelo sistema (fila FSRS)" | Revertido — navegação por tópico é a entrada primária |
| Seção 4, mapa de telas, linha "Hoje (home)" | "Um cartão dominante (próxima ação), resto colapsado" | Revertido — home é um grid de cards, não um cartão único |
| Seção 7, hierarquia visual, "Hoje (home)" | "O que deve desaparecer: qualquer lista completa da fila FSRS" | Revertido — a lista/grid de categorias É a tela principal agora; a fila FSRS vira card opcional |
| Seção 6/10, `reading_blocks` | Bloco de leitura como sequência dentro do fluxo padrão de sessão intercalada | Confirma e reforça — só muda COMO se entra no bloco (card dedicado, não sorteio no meio da fila) |

## O que continua valendo, sem mudança

Todo o resto de `docs/09` e `docs/11`: design system (tokens de cor, tipografia, spacing — Seção 6), `ExerciseShell`/componentes por família de engine (Seção 5, 10), fundamentação de TDAH e ansiedade social (Seções 11, 12), auditoria de acessibilidade (Seção 13), avaliação de gamificação (Seção 9), e todos os achados de bug/inconsistência do `docs/11` (áudio quebrado do Ditado, feedback sem diff em respostas compostas, `lang` do documento, etc.) — nada disso depende de como o usuário chega até um exercício, só de como o exercício em si se comporta uma vez aberto. `ShowedUpBadge`, tokens tri-state âmbar/verde, `ExposureLadder`, replay ilimitado em fala — tudo isso continua sendo a base correta dentro de cada card, categoria ou bloco.

## Implicações técnicas, em alto nível

Sem entrar em código — a implementação real fica pro usuário planejar via Claude Code. Só pra orientar o escopo:

- `GET /api/session` hoje sempre compõe da fila FSRS inteira (`composeSession`, sem escopo). Precisa de um modo novo que aceite um escopo — categoria de conteúdo, bloco de leitura específico, ou clipe de vídeo específico — e componha só dentro dele.
- `reading_block_items` já modela a ligação bloco→exercícios em ordem; hoje esse dado não tem um endpoint de entrada próprio, os itens só aparecem quando sorteados dentro da fila geral. Precisa de uma rota que devolva o bloco inteiro (texto + itens em ordem) de uma vez.
- Um indicador de domínio por categoria (`MasteryTrail`, já recomendado em `docs/09`) precisa de uma agregação de `progress.stability`/`difficulty` por `content_topic_id` → categoria — dado já existe, falta a query de agregação e o endpoint.
- A fila FSRS "Revisão de hoje" não é descartada — continua sendo o `GET /api/session` de hoje, sem escopo, só deixa de ser chamada automaticamente ao abrir o app.

## Fontes

Esta decisão não se apoia em pesquisa nova — reaproveita as mesmas fontes de `docs/09` (Lei de Hick, e a comparação com Duolingo/Busuu/Babbel já documentada na Seção 8 daquele documento). A mudança é de julgamento sobre COMO aplicar essa evidência a este usuário específico, não uma revisão da evidência em si.
