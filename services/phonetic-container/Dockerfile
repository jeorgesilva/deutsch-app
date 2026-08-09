# Fase 14 (CLAUDE.md) -- imagem do container Cloudflare pro servico
# fonetico (wav2vec2/phonemizer/faster-whisper/Piper). Build context =
# este diretorio (npm run vendor roda antes e copia o minimo necessario de
# pipeline/ pra vendor/, ver prepare-vendor.sh -- Docker COPY nao alcanca
# fora do build context).
FROM python:3.11-slim

# ffmpeg: converte audio do MediaRecorder (webm/opus) pra WAV 16kHz antes
# de recognize.py/stt.py (service.py::_decode_audio_to_wav).
# espeak-ng: backend do phonemizer (target_ipa.py).
# libsndfile1: soundfile (recognize.py) precisa da lib nativa.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg espeak-ng libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# torch CPU-only -- "pip install torch" puxa o wheel CUDA por padrao no
# Linux (~2GB+), sem sentido aqui (Cloudflare Containers e' CPU, nao GPU).
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# baixa os modelos HF em BUILD-time -- cold start do container (timeout de
# 20s do startAndWaitForPorts, ver src/index.ts) nao pode depender de rede,
# e o container roda com enableInternet=false em runtime de qualquer jeito.
RUN python -c "from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor; \
    Wav2Vec2Processor.from_pretrained('facebook/wav2vec2-lv-60-espeak-cv-ft'); \
    Wav2Vec2ForCTC.from_pretrained('facebook/wav2vec2-lv-60-espeak-cv-ft')"
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')"

# mesma estrutura de pastas do repo (pipeline/src/..., pipeline/models/tts/)
# -- tts/synthesize.py resolve MODELS_DIR por parents[3] relativo ao
# proprio arquivo, preservar a profundidade evita precisar mudar o path.
COPY vendor/pipeline/src/deutsch_pipeline/__init__.py /app/pipeline/src/deutsch_pipeline/__init__.py
COPY vendor/pipeline/src/deutsch_pipeline/phonetics/ /app/pipeline/src/deutsch_pipeline/phonetics/
COPY vendor/pipeline/src/deutsch_pipeline/tts/ /app/pipeline/src/deutsch_pipeline/tts/
COPY vendor/pipeline/models/tts/ /app/pipeline/models/tts/
COPY run.py /app/run.py

ENV PYTHONPATH=/app/pipeline/src
ENV PYTHONUNBUFFERED=1

EXPOSE 8080

CMD ["python", "run.py"]
