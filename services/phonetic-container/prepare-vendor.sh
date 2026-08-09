#!/usr/bin/env bash
# Fase 14 -- Docker COPY nao alcanca fora do build context (diretorio deste
# Dockerfile). Em vez de complicar a resolucao de build context do wrangler
# pra alcancar pipeline/ na raiz do repo, copia (vendoriza) o minimo
# necessario pra dentro deste projeto antes de buildar -- mesma estrutura
# de pastas (pipeline/src/deutsch_pipeline/..., pipeline/models/tts/) pra
# tts/synthesize.py resolver MODELS_DIR sem precisar mudar nenhum path.
# Rodar antes de `wrangler deploy`/`wrangler dev` (ver package.json).
set -euo pipefail
cd "$(dirname "$0")"

REPO_ROOT="../.."
DEST="vendor/pipeline"

rm -rf vendor
mkdir -p "$DEST/src/deutsch_pipeline/phonetics" "$DEST/src/deutsch_pipeline/tts" "$DEST/models/tts"

cp "$REPO_ROOT/pipeline/src/deutsch_pipeline/__init__.py" "$DEST/src/deutsch_pipeline/__init__.py"
cp "$REPO_ROOT/pipeline/src/deutsch_pipeline/phonetics/"*.py "$DEST/src/deutsch_pipeline/phonetics/"
cp "$REPO_ROOT/pipeline/src/deutsch_pipeline/tts/"*.py "$DEST/src/deutsch_pipeline/tts/"

# pipeline/models/tts/*.onnx e' gitignored (binario grande, CLAUDE.md) --
# existe na maquina de quem gerou/baixou localmente, mas NAO no checkout
# do GitHub Actions. Copia se existir; senao baixa da mesma fonte publica
# do catalogo Piper (rhasspy/piper-voices no HF Hub) -- mesmo mecanismo
# que `python -m piper.download_voices` usa por baixo, sem precisar
# instalar o pacote piper-tts so' pra isso.
VOICE="de_DE-thorsten-high"
if compgen -G "$REPO_ROOT/pipeline/models/tts/*.onnx*" > /dev/null; then
  cp "$REPO_ROOT/pipeline/models/tts/"*.onnx* "$DEST/models/tts/"
else
  echo "modelo de voz nao encontrado localmente -- baixando $VOICE do HF Hub"
  BASE_URL="https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/high"
  curl -fL "$BASE_URL/$VOICE.onnx" -o "$DEST/models/tts/$VOICE.onnx"
  curl -fL "$BASE_URL/$VOICE.onnx.json" -o "$DEST/models/tts/$VOICE.onnx.json"
fi

echo "vendorizado em $(pwd)/vendor"
