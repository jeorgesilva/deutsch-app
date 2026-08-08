"""Fase 8 (docs/08, docs/05 item 114) -- cria um exercicio ReadAloudEngine:
frase-alvo (da KB) + audio-gabarito (TTS via Piper, mesmo mecanismo ja usado
pelo DictationEngine na Fase 7) + IPA-alvo (phonemizer, calculado na hora da
correcao, nao guardado -- barato de recalcular, evita duplicar fonte de
verdade entre "sentence" e "target_ipa").

Diferente do DictationEngine: aqui o texto e' MOSTRADO ao usuario antes da
tentativa (le, depois fala -- texto-primeiro), entao nao ha problema de
copyright/regra de "nunca mostrar antes" (essa regra e' so pra transcricao de
FONTE EXTERNA -- aqui a frase e' da KB curada do proprio projeto).

Uso:
    python -m deutsch_pipeline.phonetics.create_readaloud_exercise \\
        --sentence "Der Staat hat die Stadt finanziell unterstützt." \\
        --content-topic-id 1
"""
import argparse
from pathlib import Path

from ..ingest.write_exercises import build_insert, execute_d1, query_d1
from ..tts.synthesize import DEFAULT_VOICE, synthesize_to_file
from ..tts.upload_r2 import upload_audio

AUDIO_TMP_DIR = Path(__file__).resolve().parents[4] / "pipeline" / "output" / "audio_tmp"


def create_readaloud_exercise(sentence: str, content_topic_id: int | None, voice: str = DEFAULT_VOICE) -> int:
    templates = {row["nome"]: row["id"] for row in query_d1("SELECT id, nome FROM exercise_templates;")}
    exercise_template_id = templates["ReadAloudEngine"]

    AUDIO_TMP_DIR.mkdir(parents=True, exist_ok=True)
    slug = "".join(c if c.isalnum() else "-" for c in sentence.lower()).strip("-")[:40]
    audio_path = AUDIO_TMP_DIR / f"readaloud_{slug}.wav"
    synthesize_to_file(sentence, audio_path, voice_name=voice)
    object_key = f"readaloud/{slug}.wav"
    upload_audio(audio_path, object_key)

    ex = {
        "prompt": sentence,  # texto-primeiro: mostrado ANTES da tentativa, ao contrario do DictationEngine
        "accepted_answers": [sentence],
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
    parser.add_argument("--sentence", required=True)
    parser.add_argument("--content-topic-id", type=int, default=None)
    args = parser.parse_args()

    exercise_id = create_readaloud_exercise(args.sentence, args.content_topic_id)
    print(f"ReadAloudEngine exercise id={exercise_id} criado (audio-gabarito no R2)")


if __name__ == "__main__":
    main()
