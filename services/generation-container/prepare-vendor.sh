#!/usr/bin/env bash
# docs/14 -- mesmo padrao de vendoring do phonetic-container (Docker COPY
# nao alcanca fora do build context). Copia o subconjunto de
# generation/validation/video/ingest que generation/service.py (direto ou
# transitivamente via video/daily_batch.py e generation/daily_reading_batch.py)
# importa.
#
# Fase 15 ampliou o escopo: alem dos 6 engines de Grupo A ancorados a
# content_topic_id (geracao sob demanda, docs/14), o container agora tambem
# roda o batch diario de video (video/) e bloco de leitura (as 10 engines de
# generation/prompts_<engine>.py ancoradas a reading_blocks) -- daí
# generation/ ficar quase inteiro aqui (so generate_batch.py/
# generate_dictation_batch.py/generate_shadowing_batch.py e prompts_dictation.py
# ficam de fora, sem uso no container: sao scripts de lote OFFLINE do Grupo A
# original/DictationEngine, chamados manualmente fora deste servico).
set -euo pipefail
cd "$(dirname "$0")"

REPO_ROOT="../.."
SRC="$REPO_ROOT/pipeline/src/deutsch_pipeline"
DEST="vendor/pipeline/src/deutsch_pipeline"

rm -rf vendor
mkdir -p "$DEST/generation" "$DEST/validation" "$DEST/video" "$DEST/ingest"

cp "$SRC/__init__.py" "$DEST/__init__.py"

for f in __init__.py llm_client.py model_routing.py topics.py pilot.py schemas.py service.py \
         prompts.py prompts_fillblank.py prompts_unscramble.py \
         prompts_structuraltransform.py prompts_registerreformulation.py \
         prompts_wordbankguess.py \
         prompts_binarychoice.py prompts_compoundsegmentation.py \
         prompts_comprehensionqa.py prompts_letteranagram.py prompts_matching.py \
         prompts_paragraphorder.py prompts_predictverify.py \
         prompts_punctuationcaps.py prompts_reading_block.py prompts_truefalse.py \
         prompts_vowelinsert.py reading_sources.py generate_reading_block.py \
         generate_reading_block_items.py daily_reading_batch.py; do
  cp "$SRC/generation/$f" "$DEST/generation/$f"
done

for f in __init__.py harness.py rule_adherence.py; do
  cp "$SRC/validation/$f" "$DEST/validation/$f"
done

for f in __init__.py channels.py list_candidates.py ingest_video_clip.py \
         generate_video_exercises.py generate_video_comprehension.py \
         prompts_video_citar.py vtt_parser.py daily_batch.py; do
  cp "$SRC/video/$f" "$DEST/video/$f"
done

for f in __init__.py write_exercises.py; do
  cp "$SRC/ingest/$f" "$DEST/ingest/$f"
done

echo "vendorizado em $(pwd)/vendor"
