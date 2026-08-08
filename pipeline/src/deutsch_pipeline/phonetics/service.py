"""Fase 9 -- servico HTTP local que expoe a correcao fonetica da Fase 8
(wav2vec2 + phonemizer + faster-whisper, todos PyTorch) pro Worker do
Cloudflare, que nao pode rodar essas dependencias nativas (mesmo limite de
CPU/runtime que ja bloqueia LLM em tempo real dentro de um Worker, CLAUDE.md).

Servico e' PURO CALCULO -- nao grava em D1. O Worker (`functions/api/attempts.ts`)
continua sendo o UNICO ponto de escrita de `attempts`/`phoneme_scores`/`progress`,
mesmo padrao ja estabelecido pros outros 18 templates -- este servico so chama
e devolve o diff fonema a fonema (ou a transcricao lexical), o Worker decide o
que fazer com o resultado.

Audio chega em base64 no formato que o MediaRecorder do navegador gravou
(webm/opus, tipicamente) -- convertido pra WAV 16kHz mono via ffmpeg antes de
passar pro `recognize.py` (que usa `soundfile`, sem suporte a webm/opus).

Uso:
    python -m deutsch_pipeline.phonetics.service [--port 5005]
"""
import argparse
import base64
import subprocess
import tempfile
from pathlib import Path

from flask import Flask, jsonify, request

from .recognize import phone_diff, recognize_wav2vec
from .stt import transcribe
from .target_ipa import target_ipa
from ..tts.synthesize import synthesize_to_file

app = Flask(__name__)


def _decode_audio_to_wav(audio_base64: str) -> Path:
    raw = base64.b64decode(audio_base64)
    tmp_dir = Path(tempfile.mkdtemp(prefix="deutsch_phonetics_"))
    src_path = tmp_dir / "input.bin"
    wav_path = tmp_dir / "input.wav"
    src_path.write_bytes(raw)
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(src_path), "-ar", "16000", "-ac", "1", str(wav_path)],
        capture_output=True, check=True,
    )
    return wav_path


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/score-readaloud")
def score_readaloud():
    body = request.get_json(force=True)
    sentence = body.get("sentence")
    audio_base64 = body.get("audio_base64")
    if not sentence or not audio_base64:
        return jsonify({"error": "sentence e audio_base64 sao obrigatorios"}), 400

    wav_path = _decode_audio_to_wav(audio_base64)
    tgt = target_ipa(sentence)
    recognized = recognize_wav2vec(wav_path)
    diff = phone_diff(tgt, recognized)

    return jsonify({
        "target_ipa": tgt,
        "recognized_ipa": recognized,
        "similarity": diff["similarity"],
        "alignment": diff["alignment"],
    })


@app.post("/score-spokengapfill")
def score_spokengapfill():
    body = request.get_json(force=True)
    sentence_full = body.get("sentence_full")
    accepted_answers = body.get("accepted_answers") or []
    audio_base64 = body.get("audio_base64")
    if not sentence_full or not audio_base64:
        return jsonify({"error": "sentence_full e audio_base64 sao obrigatorios"}), 400

    wav_path = _decode_audio_to_wav(audio_base64)

    # bloco 1: lexical (STT + accepted_answers) -- separado do bloco 2
    # (pronuncia) por design, nunca um score so (CLAUDE.md).
    transcribed = transcribe(wav_path)
    transcribed_lower = transcribed.lower()
    lexical_correct = any(alt.lower() in transcribed_lower for alt in accepted_answers)

    # bloco 2: pronuncia da frase inteira (com a lacuna ja reconstruida)
    tgt = target_ipa(sentence_full)
    recognized_ipa = recognize_wav2vec(wav_path)
    diff = phone_diff(tgt, recognized_ipa)

    return jsonify({
        "lexical": {
            "transcribed": transcribed,
            "accepted_answers": accepted_answers,
            "correct": lexical_correct,
        },
        "pronunciation": {
            "target_ipa": tgt,
            "recognized_ipa": recognized_ipa,
            "similarity": diff["similarity"],
            "alignment": diff["alignment"],
        },
    })


@app.post("/transcribe")
def transcribe_endpoint():
    # Fase 11 -- STT avulso pro loop de voz do Grupo D (docs/08: grava ->
    # faster-whisper local -> LLM -> Piper -> toca). Diferente de
    # /score-spokengapfill, aqui nao ha `accepted_answers` nem checagem de
    # pronuncia -- so a transcricao crua, que o Worker manda pro mecanismo
    # de roleplay (ja existente) como se fosse a fala do usuario digitada.
    body = request.get_json(force=True)
    audio_base64 = body.get("audio_base64")
    if not audio_base64:
        return jsonify({"error": "audio_base64 e obrigatorio"}), 400

    wav_path = _decode_audio_to_wav(audio_base64)
    text = transcribe(wav_path)
    return jsonify({"text": text})


@app.post("/synthesize")
def synthesize_endpoint():
    # Fase 11 -- TTS avulso pro loop de voz do Grupo D. Diferente da
    # geracao em lote de audio-gabarito (tts/synthesize.py chamado pelos
    # scripts generate_dictation_batch.py etc., que sobem pro R2), aqui a
    # sintese e' de uma fala de LLM em tempo real dentro de uma conversa --
    # nao ha exercicio nem audio_ref pra persistir, o audio existe so' pra
    # esse turno. Devolvido em base64 no JSON (nao like /media/, que serve
    # bytes crus do R2) porque quem chama (Worker) precisa combinar isso
    # com texto (transcricao do usuario + resposta da persona) na mesma
    # resposta.
    body = request.get_json(force=True)
    text = body.get("text")
    if not text:
        return jsonify({"error": "text e obrigatorio"}), 400

    tmp_dir = Path(tempfile.mkdtemp(prefix="deutsch_tts_"))
    wav_path = synthesize_to_file(text, tmp_dir / "out.wav")
    audio_b64 = base64.b64encode(wav_path.read_bytes()).decode("ascii")
    return jsonify({"audio_base64": audio_b64})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=5005)
    args = parser.parse_args()
    app.run(host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
