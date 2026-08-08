"""Fase 8 -- dois reconhecedores de fones candidatos (piloto empírico decide
qual fica, CLAUDE.md: "escolha por piloto empírico, não por documentação"),
mais o diff fonema a fonema entre alvo e reconhecido.
"""
import subprocess
from pathlib import Path

import editdistance
import soundfile as sf

TARGET_SR = 16000

_wav2vec_processor = None
_wav2vec_model = None


def _load_wav2vec():
    global _wav2vec_processor, _wav2vec_model
    if _wav2vec_model is None:
        from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor
        _wav2vec_processor = Wav2Vec2Processor.from_pretrained("facebook/wav2vec2-lv-60-espeak-cv-ft")
        _wav2vec_model = Wav2Vec2ForCTC.from_pretrained("facebook/wav2vec2-lv-60-espeak-cv-ft")
    return _wav2vec_processor, _wav2vec_model


def _load_audio_16k(audio_path: Path):
    import resampy
    audio, sr = sf.read(str(audio_path))
    if audio.ndim > 1:
        audio = audio.mean(axis=1)  # mono
    if sr != TARGET_SR:
        audio = resampy.resample(audio, sr, TARGET_SR)
    return audio


def recognize_wav2vec(audio_path: Path) -> str:
    import torch
    processor, model = _load_wav2vec()
    audio = _load_audio_16k(audio_path)
    inputs = processor(audio, sampling_rate=TARGET_SR, return_tensors="pt")
    with torch.no_grad():
        logits = model(inputs.input_values).logits
    pred_ids = torch.argmax(logits, dim=-1)
    return processor.batch_decode(pred_ids)[0]


def recognize_allosaurus(audio_path: Path) -> str:
    result = subprocess.run(
        ["python", "-m", "allosaurus.run", "--lang", "deu", "--input", str(audio_path)],
        capture_output=True, text=True, check=True,
    )
    return result.stdout.strip()


def phone_diff(target: str, recognized: str) -> dict:
    """Diff fonema a fonema: tokeniza por espaco (cada 'fonema' vira uma
    unidade) e alinha com difflib.SequenceMatcher -- gera os blocos
    equal/replace/delete/insert que phoneme_scores.diff_json espera (nao so
    a distancia agregada, que sozinha nao diz QUAL fonema errou)."""
    import difflib

    target_phones = target.split()
    recognized_phones = recognized.split()
    dist = editdistance.eval(target_phones, recognized_phones)
    max_len = max(len(target_phones), len(recognized_phones)) or 1

    matcher = difflib.SequenceMatcher(a=target_phones, b=recognized_phones, autojunk=False)
    alignment = [
        {
            "op": op,  # 'equal' | 'replace' | 'delete' (faltou) | 'insert' (sobrou)
            "target": target_phones[i1:i2],
            "recognized": recognized_phones[j1:j2],
        }
        for op, i1, i2, j1, j2 in matcher.get_opcodes()
    ]

    return {
        "target_phones": target_phones,
        "recognized_phones": recognized_phones,
        "edit_distance": dist,
        "similarity": 1 - dist / max_len,
        "alignment": alignment,
    }
