#!/usr/bin/env bash
# docs/14 -- mesmo padrao de vendoring do phonetic-container (Docker COPY
# nao alcanca fora do build context). So copia o subconjunto de
# generation/validation que generation/service.py de fato importa --
# NENHUM dos engines ancorados a reading_blocks/video_clips/phonetic_points
# (Matching/TrueFalse/Dictation/etc.) entra aqui, so os 6 engines de Grupo A
# ancorados a content_topic_id (ver ENGINE_PROMPTS em service.py).
set -euo pipefail
cd "$(dirname "$0")"

REPO_ROOT="../.."
SRC="$REPO_ROOT/pipeline/src/deutsch_pipeline"
DEST="vendor/pipeline/src/deutsch_pipeline"

rm -rf vendor
mkdir -p "$DEST/generation" "$DEST/validation"

cp "$SRC/__init__.py" "$DEST/__init__.py"

for f in __init__.py llm_client.py model_routing.py topics.py pilot.py \
         prompts.py prompts_fillblank.py prompts_unscramble.py \
         prompts_structuraltransform.py prompts_registerreformulation.py \
         prompts_wordbankguess.py service.py; do
  cp "$SRC/generation/$f" "$DEST/generation/$f"
done

for f in __init__.py harness.py rule_adherence.py; do
  cp "$SRC/validation/$f" "$DEST/validation/$f"
done

echo "vendorizado em $(pwd)/vendor"
