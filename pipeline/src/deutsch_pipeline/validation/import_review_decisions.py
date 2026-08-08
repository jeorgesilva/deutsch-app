"""Fase 4 (CLAUDE.md) -- le a planilha preenchida por
validation/export_review_queue.py e aplica as decisoes no D1: fecha o ciclo
pro validation_status='human_reviewed' que o schema previa desde
0001_init.sql mas nunca tinha ferramenta nenhuma.

decisao (coluna preenchida na planilha):
    aprovar  -> validation_status='human_reviewed', prompt/accepted_answers
                ficam como estao (o revisor confirma que a frase esta certa
                apesar do flag_reason -- ex.: LanguageTool bateu falso positivo)
    corrigir -> aplica prompt_corrigido/accepted_answers_corrigido (o que tiver
                preenchido), validation_status='human_reviewed'
    rejeitar -> validation_status='rejected' (NAO apaga a linha -- mantem
                auditoria de que foi gerado e por que foi rejeitado)
    (vazio)  -> ignorado, item continua 'flagged' pra proxima rodada

Uso:
    python -m deutsch_pipeline.validation.import_review_decisions --in pipeline/output/review/fila_revisao.xlsx
"""
import argparse
import json
from pathlib import Path

import pandas as pd

from ..ingest.write_exercises import execute_d1, sql_value

VALID_DECISIONS = {"aprovar", "corrigir", "rejeitar"}


def _clean_cell(value) -> str:
    """Celula do Excel -> string limpa, tratando NaN do pandas como vazio.
    Achado real (auditoria de calibracao, nao teorico): deixar
    accepted_answers_corrigido em branco enquanto preenchia so prompt_corrigido
    corrompeu accepted_answers pra literalmente '["nan"]' -- `str(NaN or "")`
    avalia pra 'nan' (NaN e' truthy em Python puro), no mesmo padrao ja
    corrigido em export_review_queue.py e no loop principal deste arquivo."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    return str(value).strip()


def build_update(row) -> str | None:
    decisao = _clean_cell(row.get("decisao")).lower()
    ex_id = int(row["id"])

    if decisao == "aprovar":
        return f"UPDATE exercises SET validation_status = 'human_reviewed' WHERE id = {ex_id};"

    if decisao == "corrigir":
        sets = ["validation_status = 'human_reviewed'"]
        prompt_corrigido = _clean_cell(row.get("prompt_corrigido"))
        if prompt_corrigido:
            sets.append(f"prompt = {sql_value(prompt_corrigido)}")
        alts_corrigido = _clean_cell(row.get("accepted_answers_corrigido"))
        if alts_corrigido:
            alts_list = [a.strip() for a in alts_corrigido.split(",") if a.strip()]
            sets.append(f"accepted_answers = {sql_value(json.dumps(alts_list, ensure_ascii=False))}")
        return f"UPDATE exercises SET {', '.join(sets)} WHERE id = {ex_id};"

    if decisao == "rejeitar":
        return f"UPDATE exercises SET validation_status = 'rejected' WHERE id = {ex_id};"

    return None  # vazio ou invalido -- nao mexe, fica 'flagged'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--in", dest="in_path", type=Path, required=True)
    args = parser.parse_args()

    df = pd.read_excel(args.in_path)

    statements, skipped_empty, skipped_invalid = [], 0, []
    for _, row in df.iterrows():
        decisao_raw = _clean_cell(row.get("decisao")).lower()
        if not decisao_raw:
            skipped_empty += 1
            continue
        if decisao_raw not in VALID_DECISIONS:
            skipped_invalid.append(f"id {row['id']}: decisao invalida {decisao_raw!r}")
            continue
        stmt = build_update(row)
        if stmt:
            statements.append(stmt)

    if statements:
        execute_d1("\n".join(statements))

    print(f"{len(statements)} decisoes aplicadas, {skipped_empty} sem decisao (continuam 'flagged')")
    for line in skipped_invalid:
        print(f"  [invalido] {line}")


if __name__ == "__main__":
    main()
