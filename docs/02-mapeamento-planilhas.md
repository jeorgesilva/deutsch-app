# Mapeamento das Planilhas Reais + Ferramentas por Tipo de Exercício

*Complementa `plano-arquitetura-app-alemao.md`. Baseado na leitura direta de `Planilha_Exercicios_C1plus.xlsx` (103 linhas), `Planilha_Fonetica_Pronuncia_Alema.xlsx` (26 linhas) e `Planilha_Gramatica_Alema_B2C1.xlsx` (100 linhas).*

## O que cada planilha realmente é

Isso muda a leitura do projeto: duas das três planilhas não são material a ser processado por um pipeline de geração — elas **já são a KB**, ou grande parte dela.

A planilha de gramática não é uma lista de tópicos pra alimentar geração — é a própria tabela `grammar_rules` quase pronta: 100 pontos gramaticais em 18 categorias (Wortpositionen, Konjunktiv II, Passiv, Präpositionen, Nebensätze, etc.), cada um já com regra explicada em português, exemplo real e fonte citada (*Grammatik aktiv B2-C1*, Cornelsen; PONS nos capítulos complementares). Isso é trabalho de curadoria que eu diria que é o maior gargalo do projeto — e já está feito.

A planilha de fonética é o mesmo tipo de achado: não é exercício, é a tabela de regras fonéticas — 26 pontos em 8 categorias, com uma coluna de prioridade **já personalizada pra você** (Alta/Média/Baixa), exemplos com pares mínimos e transcrição, e uma categoria inteira (8. *Pontos de atenção específicos — falante de português*) mapeando exatamente onde o português atrapalha o alemão: Knacklaut vs. sinalefa, r uvular vs. r vibrante, duração vocálica, Auslautverhärtung. Isso é ouro pra desenhar a correção de pronúncia — muito mais específico do que qualquer API genérica entregaria sozinha.

A planilha de exercícios é a única que é, de fato, uma lista de atividades — mas heterogênea, herdando de uma metodologia chamada "My Way" (originalmente parece ter raiz em ensino de inglês — várias atividades vêm de eslgames.com) adaptada pra alemão C1+, mais um "motor semanal" próprio, mais um baralho de gramática, mais uma extensão de role-plays hostis.

## O achado principal: nem todo exercício se multiplica por tópico gramatical

A ideia original — "todos os exercícios da lista, multiplicados por todos os tópicos, em várias variações" — faz sentido pra uma fração da planilha de exercícios, não pra ela inteira. Reclassifiquei as 103 linhas em 5 grupos pela forma de entrega real registrada na planilha:

| Grupo | Qtd. aprox. | Natureza | O que fazer com ele |
|---|---|---|---|
| **A — Templates reutilizáveis** | ~10 | Aplicáveis a qualquer tópico gramatical/fonético, corrigíveis por programa ou LLM | É aqui que "gerar múltiplas variações por tópico" se aplica de verdade |
| **B — Motor semanal (rotina)** | ~10 | Recorrentes, usam o tópico da semana como insumo, não se multiplicam por ele | Orquestração/agenda, não geração em massa |
| **C — Herdado de sala/grupo** | ~55-65 | "Sessão oral em grupo", jogos com dado/tabuleiro/cartelas, warmups de ESL genéricos, muitos sem ligação com um tópico B2/C1 específico | Majoritariamente **fora do escopo** de um app solo — ver nota abaixo |
| **D — Contestação/Speech** | ~7 | Desenhados como "sessão oral com tutor", mas são role-play adversarial | Ótimo caso de uso pra LLM fazendo o papel do interlocutor hostil |
| **E — Vídeo/cenas de filme** | ~8 | Dublagem, legendagem, mineração de vídeo, shadowing | Reaproveitam o mecanismo de vídeo do documento anterior |

O Grupo C é mais da metade da planilha (16 "jogos de grupo Warm Up Santa Maria" + 33 "warmup ideas" do eslgames.com + a maior parte de "Atividades em aula"). São atividades de sala de aula — Bingo, Hangman, "What do you know about bananas?", jogos que pedem dado/tabuleiro/múltiplos jogadores. Isso não é uma limitação do meu mapeamento, é a natureza do material: ele foi herdado de um método presencial/em grupo, e não tem ligação direta com um tópico gramatical específico do B2/C1 na maioria dos casos. Forçar isso num gerador "5 variações por tópico" não teria sentido pedagógico nem técnico. Minha recomendação é tratar esse grupo como **fora do escopo do app** por padrão — mantém como referência caso você volte a ter tutor/parceiro de estudo — e, se quiser, escolher a dedo 3-5 itens que valham a pena adaptar pra um parceiro de chat/voz por LLM (ex.: "Role play", "Situation", "Two truths and a lie" viram prompts de conversa solo razoavelmente bem).

## Grupo A — onde a geração rica por tópico realmente se aplica

| Template | Mecanismo de correção | Ferramenta |
|---|---|---|
| Completar lacunas com a regência correta | Determinística (JSON) | Função de matching própria |
| Transformação estrutural (ativa→Konjunktiv II, direta→indireta) | Determinística, com variantes aceitas | Função de matching própria |
| Reformulação para registro formal (Nominalstil) | Híbrida: forma-alvo determinística + fluência avaliada por LLM | Matching + LLM |
| Fill in the blanks / Guess (banco de palavras) | Determinística | Função de matching própria |
| Unscramble (reordenar frase) | Determinística — compara contra a ordem certa (ou ordens aceitas) | Função de matching própria |
| Dictation | Determinística (compara transcrição do usuário ao texto-fonte) | Whisper local pra transcrever, depois matching |
| Frases de transição/reação para opinião | Determinística com lista de variantes aceitas | Função de matching própria |

Com ~9-10 templates e 100 tópicos gramaticais + 26 fonéticos, a aplicação não é uma matriz densa — cada template só faz sentido pra um subconjunto de tópicos (ex.: "Transformação estrutural" cabe em Konjunktiv II/Passiv/Indirekte Rede/Umformung, não em Kommaregeln). Um passo de curadoria real é marcar, tópico por tópico, quais templates se aplicam. Isso deve dar algo como 100 tópicos × ~3 templates aplicáveis em média × 5 variações ≈ **ordem de 1.500 exercícios de drill**, bem menor e mais defensável do que a estimativa genérica do primeiro documento — e essa é a parte que realmente vale a pena gerar em massa.

### Exemplo concreto (dado real da sua planilha)

Tópico: *Verbposition in einfachen Sätzen* (categoria 1, B2/C1) — regra: "O verbo conjugado ocupa a posição II em orações declarativas principais." Exemplo-fonte: *Meine Schwester arbeitet seit zwei Jahren in Hamburg.*

Template: *Unscramble*. Uma variação gerada ficaria assim, como registro na tabela `exercises`:

```json
{
  "topic": "Verbposition in einfachen Sätzen",
  "template": "Unscramble",
  "variation": 3,
  "prompt_scrambled": ["seit zwei Jahren", "meine Schwester", "in Hamburg", "arbeitet"],
  "accepted_answers": ["Meine Schwester arbeitet seit zwei Jahren in Hamburg."],
  "source_rule": "O verbo conjugado ocupa a posição II em orações declarativas principais.",
  "generated_by": "modelo-do-piloto",
  "validation_status": "auto_ok"
}
```

O ponto importante aqui: a regra e o exemplo que já estão na sua planilha de gramática servem como **few-shot** no prompt de geração — o LLM não precisa "saber" a regra de cor, ele recebe a regra certa e um exemplo certo e só varia o vocabulário/contexto. Isso reforça exatamente o princípio do documento de arquitetura (KB como restrição, não como contexto solto), só que agora com dado real em vez de abstrato.

## Grupo B — motor semanal: rotina, não geração em massa

Leitner (revisão espaçada), shadowing, mineração de vídeo, parágrafo de opinião, áudio de opinião, sessão de correção com tutor/parceiro, speech/debate — esses sete giram toda semana em cima do tema da semana, não são multiplicados por tópico. Mapeamento:

- **Revisão Leitner** → isso é literalmente o mecanismo de progresso. Recomendo substituir o Leitner físico pelo FSRS digital (próxima seção) em vez de manter os dois sistemas em paralelo.
- **Shadowing / mineração de vídeo** → usam clipe de vídeo como estímulo (Grupo E).
- **Parágrafo de opinião / áudio de opinião** → escrita/fala aberta, correção por LLM com rubrica (tese → argumentos → contra-argumento → conclusão é literalmente uma rubrica pronta).
- **Sessão de correção com tutor/parceiro** → é a única que genuinamente exige um humano; não tem substituto de app razoável a não ser que você aceite uma versão mais fraca via LLM.
- **Speech/debate estruturado** → ótimo candidato a virar Grupo D (LLM no papel de interlocutor), se você topar abrir mão do tutor humano nessa etapa específica.

## Grupo D — contestação hostil: o melhor caso de uso pra LLM aqui

"Contestação hostil — Tribunal/Coletiva de imprensa/Concorrente hostil/Interrogatório técnico" e "Speech de posição atribuída" foram desenhados como sessão com tutor, mas tecnicamente são role-play adversarial — exatamente o tipo de coisa que um LLM em modo chat (texto ou voz) faz bem, com a vantagem de estar disponível a qualquer hora e poder variar o ângulo de ataque a cada sessão. Isso é um mecanismo técnico diferente dos outros dois (determinístico e LLM-rubrica): é uma **sessão multi-turno**, não uma correção de resposta única — o LLM recebe um system prompt fixando o papel (juiz hostil, jornalista cético, concorrente técnico) e mantém a pressão ao longo da conversa, com uma avaliação de fechamento (JSON) no final da sessão.

## Grupo E — vídeo e cenas de filme

Confirma o que o documento de arquitetura já cobria: os clipes (ZDF/DW no YouTube, ou cenas de filme) não precisam ser baixados nem armazenados, só o link + timestamp. A correção do que o usuário produz em cima do vídeo (dublagem, legendagem, resposta de compreensão) cai nos mesmos dois mecanismos — determinístico se a pergunta é fechada, LLM se é produção aberta. Risco de manutenção a registrar: link do YouTube pode sair do ar ou ter embed desabilitado — é curadoria contínua, não falha de arquitetura.

## Pronúncia: sua planilha de fonética já é a rubrica

Em vez de mirar um score de pronúncia genérico, a lista de prioridade "Alta" da sua própria planilha já é o checklist certo pra verificar especificamente nos áudios de shadowing/ditado/opinião gravada: duração vocálica curta vs. longa (Staat/Stadt), Umlaute (ö/ü), ich-Laut vs. ach-Laut, Auslautverhärtung (b/d/g→p/t/k no final), r uvular (vs. o r vibrante do português), Knacklaut antes de vogal tônica (vs. a sinalefa do português), acento em compostos e em verbos separáveis, e os padrões de entoação (Fallende/Steigende Intonation, Fokusakzent).

Caminho pragmático em camadas, do mais simples ao mais completo:

1. **Whisper local (grátis)** transcreve o áudio gravado e compara com o texto-alvo — pega erro grosseiro (palavra errada, omissão).
2. **API de avaliação de pronúncia** — Azure Speech Pronunciation Assessment cobre alemão (extensão de cobertura pra 33 locales além do inglês) e dá score por fonema/fluência; SpeechAce e SpeechSuper são alternativas dedicadas com demo específico de alemão. Nenhuma tem tier gratuito confirmado com certeza — vale checar na hora de implementar.
3. **Camada de regras específicas** por cima do resultado da API, checando pontualmente os itens "Alta" da sua planilha (ex.: se o tempo do fonema final de uma palavra como "Tag" bate com [k] em vez de [g]) — constrói uma rubrica muito mais alinhada ao que você realmente precisa treinar do que um score genérico "quão nativo você soou".

Construir avaliação fonética própria do zero (tipo Montreal Forced Aligner + modelo acústico) é um projeto de processamento de fala à parte — vale citar como possibilidade, mas eu não entraria por aí antes de testar se a camada 1+2 já resolve.

## O que falta pra KB: principalmente o léxico

Com gramática e fonética já cobertas pelas suas próprias planilhas, a lacuna real é a tabela `lexicon` — palavra por palavra, com gênero, plural, nível CEFR, frase de exemplo. Recursos prontos que evitam montar isso do zero:

- **VocabForge** (GitHub, `Adityav20/vocabforge-cefr-german`) — extrator de vocabulário alemão por nível CEFR (A1-C2) a partir de PDF/DOCX/PPTX, usando um pipeline de spaCy alemão, já estruturado com artigo+substantivo, verbo no infinitivo, saída em CSV. Dá pra rodar direto contra as listas oficiais do Goethe-Institut (Wortliste Start Deutsch A1/A2, Zertifikat B1) pra gerar a base do léxico.
- **Wiktionary alemão** (via `wiktextract`) — dump estruturado com gênero, plural, IPA e traduções, cobertura bem maior que qualquer lista fechada.
- **UniMorph** — banco de paradigmas morfológicos (conjugação/declinação) multilíngue, útil pra popular formas flexionadas automaticamente.
- **Falko-MERLIN + `MRNH/mbart-german-grammar-corrector`** (Hugging Face) — corpus de erros reais de aprendizes de alemão e um modelo já treinado nele pra correção gramatical; serve como segundo validador independente do LanguageTool, ou até como motor alternativo pra correção da escrita criativa.
- **Tatoeba** — frases de exemplo traduzidas, geradas por comunidade, boa fonte adicional de exemplo natural por palavra.

Sobre a ideia de explorar Roboflow: não é um bom encaixe aqui — é uma plataforma de dataset/anotação de visão computacional (imagem), não de recursos linguísticos/texto. Hugging Face Datasets é o equivalente certo pra esse tipo de busca.

## Progresso: FSRS

Confirmando a atualização já feita no documento de arquitetura: **FSRS** (Free Spaced Repetition Scheduler) é o algoritmo certo pra substituir o Leitner físico do motor semanal — é o que o Anki usa desde 2023, modela a curva de esquecimento melhor que SM-2, e tem implementação pronta (`py-fsrs`, também há versões em JS/Go/Rust) já pensada pra ser embutida em apps de flashcard/estudo. O parâmetro `desired_retention` (0-1) define a taxa de retenção alvo e o próprio pacote calcula o intervalo ótimo de revisão — não precisa reimplementar a lógica.

## Gamificação: o que funciona sem outros usuários

Como o uso é solo, mecânicas que dependem de outras pessoas (ligas, leaderboard, quests com amigos) não se aplicam diretamente. As que funcionam bem sozinhas, e que aparecem consistentemente como as de maior efeito em apps como Duolingo: streak (sequência de dias, o gatilho de engajamento mais forte sozinho), XP/pontos por sessão, níveis/badges por marco atingido, e uma visualização tipo "trilha de tópicos" (skill path) mostrando o que já foi dominado — isso, aliás, casa muito bem com a tabela de progresso por tópico que o FSRS já vai manter. Dá pra simular o efeito social com "bata seu recorde da semana passada" em vez de leaderboard contra outras pessoas. Referência de framework pra pensar nisso com mais profundidade: Octalysis (Yu-kai Chou) organiza gamificação em "core drives" e ajuda a escolher quais mecânicas fazem sentido pro seu caso especificamente solo.

## O que ajudaria a fechar isso

Três decisões ainda estão em aberto: se algum item do Grupo C vale a pena adaptar pra LLM-parceiro em vez de descartar; se o Grupo D (contestação hostil) deve ser por texto ou por voz; e se o motor semanal (Grupo B) entra na v1 do app ou fica pra depois, priorizando primeiro os templates do Grupo A que geram o volume principal de prática.

## Fontes

- [Language and Voice Support for Azure Speech | Microsoft Learn](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support)
- [Use pronunciation assessment | Microsoft Learn](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment)
- [Speechace | Pronunciation and Fluency Assessment API](https://www.speechace.com/api-plans/)
- [German Pronunciation Assessment API | SpeechSuper](https://www.speechsuper.com/demo/german/index.html)
- [VocabForge CEFR German extractor (GitHub)](https://github.com/Adityav20/vocabforge-cefr-german)
- [german_common_crawl · Hugging Face](https://huggingface.co/datasets/german-nlp-group/german_common_crawl)
- [coral-nlp/german-commons · Hugging Face](https://huggingface.co/datasets/coral-nlp/german-commons)
- [MRNH/mbart-german-grammar-corrector · Hugging Face](https://huggingface.co/MRNH/mbart-german-grammar-corrector)
- [UniversalCEFR · Hugging Face](https://huggingface.co/UniversalCEFR)
- [py-fsrs (GitHub)](https://github.com/open-spaced-repetition/py-fsrs)
- [Open Spaced Repetition](https://open-spaced-repetition.github.io/)
- [awesome-fsrs (GitHub)](https://github.com/open-spaced-repetition/awesome-fsrs)
- [10 Best Gamified Learning Apps — Yu-kai Chou / Octalysis](https://yukaichou.com/gamification-examples/10-best-gamification-education-apps/)
- [Duolingo's Gamification Secrets](https://www.orizon.co/blog/duolingos-gamification-secrets)
- [Streaks and Milestones for Gamification in Mobile Apps](https://www.plotline.so/blog/streaks-for-gamification-in-mobile-apps)
