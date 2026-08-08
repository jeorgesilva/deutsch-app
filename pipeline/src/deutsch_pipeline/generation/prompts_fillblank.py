"""Prompt few-shot pro template "Fill in the blanks" (FillBlankEngine, Grupo A,
docs/05 item 17). Variante generica do GapFillGovernanceEngine (docs/02, item 9,
generation/prompts.py): mesmo mecanismo determinístico de lacuna unica, mas o
elemento testado pode ser QUALQUER coisa que a regra do topico descrever --
forma verbal, desinencia de declinacao, conector, sufixo/prefixo de formacao
de palavra, particula -- nao especificamente regencia de caso/preposicao como
o item 9. docs/05 e' explicito: "implementacao pode reusar a mesma engine de
GapFillGovernanceEngine, diferindo so na fonte da regra" -- e' exatamente o
design aqui: mesmo generation/pilot.py generate_for_topic, mesmo harness de
validacao (validation/harness.py), so o prompt muda.

A regra e o exemplo vem sempre da planilha curada -- o LLM so varia
vocabulario/contexto em cima disso, nunca inventa a regra (CLAUDE.md).
"""
from .topics import Topic

TEMPLATE_NAME = "Fill in the blanks"

SYSTEM_PROMPT = """Você é um gerador de material didático de alemão nível B2/C1, seguindo a metodologia \
Grammatik aktiv (Cornelsen). Sua tarefa é gerar exercícios de completar lacunas testando UM ponto \
gramatical específico, a partir de UMA regra gramatical e UM exemplo já corretos, fornecidos abaixo. \
Você NÃO decide a regra gramatical -- ela já está dada. Sua única liberdade é variar vocabulário, \
sujeito e contexto (situações cotidianas, profissionais, de viagem, de notícia) mantendo a MESMA regra.

A lacuna testa o elemento central da regra, seja qual for: forma verbal (tempo, modo, Partizip), \
desinência de declinação (artigo, adjetivo, pronome), conector/conjunção, sufixo ou prefixo de formação \
de palavra, partícula, numeral -- não presuma que é sempre regência de preposição/caso.

Para cada item gere:
- "sentence_full": UMA frase alemã completa e gramaticalmente correta, nível B2/C1, aplicando a regra \
inteira -- incluindo a forma certa no elemento afetado por ela. Esta é a ÚNICA frase que você escreve; \
não existe uma segunda versão "com lacuna" para você produzir.
- "gap_answer": o trecho EXATO -- caractere por caractere, incluindo maiúscula/minúscula como aparece -- \
que deve ser cortado de "sentence_full" para virar a lacuna do exercício. Deve ser o elemento que testa a \
regra. "gap_answer" TEM que aparecer literalmente dentro de "sentence_full", como substring CONTÍGUA (sem \
reticências, sem colchetes, sem representar duas partes separadas como um só campo) -- se não aparecer, o \
item é descartado automaticamente. Nunca inclua na frase nenhuma palavra REDUNDANTE com "gap_answer" fora \
do trecho escolhido (ex.: não escreva o mesmo artigo duas vezes, uma dentro e outra fora do trecho que \
virará lacuna).

ATENÇÃO -- dois problemas recorrentes a evitar:
1. Construção verbal partida (Perfekt/Plusquamperfekt/Futur em oração principal: auxiliar na posição 2, \
particípio/infinitivo no final, com outras palavras no meio -- ex. "wird ... schlafen"). Isso NUNCA é \
substring contígua. Se a regra testa uma construção assim, prefira uma oração SUBORDINADA (weil/dass/ \
nachdem/wenn...), onde o cluster verbal auxiliar+particípio/infinitivo fica JUNTO no final da oração e \
pode virar "gap_answer" contíguo; ou, se não der, delimite a lacuna só na parte que efetivamente varia \
(só o particípio, ou só o verbo auxiliar), nunca a construção inteira com texto no meio.
2. Regra sobre AUSÊNCIA de artigo/palavra (ex. "quando não usar artigo"). Não dá pra representar "a \
resposta certa é nada" como lacuna preenchível -- gap_answer nunca pode ser vazio. Se a regra descreve um \
caso de ausência, gere o item ilustrando o contraste (uma frase com o artigo/palavra presente, testando a \
FORMA certa) em vez do caso de ausência.
- "accepted_answers": lista de 1-3 strings equivalentes aceitáveis pra preencher a mesma lacuna (variações \
de grafia comuns, ex. "über"/"ueber") -- inclua sempre "gap_answer" como uma delas.

Responda SOMENTE com um array JSON válido, sem texto antes ou depois, sem markdown, sem explicação."""


def build_user_prompt(topic: Topic, n_items: int) -> str:
    return f"""Regra gramatical (categoria: {topic.categoria}, tópico: {topic.topico}, nível {topic.nivel}):
{topic.regra}

Exemplo-fonte já curado (use como modelo de estrutura, não repita literalmente):
{topic.exemplo}

Gere exatamente {n_items} itens novos e distintos entre si, no formato JSON descrito. Não repita o \
exemplo-fonte nem frases quase idênticas entre os itens."""
