"""Fase 8 -- STT local via faster-whisper, pra checagem LEXICAL (a palavra
certa foi dita?) do SpokenGapFillEngine (docs/05 item 115). Separado da
checagem de PRONUNCIA (recognize.py) por design -- as duas nunca viram um
score so (mesmo principio de showed_up/correction_json, CLAUDE.md).
"""
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
