"""Fase 1 (CLAUDE.md) -- le as planilhas de gramatica e fonetica e gera o SQL
de seed pra popular content_topics/phonetic_points no D1.

A planilha de exercicios (Planilha_Exercicios_C1plus.xlsx) fica fora daqui --
ela alimenta a curadoria de exercise_templates/topic_template_map na Fase 2,
nao uma tabela propria.

Uso:
    python -m deutsch_pipeline.ingest.seed_sql
    (roda com --out pra escrever em outro lugar)

Saida: app/migrations/0002_seed_content.sql -- aplicar com
    npm --prefix app run db:seed:local
"""
import argparse
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[4]
GRAMATICA_XLSX = REPO_ROOT / "data" / "raw" / "Planilha_Gramatica_Alema_B2C1.xlsx"
FONETICA_XLSX = REPO_ROOT / "data" / "raw" / "Planilha_Fonetica_Pronuncia_Alema.xlsx"
DEFAULT_OUT = REPO_ROOT / "app" / "migrations" / "0002_seed_content.sql"


def sql_value(value) -> str:
    if pd.isna(value):
        return "NULL"
    text = str(value).strip()
    return "'" + text.replace("'", "''") + "'"


def build_content_topics_inserts(xlsx_path: Path = GRAMATICA_XLSX) -> list[str]:
    df = pd.read_excel(xlsx_path)
    statements = []
    for _, row in df.iterrows():
        values = [
            sql_value(row["Categoria"]),
            sql_value(row["Cap."]),
            sql_value(row["Tópico Gramatical"]),
            sql_value(row["Nível"]),
            sql_value(row["Descrição / Regra"]),
            sql_value(row["Exemplo"]),
            sql_value(row["Fonte"]),
        ]
        statements.append(
            "INSERT INTO content_topics (categoria, capitulo, topico, nivel, regra, exemplo, fonte) "
            f"VALUES ({', '.join(values)});"
        )
    return statements


def build_phonetic_points_inserts(xlsx_path: Path = FONETICA_XLSX) -> list[str]:
    df = pd.read_excel(xlsx_path)
    statements = []
    for _, row in df.iterrows():
        values = [
            sql_value(row["Categoria"]),
            sql_value(row["Tópico"]),
            sql_value(row["Prioridade pra você"]),
            sql_value(row["Descrição"]),
            sql_value(row["Exemplo"]),
            sql_value(row["Fonte"]),
        ]
        statements.append(
            "INSERT INTO phonetic_points (categoria, topico, prioridade, descricao, exemplo, fonte) "
            f"VALUES ({', '.join(values)});"
        )
    return statements


def build_seed_sql() -> str:
    topic_statements = build_content_topics_inserts()
    phonetic_statements = build_phonetic_points_inserts()
    lines = [
        "-- Fase 1 (CLAUDE.md) -- seed de content_topics/phonetic_points a partir de data/raw/.",
        "-- Gerado por pipeline/src/deutsch_pipeline/ingest/seed_sql.py -- nao editar a mao.",
        "",
        f"-- content_topics: {len(topic_statements)} linhas (Planilha_Gramatica_Alema_B2C1.xlsx)",
        *topic_statements,
        "",
        f"-- phonetic_points: {len(phonetic_statements)} linhas (Planilha_Fonetica_Pronuncia_Alema.xlsx)",
        *phonetic_statements,
        "",
    ]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    sql = build_seed_sql()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(sql, encoding="utf-8")
    print(f"SQL de seed escrito em {args.out}")


if __name__ == "__main__":
    main()
