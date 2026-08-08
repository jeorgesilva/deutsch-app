"""Fase 5 (docs/06, docs/05 item 108) -- LetterAnagramEngine: letras de uma
palavra-chave do `reading_block` embaralhadas; usuário reordena as LETRAS
(diferente do UnscrambleEngine, que reordena PALAVRAS numa frase).

Mesmo princípio de risco zero do ParagraphOrderEngine: não chama o LLM.
spaCy (`de_core_news_lg`, já usado em `validation/rule_adherence.py`) escolhe
a palavra-chave (substantivo/verbo/adjetivo de conteúdo, não artigo/
preposição/pronome) direto do texto já validado -- a "resposta certa" é
literalmente a palavra como está no texto, nunca uma invenção do LLM.
"""
import json
import random

from ..validation.rule_adherence import get_nlp

MIN_WORD_LEN = 6
CONTENT_POS = {"NOUN", "PROPN", "VERB", "ADJ"}


def pick_keywords(texto_base: str, n: int) -> list[dict]:
    """Retorna ate n palavras-chave distintas (forma como aparece no texto +
    a frase onde aparecem, pra pista semantica), maiores/de conteudo, sem
    repetir a mesma palavra duas vezes."""
    doc = get_nlp()(texto_base)
    seen = set()
    picks = []
    for sent in doc.sents:
        for tok in sent:
            word = tok.text
            key = word.lower()
            if (
                tok.pos_ not in CONTENT_POS
                or len(word) < MIN_WORD_LEN
                or not word.isalpha()
                or key in seen
            ):
                continue
            seen.add(key)
            picks.append({"palavra": word, "frase_contexto": sent.text.strip()})
            if len(picks) >= n:
                return picks
    return picks


def shuffle_letters(word: str) -> list[str]:
    letters = list(word)
    if len(letters) <= 1:
        return letters
    shuffled = list(letters)
    while shuffled == letters:
        random.shuffle(shuffled)
    return shuffled


def build_exercises_letteranagram(texto_base: str, n_items: int) -> list[dict]:
    keywords = pick_keywords(texto_base, n_items)
    exercises = []
    for kw in keywords:
        shuffled = shuffle_letters(kw["palavra"])
        exercises.append({
            "prompt": json.dumps(
                {"letras": shuffled, "frase_contexto": kw["frase_contexto"]}, ensure_ascii=False
            ),
            "accepted_answers": [kw["palavra"]],
            "flag_reason": "auto_ok",
            "flag_detail": None,
        })
    return exercises
