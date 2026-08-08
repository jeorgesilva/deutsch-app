"""Fase 5 (CLAUDE.md, docs/06) -- gera e grava um `reading_block` (texto-base
original B2/C1, inspirado em fatos de uma notícia real, nunca copiado).

Diferente de generate_batch.py: aqui não há gap_answer/case-adherence (não é
um exercício de lacuna, é um texto corrido) -- a validação é só LanguageTool
sobre o texto inteiro. Os EXERCÍCIOS que consomem esse texto (as 10 engines
do docs/06) são gerados depois, num passo separado, apontando pro
reading_block_id via reading_block_items.

Uso:
    python -m deutsch_pipeline.generation.generate_reading_block \\
        --model hf:deepseek-ai/DeepSeek-V3 \\
        --titulo-fonte "Artemis-Mondmission" --fonte-nome Nachrichtenleicht \\
        --fonte-url https://www.nachrichtenleicht.de/... \\
        --fatos-file /tmp/fatos.txt --nivel B2/C1
"""
import argparse
import json
import re
from pathlib import Path

from . import llm_client
from .prompts_reading_block import SYSTEM_PROMPT, build_user_prompt
from ..ingest.write_exercises import execute_d1, query_d1, sql_value

JSON_OBJECT_RE = re.compile(r"\{.*\}", re.DOTALL)


def extract_json_object(raw: str) -> dict:
    raw = raw.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    match = JSON_OBJECT_RE.search(raw)
    if not match:
        raise ValueError(f"Nenhum objeto JSON encontrado na resposta:\n{raw[:500]}")
    return json.loads(match.group(0))


def generate_text(model: str, fatos: str, fonte_nome: str, nivel: str) -> dict:
    user_prompt = build_user_prompt(fatos, fonte_nome, nivel)
    raw = llm_client.chat(model, SYSTEM_PROMPT, user_prompt, temperature=0.7)
    return extract_json_object(raw)


def check_text(texto: str, languagetool) -> list[dict]:
    matches = languagetool.check(texto)
    return [
        {"rule_id": m.rule_id, "message": m.message, "context": m.context, "offset": m.offset}
        for m in matches
    ]


def write_reading_block(titulo: str, texto: str, fonte_factual: str, fonte_url: str, nivel: str, content_topic_id: int | None = None) -> int:
    stmt = (
        "INSERT INTO reading_blocks (titulo, texto_base, fonte_factual, fonte_url, nivel, content_topic_id) "
        f"VALUES ({sql_value(titulo)}, {sql_value(texto)}, {sql_value(fonte_factual)}, "
        f"{sql_value(fonte_url)}, {sql_value(nivel)}, {content_topic_id if content_topic_id else 'NULL'});"
    )
    execute_d1(stmt)
    rows = query_d1("SELECT id FROM reading_blocks ORDER BY id DESC LIMIT 1;")
    return rows[0]["id"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", required=True)
    parser.add_argument("--fonte-nome", required=True, help="ex.: Nachrichtenleicht, DW, ZDF")
    parser.add_argument("--fonte-url", required=True)
    parser.add_argument("--fatos-file", type=Path, required=True)
    parser.add_argument("--nivel", default="B2/C1")
    args = parser.parse_args()

    fatos = args.fatos_file.read_text(encoding="utf-8")

    draft = generate_text(args.model, fatos, args.fonte_nome, args.nivel)
    print(f"Título: {draft['titulo']}")
    print(f"Texto ({len(draft['texto'].split())} palavras):\n{draft['texto']}\n")

    import language_tool_python
    lt = language_tool_python.LanguageTool("de-DE")
    try:
        matches = check_text(draft["texto"], lt)
    finally:
        lt.close()

    print(f"LanguageTool: {len(matches)} matches")
    for m in matches[:10]:
        print(f"  [{m['rule_id']}] {m['message']} -- \"{m['context']}\"")

    block_id = write_reading_block(
        draft["titulo"], draft["texto"], args.fonte_nome, args.fonte_url, args.nivel,
    )
    print(f"\nreading_block gravado, id={block_id}")


if __name__ == "__main__":
    main()
