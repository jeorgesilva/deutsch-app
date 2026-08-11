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
import os
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

# Fase 15 (geração diária automatizada, vídeo+notícia) -- dentro de
# services/generation-container/ não existe `wrangler` CLI (container Python
# puro, sem Node), então esse é o único jeito de um processo rodando lá
# escrever no D1 de PRODUÇÃO: D1 HTTP API direta (api.cloudflare.com),
# autenticada por um token de API escopado a D1 Edit (nunca a mesma sessão
# OAuth do `wrangler login` local -- essa não é exportável/portável). Fora do
# container (uso local/CI de sempre), D1_HTTP_API_TOKEN nunca está setado e o
# comportamento antigo (wrangler CLI, --local por padrão, --remote se
# D1_REMOTE=1 -- mesmo padrão já usado em lexicon/link_exercise_lexicon.py)
# continua idêntico, zero mudança de comportamento pros scripts existentes.
D1_ACCOUNT_ID = "2c5bff092c0408bc767cf746472a84ed"
D1_DATABASE_ID = "38bafa99-fe7f-415f-804b-139bf444b918"


def _d1_http_query(sql: str) -> list[dict]:
    import requests

    token = os.environ["D1_HTTP_API_TOKEN"]
    url = f"https://api.cloudflare.com/client/v4/accounts/{D1_ACCOUNT_ID}/d1/database/{D1_DATABASE_ID}/query"
    resp = requests.post(url, headers={"Authorization": f"Bearer {token}"}, json={"sql": sql}, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    if not data.get("success"):
        raise RuntimeError(f"D1 HTTP API error: {data.get('errors')}")
    return data["result"][0]["results"]


def query_d1(sql: str) -> list[dict]:
    if os.environ.get("D1_HTTP_API_TOKEN"):
        return _d1_http_query(sql)
    d1_target = "--remote" if os.environ.get("D1_REMOTE") else "--local"
    result = subprocess.run(
        ["npx", "wrangler", "d1", "execute", "deutsch-db", d1_target, "--json", "--command", sql],
        cwd=APP_DIR, capture_output=True, text=True, check=True,
    )
    return json.loads(result.stdout)[0]["results"]


def execute_d1(sql: str) -> None:
    if os.environ.get("D1_HTTP_API_TOKEN"):
        _d1_http_query(sql)
        return
    d1_target = "--remote" if os.environ.get("D1_REMOTE") else "--local"
    subprocess.run(
        ["npx", "wrangler", "d1", "execute", "deutsch-db", d1_target, "--command", sql],
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
