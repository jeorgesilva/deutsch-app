cat << 'EOF' > vulture_whitelist.py
# vulture_whitelist.py
# Production-grade entry-point map to satisfy static code analysis (Vulture)

import pipeline.src.deutsch_pipeline.generation.service as gen_service
import pipeline.src.deutsch_pipeline.phonetics.service as phon_service
import pipeline.src.deutsch_pipeline.generation.prompts_reading_block as prompts_rb
import pipeline.src.deutsch_pipeline.validation.export_review_queue as review_q
import pipeline.src.deutsch_pipeline.generation.schemas as pipeline_schemas


# 1. Microservice API Endpoints (Invoked dynamically over HTTP via Edge Workers)
gen_service.health
gen_service.generate_topic_endpoint
gen_service.generate_video_item_endpoint
gen_service.generate_reading_item_endpoint

phon_service.health
phon_service.score_readaloud
phon_service.score_spokengapfill
phon_service.transcribe_endpoint
phon_service.synthesize_endpoint

# 2. Structural Schemas
prompts_rb.ReadingBlockDraft

# 3. Third-party Worksheet Attribute Assignments
review_q.freeze_panes
EOF
pipeline_schemas.FillBlankItem
pipeline_schemas.FillBlankBatchResponse

pipeline_schemas.UnscrambleItem.sentence_ordered
pipeline_schemas.UnscrambleItem.words_scrambled
pipeline_schemas.UnscrambleItem.clue_translation

