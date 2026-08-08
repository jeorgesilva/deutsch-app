"""Fase 7 (CLAUDE.md) -- sintese de audio via Piper (100% local, ver decisao
em CLAUDE.md "Stack de TTS": Piper local escolhido sobre API paga depois de
comparar as duas). Piper e' leve (modelos ONNX de ~70-110MB, CPU) -- nao tem
o problema de RAM que forcou o motor de geracao de texto (LLM) pra API.

Voz padrao: de_DE-thorsten-high (melhor qualidade disponivel no catalogo
Piper pra alemao), escolhida pelo usuario apos ouvir amostra comparada com
de_DE-mls-medium.

Uso:
    from deutsch_pipeline.tts.synthesize import synthesize_to_file
    synthesize_to_file("Guten Tag, wie geht es Ihnen?", Path("out.wav"))
"""
import wave
from pathlib import Path

from piper import PiperVoice

MODELS_DIR = Path(__file__).resolve().parents[3] / "models" / "tts"
DEFAULT_VOICE = "de_DE-thorsten-high"

_voice_cache: dict[str, PiperVoice] = {}


def load_voice(voice_name: str = DEFAULT_VOICE) -> PiperVoice:
    if voice_name not in _voice_cache:
        model_path = MODELS_DIR / f"{voice_name}.onnx"
        if not model_path.exists():
            raise FileNotFoundError(
                f"Modelo de voz nao encontrado: {model_path} -- baixe com "
                f"`python -m piper.download_voices {voice_name}` e mova pra {MODELS_DIR}/"
            )
        _voice_cache[voice_name] = PiperVoice.load(str(model_path))
    return _voice_cache[voice_name]


def synthesize_to_file(text: str, out_path: Path, voice_name: str = DEFAULT_VOICE) -> Path:
    voice = load_voice(voice_name)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(out_path), "wb") as wav_file:
        voice.synthesize_wav(text, wav_file)
    return out_path
