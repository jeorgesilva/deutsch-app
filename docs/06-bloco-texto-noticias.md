# 06 — Bloco de leitura/notícia (aprovado)

Decomposição do item 16 original da planilha ("News / analysis / understanding / grammar / practice") num conjunto de 10 engines específicas, mais um modelo de dados de "bloco" que agrupa exercícios em torno de um texto-base. Aprovado a partir da análise de um pacote de referência da breakingnewsenglish.com (Sean Banville) fornecido pelo usuário. Ver `docs/05-engines-por-exercicio.xlsx` linhas 104-113 para a especificação completa de cada engine, e `app/migrations/0001_init.sql` para o schema (`reading_blocks`, `reading_block_items`).

## Por que decompor o item 16

Breaking News English publica, para cada notícia atual, um pacote de ~25 tipos de exercício em cima do MESMO texto-base, em 4 níveis de dificuldade. É o mesmo conceito do item 16 da planilha original — só que quebrado em módulos reais em vez de um item genérico só. Isso confirmou que o item 16 estava subespecificado: "análise/compreensão/gramática" misturados numa engine só (`OpenPromptEngine`) escondia pelo menos 9 mecanismos distintos que mereciam engine própria.

## Catálogo: sub-exercícios do documento de referência × cobertura no projeto

| Sub-exercício de referência | Mecanismo | Situação |
|---|---|---|
| Vocabulary Matching (palavra → definição) | Selecionar/ligar par correto | Lacuna nova → `MatchingEngine` |
| True/False (prever antes de ler) | Julgamento binário sobre afirmação | Lacuna nova → `TrueFalseEngine` |
| Synonym Match / Phrase Match | Matching, variante | Mesma lacuna de Vocabulary Matching, mesma engine |
| Gap Fill (com banco de palavras) | Preencher lacuna | Já coberto — `WordBankGuessEngine`/`GapFillGovernanceEngine` |
| Listening — Guess then check | Prever, depois confirmar ouvindo | Lacuna nova → `PredictThenVerifyEngine` |
| Listening — Gap fill | Preencher lacuna ouvindo | Já coberto — variante de `DictationEngine` |
| Comprehension Questions (abertas, ancoradas no texto) | Perguntas de fato, resposta curta | Lacuna nova → `ComprehensionQAEngine` (diferente do `OpenPromptEngine`, que é opinião livre) |
| Multiple Choice Quiz | Múltipla escolha sobre compreensão | Coberto por `ComprehensionQAEngine`/`PredictThenVerifyEngine` |
| Role Play / Student Survey / Discussion em pares / Warm-ups | Interação em grupo/dupla | Grupo C, fora de escopo, como o resto da planilha original |
| Spelling (anagrama dentro da palavra) | Reordenar letras de uma palavra | Lacuna nova → `LetterAnagramEngine` (diferente do `UnscrambleEngine`, que reordena palavras numa frase) |
| Put The Text Back Together | Reordenar frases/parágrafos | Lacuna de granularidade → `ParagraphOrderEngine`, variante do `UnscrambleEngine` parametrizada por granularidade |
| Put The Words In The Right Order | Reordenar palavras numa frase | Já coberto — `UnscrambleEngine` |
| Circle The Correct Word (par binário no texto corrido) | Escolha forçada entre 2 opções | Lacuna nova → `BinaryChoiceEngine` |
| Insert The Vowels | Preencher vogais faltantes | Lacuna nova → `VowelInsertEngine` |
| Punctuate + Add Capitals | Pontuação/maiúsculas num texto corrido | Lacuna nova → `PunctuationCapsEngine` |
| Put A Slash Where The Spaces Are | Segmentar um texto sem espaços | Lacuna nova, adaptada → `CompoundSegmentationEngine` |
| Free Writing / Academic Writing | Escrita aberta cronometrada | Já coberto — variante do `OpenPromptEngine` |
| Homework (pôster, carta, continuação) | Prompts de escrita criativa | Já coberto — mais variantes de prompt do `OpenPromptEngine` |
| Answers (gabarito) | — | Já coberto pelo conceito de `accepted_answers` |

## As três lacunas mais relevantes pro alemão

**`VowelInsertEngine`** (Insert The Vowels) foi adaptado pra treinar exatamente os pontos "Alta prioridade" da planilha de fonética — duração vocálica curta/longa (Staat/Stadt), Umlaute (ö/ü). Em vez de "insira a vogal que falta" genérico, gera pares mínimos propositais (mesma palavra-esqueleto, resposta diferente conforme o contexto da frase), puxando direto de `phonetic_points`.

**`PunctuationCapsEngine`** (Punctuate + Add Capitals) ativa duas regras da planilha de gramática que nenhuma engine usava até agora: Groß-/Kleinschreibung (maiúscula em todo substantivo — regra que o inglês nem tem, então o exercício fica genuinamente mais rico em alemão do que no original em inglês) e Kommaregeln (categoria 18, capítulos complementares PONS). Era uma lacuna dupla: faltava o tipo de exercício E o conteúdo da KB pra esses dois tópicos estava sem nenhuma engine associada.

**`CompoundSegmentationEngine`** (Put A Slash Where The Spaces Are, adaptado) não faz sentido copiado ao pé da letra pro alemão (que já usa espaço entre palavras normalmente). O princípio — segmentar uma sequência de letras em unidades menores — mapeia quase perfeitamente pra Komposita: "Taschenrechnerbatteriefachdeckel" → o usuário marca onde cada palavra-componente começa. Ativa o tópico Komposita da categoria 15 (Wortbildung), que também não tinha engine associada.

## Fontes de texto e estratégia de aquisição

Três fontes de texto em alemão, gratuitas, feitas especificamente para aprendizes (não notícia comum raspada — conteúdo já pensado pra reuso pedagógico):

- **DW "Top-Thema mit Vokabeln"** — notícia real reescrita em nível B1, com glossário de vocabulário embutido, texto + áudio, atualizado com frequência.
- **ZDF "logo!"** e **ZDF "Einfache News"** (zdfheute.de/einfache-news) — linguagem simples, texto disponível (não só vídeo).
- **Nachrichtenleicht (Deutschlandfunk)** — "primeira oferta abrangente de notícias em linguagem simples com padrão jornalístico profissional", atualizada de segunda a sexta, texto completo grátis.

Essas três fontes são de nível mais simples (B1 pra baixo) que o B2/C1+ do projeto — servem como MATÉRIA-PRIMA factual (fatos, vocabulário-base, estrutura de notícia), não como texto literal do exercício.

**Decisão adotada — nunca copiar/raspar texto literal.** O texto-base de cada `reading_block` é sempre gerado ORIGINAL pelo motor de geração do projeto (Ollama, já decidido em `docs/01`/`CLAUDE.md`), no nível B2/C1, citando a fonte real (`fonte_factual`, `fonte_url` em `reading_blocks`) como inspiração factual — nunca copiado. É exatamente a técnica que a própria breakingnewsenglish.com usa pra reciclar notícia real todo dia há mais de 20 anos sem problema de direito autoral: texto próprio, fontes citadas. Essa escolha também encaixa 100% na arquitetura de geração em lote que já existe — não precisa resolver licença de reuso de terceiro nenhuma.

## Modelo de dados: bloco e conclusão

`exercises` sozinha não tinha noção de agrupamento nem de ordem obrigatória. O modelo adotado:

- `reading_blocks` — o texto-base gerado, a fonte citada (`fonte_factual`, `fonte_url`), nível e tópico associado.
- `reading_block_items` — liga exercícios (das 10 engines novas) a um bloco, com `ordem` obrigatória.
- **Conclusão do bloco é calculada via query** (todo item filho com uma tentativa registrada em `attempts`) — não é um flag armazenado, evita inconsistência entre estado guardado e estado real.

Visualmente, isso vira uma tela de progresso do bloco (ex. barra "6 de 9 exercícios concluídos") em vez do padrão atual de servir um exercício solto por vez.

## Reconciliação com os princípios de `docs/03`

"Concluir todos os sub-exercícios do bloco pra receber a pontuação", se implementado do jeito errado, esbarra em dois princípios já fechados: um bloco de 9-10 exercícios sequenciais pode virar exatamente o tudo-ou-nada que o design evita, e esperar até o fim pra ter qualquer crédito reativa delay aversion (TDAH desatento).

**Mitigação adotada**: cada sub-exercício do bloco continua atômico, com feedback e crédito imediatos por si só (igual a qualquer outro exercício do app). A pontuação/conclusão de bloco é um bônus por cima disso, nunca a única fonte de crédito — dá pra parar no meio de um bloco e ainda ter ganho algo, retomando depois sem perder o que já foi feito.

## O que muda nos documentos do projeto

- `docs/05-engines-por-exercicio.xlsx` — linha 16 marcada como decomposta; linhas 104-113 com a especificação completa das 10 engines novas.
- `app/migrations/0001_init.sql` — tabelas `reading_blocks` e `reading_block_items`, mais índice `idx_reading_block_items_block`.
- `CLAUDE.md` — decisão registrada, contagem de atividades atualizada (103 → 113), nova Fase 5 no workflow, regra "não copiar/raspar texto literal" em "O que NÃO fazer".
- `docs/03-fundamentacao-comportamental.md` — adendo reconciliando pontuação de bloco com atomicidade/delay aversion.
