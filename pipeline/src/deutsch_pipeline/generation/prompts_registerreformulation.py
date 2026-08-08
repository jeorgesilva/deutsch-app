"""Prompt pro template "Reformulação para registro formal (Nominalstil)"
(RegisterReformulationEngine, Grupo A, docs/05 item 10) -- só 2 tópicos
(`Nominalisierung`, `Nominalisierende Suffixe`), ambos já cobertos em outro
formato por `StructuralTransformEngine`/`FillBlankEngine`; aqui é uma
modalidade de exercício DIFERENTE sobre o mesmo conteúdo gramatical (projeto
varia formato pra engajamento, CLAUDE.md -- "nunca servir o mesmo template
duas vezes seguidas").

Mecanismo de correção é HÍBRIDO por design (docs/05): checagem determinística
de padrão (existe substantivo nominalizado com sufixo -ung/-heit/-keit/
-schaft/-tum na resposta do usuário) RODA NO WORKER em tempo de tentativa,
mais uma nota de fluência via LLM leve -- essa segunda parte é
inerentemente tempo-real (avalia a resposta que o USUÁRIO deu, não existe
"resposta aceita" fixa pra comparar), então é Fase 9 (frontend), não Fase 4
(pipeline batch, CLAUDE.md: "geração é sempre em lote/offline, nunca em tempo
real dentro de um Worker"). O que ESTA fase produz é só o par sentence_a
(estilo verbal) / sentence_b (estilo nominal, referência) -- mesmo contrato de
dados de build_exercise_fields_structuraltransform (reaproveitado sem
modificação), com um TEMPLATE_NAME próprio pra não colidir no registro
reverso de generate_batch.py (TEMPLATE_NAME_TO_ENGINE).
"""
from .prompts_structuraltransform import build_exercise_fields_structuraltransform  # noqa: F401 -- reexportado
from .topics import Topic

TEMPLATE_NAME = "Reformulação para registro formal (Nominalstil)"

SYSTEM_PROMPT = """Você é um gerador de material didático de alemão nível B2/C1, seguindo a metodologia \
Grammatik aktiv (Cornelsen). Sua tarefa é gerar PARES de frases pra treinar registro FORMAL/NOMINAL \
(Nominalstil): uma frase em estilo VERBAL comum (linguagem falada/neutra, com oração verbal completa) e a \
mesma frase reescrita em estilo NOMINAL (linguagem escrita formal/acadêmica/jornalística, com o núcleo verbal \
virando um substantivo abstrato), a partir de UMA regra e UM exemplo já corretos, fornecidos abaixo. Você NÃO \
decide a regra -- ela já está dada. Sua única liberdade é variar vocabulário, sujeito e contexto (situações \
profissionais, acadêmicas, de notícia) mantendo a MESMA transformação de registro.

Para cada item gere:
- "sentence_a": frase alemã completa, nível B2/C1, em estilo VERBAL comum -- oração verbal simples, sem \
nominalização, tom neutro/falado.
- "sentence_b": a MESMA frase reescrita em estilo NOMINAL formal -- o verbo/adjetivo central vira um \
substantivo abstrato com sufixo -ung/-heit/-keit/-schaft/-tum (ou infinitivo substantivado), tipicamente com \
uma preposição (durch/bei/nach/trotz/wegen) regendo esse substantivo no lugar da oração inteira. sentence_b \
TEM que conter pelo menos um substantivo nominalizado real -- nunca invente um sufixo que não existe em \
alemão.

ATENÇÃO -- problema recorrente a evitar: sentence_b tem que expressar EXATAMENTE o mesmo conteúdo \
proposicional de sentence_a, só reestilizado -- NUNCA acrescente uma oração nova de consequência, resultado \
ou expectativa que não estava em sentence_a. O exemplo-fonte abaixo ("Durch die konsequente Nutzung von \
Nomen entsteht sprachliche Verdichtung") é só uma ilustração AVULSA do estilo nominal, não um molde de \
estrutura "Durch X entsteht Y" pra copiar -- não adicione uma consequência tipo "entsteht/steigt/wird \
gestärkt" só porque o exemplo tem essa forma.
ERRADO: sentence_a = "Die Polizei untersucht den Vorfall gründlich.", sentence_b = "Durch die gründliche \
Untersuchung des Vorfalls erwartet man baldige Aufklärung." -- errado porque "erwartet man baldige \
Aufklärung" é conteúdo NOVO, não estava em sentence_a.
CERTO: sentence_a = "Die Polizei untersucht den Vorfall gründlich.", sentence_b = "Die Polizei führt eine \
gründliche Untersuchung des Vorfalls durch." -- certo porque é só o mesmo conteúdo reestilizado, sem \
consequência nova.
Se sentence_a é uma oração só, sentence_b pode ficar só com o sintagma nominal correspondente (com \
preposição) OU virar uma frase completa que reformula a MESMA ação com um verbo-suporte neutro (durchführen/ \
vornehmen/erfolgen), nunca com uma oração de resultado que não estava no original.

Responda SOMENTE com um array JSON válido, sem texto antes ou depois, sem markdown, sem explicação."""


def build_user_prompt(topic: Topic, n_items: int) -> str:
    return f"""Regra de nominalização (categoria: {topic.categoria}, tópico: {topic.topico}, nível {topic.nivel}):
{topic.regra}

Exemplo-fonte já curado (use como modelo de registro formal, não repita literalmente):
{topic.exemplo}

Gere exatamente {n_items} pares novos e distintos entre si, no formato JSON descrito (sentence_a/sentence_b). \
Não repita o exemplo-fonte nem pares quase idênticos entre os itens."""
