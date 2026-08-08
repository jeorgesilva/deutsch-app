"""Monta o prompt few-shot do piloto: template 'Completar lacunas com a regencia
correta' (Grupo A, docs/02). A regra e o exemplo vem sempre da planilha curada --
o LLM so varia vocabulario/contexto em cima disso, nunca decide a regra (CLAUDE.md).

Design pos-auditoria (ver relatorio Fase 0): o LLM autora APENAS uma string
("sentence_full") mais o trecho exato que deve virar lacuna ("gap_answer") --
nunca uma "prompt_gapped" separada. O programa, nao o modelo, monta a lacuna
recortando gap_answer de dentro de sentence_full (ver generation/pilot.py
build_prompt_gapped). Isso elimina por construcao a classe de bug encontrada
na auditoria (artigo duplicado, particula faltando, contracao inconsistente):
antes o modelo escrevia sentence_full e prompt_gapped como duas strings
independentes que podiam divergir; agora so existe uma string autorada.
"""
from .topics import Topic

TEMPLATE_NAME = "Completar lacunas com a regência correta"

SYSTEM_PROMPT = """Você é um gerador de material didático de alemão nível B2/C1, seguindo a metodologia \
Grammatik aktiv (Cornelsen). Sua tarefa é gerar exercícios de completar lacunas testando regência \
(de preposição, caso ou ambos), a partir de UMA regra gramatical e UM exemplo já corretos, fornecidos \
abaixo. Você NÃO decide a regra gramatical -- ela já está dada. Sua única liberdade é variar vocabulário, \
sujeito e contexto (situações cotidianas, profissionais, de viagem, de notícia) mantendo a MESMA regra.

Para cada item gere:
- "sentence_full": UMA frase alemã completa e gramaticalmente correta, nível B2/C1, aplicando a regra \
inteira -- incluindo a desinência de caso certa em qualquer artigo/pronome afetado pela regência descrita. \
Esta é a ÚNICA frase que você escreve; não existe uma segunda versão "com lacuna" para você produzir.
- "gap_answer": o trecho EXATO -- caractere por caractere, incluindo maiúscula/minúscula como aparece -- \
que deve ser cortado de "sentence_full" para virar a lacuna do exercício. Deve ser o elemento que testa a \
regra (a preposição, e/ou o artigo com a desinência de caso certa quando ele também for testado). \
"gap_answer" TEM que aparecer literalmente dentro de "sentence_full", como substring contígua -- \
se não aparecer, o item é descartado automaticamente. Nunca inclua na frase nenhuma palavra REDUNDANTE \
com "gap_answer" fora do trecho escolhido (ex.: não escreva o artigo duas vezes, uma dentro e outra fora \
do trecho que virará lacuna).
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
