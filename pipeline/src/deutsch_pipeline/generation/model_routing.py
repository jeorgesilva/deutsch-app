"""Fase 4 (CLAUDE.md) -- roteamento de topico fraco: generaliza a decisao
original ("topicos de regencia fixa de Dativ... revisao humana obrigatoria,
nao geracao automatica sem checagem") de uma nota de curadoria pra uma regra
de codigo reutilizavel, chamada de dentro de generate_batch.py.

Fundamentado em evidencia real, nao especulacao -- ver
pipeline/output/batch/hf_deepseek-ai_DeepSeek-V3_1785884087.lt.json (35 itens,
7 topicos), recontado DEPOIS do reparo mecanico de bad_alternate_answer
(validation/harness.py find_bad_alternates):

    5/5  Wechselpräpositionen
    5/5  Oft gebrauchte lokale Präpositionen
    5/5  Verben mit Genitiv
    5/5  Verben, Adjektive und Nomen mit festen Präpositionen mit Akkusativ
    5/5  Verben, Nomen und Adjektive mit Präpositionen        (era 1/5 antes do reparo -- so bad_alternate_answer, nao erro de frase)
    2/5  Funktionsverbgefüge 1                                (3x lt_flagged -- erro de frase de verdade, reparo nao ajuda)
    1/5  Verben, Adjektive und Nomen mit festen Präpositionen mit Dativ  (4x case_mismatch -- erro de frase de verdade)

Ou seja: "regencia mista" (topicos sem case fixo no nome) NAO e' mais um
problema separado depois do reparo -- era so bad_alternate_answer. Os UNICOS
padroes que continuam fracos de verdade sao Dativ de caso fixo e
Funktionsverbgefüge. Revisar/editar FORCE_STRONG_MODEL_TOPICS aqui conforme
novos lotes trouxerem evidencia -- mesmo espirito de TOPIC_OVERRIDES em
ingest/seed_template_map.py (curadoria editavel, nao definitiva).

Uso:
    from .model_routing import resolve_model
    model_for_topic = resolve_model(topic, args.model)
"""
from .topics import Topic

# Modelo mais forte usado como piso de qualidade pros padroes historicamente
# fracos (Gemini: 53/54 auto_ok, 98%, nesses mesmos topicos -- ver CLAUDE.md
# Fase 4). Nao e' sobre abandonar DeepSeek pela praticidade -- e' sobre nao
# usar DeepSeek EXATAMENTE nos ~2 padroes onde ele comprovadamente erra.
STRONG_MODEL = "gemini-2.5-flash"

# Nomes exatos de topico com fraqueza confirmada que nao e' de caso fixo
# (Dativ ja e' coberto separadamente via Topic.expected_case abaixo).
FORCE_STRONG_MODEL_TOPICS: set[str] = {
    "Funktionsverbgefüge 1",
    "Funktionsverbgefüge 2",  # mesma familia do 1, nunca testado isolado ainda -- inclusao preventiva
}


def is_weak_topic(topic: Topic) -> bool:
    """True se o topico bate um padrao historicamente fraco pro DeepSeek (e,
    antes dele, pro Mistral Small -- ver CLAUDE.md: a fraqueza de Dativ e' do
    PADRAO, nao de um modelo especifico). Dois criterios:
    1. topic.expected_case == "Dat" -- generaliza pra qualquer um dos 100
       topicos da KB com esse sufixo, nao so os testados ate agora. "Dat" (nao
       "Dativ" por extenso) porque expected_case vem de rule_adherence.py
       infer_expected_case, que devolve a abreviacao morfologica do spaCy
       (_CASE_MAP: Akkusativ->Acc, Dativ->Dat, Genitiv->Gen) -- confundir os
       dois faz esse criterio nunca bater, silenciosamente.
    2. Nome exato em FORCE_STRONG_MODEL_TOPICS (Funktionsverbgefüge, sem
       sufixo de caso fixo pra generalizar por regex)."""
    if topic.expected_case == "Dat":
        return True
    return topic.topico in FORCE_STRONG_MODEL_TOPICS


def resolve_model(topic: Topic, requested_model: str) -> str:
    """Decide o model de fato usado pro topico: forca STRONG_MODEL pra
    padroes fracos conhecidos, senao respeita o --model pedido (DeepSeek pela
    praticidade, nos topicos onde ele ja sai bom o suficiente)."""
    if is_weak_topic(topic):
        return STRONG_MODEL
    return requested_model
