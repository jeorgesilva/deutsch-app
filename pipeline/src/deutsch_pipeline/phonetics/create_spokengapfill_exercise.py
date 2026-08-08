"""Fase 8 (docs/08, docs/05 item 115) -- cria um exercicio SpokenGapFillEngine:
mesma frase-com-lacuna do GapFillGovernanceEngine (item 9), mas a resposta e'
FALADA em vez de digitada. Reaproveita o mesmo contrato de dados
(prompt=frase com "___", accepted_answers=variantes aceitas) -- so acrescenta
audio-gabarito (TTS da frase COMPLETA, com a lacuna preenchida) pro passo de
checagem de pronuncia.

Uso:
    python -m deutsch_pipeline.phonetics.create_spokengapfill_exercise \\
        --sentence-full "Der Staat hat die Stadt finanziell unterstützt." \\
        --gap-answer "Staat" --content-topic-id 1
"""
import argparse
from pathlib import Path

from ..ingest.write_exercises import build_insert, execute_d1, query_d1
from ..tts.synthesize import DEFAULT_VOICE, synthesize_to_file
from ..tts.upload_r2 import upload_audio

AUDIO_TMP_DIR = Path(__file__).resolve().parents[4] / "pipeline" / "output" / "audio_tmp"


def create_spokengapfill_exercise(
    sentence_full: str, gap_answer: str, content_topic_id: int | None, voice: str = DEFAULT_VOICE,
) -> int:
    idx = sentence_full.find(gap_answer)
    if idx == -1:
        raise ValueError(f"gap_answer {gap_answer!r} nao encontrado em sentence_full")
    prompt_gapped = sentence_full[:idx] + "___" + sentence_full[idx + len(gap_answer):]

    templates = {row["nome"]: row["id"] for row in query_d1("SELECT id, nome FROM exercise_templates;")}
    exercise_template_id = templates["SpokenGapFillEngine"]

    AUDIO_TMP_DIR.mkdir(parents=True, exist_ok=True)
    slug = "".join(c if c.isalnum() else "-" for c in sentence_full.lower()).strip("-")[:40]
    audio_path = AUDIO_TMP_DIR / f"spokengapfill_{slug}.wav"
    synthesize_to_file(sentence_full, audio_path, voice_name=voice)
    object_key = f"spokengapfill/{slug}.wav"
    upload_audio(audio_path, object_key)

    ex = {
        "prompt": prompt_gapped,
        "accepted_answers": [gap_answer],
        "generated_by": voice,
        "flag_reason": "auto_ok",
        "flag_detail": None,
        "validation_status": "auto_ok",
    }
    stmt = build_insert(
        ex, content_topic_id=content_topic_id, exercise_template_id=exercise_template_id,
        audio_ref=object_key, source_type="tts",
    )
    execute_d1(stmt)
    return query_d1("SELECT id FROM exercises ORDER BY id DESC LIMIT 1;")[0]["id"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sentence-full", required=True)
    parser.add_argument("--gap-answer", required=True)
    parser.add_argument("--content-topic-id", type=int, default=None)
    args = parser.parse_args()

    exercise_id = create_spokengapfill_exercise(args.sentence_full, args.gap_answer, args.content_topic_id)
    print(f"SpokenGapFillEngine exercise id={exercise_id} criado (audio-gabarito no R2)")


if __name__ == "__main__":
    main()
