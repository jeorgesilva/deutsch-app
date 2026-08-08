"""Fase 8 (docs/08, docs/05 item 115) -- corrige uma tentativa de
SpokenGapFillEngine: DUAS checagens, sempre em blocos separados, nunca um
score so (mesmo principio de showed_up/correction_json, CLAUDE.md):
1. LEXICAL -- faster-whisper transcreve, compara com accepted_answers
   (a palavra certa foi dita?).
2. PRONUNCIA -- pipeline do ReadAloudEngine (wav2vec2 + phonemizer), rodado
   sobre a frase completa reconstruida a partir do prompt com lacuna.

Uso:
    python -m deutsch_pipeline.phonetics.score_spokengapfill_attempt \\
        --exercise-id 1020 --audio-path /path/to/gravacao.wav
"""
import argparse
import json
from pathlib import Path

from .recognize import phone_diff, recognize_wav2vec
from .stt import transcribe
from .target_ipa import target_ipa
from ..ingest.write_exercises import execute_d1, query_d1, sql_value


def _reconstruct_full_sentence(prompt_gapped: str, gap_answer: str) -> str:
    return prompt_gapped.replace("___", gap_answer)


def score_spokengapfill_attempt(exercise_id: int, audio_path: Path) -> dict:
    ex = query_d1(f"SELECT prompt, accepted_answers FROM exercises WHERE id = {exercise_id};")
    if not ex:
        raise ValueError(f"exercise {exercise_id} nao encontrado")
    prompt_gapped = ex[0]["prompt"]
    accepted_answers = json.loads(ex[0]["accepted_answers"])
    sentence_full = _reconstruct_full_sentence(prompt_gapped, accepted_answers[0])

    # 1. checagem LEXICAL -- STT + accepted_answers (igual ao item 9, so que
    # a resposta do usuario vem de audio transcrito em vez de campo de texto)
    transcribed = transcribe(audio_path)
    transcribed_lower = transcribed.lower()
    lexical_correct = any(alt.lower() in transcribed_lower for alt in accepted_answers)

    # 2. checagem de PRONUNCIA -- roda sobre a frase completa (com a lacuna
    # reconstruida), nao so a palavra da lacuna isolada -- avalia a leitura
    # da frase inteira, mesmo pipeline do ReadAloudEngine.
    tgt = target_ipa(sentence_full)
    recognized_ipa = recognize_wav2vec(audio_path)
    diff = phone_diff(tgt, recognized_ipa)

    execute_d1(
        f"INSERT INTO attempts (exercise_id, user_response, audio_ref, showed_up) "
        f"VALUES ({exercise_id}, {sql_value(transcribed)}, {sql_value(str(audio_path))}, 1);"
    )
    attempt_id = query_d1("SELECT id FROM attempts ORDER BY id DESC LIMIT 1;")[0]["id"]
    execute_d1(
        "INSERT INTO phoneme_scores (attempt_id, target_ipa, recognized_ipa, diff_json, recognizer_model) "
        f"VALUES ({attempt_id}, {sql_value(tgt)}, {sql_value(recognized_ipa)}, "
        f"{sql_value(json.dumps(diff['alignment'], ensure_ascii=False))}, {sql_value('wav2vec2-espeak')});"
    )

    return {
        "attempt_id": attempt_id,
        "sentence_full": sentence_full,
        "lexical": {
            "transcribed": transcribed,
            "accepted_answers": accepted_answers,
            "correct": lexical_correct,
        },
        "pronunciation": diff,
    }


def print_result(result: dict) -> None:
    print(f"Frase: {result['sentence_full']}\n")
    print("=== Bloco 1: palavra certa? ===")
    lex = result["lexical"]
    print(f"  Você disse: {lex['transcribed']!r}")
    print(f"  Esperado (uma de): {lex['accepted_answers']}")
    print(f"  {'✓ SIM' if lex['correct'] else '✗ NÃO'}\n")

    print("=== Bloco 2: qualidade de pronúncia (frase inteira) ===")
    pron = result["pronunciation"]
    print(f"  Similaridade: {pron['similarity']:.2f}")
    for block in pron["alignment"]:
        if block["op"] == "equal":
            continue
        label = {"replace": "TROCOU", "delete": "FALTOU", "insert": "SOBROU"}[block["op"]]
        print(f"  {label}  alvo={' '.join(block['target'])!r} disse={' '.join(block['recognized'])!r}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--exercise-id", type=int, required=True)
    parser.add_argument("--audio-path", type=Path, required=True)
    args = parser.parse_args()

    result = score_spokengapfill_attempt(args.exercise_id, args.audio_path)
    print(f"attempt id={result['attempt_id']}\n")
    print_result(result)


if __name__ == "__main__":
    main()
