"""Fase 3 (CLAUDE.md) -- grava um lote validado por validation/harness.py na
tabela exercises do D1. Resolve content_topic_id/exercise_template_id por
NOME (consulta o D1), nao por id fixo -- nao depende de ordem de insercao.

Itens sem prompt utilizavel (gate estrutural falhou em generation/pilot.py,
flag_reason="structural_mismatch") sao pulados -- nao viram linha em
exercises, so contam nas estatisticas impressas.

Uso:
    python -m deutsch_pipeline.ingest.write_exercises --in pipeline/output/piloto/mistral-small_22b-instruct-2409-q3_K_M_v2.lt.json
"""
import argparse
import json
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
APP_DIR = REPO_ROOT / "app"

# Nome de template usado na geracao (docs/02, generation/prompts.py TEMPLATE_NAME)
# -> nome de engine cadastrado em exercise_templates (docs/05). So 1 entrada
# hoje porque so GapFillGovernanceEngine tem codigo de geracao (Fase 0/3);
# Fase 4 adiciona as outras 8 conforme ganham geracao propria.
TEMPLATE_NAME_TO_ENGINE = {
    "Completar lacunas com a regência correta": "GapFillGovernanceEngine",
}


def query_d1(sql: str) -> list[dict]:
    result = subprocess.run(
        ["npx", "wrangler", "d1", "execute", "deutsch-db", "--local", "--json", "--command", sql],
        cwd=APP_DIR, capture_output=True, text=True, check=True,
    )
    return json.loads(result.stdout)[0]["results"]


def execute_d1(sql: str) -> None:
    subprocess.run(
        ["npx", "wrangler", "d1", "execute", "deutsch-db", "--local", "--command", sql],
        cwd=APP_DIR, capture_output=True, text=True, check=True,
    )


def sql_value(value) -> str:
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def build_insert(
    ex: dict,
    content_topic_id: int | None,
    exercise_template_id: int,
    phonetic_point_id: int | None = None,
    audio_ref: str | None = None,
    source_type: str | None = None,
) -> str:
    """content_topic_id/phonetic_point_id sao mutuamente exclusivos na pratica
    (exercises.* permite os dois NULL ao mesmo tempo pelo schema, mas cada
    engine usa um ou outro -- Grupo A por topico gramatical usa
    content_topic_id, DictationEngine usa phonetic_point_id). audio_ref e'
    a chave do objeto no R2 (bucket deutsch-media), preenchida so por engines
    com audio (fase 7)."""
    flag_detail = ex.get("flag_detail")
    values = [
        str(exercise_template_id),
        str(content_topic_id) if content_topic_id is not None else "NULL",
        str(phonetic_point_id) if phonetic_point_id is not None else "NULL",
        "NULL",  # video_clip_id
        str(ex.get("variation") or "NULL"),
        sql_value(ex["prompt"]),
        sql_value(json.dumps(ex["accepted_answers"], ensure_ascii=False)),
        sql_value(ex.get("source_rule")),
        sql_value(audio_ref),
        sql_value(ex.get("generated_by")),
        sql_value(ex.get("validation_status", "pending")),
        sql_value(ex.get("flag_reason")),
        sql_value(json.dumps(flag_detail, ensure_ascii=False) if flag_detail is not None else None),
        sql_value(source_type),
    ]
    return (
        "INSERT INTO exercises (exercise_template_id, content_topic_id, phonetic_point_id, "
        "video_clip_id, variation_number, prompt, accepted_answers, source_rule, audio_ref, "
        "generated_by, validation_status, flag_reason, flag_detail, source_type) "
        f"VALUES ({', '.join(values)});"
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--in", dest="in_path", type=Path, required=True)
    args = parser.parse_args()

    exercises = json.loads(args.in_path.read_text(encoding="utf-8"))
    topics = {row["topico"]: row["id"] for row in query_d1("SELECT id, topico FROM content_topics;")}
    templates = {row["nome"]: row["id"] for row in query_d1("SELECT id, nome FROM exercise_templates;")}

    statements, skipped = [], []
    for ex in exercises:
        if not ex.get("prompt"):
            skipped.append(f"{ex.get('topic')!r}: sem prompt (gate estrutural falhou)")
            continue
        engine_name = TEMPLATE_NAME_TO_ENGINE.get(ex.get("template"))
        content_topic_id = topics.get(ex.get("topic"))
        exercise_template_id = templates.get(engine_name)
        if content_topic_id is None or exercise_template_id is None:
            skipped.append(f"{ex.get('topic')!r} / {ex.get('template')!r}: nao encontrado no D1")
            continue
        statements.append(build_insert(ex, content_topic_id, exercise_template_id))

    if statements:
        execute_d1("\n".join(statements))

    print(f"{len(statements)} exercicios inseridos, {len(skipped)} pulados (de {len(exercises)})")
    for reason in skipped:
        print(f"  [pulado] {reason}")


if __name__ == "__main__":
    main()
