# Plano de Arquitetura: App de Aprendizado de Alemão

*Contexto assumido: geração de exercícios em lote via IA sobre uma base curada de vocabulário/gramática alemã; frontend em Cloudflare Pages; uso solo; escala média (~35 tópicos de conteúdo × ~22 tipos de exercício × 5 variações, por volta de 3.850 exercícios de texto); mídia (áudio/imagem) precisa ser gerada do zero.*

## O reframe central

A palavra "hercúlea" está certa, mas mirando o gargalo errado. Gerar milhares de exercícios não é o problema difícil — é um job em lote, que roda uma vez, offline, com custo (dinheiro e tempo) bem menor do que parece. O trabalho difícil de verdade tem três partes: curar uma base de conhecimento (KB) que representa a gramática alemã sem ambiguidade; construir um jeito de verificar que cada exercício gerado está gramaticalmente correto antes de confiar nele; e desenhar um modelo pedagógico — o que fazer com o histórico de acertos e erros. Sem isso, milhares de exercícios são só um monte de conteúdo, não uma ferramenta de aprendizado.

Isso muda a ordem de prioridades: antes de escrever uma linha de frontend, o projeto vive ou morre na qualidade da KB e do harness de validação.

## O motor de IA: Teuken-7B vs. API paga, decidido com um piloto barato

Teuken-7B é real e é uma escolha razoável em tese: um modelo de 7B parâmetros do consórcio OpenGPT-X/Fraunhofer, treinado com ~50% de dados não ingleses, cobrindo as 24 línguas da UE, com variantes sob licença Apache 2.0 (comercial), licença de pesquisa e CC BY-NC 4.0. A versão base roda em GPU com ~15GB de VRAM. Um dado relevante para o seu planejamento: em janeiro de 2026 a Deutsche Telekom anunciou o projeto SOOFI, sucessor de 100B parâmetros do Teuken — o próprio ecossistema que o criou já trata essa geração como transição, não como estado da arte definitivo.

Isso não desqualifica o Teuken, mas muda o cálculo de escolha. Como a geração de exercícios é um processo em lote — você gera uma vez, valida, e guarda o resultado, não é uma chamada por usuário em tempo real — a pergunta certa não é "qual modelo é barato para servir em escala", é "qual modelo produz texto confiável o bastante para eu não precisar revisar cada frase à mão". Nesse critério, um modelo generalista de 7B tende a errar mais em nuances de caso, declinação e regência do que um modelo de fronteira (Claude, GPT, Gemini) chamado via API — exatamente o tipo de erro mais caro de deixar passar, já que você está aprendendo alemão a partir desse material.

Sobre a sua condição ("se a API maior for gratuita, uso ela; senão, self-hosted"): vale notar que nenhuma das duas é estritamente grátis, a não ser que você já tenha uma GPU própria com uns 16GB de VRAM — aí self-host custa só eletricidade. Se você não tem, self-host significa alugar GPU por hora, o que também custa dinheiro e ainda soma complexidade operacional (setup, monitoramento, throughput menor). A opção mais próxima de "gratuita e sem infraestrutura" costuma ser o tier gratuito de APIs como o Gemini — tem cota diária de requisições, mas para o volume estimado aqui pode ser suficiente, mesmo que leve alguns dias corridos em vez de horas.

Recomendação prática: antes de comprometer a arquitetura, rode um piloto de um único tópico com todos os tipos de exercício (20-30 itens) testando vários motores em paralelo, sem gastar nada. Rodando local via Ollama (o mais simples de todos: sem setup de nuvem, roda na sua própria máquina), o candidato mais forte é o **Mistral Small** — entre os modelos abertos, a Mistral é consistentemente a que mais se destaca em qualidade de francês/alemão/italiano/espanhol, porque concentra capacidade num conjunto menor de línguas europeias em vez de diluir entre 24 como o Teuken. Vale testar também Llama 3.3 e Gemma via Ollama (`ollama pull mistral-small`, `ollama pull llama3.3`, `ollama pull gemma4`) — trocar de modelo é uma linha de comando. Adicione Teuken via Google Colab (GPU T4 gratuita) ou Hugging Face Spaces, e o modelo maior via tier gratuito de API, ao mesmo comparativo. Como é geração em lote, não interativa, até hardware modesto resolve — pode rodar de um dia para o outro, então velocidade de inferência importa menos do que taxa de erro. Passe todos os lotes pelo LanguageTool (cobertura sólida de alemão) e compare taxa de erro gramatical. Decida com dado na mão, não com preferência a priori.

Um ponto de atenção comum a **qualquer** modelo nessa faixa de tamanho (7B-13B, quantizado para rodar local): mesmo o melhor deles ainda erra em nuances de declinação/regência de caso com frequência não desprezível. Isso não descarta o Ollama — só reforça que a arquitetura de KB como restrição determinística (próxima seção) não é opcional, é o que faz qualquer um desses motores ser confiável na prática.

## A peça que mais importa: tratar a KB como restrição, não como contexto solto

O maior risco conceitual do plano como está desenhado hoje é dar ao LLM a responsabilidade de "saber gramática alemã" a partir de uma KB usada como contexto solto (RAG tradicional). Isso ainda deixa o modelo livre para errar declinação, gênero ou regência de caso — justamente os pontos onde o alemão mais pune erro sutil.

A alternativa mais robusta é modelar a KB como dados estruturados e determinísticos — uma tabela de léxico com gênero, plural e nível CEFR já corretos; uma tabela de regras gramaticais com os padrões de declinação e conjugação já corretos — e deixar que um programa, não o LLM, escolha a forma gramatical certa a partir dessas tabelas. O papel do LLM vira gerar variação natural de frase, contexto e distratores plausíveis em cima de peças que já estão certas por construção. Isso troca "o LLM precisa saber alemão perfeitamente" (arriscado) por "o LLM precisa escrever frases fluentes dado um esqueleto já correto" (muito mais confiável), com a validação automática como rede de segurança, não como única linha de defesa.

## Geração de mídia (áudio e imagem)

Como tudo precisa ser gerado do zero, vale o mesmo princípio: é lote, não serviço em tempo real, então dá para usar a opção mais barata sem perda perceptível de qualidade. Para áudio em alemão, Piper TTS (open-source, roda local, vozes alemãs razoáveis) tem custo de API zero — só tempo de processamento. Alternativas pagas (Google Cloud TTS, Azure, ElevenLabs) custam poucos dólares para o volume estimado aqui, com vozes mais naturais. Sugiro começar sem geração de imagem: adiciona custo e complexidade sem, a essa altura, mudar muito o valor pedagógico do exercício. Trate como uma etapa posterior, só se fizer falta na prática.

## Armazenamento: o que a Cloudflare realmente oferece

Vale corrigir uma premissa antes de seguir: a Cloudflare não hospeda Postgres nativamente. O D1 (nativo, baseado em SQLite) é o banco "de verdade" da Cloudflare; o Hyperdrive não é um banco — é um acelerador e pool de conexão para um Postgres ou MySQL hospedado em outro lugar (Neon, Supabase, RDS etc.). "Postgres no próprio Cloudflare" não existe hoje como produto único.

Para o seu caso isso é uma boa notícia, não um problema: o D1 sozinho resolve. O tier gratuito inclui 5GB de armazenamento e algo como 150 milhões de leituras e 3 milhões de escritas por mês — muito acima do que alguns milhares de exercícios mais histórico de progresso de um único usuário vão gerar. Não há motivo prático para trazer um Postgres externo, com a complexidade de mais um provedor, para este projeto.

Para mídia, o candidato mais simples é o R2 (armazenamento de objetos nativo da Cloudflare, sem taxa de egress, acessível direto de Workers sem OAuth). O Google Drive funciona, mas adiciona uma camada de autenticação OAuth só para servir arquivo estático, e historicamente tem limites de download direto quando um arquivo é acessado muitas vezes seguidas — irrelevante em uso solo de baixo volume, mas ainda assim é complexidade extra sem benefício claro, a não ser que o motivo de usar o Drive seja especificamente "quero navegar e gerenciar os arquivos manualmente pela interface dele". Se for esse o motivo, é uma troca legítima e vale manter.

## Validação: o que "acurácia" precisa significar na prática

"Gerar com acurácia" precisa de um critério mensurável, senão não dá para saber quando o pipeline está bom o suficiente. Três camadas fazem sentido aqui. A primeira é verificação determinística — o gabarito do exercício bate com o que a KB diz que é correto, o que só é possível se a geração for restringida como descrito acima. A segunda é rodar o LanguageTool (self-hosted ou via API, com cobertura boa de alemão) em cima de todo texto gerado, sinalizando qualquer coisa fora do esperado. A terceira é amostragem humana — com um alerta honesto: como você está aprendendo alemão, revisar sua própria amostra tem um ponto cego óbvio, o erro que você ainda não sabe reconhecer como erro. Vale considerar uma revisão paga pontual de uma amostra pequena (5-10%) por alguém fluente, via alguma plataforma de freelancer, como camada final antes de confiar no lote inteiro.

## A peça ausente: modelo pedagógico de progresso

O plano original define onde salvar progresso (Drive + banco), mas não o que rastrear. Guardar arquivo é infraestrutura, não é a parte pedagógica. Para o conteúdo realmente ensinar, cada exercício precisa de um registro de desempenho por item — acertos, erros, última vez visto — alimentando um algoritmo de repetição espaçada. Recomendo **FSRS** em vez do SM-2 clássico: é o algoritmo que o próprio Anki usa desde 2023, modela a curva de esquecimento de forma mais precisa, e já tem implementação pronta em Python (`py-fsrs`) — não precisa ser escrito do zero. Detalhes no documento `ferramentas-e-referencias-tecnicas.md`. Sem isso, o app é uma pilha de exercícios; com isso, é uma ferramenta adaptativa de verdade. Vale tratar isso como parte do escopo central, não como um extra para depois.

## Autenticação, dado que é uso solo

Como é só para você, não vale construir sistema de login. O Cloudflare Access (parte do Zero Trust, gratuito para poucos usuários) coloca uma trava de e-mail ou login Google na frente do Pages sem escrever nenhuma linha de autenticação — resolve "não deixar público" com esforço de engenharia praticamente zero.

## Gargalos identificados

**Curadoria da KB.** É o item que mais consome tempo humano no projeto inteiro — não existe atalho de IA que substitua decidir, palavra por palavra e regra por regra, qual é a forma correta.

**Harness de validação.** Construir a verificação determinística mais o LanguageTool mais a amostragem é trabalho de engenharia real, maior do que escrever os prompts de geração em si.

**Revisão em escala.** Com milhares de exercícios, revisão 100% manual é inviável. A mitigação é a validação automática cobrir o volume inteiro e a amostragem humana cobrir a confiança.

**Throughput de API/GPU em lote.** Tiers gratuitos têm cota diária de chamadas; se o volume estourar a cota, a geração se estende por dias em vez de horas. Não é bloqueante, só precisa entrar no cronograma.

**Reconciliação de duas fontes de mídia**, caso mantenha Google Drive junto com o banco — cada exercício precisa de um ID estável apontando para o arquivo certo, com permissão de compartilhamento configurada corretamente, ou o áudio simplesmente não carrega no app.

## Falhas conceituais e estruturais identificadas

**Motor de IA dimensionado para o problema errado.** Teuken-7B foi cogitado com a lógica de "modelo pequeno e barato para servir em escala", mas a arquitetura real não serve nada em tempo real — gera uma vez, offline. O critério certo de escolha é acurácia por chamada, não custo de inferência em produção.

**"Postgres no próprio Cloudflare" não existe como produto.** D1 (SQLite) é o banco nativo; Postgres exigiria um provedor externo mais Hyperdrive. Para este projeto, D1 sozinho é suficiente e mais simples.

**LLM como fonte da verdade gramatical.** Pedir para o modelo "saber" gênero, caso e conjugação a partir de contexto solto é o padrão de RAG que mais falha em línguas com declinação rica. A KB deveria parametrizar a resposta certa deterministicamente; o LLM só varia a forma.

**"Acurácia" sem critério de aceite.** Sem uma definição mensurável — taxa de erro do LanguageTool, percentual de amostra revisada — não existe jeito de saber quando o pipeline está pronto, só a sensação de "parece bom".

**Progresso definido só como local de armazenamento.** Onde salvar (Drive/D1) é infraestrutura; o que rastrear e como decidir o que reaparecer (repetição espaçada) é o modelo pedagógico, e está ausente do plano original.

## Esquema de dados (rascunho, compatível com D1/SQLite)

```sql
CREATE TABLE lexicon (
  id INTEGER PRIMARY KEY,
  lemma TEXT NOT NULL,
  pos TEXT NOT NULL,
  gender TEXT,
  plural TEXT,
  cefr_level TEXT,
  example_sentence TEXT,
  audio_ref TEXT
);

CREATE TABLE grammar_rules (
  id INTEGER PRIMARY KEY,
  rule_type TEXT,
  pattern TEXT,
  applies_to TEXT,
  cefr_level TEXT
);

CREATE TABLE content_topics (
  id INTEGER PRIMARY KEY,
  name TEXT,
  cefr_level TEXT
);

CREATE TABLE exercise_types (
  id INTEGER PRIMARY KEY,
  name TEXT,
  template TEXT,
  requires_audio BOOLEAN
);

CREATE TABLE exercises (
  id INTEGER PRIMARY KEY,
  topic_id INTEGER REFERENCES content_topics(id),
  exercise_type_id INTEGER REFERENCES exercise_types(id),
  variation_number INTEGER,
  prompt TEXT,
  correct_answer TEXT,
  distractors TEXT,
  audio_ref TEXT,
  validation_status TEXT,
  generated_by TEXT,
  created_at TEXT
);

CREATE TABLE progress (
  id INTEGER PRIMARY KEY,
  exercise_id INTEGER REFERENCES exercises(id),
  last_seen_at TEXT,
  next_review_at TEXT,
  ease_factor REAL,
  correct_streak INTEGER,
  total_attempts INTEGER,
  total_correct INTEGER
);
```

## Matemática de escala (estimativa)

Com ~35 tópicos × ~22 tipos de exercício × 5 variações, o total fica perto de 3.850 exercícios de texto. É uma estimativa grosseira, mas dá a ordem de grandeza: geração via API paga barata deve ficar na casa de poucos a algumas dezenas de dólares, uma única vez; via tier gratuito, custo zero, ao preço de levar alguns dias em vez de horas; áudio via Piper local, custo zero de API. Nenhum desses números é o fator limitante do projeto — o tempo de curar a KB e revisar amostras é.

## Plano de ação

1. **Piloto de decisão (1-2 dias).** Gerar 20-30 exercícios de um único tópico com pelo menos três motores — Mistral Small (e opcionalmente Llama 3.3/Gemma) via Ollama local, Teuken (via Colab/HF gratuito) e um modelo maior via API gratuita; validar todos com LanguageTool; decidir o motor de geração com dado na mão.
2. **Curar a KB mínima viável.** Estruturar léxico e regras gramaticais para os tópicos das planilhas — reservar a maior parte do tempo do projeto aqui, é o gargalo real.
3. **Schema e harness de validação.** Criar as tabelas no D1; implementar a checagem determinística mais a integração com LanguageTool.
4. **Pipeline de geração em lote.** Rodar a geração completa de texto para todos os tópicos × tipos × variações, com log de validação por item.
5. **Mídia.** Rodar TTS em lote sobre os exercícios que precisam de áudio; adiar imagem para depois.
6. **Frontend.** Cloudflare Pages mais Workers/Pages Functions consumindo o D1 e o R2, atrás do Cloudflare Access.
7. **Modelo pedagógico.** Implementar repetição espaçada (FSRS via `py-fsrs`) sobre a tabela de progresso e usar isso para decidir a ordem dos exercícios exibidos.
8. **Amostragem humana e ajustes.** Revisar uma amostra — idealmente com apoio externo fluente —, corrigir a KB onde necessário, e só então considerar o conteúdo pronto.

## O que ajudaria a refinar isso

Duas coisas tornariam este plano bem mais preciso: as colunas reais das duas planilhas (nomes dos tipos de exercício e dos tópicos, mesmo que só uma amostra) e confirmar se você já tem alguma GPU própria — isso resolve de vez a escolha do motor de IA.

## Fontes

- [Best Open Source LLM 2026: GLM-5, Qwen 3.5, Llama 4 Compared](https://datavlab.ai/post/best-open-source-llm-2026-decision-framework)
- [DeepSeek, Qwen, Mistral, Gemma or Llama: Which Open-Weight Model Should a Pleb Self-Host?](https://d-central.tech/best-local-llm-2026-pleb-open-weight-model-guide/)
- [Ollama Models Cheat Sheet 2026 | ComputingForGeeks](https://computingforgeeks.com/ollama-models-cheat-sheet/)
- [mistral-small · Ollama library](https://ollama.com/library/mistral-small)
- [Best Ollama Models 2026: 25+ Ranked by VRAM & SWE-Bench | Morph](https://www.morphllm.com/best-ollama-models)
- [Teuken-7B - Global AI Ecosystem Database](https://megatek.ai/en/model/teuken-7b/)
- [openGPT-X/Teuken-7B-instruct-commercial-v0.4 · Hugging Face](https://huggingface.co/openGPT-X/Teuken-7B-instruct-commercial-v0.4)
- [openGPT-X/Teuken-7B-instruct-research-v0.4 · Hugging Face](https://huggingface.co/openGPT-X/Teuken-7B-instruct-research-v0.4)
- [OpenGPT-X: Teuken 7B - Fraunhofer IAIS](https://www.iais.fraunhofer.de/en/industries_and_cross-sector_solutions/cross-sector_solutions/generative-ai/opengpt-x.html)
- [Teuken 7B Base V0.6 by openGPT-X — LLM Explorer](https://llm-explorer.com/model/openGPT-X%2FTeuken-7B-base-v0.6,4vBJuTzCfJmoPIiwiU0V2R)
- [European LLMs in 2026: The Complete Map - MRKT3.0](https://mrkt30.com/european-llms-2026-map/)
- [Cloudflare D1 Pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [Cloudflare Hyperdrive Pricing](https://developers.cloudflare.com/hyperdrive/platform/pricing/index.md)
- [Cloudflare D1 product page](https://www.cloudflare.com/developer-platform/products/d1)
