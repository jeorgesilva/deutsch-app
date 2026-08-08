# 08 — Fonética e fala: comparação de fonemas e roleplay de voz (aprovado)

Responde três perguntas: como comparar a fala do usuário contra um alvo fonético e mostrar acerto/erro por fonema em IPA; de onde vêm os samples de áudio-alvo; e como orquestrar o roleplay de voz do Grupo D. Ver `docs/05-engines-por-exercicio.xlsx` linhas 114-118 para a especificação completa das engines novas, e `app/migrations/0001_init.sql` para o schema (`phoneme_scores`, `exercises.source_type`).

## Duas perguntas que exercícios de fala fazem — e por que a resposta técnica difere

1. **"Você disse as palavras certas?"** (correção lexical/gramatical) — resolvida por STT (`faster-whisper`) + os mecanismos de correção que já existem (`accepted_answers` determinístico ou rubrica LLM). Não precisa de engine nova, só um modal de entrada novo (voz) alimentando o que já está especificado.
2. **"Você pronunciou certo?"** (precisão fonética) — precisa de mecanismo novo: comparação de fonemas contra um alvo IPA. É o assunto principal deste documento.

As duas ficam facilmente confundidas porque as duas usam microfone — mas exercícios que só querem saber se a palavra certa foi dita não precisam do pipeline de fonemas.

## Pipeline de comparação de fonemas

**Passo 1 — gerar o alvo.** `phonemizer` (Python, backend `espeak-ng`) converte o texto de referência em IPA. Importante: usar especificamente o backend eSpeak (não `epitran` ou outra lib de G2P), porque é o mesmo esquema de fonemização usado pra treinar o modelo do Passo 2 — mantém os dois lados na mesma notação, evitando diff espúrio por convenção de símbolo em vez de erro real.

**Passo 2 — reconhecer o que foi dito.** Dois candidatos locais, sem custo recorrente:
- `facebook/wav2vec2-lv-60-espeak-cv-ft` — CTC treinado no Common Voice com rótulos fonêmicos via eSpeak, cross-lingual.
- `allosaurus` — reconhecedor de fones "universal" dedicado (2000+ idiomas, ~230 fones IPA), CLI/Python simples.

**Escolha por piloto empírico (Fase 8), não por documentação** — mesmo espírito da Fase 0 (motor de geração escolhido por taxa de erro observada, não por reputação do modelo). Gravar 5-10 amostras cobrindo os pontos de Alta prioridade da planilha de fonética, rodar os dois candidatos, comparar contra o que a Azure Pronunciation Assessment retornaria pras mesmas amostras (benchmark, não padrão), e só então decidir. `recognizer_model` fica registrado em `phoneme_scores` por linha justamente pra permitir essa comparação lado a lado.

**Passo 3 — diff fonema a fonema.** Alinhamento de sequência (edit distance) entre o alvo e o reconhecido → substituições/inserções/omissões, exibidas em IPA direto (sem "tradução" pra linguagem leiga, já que o usuário lê IPA).

Pipeline inteiro roda local — consistente com o motor 100% Ollama já decidido.

### Reforço pontual pros contrastes de Alta prioridade

Reconhecedor de fones generalista tende a errar exatamente nos contrastes mais sutis que a planilha PONS já prioriza: duração vocálica (Staat/Stadt) e arredondamento de Umlaut (ö/ü) são medidas contínuas (duração em ms, formantes F1/F2), não uma troca categórica limpa de fone. Reforço de fase 2 (não bloqueia o pipeline principal): `Parselmouth` (bindings Python pro Praat) medindo duração e formantes diretamente pra esses pontos específicos.

### Alternativas comerciais — benchmark, não padrão

| Serviço | Alemão suportado | Preço | Papel |
|---|---|---|---|
| Azure AI Speech — Pronunciation Assessment | Sim (de-DE, um dos 33 locales) | Batch grátis (só paga STT padrão); tempo real +US$0,30/hora | Benchmark de validação pontual |
| SpeechAce | Sim (confirmado nas páginas de teste multilíngue) | US$40/mês (5.000 requisições de 15s) + overage | Benchmark alternativo, focado em CAPT |

Nenhuma das duas vira padrão — rodar o pipeline local como principal, usar essas só pra validar se a versão local está "boa o suficiente" sem depender de API paga recorrente.

## De onde vêm os samples de áudio-alvo

**Não precisa de banco de dados externo pro caso principal.** Todo exercício do Grupo A (`ReadAloudEngine`, `SpokenGapFillEngine`) é gerado pelo pipeline (Ollama + KB), então a frase já é sobre o tópico certo por construção. O único passo que falta é rodar essa mesma frase pelo TTS (Piper, Fase 7) — o resultado é áudio-referência garantidamente no tema, porque veio da frase gerada a partir do `content_topic_id`/`phonetic_point_id`. O `DictationEngine` (item 28) já resolveu esse problema pra si mesmo; os exercícios de fala só reusam o mesmo áudio TTS, olhando pra ele como "gabarito de pronúncia" em vez de "o que digitar".

| Tipo de exercício | Fonte da frase-alvo | Fonte do áudio-alvo |
|---|---|---|
| `ReadAloudEngine`, `SpokenGapFillEngine` | Gerada pelo pipeline (Ollama + KB) | TTS (Piper) da mesma frase gerada |
| Shadowing (item 2) e Shadowing com correção (linha 117) | `video_clips` (autêntico) ou TTS — já assim no `docs/05`, mesma fonte pras duas variantes | O que já estiver em `video_clips`/`video_transcript_segments`, ou TTS |
| Shadowing de vocabulário isolado (linha 116) | Uma palavra do `lexicon` | TTS da palavra, ou Forvo (ver abaixo) |

**Bancos externos avaliados** — nenhum resolve o requisito de estar no tópico/regra certa, que é o que importa:
- **Tatoeba** — confirmado: ~13.400 frases em alemão têm áudio (de milhões), sem indexação por regra gramatical ou contraste fonético. Sorte, não busca garantida.
- **Forvo** — confirmado: API real, 6 milhões de pronúncias, 430+ idiomas incluindo alemão, filtrável por idioma/país/gênero/usuário. Indexado por **palavra isolada**, não frase — vale só como opção B pro shadowing de vocabulário isolado (pronúncia real de nativo em vez de TTS), mesma filosofia de "um recurso por necessidade" já usada no léxico.

## Inventário: onde a voz já entrava nos 113 itens anteriores

| Item | Nome | Voz é a resposta? |
|---|---|---|
| 2 | Shadowing | Sim — grava repetindo, ouve a si mesmo (sem correção automática, mantido); áudio-only, nunca vídeo, decidido mais simples e consistente entre fonte de vídeo e TTS |
| 5, 25 | Áudio de opinião / journal | Sim — grava 1-2 min |
| 7 | Speech/debate estruturado | Só se migrado pro Grupo D |
| 15, 43 | Podcast interpret / Interpretando | Opcional — texto ou gravação |
| 28, 29 | Dictation / Legendar podcast | **Não** — ouve áudio, mas digita |
| 41 | Dublagem | Sim — grava dublagem |
| 95-99, 103 | Contestação hostil / speech rápido | Opcional — texto padrão, voz upgrade |

Nenhum item fazia exatamente "ver texto → gravar lendo → feedback de pronúncia → ouvir gabarito depois" ou "gap-fill falado" — daí as engines novas.

## As cinco engines novas

Especificação completa em `docs/05` linhas 114-118. Resumo:

- **`ReadAloudEngine`** (linha 114) — nome e mecânica já estabelecidos na literatura de CAPT (TOEFL/PTE/Speechace chamam essa tarefa exata de "Read Aloud"). **Texto-primeiro**: vê a frase escrita, lê em voz alta. Difere do Shadowing por não precisar ouvir o áudio-alvo antes de falar — testa se o usuário infere a pronúncia certa a partir da ortografia. Usuário grava, pode ouvir/regravar à vontade antes de submeter, feedback com fonemas errados destacados, só então ouve o áudio-gabarito — transcrição/áudio de referência nunca aparece antes da tentativa, mesma regra do `docs/06`/`docs/07`.
- **`SpokenGapFillEngine`** (linha 115) — variante em voz do `GapFillGovernanceEngine` (item 9). Combina as duas perguntas do topo deste documento na mesma gravação: STT confere a palavra certa (mecanismo que já existe), pipeline de fonemas confere a pronúncia. As duas aparecem em blocos de feedback **separados**, nunca um score só — mesmo princípio de não misturar canais já usado em `showed_up`/`correction_json`.
- **Shadowing de vocabulário isolado** (linha 116) — mesma mecânica áudio-primeiro do item 2/117, numa palavra do léxico em vez de frase/trecho — caso mais fácil de pilotar primeiro (sem os problemas de coarticulação de fala conectada). Já nasce na variante com correção.
- **Shadowing com correção** (linha 117) — **áudio-primeiro**, igual ao item 2: toca o trecho, usuário grava repetindo, ouve a si mesmo. A única diferença do item 2: depois de se ouvir, vê a transcrição fonética do que falou comparada à transcrição-alvo, com as diferenças destacadas. Não substitui o item 2 — é uma segunda opção lado a lado, o usuário escolhe qual praticar.
- **Read Aloud de vocabulário isolado** (linha 118) — mesma mecânica texto-primeiro do item 114, numa palavra em vez de frase. Completa o par de granularidade que faltava: cada família (Shadowing áudio-primeiro, Read Aloud texto-primeiro) agora tem uma variante de frase e uma de palavra isolada.

Vale notar a distinção que separa `ReadAloudEngine` de `ShadowingEngine` — mais clara agora que as duas famílias têm as mesmas duas granularidades: a diferença nunca foi ter ou não correção, é a ordem — Shadowing sempre ouve o áudio-alvo primeiro e depois fala (mimetiza o som); Read Aloud sempre vê o texto primeiro e fala sem ouvir nada antes (produz a partir da ortografia). São habilidades diferentes, por isso duas famílias de engine, não uma com parâmetro:

| | Frase/trecho | Vocabulário isolado |
|---|---|---|
| **Áudio-primeiro** (Shadowing) | Item 2 (sem correção) / Item 117 (com correção) | Item 116 (com correção) |
| **Texto-primeiro** (Read Aloud) | Item 114 (com correção) | Item 118 (com correção) |

Nas duas variantes de vocabulário isolado (116 e 118), o IPA-alvo vem de `lexicon.ipa` (já curado via Wiktionary/wiktextract, ver léxico no `CLAUDE.md`) quando a palavra já estiver no léxico, com `phonemizer` como fallback só pra palavra ainda não catalogada — mais preciso que regerar via síntese de regras toda vez que a palavra já tem transcrição dicionarizada.

## Roleplay de voz do Grupo D — por que não CrewAI

CrewAI (e frameworks parecidos como AutoGen/AG2) orquestram **vários agentes autônomos com papéis diferentes** colaborando numa tarefa complexa compartilhada. O `HostileRoleplayEngine` não tem "crew" nenhuma — é um LLM assumindo uma persona fixa, conversando com uma pessoa. Não há tarefa pra decompor nem papéis pra coordenar. Usar CrewAI aqui importaria uma camada de orquestração (papéis, delegação, manager/worker) que não corresponde a nada que o exercício precisa.

A categoria certa de ferramenta, se um framework fosse necessário, é voice-agent (STT→LLM→TTS com turn-taking) — **Pipecat** é o mais maduro confirmado (open source, BSD-2, suporta Whisper local e qualquer LLM/TTS). Mas Pipecat é construído pra conversa em tempo real com interrupção tipo ligação telefônica — o Grupo D é exposição à ansiedade social, não simulação realista de ligação.

**Decisão: loop simples turn-based**, sem framework novo — grava → `faster-whisper` local transcreve → Ollama gera a resposta da persona → Piper sintetiza → toca → sua vez de novo. Consistente com o princípio já adotado de não investir engenharia desproporcional em camada secundária (mesmo raciocínio da gamificação), e com "não é infraestrutura de dia 1" (mesmo padrão usado pra adiar embeddings/vetores no léxico). Migrar pra Pipecat fica como opção futura, só se a experiência full-duplex virar necessidade real.

## Fase de trabalho

Adicionada como Fase 8 no `CLAUDE.md` (fonética e fala), entre TTS em lote (Fase 7) e o frontend mínimo (Fase 9, antiga Fase 8) — depende de TTS já existir pra gerar o áudio-gabarito, e informa como o modo de voz do Grupo D (Fase 11, antiga Fase 10) é implementado.
