"""Fase 5 (docs/06, docs/05 item 112) -- PunctuationCapsEngine: texto corrido
sem pontuação nem maiúsculas; usuário adiciona nos lugares certos. Ativa
Groß-/Kleinschreibung (maiúscula em todo substantivo -- regra que o inglês
nem tem) e Kommaregeln (`content_topics` categoria 18).

Mesmo princípio zero-risco do ParagraphOrderEngine/LetterAnagramEngine: não
chama o LLM -- deriva mecanicamente do `reading_block` já aprovado. "Strip"
de pontuação/maiúscula é determinístico, então "desfazer" e comparar com o
original é sempre exato, sem gate de fundamentação necessário.
"""
import re

MIN_WORDS = 8
MAX_WORDS = 45


def strip_punctuation_and_caps(snippet: str) -> str:
    stripped = re.sub(r"[.,;:!?„“\"']", "", snippet)
    return stripped.lower()


def pick_snippet(texto_base: str) -> str | None:
    """Pega as 2 primeiras frases do texto (ja tem maiuscula/pontuacao
    corretas por ser o texto original aprovado) -- tamanho medio, nem
    trivial nem exaustivo de corrigir."""
    flat = re.sub(r"\s+", " ", texto_base.replace("\n", " ")).strip()
    sentences = re.split(r"(?<=[.!?]) +", flat)
    snippet = " ".join(sentences[:2])
    n_words = len(snippet.split())
    if n_words < MIN_WORDS:
        snippet = " ".join(sentences[:3])
        n_words = len(snippet.split())
    if n_words < MIN_WORDS or n_words > MAX_WORDS:
        return None
    return snippet


def build_exercise_fields_punctuationcaps(texto_base: str) -> dict:
    snippet = pick_snippet(texto_base)
    if not snippet:
        return {"prompt": None, "accepted_answers": [], "flag_reason": "structural_mismatch", "flag_detail": None}
    return {
        "prompt": strip_punctuation_and_caps(snippet),
        "accepted_answers": [snippet],
        "flag_reason": "auto_ok",
        "flag_detail": None,
    }
