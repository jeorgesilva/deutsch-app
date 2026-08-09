# 09 — Análise de UX/UI: o que a interface precisa ser

*Análise de UX Research, Product Design e HCI sobre o estado atual do projeto (CLAUDE.md, docs/01–08, schema `app/migrations/0001_init.sql`, catálogo de 118 engines em `docs/05`/`scripts/build_engine_spec.py`). Não cobre arquitetura técnica nem código — isso já está decidido e bem fundamentado em `docs/01`–`docs/03`. Cobre o que ainda não foi decidido: forma visual, hierarquia de informação, componentes e telas.*

## Nota metodológica

Duas coisas mudam a natureza desta análise em relação a um "UX audit" convencional, e valem registrar antes das 14 seções pedidas:

**Primeira: não existe UI construída para auditar.** `app/src/components`, `app/src/lib`, `app/src/routes` e `app/src/workers` estão vazios — o frontend é a Fase 9 de um plano de 12 fases, e o projeto ainda está nas fases de fundação (schema, KB, pipeline de geração). Isso significa que a "auditoria" na Etapa 3 não pode apontar para telas ruins, porque telas ainda não existem. O que existe — e é incomumente maduro para este estágio — é uma especificação: 100 regras gramaticais e 26 pontos fonéticos curados, um schema D1 completo, um catálogo de 118 unidades de exercício com mecanismo de correção e stack já definidos por item, e um documento de fundamentação comportamental (`docs/03`) que já aplica literatura real (SDT, temptation bundling, delay aversion, ADAPT) a decisões de design. A auditoria desta análise, portanto, mira a especificação: se cada uma dessas 118 linhas fosse implementada exatamente como descrita, onde a experiência sofreria? Essa é uma pergunta respondível hoje, antes de escrever uma linha de frontend — e responder agora é mais barato do que descobrir depois de construir 56 telas.

**Segunda: o roadmap desta análise não reordena as fases do `CLAUDE.md`.** O workflow do projeto já tem um princípio explícito — não avançar de fase sem revisão — e esta análise não propõe furá-lo. As prioridades P0–P3 da Etapa 14 são sobre o que fazer primeiro *dentro* da Fase 9 (e o que preparar nas fases anteriores para que a Fase 9 comece bem), não sobre pular etapas.

**Sobre fundamentação**: teoria estrutural de HCI/cognição (heurísticas de Nielsen, Lei de Fitts, Lei de Hick, princípios de Gestalt, Cognitive Load Theory de Sweller, Self-Determination Theory de Deci & Ryan, o modelo cognitivo de fobia social de Clark & Wells) vem de literatura estável, citada por nome no corpo do texto. Para reivindicações mais específicas ou atuais — pesquisa de UI para TDAH, WCAG 2.2, evidência de gamificação/streaks, eficácia do FSRS, padrões de concorrentes — foi feita pesquisa web dedicada; essas fontes estão listadas em "Fontes" ao final, seguindo a mesma convenção dos demais documentos em `docs/`. Onde a evidência é mista ou o corte exato varia entre fontes (ex. faixas de severidade da LSAS), isso é sinalizado explicitamente em vez de apresentado como número único.

---

## 1. Resumo executivo

O projeto tem uma fundamentação comportamental melhor do que a maioria dos produtos de aprendizado financiados por venture capital — `docs/03` já conecta TDAH desatento e ansiedade social (LSAS=76) a decisões concretas de dado e fluxo (campo `showed_up` separado de `correction_json`, `session_plans` como implementation intention, streak com "perdão" em vez de reset binário, celebração desligada por padrão). Isso não é comum: a maioria dos apps de idioma trata "acessibilidade cognitiva" como um adendo de marketing, não como uma tabela no schema. O risco real deste projeto não é "teoria errada" — é o intervalo entre uma fundamentação comportamental sólida e uma camada visual ainda inteiramente não especificada, atravessada por 56 unidades de exercício em escopo (Grupos A/B/D/E, depois de excluir os 61 itens do Grupo C) que, se cada uma virar uma tela desenhada isoladamente — como as descrições de "apresentação visual" linha a linha de `docs/05` sugerem —, recriam exatamente o problema que a consistência visual deveria evitar.

A boa notícia é que o próprio catálogo já mostra o caminho: `VideoTaskEngine` cobre 8 linhas diferentes (legendar, lixicon, interpretar, dublar, citar) com um único parâmetro de subtipo, em vez de 8 classes. O mesmo raciocínio de parametrização, hoje aplicado só no mecanismo de correção e no backend, precisa subir uma camada — para o componente visual. Esta análise recomenda, como movimento estrutural único de maior alavancagem: construir uma "casca de exercício" (`ExerciseShell`) compartilhada e um design system com tokens antes de desenhar qualquer engine individualmente, porque as ~56 unidades em escopo colapsam para algo entre 10 e 12 *formas de interação* reutilizáveis (ver Seção 10) — não 56 telas.

Dois pontos de risco concentram a maior parte do valor esperado desta análise. O primeiro é a fila de revisão do FSRS: se o número bruto de itens pendentes ("42 itens para revisar hoje" depois de uma semana sem abrir o app) for exibido sem tratamento, ele recria a mesma armadilha de sobrecarga tudo-ou-nada que `docs/03` já resolveu com cuidado para o bloco de leitura — só que numa superfície nova, sem a mesma mitigação. O segundo é a dupla ansiedade social + voz: os componentes de fala (Grupo D, `ReadAloudEngine`, `ShadowingEngine`) são a superfície de maior risco emocional do produto inteiro e precisam do tratamento visual mais deliberado — não o oposto, que é o padrão comum de "isso é só um botão de gravar, cuidamos disso depois".

O restante deste documento detalha isso em 14 seções: modelo do usuário, auditoria da especificação atual, mapa de telas, inventário de componentes, design system, hierarquia visual, comparação com produtos consolidados, avaliação crítica de gamificação, recomendação por família de engine, uma seção dedicada a TDAH, uma a ansiedade social, uma auditoria de acessibilidade, e um roadmap priorizado.

---

## 2. Modelo mental do produto e do usuário

### O que o produto é

Um app pessoal (uso solo, sem contas múltiplas, sem features sociais) de alemão B2/C1+, construído sobre três planilhas curadas manualmente — 100 regras gramaticais (`Grammatik aktiv B2-C1`, Cornelsen), 26 pontos fonéticos priorizados especificamente para os erros típicos de falante de português (PONS), e um catálogo de 118 unidades de exercício herdadas de uma metodologia própria ("My Way") mais um motor semanal autoral. A infraestrutura é Cloudflare Pages + Workers + D1, geração de conteúdo 100% offline via LLM local (Ollama) restringido pela KB curada — o modelo nunca "inventa" gramática, só varia vocabulário e contexto em cima de uma regra e um exemplo já corretos. Progresso usa FSRS (o mesmo algoritmo do Anki desde 2023). Três mecanismos de correção nunca se misturam: determinística (JSON de respostas aceitas), LLM com rubrica estruturada (erros **e** pontos fortes, sempre os dois), e LLM em roleplay multi-turno (Grupo D).

### Quem é o usuário

Um único usuário — falante de português, TDAH desatento diagnosticado, ansiedade social diagnosticada (LSAS=76, faixa que a maioria dos sistemas de corte da literatura classifica como "marcada" — a banda mais citada situa 65–79 nessa categoria, com sistemas alternativos posicionando o mesmo valor entre "moderada" e "severa"; o que muda pouco entre os cortes é a conclusão prática: não é ansiedade social leve, é clinicamente significativa e o design de exposição precisa ser levado a sério, não tratado como escolha estética). Aprendiz avançado (B2/C1+) com horizonte de uso longo (não é um app para 3 meses, é infraestrutura de estudo recorrente).

### Objetivos do usuário

Atingir fluência C1+ com precisão gramatical real (não fluência "boa o suficiente" — a ênfase do projeto inteiro em regência de caso, Konjunktiv II, Nominalstil sinaliza um padrão alto), presumivelmente com uma prova C1 no horizonte (`docs/03` já prevê um "modo prova" cronometrado sem apoio, o que só faz sentido se há uma data-alvo real), e — o objetivo menos óbvio mas mais estrutural — build de confiança de fala apesar da ansiedade social, o que faz do produto não só uma ferramenta de idioma mas, para os módulos orais, um instrumento de exposição gradual disfarçado de exercício de idioma.

### Objetivos do sistema

Maximizar retenção via repetição espaçada real (não decorativa); minimizar abandono via fricção mínima por unidade de prática; gerar conteúdo correto-por-construção quase ilimitado a custo zero recorrente; proteger o usuário do próprio padrão de evitação (delay aversion) sem ser paternalista ou irritante — a diferença entre "o app me lembra gentilmente" e "o app me pressiona" é exatamente a linha que separa adesão de abandono neste perfil específico.

### Principais restrições

Uso solo — isso descarta legitimamente qualquer feature de comparação social (líder de ranking, feed de atividade de outros usuários) não por preguiça de implementação, é que literalmente não há "outros" para comparar. Geração é sempre em lote/offline, nunca em tempo real num Worker — o que tem uma implicação de UX ainda não endereçada em nenhum documento: os mecanismos de correção 2 e 3 (LLM com rubrica, LLM roleplay) não são pré-gerados, são reativos ao que o usuário escreve/fala na hora, então *alguma* chamada de LLM acontece em tempo de uso, e o texto de `docs/01` diz "Worker chamando o motor de geração/correção (Ollama local)" sem detalhar disponibilidade/latência — isso é uma dependência de UX real (ver Seção 3, item de auditoria sobre estados de carregamento) que a análise sinaliza, sem tentar resolver a arquitetura, que não é o escopo desta análise.

### Barreiras cognitivas, emocionais e comportamentais

TDAH desatento entrega três barreiras concretas já nomeadas em `docs/03`, e vale reafirmar por que elas são as que mais restringem design: **delay aversion** (Sonuga-Barke, modelo de via dupla, 2002) é tédio funcional — a mesma via neural que faz uma tarefa repetitiva parecer insuportável é a que também torna "esperar recompensa" aversivo, então sessões longas e monótonas de um único formato não são só "chatas", são estruturalmente mais propensas a abandono para este usuário do que para a média. **Função executiva** reduz a capacidade de auto-iniciar e sustentar tarefas sem estrutura externa — daí a importância central de session_plans/implementation intentions. **Memória prospectiva** fraca é por que "lembrar de praticar" falha sem um gatilho quando/onde específico — um lembrete genérico ("hora de estudar alemão") tem taxa de adesão muito pior do que um gatilho implementation-intention concreto ("depois do jantar, na mesa da cozinha").

Ansiedade social (LSAS=76) entrega uma barreira que é fácil de subestimar num app de idioma: qualquer exercício que exija produção oral ou escrita avaliada é, estruturalmente, uma situação de desempenho sob observação — mesmo que o "observador" seja um LLM. O modelo cognitivo de fobia social de Clark & Wells (1995) é útil aqui: atenção autofocada e auto-avaliação durante a tarefa social são o próprio mecanismo mantenedor da ansiedade, não um efeito colateral dela. Isso significa que *quando* e *como* a correção aparece (durante vs. depois da tentativa) não é um detalhe de UX — é a diferença entre um exercício terapêutico e um que reforça o problema que deveria tratar.

### Gatilhos de desistência e momentos de maior fricção

Os mais prováveis, na ordem de risco: (1) abrir o app depois de alguns dias fora e ver uma fila de revisão grande — gatilho clássico de "inbox zero" invertido, delay aversion ativada antes mesmo de começar; (2) um exercício de fala/roleplay sem saída fácil no meio, especialmente se a intensidade da persona (Grupo D) for maior do que o esperado; (3) um bloco de leitura de 9-10 itens que *parece* exigir conclusão total para valer a pena, mesmo que o schema já garanta crédito atômico — o risco aqui é puramente de apresentação, não de dado; (4) qualquer momento de espera sem feedback visual claro (chamada de LLM local que demora), que para um usuário com intolerância à incerteza já documentada em `docs/03` é ambíguo o bastante para gerar ansiedade("travou? Erro meu? Vale a pena esperar?").

---

## 3. Auditoria UX

Auditoria da especificação atual (schema + `docs/01`–`08` + catálogo de 118 engines), não de uma UI que ainda não existe — ver nota metodológica. Cada achado segue: localização, impacto, severidade, evidência, recomendação.

### O que está faltando

| # | Achado | Localização | Impacto | Severidade | Evidência | Recomendação |
|---|---|---|---|---|---|---|
| 1 | Nenhum componente visual definido para o "sinal de conclusão visível imediato" que `docs/03` torna regra obrigatória para toda unidade | `docs/03`, regra de composição de sessão | Alto — é a regra de design mais repetida no documento comportamental, mas não tem forma | Alta | "cada unidade precisa fechar em menos de ~2 minutos com um sinal de conclusão visível imediato" (`docs/03`) | Definir `CompletionSignal` como componente único, usado identicamente nas 56 unidades em escopo (Seção 5) |
| 2 | A captura do "motivo de verdade" (frase pessoal que reaparece antes de blocos chatos, inspirada na "bússola interna" do ADAPT) é proposta em `docs/03` mas não tem tela nem gatilho de exibição definidos | `docs/03`, seção "As 7 técnicas" | Médio — é uma técnica de SDT barata, perde valor se não tiver onde morar | Média | ADAPT (JMIR Formative Research 2025) citado no próprio `docs/03` | Adicionar tela "Perfil & Motivo" (Seção 4) + regra de exibição (antes de `OpinionEssayEngine`, `HostileRoleplayEngine`, blocos de leitura) |
| 3 | O canal de entrega do lembrete de implementation intention (push? banner in-app? e-mail?) não está definido — `docs/03` especifica o *conteúdo* ("depois do jantar, na mesa da cozinha") mas não o *canal*, e os dois têm implicações de UX e técnicas muito diferentes | `docs/03`, `session_plans` no schema | Alto — é a intervenção que o próprio `docs/03` classifica como a de maior retorno imediato | Alta | "a intervenção que eu implementaria primeiro tecnicamente, porque é barata" (`docs/03`) | Especificar canal explicitamente antes da Fase 9/10 — recomendação: notificação push via Web Push API (PWA), com fallback de banner in-app na próxima abertura se a permissão de push não foi concedida |
| 4 | Nenhuma tela reconhece a curadoria assistida de `topic_template_map` (Fase 2) ou de vídeo (Fase 6) como trabalho humano recorrente — hoje presumivelmente feito via SQL/planilha direto | `CLAUDE.md`, Fases 2 e 6 | Baixo (é uso do próprio desenvolvedor, não do "aprendiz") mas cresce com o tempo | Baixa | "trabalho humano assistido, não 100% automático" | Tela de curadoria mínima (Seção 4, item fora da IA principal) — não é prioridade de aprendizado, é ferramenta interna |
| 5 | O alternador "modo com apoio" / "modo prova" (`docs/03`) não tem nenhuma especificação de interação — nem em `docs/03` nem em nenhuma linha de `docs/05` | `docs/03`, seção "Velocidade de processamento" | Médio-alto se há uma prova C1 real no horizonte | Média | "com o apoio sendo retirado progressivamente conforme a data da prova se aproxima" | Especificar como um toggle de sessão + campo de data-alvo em Perfil (Seção 4) |
| 6 | O estado por tópico que o FSRS já calcula (`stability`, `difficulty`, `reps`, `lapses`) não tem nenhuma tela que o visualize como progresso — a "trilha de tópicos" aparece só como ideia de gamificação em `docs/02`, nunca como visualização de domínio real | `app/migrations/0001_init.sql`, tabela `progress`; `docs/02` | Alto — é dado já coletado, sem interface, subaproveitado | Alta | Ver Seção 9 (gamificação) — reclassificação proposta | Tela "Trilha de Tópicos" dedicada (Seção 4), tratada como progresso central, não decoração |

### O que está excessivamente complexo

| # | Achado | Localização | Impacto | Severidade | Evidência | Recomendação |
|---|---|---|---|---|---|---|
| 7 | 56 unidades em escopo, cada uma com sua própria coluna "apresentação visual" em `docs/05`, implicam ~56 layouts distintos se implementadas ao pé da letra — mas o próprio catálogo já mostra que isso é desnecessário: `VideoTaskEngine` cobre 8 linhas (12, 13, 15, 29, 41, 42, 43, 44) com um parâmetro de subtipo | `docs/05`/`scripts/build_engine_spec.py`, linhas 104-113 e a família `VideoTaskEngine` | Alto — 56 telas aprendidas do zero é custo cognitivo real para o próprio usuário, além de custo de manutenção | Alta | Heurística de Nielsen #4 (consistência e padrões); o próprio catálogo já parametriza por subtipo no backend | Elevar a mesma parametrização por subtipo do nível de engine/correção para o nível visual — ver Seção 5 e 10, ~10-12 formas de interação cobrem as 56 unidades |
| 8 | Grupo D tem 6 personas/cenários (coletiva, tribunal, concorrente, interrogatório, posição atribuída, speech rápido) apresentados hoje como uma lista plana no catálogo — sem hierarquia de intensidade na apresentação | `docs/05`, itens 95-99, 103 | Alto — é exatamente o momento (pré-exposição social) em que sobrecarga de escolha é mais cara | Alta | Lei de Hick (tempo de decisão cresce com número/complexidade de opções); `docs/03` já propõe "progressão deliberada" mas não define a UI | Escada de exposição visual (Seção 12), não menu/grade |
| 9 | O bloco de leitura (9-10 sub-exercícios de 10 engines diferentes) risca parecer uma prova longa mesmo com a mitigação de dado já correta (crédito atômico) — o risco remanescente é puramente de apresentação | `docs/06`; schema `reading_blocks`/`reading_block_items` | Médio | Média | `docs/03`, adendo: "um bloco de 9-10 exercícios sequenciais pode virar exatamente o tudo-ou-nada que se quer evitar" — já reconhecido, mitigação de dado feita, mitigação visual não | Barra de progresso de bloco com moldura explícita de bônus + affordance de pausa (Seção 4, 11) |

### O que está cognitivamente pesado

| # | Achado | Localização | Impacto | Severidade | Evidência | Recomendação |
|---|---|---|---|---|---|---|
| 10 | IPA (alfabeto fonético) é a linguagem de feedback literal em pelo menos 6 engines (`ReadAloudEngine`, `SpokenGapFillEngine`, `ShadowingEngine` com correção, `VowelInsertEngine`, o log fonético do `DictationEngine`) — glifos IPA são visualmente densos (diacríticos incomuns, símbolos fora do alfabeto latino padrão) | `docs/08`; `phoneme_scores.diff_json` | Alto para os engines de fonética especificamente | Alta | "mostradas... direto em IPA, sem 'tradução' pra linguagem leiga" (`docs/08`) — decisão correta pedagogicamente, mas exige tratamento tipográfico dedicado | Fonte com cobertura Unicode IPA completa, tamanho maior, espaçamento generoso, isolado do restante do corpo de texto (Seção 6) |
| 11 | A fila do FSRS ("X itens para revisar hoje") mostrando o número bruto de pendências é um gatilho clássico de sobrecarga — mais ainda para um usuário com delay aversion documentada, depois de qualquer intervalo sem uso | `docs/05`, item 1, `SpacedReviewEngine` | Alto | Alta | Achado de pesquisa sobre UI para TDAH: interrupções e volume não filtrado sobrecarregam; padrão análogo a ansiedade de "inbox zero" | Nunca mostrar o total bruto como número primário — capar/fatiar em lotes do tamanho de uma sessão (Seção 11) |
| 12 | 100 tópicos gramaticais × 18 categorias é uma taxonomia grande — se exposta como lista/dropdown para "escolher o que estudar", viola a Lei de Hick | `app/migrations/0001_init.sql`, `content_topics` | Médio | Média | Lei de Hick | ~~Navegação por tópico é secundária/opt-in (trilha, Seção 4); entrada primária é sempre decidida pelo sistema (fila FSRS)~~ **Revertido em `docs/12` — navegação por categoria (18 categorias reais, não dropdown genérico) é a entrada primária; a fila FSRS vira card opcional.** |

### O que gera atrito desnecessário

| # | Achado | Localização | Impacto | Severidade | Evidência | Recomendação |
|---|---|---|---|---|---|---|
| 13 | Nenhuma saída de baixo atrito é mencionada para sair de uma sessão de roleplay (Grupo D) já em andamento | `docs/05`, itens 95-99 | Alto — é exatamente onde a saída fácil mais importa (exposição social) | Alta | Exposição graduada pressupõe que o ritmo é controlado pelo paciente/usuário, não só a ordem dos cenários | `ExitConversationAffordance` sempre visível, sem framing de "desistência" (Seção 5, 12) |
| 14 | Não há definição do que acontece com gravações/tentativas descartadas antes da submissão final (Shadowing, ReadAloud, opinião gravada) — usuário pode regravar à vontade, mas as tentativas anteriores ficam em algum lugar? | `docs/05`, itens 2, 5, 25, 114-118 | Baixo-médio, mas é uma fonte real de ansiedade residual ("minha gravação ruim ficou salva em algum lugar?") | Média | Nenhuma evidência direta — inferência de design a partir do princípio geral de reduzir incerteza (`docs/03`) | Deixar explícito na UI que só a tentativa final é retida; tentativas descartadas não são enviadas/salvas |
| 15 | Nenhum exercício individual tem affordance de "pular" mencionado — só existe pausa de sessão implícita | Catálogo inteiro | Médio | Média | Para TDAH, incapacidade de pular um item específico pode transformar aversão a um item em abandono da sessão inteira | Botão de pular de baixo atrito, sem penalidade severa no FSRS (Seção 5, 11) |

### O que pode prejudicar retenção

| # | Achado | Localização | Impacto | Severidade | Evidência | Recomendação |
|---|---|---|---|---|---|---|
| 16 | `source_rule` é armazenado em `exercises` como few-shot de geração, mas não está definido se é mostrado ao usuário — se só alimenta o LLM e nunca aparece na tela, o usuário treina frases sem ver a regra abstraída que deveria internalizar | `app/migrations/0001_init.sql`, `exercises.source_rule` | Médio-alto — efeito de "exemplo trabalhado" (worked-example effect) é um dos achados mais replicados de Cognitive Load Theory (Sweller) | Média | Sweller, Cognitive Load Theory — pareamento de regra explícita + prática melhora transferência mais do que prática pura | Exibir `source_rule` sob demanda (disclosure progressivo — um toque/clique, não forçado) em todo engine do Grupo A |

### O que pode prejudicar motivação

| # | Achado | Localização | Impacto | Severidade | Evidência | Recomendação |
|---|---|---|---|---|---|---|
| 17 | A "trilha de tópicos" é tratada como item de gamificação (`docs/02`) em vez de visualização central de competência — isso é um erro de categoria: dado real de maestria (FSRS) não é decoração, é a resposta mais direta à necessidade de competência da SDT | `docs/02`, seção de gamificação | Médio-alto | Média | Deci & Ryan, Self-Determination Theory — competência como necessidade psicológica básica; achado de pesquisa: "gamificação pode satisfazer competência através de marcadores visuais claros de progresso" | Promover a trilha de P2/decorativo para P1/estrutural (Seção 4, 9, 14) |

### O que pode prejudicar consistência

| # | Achado | Localização | Impacto | Severidade | Evidência | Recomendação |
|---|---|---|---|---|---|---|
| 18 | A regra "feedback verde/âmbar, nunca vermelho puro" existe uma única vez, no texto livre da linha do item 9 (`GapFillGovernanceEngine`) — não é declarada como regra global | `docs/05`, item 9 | Alto — com 56 unidades especificadas por pessoas/sessões diferentes ao longo de 12 fases, regras não centralizadas divergem | Alta | Heurística de Nielsen #4 (consistência); a própria existência da regra mostra que a intuição certa já apareceu uma vez, só não foi sistematizada | Promover para token de design system global (Seção 6), aplicado por padrão em todo componente de feedback, não redeclarado engine a engine |

### O que pode prejudicar acessibilidade

| # | Achado | Localização | Impacto | Severidade | Evidência | Recomendação |
|---|---|---|---|---|---|---|
| 19 | Nenhuma menção a contraste, tamanho de texto, navegação por teclado ou leitor de tela em `docs/01`–`08` ou no schema | Todo o conjunto de docs | Médio — fácil de subestimar "porque é só para mim" | Média | Ver Seção 13 — o ponto central é que uso noturno/cansado/TDAH torna acessibilidade básica interesse próprio do usuário principal, não gesto para terceiros hipotéticos | Linha de base WCAG AA (Seção 13) desde o primeiro componente, não como retrofit |
| 20 | Engines audio-primeiro (Shadowing, Dictation, família de fonética) não têm caminho alternativo definido para momentos em que áudio não é viável (trem sem fone, ambiente barulhento) | `docs/05`, itens 2, 28, 114-118 | Baixo-médio | Baixa | Inferência de contexto de uso real, não achado de pesquisa específico | Degradar graciosamente para texto-only quando o microfone/áudio não estiver disponível, em vez de bloquear a sessão |

---

## 4. Mapa completo de telas

Como não existe IA (arquitetura de informação) hoje, este é um inventário proposto, não uma lista do que já existe. Prioridade segue a mesma escala do roadmap (P0–P3, Seção 14).

| Tela | Objetivo | Prioridade | Frequência | Informação exibida | Ações principais → secundárias | Elementos visuais |
|---|---|---|---|---|---|---|
| **Hoje** (home) — **superado, ver `docs/12`** | ~~Ponto de entrada único; decide "o próximo item", não lista tudo~~ Passa a ser um grid de cards por categoria (Gramática, Fonética, Leitura, Vídeo, Prática semanal, Conversas); "próxima ação" vira card opcional ("Revisão de hoje") | P0 | Toda abertura do app | Próxima ação recomendada, contagem suave da fila (não bruta), lembrete de implementation intention ativo, se houver | Continuar/Começar → ver trilha, ver planejador semanal | ~~Um cartão dominante (próxima ação), resto colapsado~~ Grid de 6 cards de grupo, ver `mockups/home-redesign-mockup.html` |
| **Sessão ativa** (`ExerciseShell`) | Casca única reusada pelas ~56 unidades — prompt, resposta, feedback | P0 | Múltiplas vezes por sessão | Item atual, posição na sessão (pontos discretos, não barra numérica agressiva), o prompt do engine específico | Responder/Enviar → pular, pausar | Layout de 3 zonas fixas: prompt / resposta / feedback (Seção 5) |
| **Fala/Pronúncia** (estado especializado da Sessão ativa) | Gravação + feedback fonético — cobre `ReadAloudEngine`, `ShadowingEngine`, `SpokenGapFillEngine` | P0 | Frequente (fonética é núcleo do projeto) | Frase/palavra-alvo, estado de gravação, diff fonético pós-envio | Gravar → ouvir/regravar (ilimitado) → enviar → ouvir gabarito | Botão de gravar grande e central (Lei de Fitts), diff em IPA com tratamento tipográfico dedicado |
| **Contestação hostil** (Grupo D) | Roleplay adversarial multi-turno, texto ou voz | P0 | Semanal (motor semanal) | Persona ativa, histórico da conversa, indicador de turno | Responder (texto/voz) → sair da conversa, alternar texto/voz | Chat-first; escada de cenário antes de entrar (Seção 12) |
| **Motor semanal / Planejador** | Captura de implementation intention + visão do ritual semanal | P0 | Semanal | Itens da semana (shadowing, mineração de vídeo, opinião, tutor), campos quando/onde | Definir quando/onde → editar/concluir item | Cartões por atividade da semana, não uma tabela densa |
| **Bloco de leitura/notícia** | Sequência de 9-10 sub-exercícios ligados a um texto gerado | P1 | Algumas vezes por semana | Progresso do bloco (moldura de bônus, nunca única fonte de crédito), texto-base colapsável | Continuar bloco → pausar e retomar depois | Barra "6 de 9" com microcopy explícito de que cada item já valeu |
| **Vídeo + tarefa** (Grupo E) | Player + tarefa lateral (legendar, dublar, interpretar, citar) | P1 | Algumas vezes por semana | Vídeo (iframe YouTube), campo de tarefa específico do subtipo | Assistir/gravar/digitar → enviar | Vídeo à esquerda, tarefa à direita (desktop) / empilhado (mobile) |
| **Trilha de tópicos** (mastery map) | Visualizar domínio real por categoria gramatical/fonética, a partir do FSRS | P1 | Consulta ocasional, não obrigatória | Categorias com nível de maestria (derivado de `stability`/`difficulty`), não streak | Abrir tópico → praticar tópico específico (opt-in, fora do fluxo padrão) | Mapa por categoria, cor por maestria — tom calmo (ver Seção 8, referência Khan Academy) |
| **Perfil & Motivo** | Motivo pessoal (SDT), data da prova C1 (modo prova), preferências (celebração, canal de lembrete, padrão texto/voz) | P1 | Raro (configurar uma vez, revisar ocasionalmente) | Frase-motivo, data-alvo, toggles | Editar motivo → editar preferências | Formulário simples, sem densidade |
| **Mineração de vídeo** | Anotação de vídeo escolhido pelo usuário (temptation bundling) | P2 | Semanal (Grupo B) | Vídeo + notas com timestamp, candidatos a virar card | Anotar → marcar candidato a card | Vídeo à esquerda, notas à direita, lista de candidatos abaixo |
| **Notebook / Referência pessoal** | Registro livre não corrigido (`PersonalReferenceEngine`) | P2 | Ocasional | Notas por tópico/data | Escrever → consultar histórico | Editor minimalista tipo bloco de notas |
| **Progresso & Estatísticas** | Streak, XP, tendências — deliberadamente secundário | P2 | Opcional, consulta espontânea | Streak (com estado de "perdão"), XP, histórico | Consultar (sem ação obrigatória) | Painel discreto, nunca a tela de entrada |
| **Configurações** | Acessibilidade, notificação, dados | P1 | Raro | Tamanho de texto, motion, som, canal de lembrete, exportação de dados | Ajustar → salvar | Lista de toggles simples |
| **Onboarding** | Primeira captura de motivo + preferências | P1 (mas uso único) | Uma vez | — | Configurar preferências iniciais | Mínimo, 2-3 passos no máximo |
| *(interno)* Curadoria `topic_template_map` / vídeo | Ferramenta de curadoria assistida (Fases 2 e 6) | P3, fora da IA do "aprendiz" | Uso do desenvolvedor | Tópicos/templates, candidatos de vídeo | Aprovar/rejeitar mapeamento | Tabela funcional, sem necessidade de polish visual |

Nota: "Feedback pós-exercício" não é uma tela separada — é um *estado* da Sessão Ativa (Seção 6, "Estados"). Tratá-lo como tela própria criaria uma navegação extra desnecessária exatamente no momento em que o usuário mais precisa de continuidade sem fricção.

---

## 5. Inventário de componentes

Para cada componente: por que existe, que problema resolve, evidência, exemplos reais. Componentes explicitamente não recomendados vêm ao final, com justificativa — a pergunta "por que NÃO" importa tanto quanto "por que sim" neste projeto, dado o histórico de escopo já cuidadosamente controlado em `docs/03`.

### Casca e navegação

**`ExerciseShell`** — três zonas fixas (prompt / resposta / feedback) reusadas por todas as 56 unidades em escopo, parametrizadas por engine. Resolve o problema identificado no Achado #7 (Seção 3): sem isso, cada engine vira uma tela nova a aprender. Evidência: heurística de Nielsen #4 (consistência e padrões); o próprio catálogo já usa parametrização por subtipo no backend (`VideoTaskEngine`). Exemplo real: Anki e Brilliant.org usam exatamente esse padrão — uma casca fixa, conteúdo que varia dentro dela — e ambos são citados como referência de baixa carga cognitiva por sessão.

**`CompletionSignal`** — confirmação micro (ex. check mark, <1s, sem modal bloqueante) ao final de cada unidade. Resolve o Achado #1: a regra existe em `docs/03`, o componente não. Evidência: pesquisa de UI para TDAH aponta feedback imediato e visível como redutor de abandono; delay aversion (Sonuga-Barke) torna a ausência desse sinal mais custosa para este usuário especificamente do que para a média.

**`SessionProgressDots`** — indicador de posição na sessão como pontos discretos (não barra numérica "3/47"), porque o número bruto é o problema identificado nos Achados #11/#12. Mostra "onde estou dentro deste lote pequeno", nunca o backlog total.

**`SkipButton`** — resolve o Achado #15. Baixo atrito, sem framing de fracasso, penalidade leve no FSRS (equivalente a "difícil", não a "errei").

### Feedback

**`InlineFeedbackBadge`** — estado tri-state (certo / quase-lá / a revisar), verde/âmbar como regra global promovida do Achado #18, nunca vermelho puro, sempre com ícone + texto além de cor (não depende só de matiz — ver Seção 13, WCAG 1.4.1). Exemplo real: Duolingo usa esse mesmo princípio de tom (evita "ERRADO" em vermelho berrante na maioria dos fluxos atuais), mas com um tom lúdico que não se encaixa neste perfil de usuário — a versão aqui deve ser mais neutra/factual, dado o achado sobre intolerância à incerteza em `docs/03`.

**`StrengthsAndErrorsPanel`** — implementa o campo duplo de `correction_json` (erros **e** pontos fortes) definido em `docs/03`/schema, com pontos fortes exibidos primeiro ou lado a lado, nunca depois/escondido. Resolve diretamente o viés de tudo-ou-nada já nomeado em `docs/03`.

**`ShowedUpBadge`** — canal visual completamente separado de `InlineFeedbackBadge`/`StrengthsAndErrorsPanel`, implementando `attempts.showed_up`. É o componente de maior importância terapêutica do inventário inteiro: a separação já existe no schema, mas se os dois aparecerem na mesma área visual (mesmo que em campos de dado diferentes), o efeito prático de "misturar validação de exposição com feedback de idioma" — que `CLAUDE.md` proíbe explicitamente — acontece de qualquer forma, pela proximidade visual. Precisa de separação espacial real, não só separação de campo no JSON.

**`PhonemeDiffDisplay`** — exibição de IPA lado a lado (alvo vs. reconhecido), tipografia dedicada (Seção 6), toque para ouvir o fonema-alvo. Resolve o Achado #10. Exemplo real: ELSA Speak usa cor por fonema (verde/amarelo/vermelho) sobre o texto, com símbolo fonético e dica articulatória — validado por pesquisa de mercado como um padrão que usuários entendem rápido; a adaptação aqui deve manter a paleta tri-state já definida (não usar vermelho puro do ELSA) e adicionar sempre o próprio símbolo IPA, já que — diferente do público geral do ELSA — o usuário aqui lê IPA por design (`docs/08`).

### Progresso e maestria

**`MasteryTrail`** — visualização por categoria a partir de `progress.stability`/`difficulty`, não framing de "jogo". Resolve o Achado #6/#17 — promove a trilha de decoração para infraestrutura central de competência (SDT).

**`StreakWidget`** com estado de "perdão" (não reset binário) — ver avaliação crítica completa na Seção 9. Evidência: pesquisa sobre streaks do Duolingo mostra tanto o efeito motivador quanto o custo de ansiedade/perda; a mitigação de "perdão" já proposta em `docs/03` é a resposta certa à crítica, não uma decisão estética.

**`ReviewQueueSoftCount`** — nunca mostra o total bruto pendente como número primário; mostra "hoje: N itens" com N capado ao tamanho de uma sessão razoável (ex. 8-12), mesmo que o backlog real seja maior. Resolve os Achados #11.

**Sobre um "indicador de confiança" separado**: a Etapa 5 do pedido original lista "confidence indicators" como exemplo de componente a considerar. Recomendação: **não construir um rating de confiança manual adicional**. O motivo: os botões de auto-avaliação do FSRS (Errei/Difícil/Bom/Fácil, já especificados no item 93 do catálogo) já capturam sinal de confiança subjetiva no momento exato da resposta, e `stability`/`difficulty` do FSRS já modelam confiança objetiva a partir do histórico. Pedir ao usuário para *também* se autoavaliar numa escala de confiança separada duplica o sinal, adiciona uma decisão a mais por item (custo de Lei de Hick) sem ganho correspondente — é exatamente o tipo de engenharia desproporcional que `docs/03` já evita conscientemente para gamificação.

### Planejamento e exposição

**`ImplementationIntentionCapture`** — seletor quando/onde ligado a `session_plans`. Resolve o Achado #3 (parcialmente — ainda falta decidir o canal de notificação, que é uma decisão de produto, não só de componente).

**`ExposureLadder`** — seletor de cenário do Grupo D como escada visual ordenada por intensidade, com estados concluído/atual/disponível-mas-pulável (não bloqueado rigidamente — ver Seção 12 sobre por que ordem estrita seria contraproducente). Resolve o Achado #8.

**`TextVoiceToggle`** — default texto, voz como upgrade opt-in por sessão, nunca forçado (implementa a decisão já fechada em `docs/03`).

**`ExitConversationAffordance`** — sempre visível durante roleplay, sem linguagem de fracasso ("Encerrar por hoje", não "Desistir"). Resolve o Achado #13.

### Vídeo e leitura

**`VideoIframeShell`** — wrapper consistente do embed do YouTube, nunca baixa/re-hospeda o vídeo (reforça a regra já fechada em `docs/07`).

**`BlockProgressBar`** — implementa a moldura de bônus (nunca única fonte de crédito) com microcopy explícito, mais affordance de pausa/retomada explícita na UI (o schema já suporta isso via crédito atômico; falta expor na interface). Resolve o Achado #9.

**`TranscriptRevealGate`** — componente que *fisicamente* impede a transcrição/texto-gabarito de renderizar antes de uma tentativa registrada, em vez de depender de cada engine individualmente "lembrar" de não mostrar cedo. Isso importa porque a regra ("nunca mostrar transcrição antes da tentativa") está repetida textualmente em `docs/06`, `docs/07` e `docs/08` — três vezes a mesma regra em três documentos é sinal de que ela precisa de um mecanismo de imposição único (o componente), não de disciplina repetida em cada implementação futura.

### Explicitamente não recomendados

**Leaderboard/comparação social** — não recomendado. Não por princípio geral (funciona bem em outros produtos), mas porque este é literalmente uso solo — não há "outros" para comparar. `docs/02` já fechou essa decisão; esta análise só confirma que nenhuma pressão de escopo futuro deveria reabri-la.

**Perfil público/compartilhamento** — não recomendado. Superfície de complexidade (autenticação social, privacidade) sem nenhum caso de uso num app de um usuário só.

**Badges de notificação não lidas / contador vermelho persistente** — não recomendado. Pesquisa sobre gamificação do Duolingo encontrada nesta análise descreve notificações frequentes como fonte de irritação e o padrão geral como parecido com "checagem compulsiva" de redes sociais — o oposto do que o projeto já decidiu evitar (`docs/03` já rejeita mecânicas manipulativas implicitamente ao manter gamificação como camada secundária).

**Cronômetro regressivo em exercícios de fala/exposição** — não recomendado, com uma exceção nomeada. `docs/03` já proíbe isso explicitamente para `RecordedOpinionEngine" ("sem cronômetro regressivo agressivo"); esta análise generaliza a regra para todo exercício adjacente a exposição (Grupo D, fonética, opinião gravada). A exceção correta é o "modo prova" (Achado #5) — ali, cronômetro é o ponto pedagógico (simular a prova real), não um acidente de design.

**Indicador de confiança manual separado** — não recomendado, justificado acima.

---

## 6. Design System recomendado

Cada decisão aqui é justificada por UX/acessibilidade, não por preferência estética — conforme pedido explicitamente.

### Escala tipográfica

Base de 16-18px (não 14px) para corpo de texto — sessões longas, uso noturno/cansado e o próprio perfil de atenção do usuário pesam contra texto pequeno. Escala modular (razão ~1.25), altura de linha ≥1.5, comprimento de linha entre 60-75 caracteres via `max-width` no container de leitura — os três parâmetros com maior peso de pesquisa em legibilidade, mais determinantes que a escolha da fonte em si, segundo a pesquisa de tipografia inclusiva revisada para esta análise.

Fonte de corpo: opções com lastro de pesquisa mais forte (Lexend, Atkinson Hyperlegible) ou um default seguro (fonte de sistema, Arial/Verdana-classe) — a pesquisa revisada encontrou que fontes "de acessibilidade" especializadas como OpenDyslexic **não** mostraram vantagem de velocidade de leitura sobre sans-serif convencionais em estudo empírico relevante, então a recomendação não é "use uma fonte especial", é "priorize espaçamento e contraste, que têm efeito maior e mais consistente".

Fonte para IPA: requisito técnico específico deste projeto — a maioria das fontes de UI padrão não renderiza bem diacríticos e símbolos IPA menos comuns. Recomenda-se uma fonte com cobertura Unicode IPA completa e formas claras nesses glifos (ex. família Noto Sans, ou Charis SIL para os casos mais raros), usada isoladamente nos componentes de fonética — nunca a mesma fonte de corpo genérica aplicada "por acaso" a símbolos fonéticos.

### Grid

Mobile-first, coluna única — o produto é fundamentalmente sessão-a-sessão, não um dashboard denso. Em desktop, manter largura máxima de leitura (~640-720px) mesmo com tela larga, para preservar o comprimento de linha ideal em vez de deixar o texto esticar.

### Spacing

Escala de 8px (8/16/24/32/48...) — padrão da indústria, mas a justificativa aqui é específica: pesquisa de UI para TDAH nomeia espaço em branco como "multiplicador de clareza" e agrupamento visual consistente como redutor de esforço cognitivo (princípio de proximidade de Gestalt). Espaço não é "estético", é a ferramenta que permite ao usuário escanear a tela em vez de ler linearmente cada elemento.

### Radius

Cantos moderadamente arredondados (não retos, não excessivamente arredondados/"bolha") — tom aproximável, apropriado para um produto que lida com exposição emocional (Grupo D, fala), sem escala para o registro "lúdico/mascote" que faria sentido num produto de massa mas destoa do perfil deste usuário (ver comparação com Duolingo, Seção 8). Escala consistente: ~8px em elementos pequenos, ~12px em cartões, arredondamento total em pills/badges.

### Sombras

Mínimas, só funcionais (indicar elevação/interatividade — ex. um card clicável vs. texto estático), nunca decorativas. Sombra decorativa é ruído visual, e ruído visual é custo de atenção — o mesmo argumento de carga cognitiva de todo o resto desta seção.

### Contraste

Mínimo WCAG AA (4.5:1 texto normal, 3:1 texto grande/componentes de interface — ver Seção 13), com meta de AAA (7:1) onde viável para corpo de texto. A justificativa não é conformidade regulatória (uso solo, sem obrigação legal) — é redução de fadiga visual/cognitiva em sessões longas e uso noturno, que é o cenário real deste usuário, não um caso extremo hipotético.

### Sistema de cores

Tokens semânticos, não uma paleta solta: `success`, `caution` (âmbar — nunca vermelho puro, promovendo o Achado #18 a regra global), `neutral`, `info`. Cor nunca é o único canal de significado (sempre pareada com ícone/forma/texto — WCAG 1.4.1, e relevante à parcela de daltonismo vermelho-verde, a forma mais comum, que atinge diretamente o par verde/vermelho que muitos apps de correção usam sem pensar). Paleta de base contida/pouco saturada — deliberadamente o oposto do visual "brilhante e lúdico" de Duolingo (apropriado para o público de massa dele, errado para um usuário com ansiedade social alta onde tom mais calmo reduz ativação, não aumenta engajamento).

### Estados

**Erro**: nunca tom de "errado!"/exclamação — reformulado como diff factual ("quase lá" / mostra a diferença), sem linguagem de vergonha. Conecta diretamente ao achado sobre intolerância à incerteza em `docs/03`.

**Sucesso**: discreto por padrão (celebração sonora/animada desligada por padrão, já decidido em `CLAUDE.md`) — mas ainda precisa de um estado real, só silencioso, não ausente.

**Carregamento**: skeleton screens preferíveis a spinners genéricos (percepção de performance), e — especificamente relevante aqui — um estado de "pensando" explícito e nomeado para os momentos em que a correção ou o roleplay dependem de uma chamada de LLM que pode não ser instantânea (Achado da Seção 2 sobre latência não especificada). Silêncio ambíguo é pior que espera visível para um usuário com intolerância à incerteza documentada.

**Vazio**: "nenhum item para revisar hoje" deve ser tratado como conquista (microcopy positivo), não como tela em branco sem conteúdo — oportunidade de reforço motivacional barata, hoje não mencionada em nenhum documento.

---

## 7. Hierarquia visual

Aplicando Eye Tracking (padrão F/Z de leitura), Lei de Fitts, Lei de Hick, Gestalt e heurísticas de Nielsen às telas de maior risco/frequência.

**Hoje (home) — superado, ver `docs/12`**: ~~primário — a próxima ação recomendada, ocupando a maior área visual e a posição de maior atenção segundo padrão F (canto superior esquerdo/centro). Secundário — contagem suave da fila, apenas indicativa. Terciário — atalhos para trilha/planejador, visualmente recuados (menor peso, menor contraste, canto inferior). O que deve desaparecer: qualquer lista completa da fila FSRS — se ela aparece na home, compete diretamente com a ação primária pela atenção do usuário (viola o próprio objetivo da tela).~~ Revertido a pedido do usuário: a home é um grid de cards por categoria (primário), com "Revisão de hoje" (fila FSRS) como card secundário opcional, não mais o ponto de entrada único — razão completa em `docs/12-mudanca-direcao-home-por-categoria.md`.

**Sessão ativa**: primário — o prompt do exercício (maior tamanho de texto da tela). Secundário — a área de resposta, imediatamente abaixo, com o alvo de toque/clique da ação principal dimensionado com folga (Lei de Fitts: quanto maior e mais previsível a posição do alvo, menor o tempo/erro de interação — relevante especialmente no botão de gravar, que deve ser grande e sempre na mesma posição em todos os engines de fala). Terciário — posição na sessão (pontos discretos) e ação de pular, ambos discretos, canto superior, nunca competindo em tamanho com o prompt.

**Fala/Pronúncia**: primário — a frase/palavra-alvo. Secundário — o botão de gravar (maior alvo de toque da tela inteira, seguindo Fitts explicitamente, dado que é a ação mais repetida da sessão). Terciário, e crucialmente *invisível até depois do envio* — o áudio-gabarito e a transcrição fonética-alvo (reforça a regra de não revelar antes da tentativa via hierarquia visual, não só via lógica de estado).

**Contestação hostil (Grupo D)**: antes de entrar — primário é a identidade da persona e o nível de intensidade (previsibilidade reduz incerteza, Clark & Wells), secundário é o botão de começar, terciário é a opção texto/voz. Durante a conversa — primário é a mensagem mais recente (padrão de chat já bem estabelecido, reconhecível sem esforço — heurística de Nielsen #6, reconhecimento em vez de recall), a saída de conversa deve ter peso visual suficiente para ser notada sem competir com o conteúdo do chat (nem escondida, nem dominante).

Em todas as telas, o princípio de Gestalt mais aplicável é proximidade + agrupamento: elementos que pertencem à mesma decisão (ex. prompt + campo de resposta) precisam estar visualmente próximos e separados por espaço claro dos elementos de navegação/meta-informação, para que o usuário nunca precise decidir conscientemente "isso é parte do exercício ou é chrome do app?".

---

## 8. Comparação com produtos consolidados

Padrões extraídos, não copiados — cada linha diz por que funciona, quando não funciona, e o que fazer aqui.

| Produto | Padrão extraído | Por que funciona | Quando NÃO funciona / não se aplica aqui | Decisão para este projeto |
|---|---|---|---|---|
| **Duolingo** | Sessões curtas, streak, XP, ligas, celebração vibrante | Streaks são motivador forte comprovado; sessões atômicas reduzem fricção de início | Pesquisa revisada mostra streaks gerando ansiedade/pressão para parte dos usuários, "XP grinding" (usuários refazem conteúdo fácil só para pontuar) e tom lúdico/comparativo mal alinhado com ansiedade social alta | Adotar: sessões atômicas curtas. Rejeitar: ligas/comparação (N/A, uso solo), tom vibrante/mascote, XP como métrica de volume. Adaptar: streak com "perdão" em vez de reset — já decidido em `docs/03`, esta análise concorda com a evidência |
| **Babbel** | Currículo estruturado com explicação gramatical explícita antes da prática | Efeito de exemplo trabalhado (Cognitive Load Theory) — regra + exemplo antes de praticar melhora retenção | N/A — Babbel usa isso para iniciantes num currículo linear; este projeto não tem currículo linear único | Adotar o princípio, não o formato: `source_rule` deveria ser acessível ao usuário (Achado #16), não só ao LLM |
| **Busuu** | Variedade de tipos de exercício + vídeo com falantes nativos | Variedade de formato reduz tédio/monotonia | Risco espelhado neste projeto: variedade de *conteúdo* não deveria virar variedade de *chrome de interface* (Achado #7) | Adotar variedade de desafio; manter casca visual única (`ExerciseShell`) |
| **Memrise** | Repetição espaçada + clipes de vídeo autêntico (não só voz sintética) | Áudio autêntico treina compreensão real; espaçamento é eficaz (ver FSRS abaixo) | Custo de curadoria de vídeo é alto — por isso este projeto corretamente mantém TTS como padrão e vídeo autêntico como enriquecimento (`docs/07`), não o oposto | Validação: a arquitetura já decidida (TTS padrão + DW como fonte principal de vídeo curado) é o equilíbrio certo |
| **Anki** | UI minimalista de flashcard, auto-avaliação de 4 botões (Again/Hard/Good/Easy) | Estudos revisados mostram ganho de 6-13% em notas de exame associado a uso de Anki em educação médica; interface sem decoração não é uma limitação, é o que funciona | N/A para engines de produção livre (escrita, roleplay) — o padrão de card serve bem só a recall ativo | Adotar diretamente para `TransitionPhraseEngine`/`ReactionPhraseEngine` (item 93/94, já especificados como "visual próximo ao Anki") e para `SpacedReviewEngine` |
| **LingQ / Readlang** | Clique numa palavra do texto para ver definição/glosa sem sair da leitura | Preserva o fluxo de leitura (não força troca de tela para consultar dicionário) | N/A antes da tentativa em textos onde a "resposta" depende de não saber a palavra ainda (ex. `ComprehensionQAEngine` antes de responder) | Adotar para o texto-base do bloco de leitura *depois* da tentativa, e para transcrições de vídeo pós-tentativa — sinergia direta com o pipeline de enriquecimento de léxico via Wiktionary já planejado |
| **Khan Academy** | Progresso por maestria (não por tempo), tom visual calmo (azuis/verdes acadêmicos, não cores de parque de diversão) | Comunica competência real, não atividade; tom reduz ativação de ansiedade de desempenho | N/A onde o objetivo é engajamento de massa via excitação visual | Referência de tom direta para `MasteryTrail` — o oposto do registro visual do Duolingo, e o mais adequado a este perfil de usuário |
| **Brilliant** | Um problema por vez, feedback instantâneo, chrome mínimo | Reduz decisão simultânea (Lei de Hick), valida entendimento antes de avançar | N/A a exercícios de produção aberta longa (ensaio, roleplay) onde "um problema por vez" já é a estrutura natural | Valida a arquitetura de `ExerciseShell` de item único — já é o padrão implícito do projeto, esta comparação só confirma que é o padrão certo |

---

## 9. Gamificação

Avaliação crítica elemento a elemento — não presume que gamificação é boa por padrão, conforme pedido.

**Streak — Recomendar com restrições.** Funciona como motivador (confirmado por múltiplas fontes revisadas), mas o mecanismo de reset binário tradicional é onde o dano mora: pesquisa sobre o próprio Duolingo, revisada nesta análise, associa a mecânica de streak a ansiedade e "verificação compulsiva" para parte dos usuários — e para um usuário com TDAH, um dia perdido por falha de função executiva (não de motivação) seguido de reset a zero é o gatilho perfeito para o padrão de abandono tudo-ou-nada que `docs/03` já identifica como risco central. A mitigação de "perdão" já proposta em `docs/03` é exatamente a correção certa segundo essa evidência — esta análise reforça: implementar isso não é opcional dentro da decisão de manter streak.

**XP/pontos — Recomendar com restrições.** Aceitável como sinal de conclusão de sessão, mas não deve recompensar volume bruto — a crítica de "XP grinding" encontrada (usuários redoing conteúdo fácil só para pontuar) é uma falha de design evitável: se XP existe, deveria pesar mais itens que o FSRS realmente precisa revisar, não qualquer atividade. Alternativa mais simples e mais alinhada ao projeto: não gamificar volume, deixar a trilha de maestria ser "o número que importa".

**Níveis/badges — Recomendar com restrições.** Só quando amarrados a marco de maestria real (FSRS), nunca por frequência/attendance pura — pesquisa revisada nomeia a "implementação rasa de badges/pontos/leaderboards sem transformar a experiência de aprendizado" como a razão central de gamificação subperformar expectativas. Um badge por "10 dias seguidos" é decorativo; um badge por "categoria Konjunktiv II dominada" é informação real disfarçada de recompensa — a diferença importa.

**Leaderboard — Não recomendar.** Não há outros usuários. Ponto fechado, sem ambiguidade — e mesmo em produtos multi-usuário, a pesquisa revisada mostra leaderboards como capazes de desmotivar quem não está no topo, o que reforça que não há cenário aqui em que valha a pena reabrir.

**Celebrações (som/animação) — Recomendar com restrições, exatamente como já decidido.** Desligadas por padrão (`CLAUDE.md`) é a decisão certa: pesquisa de UI para TDAH nomeia autoplay, auto-expansão e interrupções não solicitadas como quebra de foco especificamente custosa para esse perfil de atenção. Refinamento a acrescentar: mesmo quando o usuário optar por ligar celebrações, elas nunca devem bloquear a próxima ação (sem modal forçado) — o princípio de "respeitar o foco" se aplica mesmo a quem pediu o efeito.

**Trilha de tópicos / mapa de maestria — Recomendar sem restrições, reclassificado.** Esta é a mudança de categoria mais importante desta seção: a trilha não deveria estar na mesma prateleira mental que streak/XP/badges. Ela visualiza dado de competência real que o FSRS já produz — está mais próxima de "informação" do que de "jogo", na mesma lógica de Khan Academy (Seção 8) e diretamente ligada à necessidade de competência da SDT. Tratá-la como gamificação decorativa (como aparece hoje em `docs/02`) é subestimar seu papel — deveria ser P1 estrutural, não P2/P3 opcional.

---

## 10. Recomendações por engine

As 56 unidades em escopo (Grupos A/B/D/E) já colapsam para 36 classes de engine distintas no próprio catálogo (contagem exata a partir de `scripts/build_engine_spec.py` — ex. os 8 subtipos de `VideoTaskEngine` contam como 1 classe), e esta análise propõe colapsá-las mais uma vez, para ~10-12 *formas de interação* visual reutilizáveis — a tabela abaixo organiza por família de interação, não por linha individual de `docs/05`, porque é assim que a UI deveria ser construída (Achado #7).

| Família (engines cobertas) | Layout | Feedback | Cores | Interação | Densidade |
|---|---|---|---|---|---|
| **Lacuna** (`GapFillGovernanceEngine`, `FillBlankEngine`, `WordBankGuessEngine`, `SpokenGapFillEngine`) | Frase com lacuna inline, campo/chip no lugar da palavra faltante | Tri-state por lacuna, imediato | Verde/âmbar padrão, nunca vermelho puro | Digitação curta ou seleção de chip; envio por Enter | Baixa — uma frase, uma decisão |
| **Transformação** (`StructuralTransformEngine`, `RegisterReformulationEngine`) | "Antes/depois": frase-fonte fixa em cima, campo de reescrita embaixo | Dois indicadores separados quando aplicável (transformação correta? + naturalidade) | Mesma paleta padrão | Texto livre, sem limite de tempo | Média — exige mais working memory que lacuna simples, então nunca deveria vir em sequência com outra unidade de alta carga (regra de intercalação já decidida em `docs/03`) |
| **Reordenar** (`UnscrambleEngine`, `ParagraphOrderEngine`, `LetterAnagramEngine`) | Chips clicáveis em ordem — banco embaixo, montagem em cima (já especificado corretamente em `docs/05` como mais amigável que arrastar) | Diff de sequência pós-envio | Padrão | Clique sequencial, nunca arrastar como única via (ver Seção 13 — WCAG 2.2 penaliza depender só de gestos de arrastar) | Baixa-média conforme granularidade (letra vs. palavra vs. parágrafo) |
| **Dictation** (`DictationEngine`, TTS e áudio autêntico) | Player minimalista (só play/replay, sem scrubber) + campo de texto | Diff palavra a palavra | Padrão | Replay ilimitado (já corretamente especificado — reduz ansiedade de "uma chance só") | Baixa |
| **Seleção/reconhecimento** (`MatchingEngine`, `TrueFalseEngine`, `BinaryChoiceEngine`, `PredictThenVerifyEngine`) | Duas colunas ou par binário inline | Imediato por par/afirmação | Padrão | Clique, sem digitação — deliberadamente reconhecimento em vez de recall, contraste bem-vindo com a família de lacuna (variedade real, não decorativa) | Muito baixa — bom para intercalar depois de uma unidade pesada |
| **Fala/Pronúncia** (`ReadAloudEngine`, `ShadowingEngine` ± correção, `SpokenGapFillEngine`) | Alvo em destaque + botão de gravar grande e fixo | Diff fonema a fonema em IPA, revelado só após envio; áudio-gabarito só depois disso | Tri-state, sempre pareado com símbolo/forma (nunca só cor) | Ouvir/regravar ilimitado antes de enviar (já corretamente especificado) | Baixa por item, mas alto custo emocional — nunca encadear dois itens de fala seguidos sem intercalar outro formato |
| **Roleplay** (`HostileRoleplayEngine` e variantes, Grupo D) | Chat-first; escada de cenário antes de entrar | Avaliação só no fechamento da sessão, nunca durante (já corretamente decidido — protege o valor terapêutico da exposição) | Neutra durante a conversa (sem tri-state de erro no meio do chat, que quebraria a imersão) | Texto por padrão, voz opt-in por sessão; saída sempre visível | Alta em conteúdo (multi-turno), mas cada turno deve ser uma decisão só |
| **Vídeo** (`VideoTaskEngine` em todos os subtipos, `VideoStimulusEngine`) | Iframe + painel de tarefa lateral (desktop) / empilhado (mobile) | Determinístico (legendar/citar) ou LLM-rubrica (interpretar/dublar), nunca misturados | Padrão | Assistir com controles limitados ao trecho definido | Baixa-média |
| **Escrita aberta** (`OpinionEssayEngine`, `GuidedImitationEngine`, família `OpenPromptEngine`) | Editor com contador de palavras/checklist estrutural visível | `StrengthsAndErrorsPanel`, pontos fortes primeiro | Padrão | Texto livre, sem cronômetro (exceto modo prova) | Alta — a mais alta da tabela; nunca deveria ser o primeiro item de uma sessão |
| **Leitura/notícia** (bloco `reading_blocks`, 10 engines 104-113) | `BlockProgressBar` de moldura de bônus + texto-base colapsável | Item a item, imediato; bônus de bloco separado | Padrão | Navegação sequencial com pausa/retomada explícita | Média por item, mas o bloco inteiro precisa de affordance de pausa (Achado #9) |
| **Recall ativo/flashcard** (`SpacedReviewEngine`, `TransitionPhraseEngine`, `ReactionPhraseEngine`) | Cartão central, vira ao clicar, 4 botões de auto-avaliação FSRS embaixo | Nenhum "erro" — é autoavaliação, não correção externa | Padrão, tom neutro (é o usuário avaliando a si mesmo) | Clique para virar, clique para autoavaliar | Muito baixa — o formato mais leve do catálogo, bom para abrir ou fechar sessão |
| **Mineração/registro pessoal** (`VideoMiningEngine`, família `PersonalReferenceEngine`) | Anotação lateral ao vídeo, ou editor de notas livre | Nenhum — auto-relato, não corrigido (já especificado corretamente) | Neutra | Anotar/registrar livremente | Baixa, sem pressão de desempenho — vale preservar esse tom deliberadamente "sem nota" |

---

## 11. TDAH

### Padrões recomendados

Intercalação obrigatória de formato a cada item (já decidido em `docs/03` — confirmado aqui com a base de evidência: delay aversion reage à monotonia tanto quanto à ausência de recompensa, então repetir o mesmo formato é estruturalmente mais custoso para este perfil do que para a média). Unidades atômicas <2min com `CompletionSignal` imediato (já decidido — a Seção 3 confirma que falta só o componente). Fila de revisão sempre capada/fatiada, nunca exibindo o backlog bruto (Achado #11). Implementation intentions com gatilho quando/onde literal, nunca lembrete genérico (já decidido — literatura de memória prospectiva ampla, e a citação de `docs/03` já é consistente com ela). Body-doubling leve — um cronômetro de "sessão ao vivo" tipo co-working — já proposto em `docs/03` como experimento barato; validar como P2, não P0, dado que a evidência formal para body doubling ainda é fraca/anedótica segundo o próprio `docs/03`. Skip de baixo atrito (Achado #15). Temptation bundling como default, não exceção — conteúdo escolhido pelo próprio usuário (mineração de vídeo) deveria ser o motor principal, biblioteca curada como apoio, não o inverso (já decidido em `docs/03`).

### Padrões proibidos

Autoplay, auto-expansão de conteúdo, modais surpresa não solicitados — nomeados diretamente pela pesquisa de UI para TDAH revisada como quebra de foco custosa. Pressão de cronômetro fora do modo prova explícito (já decidido para opinião gravada, generalizado aqui para todo exercício de exposição). Listas infinitas/scroll sem fim como padrão de navegação primário. Dashboards densos multi-coluna como tela de entrada — o oposto do padrão "um problema por vez" validado na Seção 8. Badges de notificação não lida / contadores vermelhos persistentes — geram o padrão de checagem compulsiva que a pesquisa sobre gamificação do Duolingo já associa a ansiedade, e que este projeto não deveria replicar.

### Densidade ideal

Uma tarefa/decisão por tela, sempre — não é um princípio genérico de minimalismo, é a tradução direta da Lei de Hick para um perfil onde custo de decisão já é estruturalmente mais alto (função executiva reduzida). Isso já é a arquitetura implícita do projeto (`ExerciseShell` serve um item por vez) — o risco não é a arquitetura errada, é uma tela de entrada (`Hoje`) ou uma tela de progresso (`Progresso & Estatísticas`) que reintroduza densidade de dashboard "porque parece mais completo".

### Tamanho ideal dos blocos

<2 minutos por unidade, confirmado. O bloco de leitura (9-10 sub-exercícios) é o caso que exige atenção extra: mesmo com cada sub-item abaixo de 2 minutos, o bloco inteiro pode passar de 15-20 minutos — longo para uma sessão. O schema já suporta pausa (crédito atômico), mas a UI precisa expor isso ativamente como "pausar aqui, retomar depois", não deixar implícito.

### Frequência ideal de feedback

Imediato, a cada item — já é regra do projeto. A extensão que falta: para os mecanismos 2 e 3 (LLM com rubrica, LLM roleplay), "imediato" não é tecnicamente garantido — esses dependem de uma chamada de LLM que pode levar segundos. A obrigação de design correspondente não é fingir que será instantâneo, é desenhar um estado de espera nomeado e visível (Seção 6), porque para delay aversion o que mais importa não é só a ausência de recompensa — é a ambiguidade da espera.

### Mecanismos de conclusão

Três níveis (item/bloco/sessão), cada um com tratamento visual distinto mas consistente. O resumo de fim de sessão deveria ser extremamente curto — uma linha e uma ação de "concluir", nunca uma tela adicional de revisão de estatísticas forçada. Fechamento rápido é, para este perfil, uma feature, não uma economia de escopo.

### Gestão de atenção

Minimizar demanda simultânea: não pedir para ouvir + ler + decidir ao mesmo tempo a menos que essa combinação seja literalmente o que o exercício testa (ex. `PredictThenVerifyEngine` legitimamente combina duas etapas, mas em fases sequenciais claras, não simultâneas). Ritmo iniciado pelo usuário por padrão; cronômetro só onde pedagogicamente justificado (modo prova).

---

## 12. Ansiedade social

Foco em Grupo D, mas a mesma lógica se estende a todo exercício de fala/exposição (Shadowing, ReadAloud, opinião gravada, Speech).

### Elementos que reduzem ansiedade

Ouvir/regravar ilimitado antes de enviar (já decidido) — controle do próprio ritmo de exposição é o princípio central de dessensibilização sistemática, e este é o exemplo mais direto de tradução de teoria clínica em decisão de produto já presente no projeto. Texto como padrão, voz como upgrade opt-in por sessão (já decidido) — mapeia diretamente para uma escada de exposição gradual real, não decorativa. Canais separados `showed_up`/`correction_json` (já decidido) — a decisão de design mais importante desta dimensão inteira do produto: ela evita que a coragem de tentar seja julgada pela mesma régua que julga erro de caso gramatical. Prévia de persona/cenário antes de começar (recomendado nesta análise, Seção 5/10) — previsibilidade reduz incerteza, e incerteza é o próprio combustível da ansiedade antecipatória. Avaliação só ao final da sessão de roleplay, nunca durante (já decidido em `docs/02`) — protegido pelo modelo de Clark & Wells: interromper a exposição com avaliação no meio reintroduz exatamente o ciclo de auto-observação que mantém a fobia social. Saída de baixo atrito, sempre visível, sem linguagem de fracasso (recomendado, Achado #13).

### Elementos que aumentam ansiedade (evitar)

Cronômetro regressivo em qualquer tarefa de fala fora do modo prova (já proibido, generalizado aqui). Voz forçada sem alternativa de texto. Estilo de erro vermelho/agressivo em tentativas faladas — mais custoso aqui do que em qualquer outro exercício do catálogo, porque a tentativa já era o ato de coragem. Ranking ou comparação de qualquer tipo (N/A, mas vale nomear porque reforça por que não reabrir a decisão). Intensidade de cenário não sinalizada antes de começar — escalar de coletiva de imprensa para tribunal sem aviso é o oposto de exposição graduada, é exposição por surpresa. Ausência de saída visível.

### Ordem ideal de exposição

A escada de 4 cenários (coletiva → tribunal → concorrente → interrogatório técnico) já proposta em `docs/03` deveria aparecer na UI como uma escada visual real (rungs), não uma lista/grade plana (Achado #8) — mas com um refinamento importante: os degraus deveriam ser visíveis e disponíveis, não bloqueados em ordem estrita. Em exposição terapêutica real, a hierarquia é um guia que o paciente usa para se desafiar progressivamente, não um portão que o sistema tranca — forçar sequência rígida reintroduz controle externo exatamente onde a autonomia (necessidade central da SDT, e também um fator protetor contra ansiedade de desempenho) deveria estar do lado do usuário. A recomendação é: ordem sugerida visualmente (degraus, do mais fácil ao mais difícil), navegação livre entre eles.

---

## 13. Auditoria de acessibilidade

Nenhum dos oito eixos abaixo aparece hoje em `docs/01`–`08` ou no schema (Achado #19) — a auditoria aqui é prescritiva (linha de base a adotar), fundamentada em WCAG 2.2 (nove critérios novos publicados em novembro de 2023, elevando o total de critérios testáveis de 78 para 87).

**Contraste**: mínimo AA — 4.5:1 para texto normal, 3:1 para texto grande e componentes de interface (WCAG 1.4.3/1.4.11), meta AAA (7:1) para corpo de texto onde viável, dado o padrão de uso noturno/cansado deste usuário específico.

**Tamanho de texto**: unidades relativas (rem), redimensionável até 200% sem quebrar layout (WCAG 1.4.4) — relevante mesmo em uso solo porque necessidade visual pode variar por sessão (cansaço, iluminação), não só por usuário.

**Foco**: indicador de foco visível em todo elemento interativo, nunca obscurecido por outro elemento (WCAG 2.4.7, e o novo 2.4.11 "Focus Not Obscured" do WCAG 2.2) — particularmente relevante se uso via teclado for comum em desktop, o que é plausível dado o perfil técnico do usuário.

**Navegação por teclado**: operabilidade completa por teclado (WCAG 2.1.1). Aplicação concreta e específica deste projeto: os componentes de reordenação por chip (`UnscrambleEngine` e família) já foram corretamente especificados como "clicar em vez de arrastar" por motivo de usabilidade touch — o mesmo design também resolve, de graça, o critério novo do WCAG 2.2 (2.5.7, "Dragging Movements", que exige uma alternativa a gestos de arrastar). Vale manter navegação por teclado (setas) como via adicional nesses componentes, não só clique.

**Leitores de tela**: HTML semântico, regiões `aria-live` para anúncio de feedback — importa mesmo em app solo porque há situações de uso não-visual reais (tela apagada, uso auditivo enquanto faz outra coisa) que não são hipotéticas para um app com tantos exercícios de áudio. Feedback que aparece só como cor/animação é invisível nesses momentos.

**Feedback multimodal**: nunca depender só de cor (WCAG 1.4.1) — já é regra recomendada no design system (Seção 6); para o `PhonemeDiffDisplay` especificamente, isso significa que a diferença fonética precisa de um equivalente textual/sonoro, não só a cor sobre o símbolo IPA.

**Tamanho de alvo de toque**: mínimo 24×24px CSS (WCAG 2.5.8, novo no 2.2) — relevante diretamente aos chips de reordenação e ao botão de gravar (que já deveria ser grande por Lei de Fitts, então este critério é satisfeito pela própria recomendação de hierarquia visual da Seção 7, não é um requisito adicional).

**Movimento/animação**: respeitar `prefers-reduced-motion` do sistema operacional, especialmente relevante porque efeitos de celebração existem no produto (mesmo desligados por padrão) e o perfil sensorial já documentado em `docs/03` justifica cautela extra com estímulo inesperado.

---

## 14. Roadmap priorizado

P0 = implementar imediatamente (dentro da Fase 9). P1 = muito importante. P2 = importante. P3 = opcional.

| Funcionalidade/UI | Impacto UX | Evidência | Complexidade | Prioridade |
|---|---|---|---|---|
| Design tokens (cor, tipografia, spacing) + `ExerciseShell` compartilhado | Evita 56 telas divergentes; base de tudo o resto | Achado #7; heurística de Nielsen #4 | Média | **P0** |
| `CompletionSignal` (sinal de conclusão imediato) | Regra já mandatória em `docs/03`, sem componente | Achado #1; delay aversion | Baixa | **P0** |
| `ShowedUpBadge` separado de feedback de correção | Decisão comportamental mais importante do produto, precisa de imposição visual, não só de schema | `CLAUDE.md`, regra explícita; Clark & Wells | Baixa-média | **P0** |
| `ReviewQueueSoftCount` (fila nunca em número bruto) | Evita gatilho de sobrecarga em todo retorno ao app | Achado #11; pesquisa de UI para TDAH | Baixa | **P0** |
| Casca de gravação (`ExerciseShell` variante fala) com replay ilimitado + revelação tardia do gabarito | Reusada por ~8 engines; é a superfície de maior risco emocional do produto | Achado da Seção 12; docs/08 | Média-alta | **P0** |
| `ImplementationIntentionCapture` + decisão de canal de lembrete | Maior retorno esperado segundo o próprio `docs/03` | Achado #3 | Média (depende de decisão de canal) | **P0** |
| Tokens de feedback tri-state globais (verde/âmbar, nunca vermelho puro) | Consistência entre 56 unidades construídas ao longo de 12 fases | Achado #18 | Baixa | **P0** |
| `ExposureLadder` + `TextVoiceToggle` + `ExitConversationAffordance` (Grupo D) | Maior risco de abandono por ansiedade mal gerida | Achados #8, #13; Seção 12 | Média | **P0** |
| `MasteryTrail` (trilha de tópicos como progresso central) | Dado já coletado (FSRS) sem interface; alavanca de competência/SDT | Achados #6, #17 | Média | **P1** |
| `PhonemeDiffDisplay` + tipografia IPA dedicada | Fonética é núcleo declarado do projeto; risco de carga visual alto sem tratamento | Achado #10 | Média-alta | **P1** |
| `BlockProgressBar` com affordance de pausa/retomada explícita | Mitiga o risco remanescente (visual, não de dado) do bloco de leitura | Achado #9 | Baixa-média | **P1** |
| Toggle "modo com apoio" / "modo prova" | Feature de preparação de prova sem nenhuma especificação hoje | Achado #5 | Média | **P1** |
| Estados de carregamento/"pensando" nomeados para correção e roleplay via LLM | Latência não especificada hoje; ambiguidade custa mais que espera visível | Seção 2, 11 | Baixa | **P1** |
| Linha de base de acessibilidade (contraste, foco, teclado nos componentes de chip) | Zero cobertura hoje; interesse próprio do usuário principal, não terceiros | Achado #19; Seção 13 | Média | **P1** |
| `SkipButton` de baixo atrito | Evita que aversão a um item vire abandono da sessão | Achado #15 | Baixa | **P1** |
| Tela Perfil & Motivo (motivo SDT + preferências) | Barato, ativa técnica de SDT já validada em `docs/03` | Achado #2 | Baixa | **P1** |
| `source_rule` exposto sob demanda em engines do Grupo A | Efeito de exemplo trabalhado (Cognitive Load Theory) hoje não aproveitado | Achado #16 | Baixa | **P1** |
| Streak com estado de "perdão" + framing de recorde pessoal | Mitiga risco de ansiedade/abandono tudo-ou-nada já documentado | Seção 9 | Baixa | **P2** |
| Tela de mineração de vídeo (anotação) | Ativa temptation bundling, já valorizado em `docs/03` | `docs/03` | Média | **P2** |
| Clique-para-definir inline em blocos de leitura/transcrições (pós-tentativa) | Sinergia com pipeline de léxico (Wiktionary) já planejado | Seção 8 (LingQ/Readlang) | Média | **P2** |
| Painel Progresso & Estatísticas (streak/XP, opt-in) | Deliberadamente secundário — não é tela de entrada | Seção 9 | Baixa-média | **P2** |
| Badges amarrados a marco real de maestria (nunca a frequência) | Só vale se ligado a dado real, não decorativo | Seção 9 | Baixa | **P2** |
| Telas Notebook/Referência pessoal | Baixo risco, baixo esforço, valor de utilidade direta | — | Baixa | **P2** |
| Efeitos de celebração (som/animação), opt-in | Já decidido como desligado por padrão; construir depois do essencial | `CLAUDE.md` | Baixa | **P3** |
| Exibição de XP (se mantida) | Só faz sentido depois que `MasteryTrail` já existe como métrica primária | Seção 9 | Baixa | **P3** |
| Onboarding formal | Usuário único, que é também o desenvolvedor — baixo valor incremental | — | Baixa | **P3** |
| UI de curadoria (`topic_template_map`, vídeo) | Ferramenta interna, não UX de aprendiz | `CLAUDE.md`, Fases 2 e 6 | Média | **P3** |

---

## Fontes

- [ADHD Accessibility: Enhancing Digital Inclusivity for Neurodiverse Users](https://accessiblyapp.com/blog/adhd-accessibility-enhancing-digital-inclusivity-for-neurodiverse-users/)
- [ADHD Accessibility — Building UIs That Work for Everyone](https://medium.com/@sterling.benjamin/adhd-friendly-ui-checklistadhd-accessibility-building-uis-that-work-for-everyone-including-me-61dbde186a42)
- [How to design for ADHD and neurodiversity in UX | Welcoming Web](https://welcomingweb.com/learn/designing-for-neurodiversity-adhd-ux)
- [The Principles of Neurodivergent UX Design](https://www.accessibilitychecker.org/blog/neurodivergent-ux-design/)
- [UI/UX for ADHD: Designing Interfaces That Actually Help Students](https://din-studio.com/ui-ux-for-adhd-designing-interfaces-that-actually-help-students/)
- [U.S. Access Board — W3C WCAG 2.2 Now Available](https://www.access-board.gov/news/2023/11/27/w3c-wcag-2-2-now-available/)
- [WCAG 2.2 New Success Criteria: Complete Implementation Guide](https://testparty.ai/blog/wcag-22-new-success-criteria)
- [What's new in WCAG 2.2 — TetraLogical](https://tetralogical.com/blog/2023/10/05/whats-new-wcag-2.2/)
- [Duolingo Gamification Strategy: A Full Case Study](https://trophy.so/blog/duolingo-gamification-case-study)
- [Duolingo's Shallow Learning Trap: Gamified Streaks, Harmful Habits](https://dev.to/yaptech/duolingos-shallow-learning-trap-gamified-streaks-harmful-habits-4134)
- [The Psychology of Gamification: Duolingo Case Study](https://www.ludaxis.io/blog/gamification-in-apps-duolingo-case-study-2026)
- [Align the Game to Your Aim: Gamification through the Lens of Self-Determination Theory](https://icenet.blog/2025/06/17/align-the-game-to-your-aim-considering-gamification-through-the-lens-of-self-determination-theory/)
- [The Dark Side of Gamification: When Points, Badges & Leaderboards Go Wrong](https://www.growthengineering.co.uk/dark-side-of-gamification/)
- [Gamification enhances student intrinsic motivation... meta-analysis and systematic review — Springer](https://link.springer.com/article/10.1007/s11423-023-10337-7)
- [Exposure hierarchy — Wikipedia](https://en.wikipedia.org/wiki/Exposure_hierarchy)
- [Exposure Therapy and Hierarchies | Social Anxiety Alliance UK](https://socialanxietyalliance.org.uk/exposure-therapy-and-hierarchies/)
- [Spaced Repetition Systems Have Gotten Way Better](https://domenic.me/fsrs/)
- [The FSRS Spaced Repetition Algorithm | RemNote Help Center](https://help.remnote.com/en/articles/9124137-the-fsrs-spaced-repetition-algorithm)
- [What spaced repetition algorithm does Anki use? — Anki FAQs](https://faqs.ankiweb.net/what-spaced-repetition-algorithm)
- [A Cohort Study Assessing the Impact of Anki as a Spaced Repetition Tool on Academic Performance in Medical School](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10403443/)
- [Busuu vs Babbel: Which Language App Wins?](https://testprepinsight.com/comparisons/busuu-vs-babbel/)
- [Language Learning Apps Comparison: What Actually Works](https://migaku.com/blog/language-fun/language-learning-apps-comparison)
- [How does ELSA's pronunciation feedback work?](https://elsaspeak.com/en/faqs/how-does-elsas-pronunciation-feedback-work)
- [Have you taken advantage of ELSA feedback?](https://blog.elsaspeak.com/en/advantage-of-elsa-feedback/)
- [Inclusive Typography: Fonts, Line Height, Spacing](https://www.disabilityworld.org/articles/inclusive-typography-and-readability/)
- [Best Fonts for Dyslexia: Research and Insights](https://developerux.com/2026/03/27/best-fonts-for-dyslexia-research-and-insights/)
- [Best fonts and text layouts for ADHD | iubenda](https://www.iubenda.com/en/help/184233-adhd-font-2/)
- [Liebowitz Social Anxiety Scale (LSAS): Optimal cut points for remission and response in a German sample](https://pubmed.ncbi.nlm.nih.gov/29430794/)
- [Liebowitz Social Anxiety Scale: Understanding This Assessment Tool](https://www.ampsych.com.au/blog/social-anxiety/liebowitz-social-anxiety/)

Literatura estrutural citada por nome sem link único (teoria estável, sem uma fonte web canônica verificada nesta sessão): heurísticas de usabilidade de Jakob Nielsen; Lei de Fitts; Lei de Hick; princípios de Gestalt (proximidade, figura-fundo); Cognitive Load Theory (Sweller, incluindo o efeito de exemplo trabalhado); Self-Determination Theory (Deci & Ryan); modelo cognitivo de fobia social (Clark & Wells, 1995); modelo de via dupla e delay aversion (Sonuga-Barke, 2002) — este último já citado com fonte em `docs/03`.
