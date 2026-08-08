"""Fase 4 (CLAUDE.md) -- fila de revisao humana pros itens flagged pelo harness
(validation/harness.py). Fecha o ciclo que validation_status='human_reviewed'
previa desde 0001_init.sql mas nunca teve ferramenta nenhuma: exporta os
flagged do D1 pra uma planilha (mesmo formato que o projeto ja usa desde as
3 planilhas originais em data/raw/), o usuario preenche a coluna "decisao"
numa sessao de revisao, e import_review_decisions.py aplica de volta no D1.

flag_reason/flag_detail so existem no D1 a partir da migration
0004_review_workflow.sql -- itens gravados ANTES dela ficam com essas colunas
vazias na planilha, mas ainda aparecem pra revisao via validation_status='flagged'.

Uso:
    python -m deutsch_pipeline.validation.export_review_queue
    python -m deutsch_pipeline.validation.export_review_queue --out pipeline/output/review/fila_2026-08-05.xlsx
"""
import argparse
import json
from pathlib import Path

import pandas as pd
from openpyxl import load_workbook
from openpyxl.worksheet.datavalidation import DataValidation

from ..ingest.write_exercises import query_d1

REPO_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_OUT = REPO_ROOT / "pipeline" / "output" / "review" / "fila_revisao.xlsx"

DECISION_OPTIONS = ["aprovar", "corrigir", "rejeitar"]

COLUMNS = [
    "id", "categoria", "topico", "prompt", "accepted_answers", "flag_reason",
    "motivo", "generated_by", "source_rule", "decisao", "prompt_corrigido",
    "accepted_answers_corrigido",
]
COLUMN_WIDTHS = [6, 24, 40, 50, 30, 18, 50, 22, 40, 12, 50, 30]


def _flag_detail_summary(raw) -> str:
    """Reduz o JSON de flag_detail (validation/harness.py) pra 1 linha legivel
    na planilha -- o revisor nao precisa do JSON cru, so o motivo em texto.
    raw pode vir NaN do pandas (coluna NULL no D1, ex.: linhas gravadas antes
    da migration 0004_review_workflow.sql existir) -- NaN e' truthy em Python
    puro (`not float('nan')` == False), entao `if not raw` sozinho nao pega
    esse caso e cai no TypeError de `"detail" in NaN` mais abaixo."""
    if raw is None or (isinstance(raw, float) and pd.isna(raw)) or raw == "":
        return ""
    try:
        detail = json.loads(raw) if isinstance(raw, str) else raw
    except (json.JSONDecodeError, TypeError):
        return str(raw)
    if not detail:
        return ""
    if "detail" in detail:  # case_check (case_mismatch)
        return (f"esperado {detail.get('expected_case')}, achou "
                f"{detail.get('found_case')} em {detail.get('found_token')!r}: {detail.get('detail')}")
    if "languagetool_matches" in detail:  # lt_flagged
        msgs = [m.get("message", "") for m in detail["languagetool_matches"]]
        return " | ".join(msgs)
    if "removed_alternates" in detail:  # bad_alternate_answer (repair falhou -- caso raro)
        alts = [f"{a.get('alternate')!r} ({a.get('message')})" for a in detail["removed_alternates"]]
        return " | ".join(alts)
    return json.dumps(detail, ensure_ascii=False)


def load_flagged() -> pd.DataFrame:
    rows = query_d1(
        "SELECT e.id, ct.categoria, ct.topico, e.prompt, e.accepted_answers, "
        "e.flag_reason, e.flag_detail, e.generated_by, e.source_rule "
        "FROM exercises e "
        "LEFT JOIN content_topics ct ON e.content_topic_id = ct.id "
        "WHERE e.validation_status = 'flagged' "
        "ORDER BY ct.topico, e.id;"
    )
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    df["accepted_answers"] = df["accepted_answers"].apply(
        lambda v: ", ".join(json.loads(v)) if v else ""
    )
    df["motivo"] = df["flag_detail"].apply(_flag_detail_summary)
    df["decisao"] = ""
    df["prompt_corrigido"] = ""
    df["accepted_answers_corrigido"] = ""
    return df[COLUMNS]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    df = load_flagged()
    if df.empty:
        print("Nenhum item com validation_status='flagged' -- nada pra exportar.")
        return

    args.out.parent.mkdir(parents=True, exist_ok=True)
    df.to_excel(args.out, index=False, sheet_name="revisao")

    wb = load_workbook(args.out)
    ws = wb["revisao"]
    decisao_col = COLUMNS.index("decisao") + 1  # 1-indexed
    dv = DataValidation(type="list", formula1=f'"{",".join(DECISION_OPTIONS)}"', allow_blank=True)
    ws.add_data_validation(dv)
    dv.add(f"{ws.cell(row=2, column=decisao_col).coordinate}:{ws.cell(row=len(df) + 1, column=decisao_col).coordinate}")
    for i, width in enumerate(COLUMN_WIDTHS, start=1):
        ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = width
    ws.freeze_panes = "A2"
    wb.save(args.out)

    print(f"{len(df)} itens flagged exportados pra {args.out}")
    print("Preencha a coluna 'decisao' (aprovar/corrigir/rejeitar) -- se corrigir, "
          "preencha tambem prompt_corrigido e/ou accepted_answers_corrigido (separadas por virgula).")
    print(f"Depois: python -m deutsch_pipeline.validation.import_review_decisions --in {args.out}")


if __name__ == "__main__":
    main()
