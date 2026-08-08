"""CLI fino sobre validation/harness.py (Fase 3, CLAUDE.md) -- mantido como
entrada de linha de comando pro fluxo de arquivo .json usado desde a Fase 0.

Uso:
    python -m deutsch_pipeline.validation.languagetool_check --in pipeline/output/piloto/mistral-small.json
"""
import argparse
import json
from pathlib import Path

from .harness import validate_batch


def check_file(in_path: Path, out_path: Path | None = None) -> Path:
    exercises = json.loads(in_path.read_text(encoding="utf-8"))
    validate_batch(exercises)

    out_path = out_path or in_path.with_suffix(".lt.json")
    out_path.write_text(json.dumps(exercises, ensure_ascii=False, indent=2), encoding="utf-8")
    return out_path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--in", dest="in_path", type=Path, required=True)
    parser.add_argument("--out", dest="out_path", type=Path, default=None)
    args = parser.parse_args()

    out_path = check_file(args.in_path, args.out_path)

    exercises = json.loads(out_path.read_text(encoding="utf-8"))
    by_status: dict[str, int] = {}
    for e in exercises:
        by_status[e["flag_reason"]] = by_status.get(e["flag_reason"], 0) + 1

    print(f"{args.in_path.name}: {len(exercises)} itens")
    for status, count in sorted(by_status.items()):
        print(f"  {status}: {count}")
    print(f"Salvo em {out_path}")


if __name__ == "__main__":
    main()
