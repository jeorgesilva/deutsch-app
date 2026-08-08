"""Fase 8 (docs/08, docs/05 item 114) -- corrige uma tentativa de
ReadAloudEngine: grava `attempts` (audio_ref = caminho local por enquanto,
Fase 9 troca pra referencia real de storage) + `phoneme_scores` (IPA-alvo,
IPA-reconhecido, alinhamento fonema a fonema). Reconhecedor padrao:
wav2vec2-lv-60-espeak-cv-ft -- vencedor do piloto empirico (8 frases, fala
real do usuario, 7/8 com similaridade maior que allosaurus -- ver CLAUDE.md).

Uso:
    python -m deutsch_pipeline.phonetics.score_attempt --exercise-id 1015 \\
        --audio-path /path/to/gravacao.wav
"""
import argparse
import json
from pathlib import Path

from .recognize import phone_diff, recognize_wav2vec
from .target_ipa import target_ipa
from ..ingest.write_exercises import execute_d1, query_d1, sql_value

DEFAULT_RECOGNIZER = "wav2vec2-espeak"


def score_attempt(exercise_id: int, audio_path: Path, recognizer_model: str = DEFAULT_RECOGNIZER) -> dict:
    ex = query_d1(f"SELECT prompt FROM exercises WHERE id = {exercise_id};")
    if not ex:
        raise ValueError(f"exercise {exercise_id} nao encontrado")
    sentence = ex[0]["prompt"]

    tgt = target_ipa(sentence)
    recognized = recognize_wav2vec(audio_path)
    diff = phone_diff(tgt, recognized)

    execute_d1(
        f"INSERT INTO attempts (exercise_id, audio_ref, showed_up) "
        f"VALUES ({exercise_id}, {sql_value(str(audio_path))}, 1);"
    )
    attempt_id = query_d1("SELECT id FROM attempts ORDER BY id DESC LIMIT 1;")[0]["id"]

    execute_d1(
        "INSERT INTO phoneme_scores (attempt_id, target_ipa, recognized_ipa, diff_json, recognizer_model) "
        f"VALUES ({attempt_id}, {sql_value(tgt)}, {sql_value(recognized)}, "
        f"{sql_value(json.dumps(diff['alignment'], ensure_ascii=False))}, {sql_value(recognizer_model)});"
    )

    return {"attempt_id": attempt_id, "sentence": sentence, **diff}


def print_diff(result: dict) -> None:
    print(f"Frase: {result['sentence']}")
    print(f"Similaridade: {result['similarity']:.2f}\n")
    for block in result["alignment"]:
        if block["op"] == "equal":
            print(f"  OK       {' '.join(block['target'])}")
        elif block["op"] == "replace":
            print(f"  TROCOU   alvo={' '.join(block['target'])!r} -> disse={' '.join(block['recognized'])!r}")
        elif block["op"] == "delete":
            print(f"  FALTOU   {' '.join(block['target'])!r} (nao foi dito)")
        elif block["op"] == "insert":
            print(f"  SOBROU   {' '.join(block['recognized'])!r} (dito a mais)")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--exercise-id", type=int, required=True)
    parser.add_argument("--audio-path", type=Path, required=True)
    args = parser.parse_args()

    result = score_attempt(args.exercise_id, args.audio_path)
    print(f"attempt id={result['attempt_id']}\n")
    print_diff(result)


if __name__ == "__main__":
    main()
