"""Fase 8 -- STT local via faster-whisper, pra checagem LEXICAL (a palavra
certa foi dita?) do SpokenGapFillEngine (docs/05 item 115). Separado da
checagem de PRONUNCIA (recognize.py) por design -- as duas nunca viram um
score so (mesmo principio de showed_up/correction_json, CLAUDE.md).
"""
import re
from pathlib import Path

_model = None


def _load_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        _model = WhisperModel("small", device="cpu", compute_type="int8")
    return _model


def transcribe(audio_path: Path, language: str = "de") -> str:
    model = _load_model()
    segments, _info = model.transcribe(str(audio_path), language=language)
    return " ".join(seg.text.strip() for seg in segments).strip()


def lexical_match(transcribed: str, accepted_answers: list[str]) -> bool:
    """A resposta aceita aparece como PALAVRA(S) inteira(s) na transcrição.

    Antes era substring (`alt in transcrito`): falando a frase inteira, uma
    preposição curta "acertava" dentro de outra palavra ("an" em "kann", "im"
    em "immer"), e quase toda lacuna do SpokenGapFill é preposição curta.
    Resposta com mais de uma palavra ("in Frage") casa como sequência contígua.
    """
    words = re.findall(r"\w+", transcribed.lower())
    for alt in accepted_answers:
        alt_words = re.findall(r"\w+", alt.lower())
        n = len(alt_words)
        if n and any(words[i:i + n] == alt_words for i in range(len(words) - n + 1)):
            return True
    return False
