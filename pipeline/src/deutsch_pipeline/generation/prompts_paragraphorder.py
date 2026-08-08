"""Fase 5 (docs/06, docs/05 item 109) -- ParagraphOrderEngine: variante de
granularidade do UnscrambleEngine (item 19), reordenando blocos do
`reading_block` em vez de tokens de uma frase.

Diferente de TODOS os outros engines deste projeto: NÃO chama o LLM pra
gerar conteúdo -- o texto já existe (`reading_blocks.texto_base`, já
validado por LanguageTool + revisão humana), então não há risco nenhum de
fundamentação/invenção. É puramente mecânico: divide o texto em frases,
embaralha, o usuário reordena. Zero-risco por construção, não por gate.

Granularidade escolhida: FRASE, não parágrafo -- o texto-base do piloto tem\
3 parágrafos (poucos demais pra um quebra-cabeça interessante: 3! = 6\
permutações) mas 9 frases (9! permutações, granularidade adequada). docs/05\
já previa "frase/parágrafo" como intercambiável pro nome do engine."""
import json
import random
import re

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?]) +")


def split_sentences(texto_base: str) -> list[str]:
    flat = texto_base.replace("\n", " ")
    flat = re.sub(r"\s+", " ", flat).strip()
    return [s for s in _SENTENCE_SPLIT_RE.split(flat) if s]


def shuffle_chunks(chunks: list[str]) -> list[str]:
    if len(chunks) <= 1:
        return list(chunks)
    shuffled = list(chunks)
    while shuffled == chunks:
        random.shuffle(shuffled)
    return shuffled


MIN_SENTENCES = 4


def build_exercise_fields_paragraphorder(texto_base: str) -> dict:
    sentences = split_sentences(texto_base)
    if len(sentences) < MIN_SENTENCES:
        return {
            "prompt": None, "accepted_answers": [],
            "flag_reason": "structural_mismatch", "flag_detail": None,
        }
    shuffled = shuffle_chunks(sentences)
    canonical = " ".join(sentences)
    return {
        "prompt": json.dumps(shuffled, ensure_ascii=False),
        "accepted_answers": [canonical],
        "flag_reason": "auto_ok",
        "flag_detail": None,
    }
