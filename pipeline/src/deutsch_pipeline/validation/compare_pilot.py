"""Compara os lotes .lt.json de dois (ou mais) modelos do piloto: taxa por
STATUS (nao so auto_ok/flagged binario -- ver relatorio de auditoria da Fase 0)
por topico. status possiveis: auto_ok, structural_mismatch, case_mismatch,
lt_flagged.

Uso:
    python -m deutsch_pipeline.validation.compare_pilot \
        pipeline/output/piloto/mistral-small.lt.json \
        pipeline/output/piloto/deepseek-r1-multi-7b.lt.json
"""
import argparse
import json
from collections import defaultdict
from pathlib import Path

OUTPUT_DIR = Path(__file__).resolve().parents[4] / "output" / "piloto"
STATUSES = ["auto_ok", "structural_mismatch", "case_mismatch", "lt_flagged", "bad_alternate_answer"]


def summarize(path: Path) -> dict:
    exercises = json.loads(path.read_text(encoding="utf-8"))
    model = exercises[0]["generated_by"] if exercises else path.stem

    by_topic = defaultdict(lambda: {s: 0 for s in STATUSES})
    totals = {s: 0 for s in STATUSES}
    for ex in exercises:
        topic = ex["topic"]
        status = ex["flag_reason"]
        if status not in STATUSES:
            status = "lt_flagged"  # fallback pra status desconhecido/legado
        by_topic[topic][status] += 1
        totals[status] += 1

    total = len(exercises)
    return {
        "model": model,
        "file": str(path),
        "total": total,
        "totals": totals,
        "auto_ok_rate": round(totals["auto_ok"] / total, 3) if total else None,
        "by_topic": dict(by_topic),
    }


def print_table(summaries: list[dict]):
    print("\n=== Comparativo agregado (taxa de auto_ok real, 3 gates) ===")
    print(f"{'modelo':30s} {'itens':>6s} {'auto_ok':>8s} {'estrutural':>11s} {'caso':>6s} {'LT':>6s} {'taxa ok':>9s}")
    for s in summaries:
        t = s["totals"]
        print(
            f"{s['model']:30s} {s['total']:6d} {t['auto_ok']:8d} "
            f"{t['structural_mismatch']:11d} {t['case_mismatch']:6d} {t['lt_flagged']:6d} "
            f"{s['auto_ok_rate']:>8.1%}"
        )

    print("\n=== Por tópico ===")
    topics = sorted({t for s in summaries for t in s["by_topic"]})
    for topic in topics:
        print(f"\n{topic}")
        for s in summaries:
            d = s["by_topic"].get(topic)
            if not d:
                continue
            total_topic = sum(d.values())
            print(
                f"  {s['model'][:28]:28s} auto_ok={d['auto_ok']}/{total_topic}  "
                f"estrutural={d['structural_mismatch']}  caso={d['case_mismatch']}  LT={d['lt_flagged']}"
            )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("inputs", nargs="+", type=Path, help="arquivos .lt.json, um por modelo")
    parser.add_argument("--out", type=Path, default=OUTPUT_DIR / "comparativo.json")
    args = parser.parse_args()

    summaries = [summarize(p) for p in args.inputs]
    print_table(summaries)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(summaries, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nResumo estruturado salvo em {args.out}")


if __name__ == "__main__":
    main()
