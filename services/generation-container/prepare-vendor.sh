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
# Lista de arquivos em vendor-files.txt (fonte única, conferida por
# pipeline/tests/test_vendor_manifest.py contra os imports reais).
grep -vE '^[[:space:]]*(#|$)' vendor-files.txt | while read -r f; do
  mkdir -p "$DEST/$(dirname "$f")"
  cp "$SRC/$f" "$DEST/$f"
done

echo "vendorizado em $(pwd)/vendor"
