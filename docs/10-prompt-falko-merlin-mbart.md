# Prompt: integrar Falko-MERLIN + mBART-GEC (rodar só depois de todas as fases 0-12 aprovadas)

Cole este texto como mensagem pro Claude Code, depois de abrir o repositório (`cd deutsch-app && claude`) — mas só quando todas as fases já listadas em `CLAUDE.md` (0 a 12) estiverem prontas e aprovadas. É trabalho adicional sobre um pipeline já estável, não substitui nem depende de nenhuma fase em andamento. Antes de colar, confirme que ainda é isso que você quer priorizar — bastante coisa pode ter mudado no código entre agora e "todas as fases prontas".

---

Leia `CLAUDE.md` inteiro primeiro, se ainda não tiver lido nesta sessão. O que vem abaixo é um pacote de melhorias pra confiabilidade do harness de validação e da geração, usando dois recursos externos gratuitos. Como isso foi escrito ANTES das fases 5-12 rodarem, releia o estado atual de `pipeline/src/deutsch_pipeline/validation/harness.py`, `validation/rule_adherence.py` e `generation/model_routing.py` antes de assumir que qualquer detalhe técnico abaixo ainda bate 1:1 com o código — trate os trechos citados aqui como referência do estado em 2026-08, não como verdade atual garantida.

## Os dois recursos

**Falko-MERLIN**: corpus de aprendizes de alemão, ~24 mil frases, níveis A1-C2, com erros anotados automaticamente via uma adaptação do ERRANT pro alemão (Boyd 2018, 21 categorias de erro, 15 baseadas em tag de POS). Licença CC BY-SA 4.0 — uso livre, exige atribuição, e qualquer redistribuição de material DERIVADO do corpus precisa manter a mesma licença. Baixável via Eurac Research CLARIN Centre Repository.

**MRNH/mbart-german-grammar-corrector** (Hugging Face): mBART-50, 610M parâmetros, free, treinado especificamente no Falko-MERLIN pra correção gramatical de alemão. Leve o suficiente pra rodar local sem quantizar (~1-2GB em fp16) — não é o mesmo problema de memória que o EuroLLM-22B foi.

**Limitação importante que vale pra quase tudo abaixo**: esse modelo (e GEC de um modo geral) pega erro gramatical GERAL — concordância, ordem de palavra, artigo errado. Ele NÃO resolve o padrão específico que motivou esse trabalho (documentado em `CLAUDE.md`, `model_routing.py`): frase gramaticalmente válida que testa o idioma/regência ERRADO pro tópico pedido (ex. usar regência fixa de Akkusativ num item que deveria testar Dativ). Isso só o `check_case_adherence` (`rule_adherence.py`) pega, porque só ele sabe qual é a regra-alvo do exercício. Trate os recursos abaixo como complementares a esse gate, nunca substitutos.

## Tarefas, em ordem de prioridade — pare depois de cada uma e me mostre o resultado antes de seguir pra próxima

**1. (Alta) Auditoria de calibração assistida por mBART.** Existe uma auditoria de calibração pendente desde a Fase 4 (ver `CLAUDE.md`): amostrar itens `auto_ok` pra confirmar que o harness não tem falso-negativo. Escreva `validation/audit_auto_ok.py`: roda o mbart-german-grammar-corrector sobre uma amostra de `exercises` com `validation_status='auto_ok'`, compara a sugestão do modelo com `sentence_full`, e sinaliza discordâncias. Isso NÃO decide sozinho que o item está errado — só prioriza qual amostra revisar manualmente primeiro, em vez de amostragem cega. Saída: relatório simples (CSV ou print) com id, frase original, sugestão do mBART, e um score de diff — sem mexer em `validation_status` automaticamente. Critério de aceite: rodar contra uma amostra real do D1 e mostrar quantos itens discordaram, com exemplos concretos.

**2. (Alta) Gate adicional de GEC no harness — aditivo, não substituto.** Adicione uma verificação usando o mbart-german-grammar-corrector em `validation/harness.py`, rodando ao lado dos gates que já existirem nesse momento. Defina um `flag_reason` novo e específico (ex. `gec_flagged`) pra distinguir isso de `lt_flagged` — são ferramentas diferentes, útil saber qual pegou o quê. Antes de escrever código, confirme comigo o formato de saída do modelo (correção direta vs. lista de erros) rodando um teste rápido contra 3-5 frases reais do projeto.

**3. (Média) Minerar erros reais do Falko-MERLIN como distratores autênticos.** Os engines `TrueFalseEngine`/`BinaryChoiceEngine` (bloco de leitura, `docs/06`, Fase 5) precisam de frases erradas plausíveis. Em vez de pedir pro LLM inventar, filtre o Falko-MERLIN por categoria de erro e nível CEFR e adapte exemplos reais — mesma regra de direito autoral já em uso pro texto do bloco de leitura: transformar, nunca copiar verbatim, e citar a fonte (CC BY-SA 4.0 exige atribuição). **Pare antes de implementar**: primeiro proponha um schema (nova tabela? campo em `reading_block_items`?) e confirme comigo — os engines de destino podem ainda não estar implementados exatamente como descrito aqui, dependendo de quando você está lendo isto.

**4. (Média, exploratória) Validar/expandir `model_routing.py` com dado maior que o dos lotes pequenos originais.** Primeiro passo, antes de qualquer código: confirme se a taxonomia de 21 categorias do ERRANT-alemão (Boyd 2018) tem uma categoria isolada de erro de caso/regência (Kasus/Rektion) — isso NÃO foi confirmado ainda, só a existência da taxonomia em si. Se não tiver uma categoria que sirva, essa tarefa não é viável como descrita — me avise em vez de forçar um proxy ruim. Se tiver, cruze com os tópicos da KB e veja se aparece algum padrão fraco além de Dativ/Funktionsverbgefüge que os lotes pequenos (35-89 itens) não tiveram amostra suficiente pra pegar.

**Fora de escopo, não faça sem eu pedir nomeadamente**: fine-tunar um corretor de regência próprio a partir do Falko-MERLIN. É factível, mas contradiz o princípio já registrado no `CLAUDE.md` de não investir em infraestrutura antes da necessidade aparecer de verdade — os itens 1-4 acima resolvem o problema real sem isso.

## Ritmo, igual ao resto do projeto

Mesma regra do `docs/04`: depois de cada tarefa, rode algo que eu possa ver, descreva em poucas linhas o que decidiu, espere eu confirmar antes de seguir pra próxima. Se achar um problema que muda o escopo de uma tarefa (schema que não existe mais, engine que já foi implementada diferente do que está aqui), pare e me avise em vez de assumir.
