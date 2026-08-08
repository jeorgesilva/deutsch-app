"""Fase 2 (CLAUDE.md) -- curadoria topic_template_map: quais templates do
Grupo A (docs/02, docs/05-engines-por-exercicio.xlsx) se aplicam a quais
content_topics/phonetic_points.

Isso e' "trabalho humano assistido, nao 100% automatico" (CLAUDE.md, Fase 2):
o default por categoria abaixo (CATEGORY_DEFAULTS) e' um ponto de partida
derivado da propria curadoria ja feita nas planilhas (as 18 categorias), com
excecoes pontuais por topico (TOPIC_OVERRIDES) onde o default de categoria
erraria o alvo -- por exemplo "Nominalisierung" pede RegisterReformulationEngine
mesmo estando na categoria 13 (default StructuralTransformEngine), porque e'
literalmente o topico de Nominalstil. Este arquivo e' o registro editavel
dessa curadoria -- revisar/ajustar aqui antes de rodar de novo, nao só aceitar
o resultado como definitivo.

So cobre os ~9 templates do Grupo A que precisam de um topico/regra como
few-shot (docs/02); TransitionPhraseEngine/ReactionPhraseEngine (itens 93/94)
ficam registrados em exercise_templates mas sem linhas em topic_template_map --
sao flashcards de linguagem funcional, nao amarrados a uma regra gramatical
especifica.

Uso:
    python -m deutsch_pipeline.ingest.seed_template_map
    (precisa que content_topics/phonetic_points ja estejam populados no D1
    local -- rodar depois de `npm run db:seed:local`, ver Fase 1)

Saida: app/migrations/0003_seed_topic_template_map.sql
"""
import argparse
import json
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
APP_DIR = REPO_ROOT / "app"
DEFAULT_OUT = APP_DIR / "migrations" / "0003_seed_topic_template_map.sql"

# Catalogo fixo dos templates Grupo A (docs/05-engines-por-exercicio.xlsx,
# IDs 8, 9, 10, 17, 19, 20, 28, 93, 94). IDs explicitos aqui para nao depender
# da ordem de insercao no D1.
EXERCISE_TEMPLATES = [
    (1, "GapFillGovernanceEngine", "deterministico", 0, 0),
    (2, "FillBlankEngine", "deterministico", 0, 0),
    (3, "WordBankGuessEngine", "deterministico", 0, 0),
    (4, "StructuralTransformEngine", "deterministico", 0, 0),
    (5, "RegisterReformulationEngine", "hibrida", 0, 0),
    (6, "UnscrambleEngine", "deterministico", 0, 0),
    (7, "DictationEngine", "deterministico", 1, 0),
    (8, "TransitionPhraseEngine", "deterministico", 0, 0),
    (9, "ReactionPhraseEngine", "deterministico", 0, 0),
]
TEMPLATE_ID = {nome: id_ for id_, nome, *_ in EXERCISE_TEMPLATES}

# Default por categoria (categoria exata de content_topics -> templates aplicaveis).
# Categoria 14 ("Und noch mehr Wissenswertes": Kommaregeln, Formen da lingua falada)
# fica sem template Grupo A -- Kommaregeln e' coberta por PunctuationCapsEngine
# na Fase 5 (bloco de leitura), nao por um drill deste grupo.
CATEGORY_DEFAULTS = {
    "1. Wortpositionen im Satz": ["UnscrambleEngine"],
    "2. Konjunktiv II": ["StructuralTransformEngine"],
    "3. Passiv": ["StructuralTransformEngine"],
    "4. Präpositionen": ["GapFillGovernanceEngine"],
    "5. Verben, Adjektive, Nomen und ihre Ergänzungen": ["GapFillGovernanceEngine"],
    "6. Bildung der Zeiten": ["FillBlankEngine"],
    "7. Modalverben, lassen und (un)trennbare Verben": ["FillBlankEngine"],
    "8. Nomen, Artikel und Pronomen": ["FillBlankEngine", "WordBankGuessEngine"],
    "9. Adjektive": ["FillBlankEngine", "WordBankGuessEngine"],
    "10. Indirekte Rede": ["StructuralTransformEngine", "FillBlankEngine"],
    "11. Nebensätze": ["FillBlankEngine", "UnscrambleEngine"],
    "12. Besondere Wörter und Wortverbindungen": ["FillBlankEngine"],
    "13. Umformung von Sätzen": ["StructuralTransformEngine"],
    "14. Und noch mehr Wissenswertes": [],
    "15. Wortbildung (complementar — PONS)": ["FillBlankEngine", "WordBankGuessEngine"],
    "16. Zahlwörter (complementar — PONS)": ["FillBlankEngine", "WordBankGuessEngine"],
    "17. Partikeln und Interjektionen (complementar — PONS)": ["FillBlankEngine", "WordBankGuessEngine"],
    "18. Rechtschreibung und Zeichensetzung (complementar — PONS)": ["WordBankGuessEngine"],
}

# Excecoes pontuais por nome exato de topico -- somam ao default da categoria.
TOPIC_OVERRIDES: dict[str, list[str]] = {
    "Nominalisierung": ["RegisterReformulationEngine"],
    "Nominalisierende Suffixe (-heit, -keit, -ung, -schaft, -tum)": ["RegisterReformulationEngine"],
    "Doppelkonnektoren": ["UnscrambleEngine"],
    "Position und Direktion": ["UnscrambleEngine"],
    "Funktionsverbgefüge 1": ["GapFillGovernanceEngine"],
    "Funktionsverbgefüge 2": ["GapFillGovernanceEngine"],
    "Infinitiv mit und ohne zu": ["StructuralTransformEngine"],
    "Nebensatz mit dass und Infinitiv mit zu": ["StructuralTransformEngine"],
    "Finale und modale Infinitiv- und Nebensätze": ["StructuralTransformEngine"],
    "Relativpronomen im Nominativ, Akkusativ und Dativ": ["WordBankGuessEngine"],
    "Relativpronomen im Genitiv": ["WordBankGuessEngine"],
    "Relativpronomen mit w- und als": ["WordBankGuessEngine"],
}

# Fonetica: todo phonetic_point serve de base pro DictationEngine (item 28) --
# ReadAloudEngine/SpokenGapFillEngine (docs/08) sao Fase 8, fora deste escopo.
PHONETIC_TEMPLATES = ["DictationEngine"]


def query_d1(sql: str) -> list[dict]:
    result = subprocess.run(
        ["npx", "wrangler", "d1", "execute", "deutsch-db", "--local", "--json", "--command", sql],
        cwd=APP_DIR,
        capture_output=True,
        text=True,
        check=True,
    )
    payload = json.loads(result.stdout)
    return payload[0]["results"]


def build_exercise_templates_sql() -> list[str]:
    statements = []
    for id_, nome, mecanismo, requires_audio, requires_video in EXERCISE_TEMPLATES:
        statements.append(
            "INSERT INTO exercise_templates (id, nome, grupo, mecanismo_correcao, requires_audio, requires_video) "
            f"VALUES ({id_}, '{nome}', 'A', '{mecanismo}', {requires_audio}, {requires_video});"
        )
    return statements


def build_content_topic_map_sql(rows: list[dict]) -> tuple[list[str], list[str]]:
    statements = []
    unmapped = []
    for row in rows:
        templates = set(CATEGORY_DEFAULTS.get(row["categoria"], []))
        templates.update(TOPIC_OVERRIDES.get(row["topico"], []))
        if not templates:
            unmapped.append(f"[{row['id']}] {row['categoria']} | {row['topico']}")
            continue
        for nome in sorted(templates):
            statements.append(
                "INSERT INTO topic_template_map (content_topic_id, phonetic_point_id, exercise_template_id) "
                f"VALUES ({row['id']}, NULL, {TEMPLATE_ID[nome]});"
            )
    return statements, unmapped


def build_phonetic_map_sql(rows: list[dict]) -> list[str]:
    statements = []
    for row in rows:
        for nome in PHONETIC_TEMPLATES:
            statements.append(
                "INSERT INTO topic_template_map (content_topic_id, phonetic_point_id, exercise_template_id) "
                f"VALUES (NULL, {row['id']}, {TEMPLATE_ID[nome]});"
            )
    return statements


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    content_topics = query_d1("SELECT id, categoria, topico FROM content_topics;")
    phonetic_points = query_d1("SELECT id FROM phonetic_points;")

    template_statements = build_exercise_templates_sql()
    topic_statements, unmapped = build_content_topic_map_sql(content_topics)
    phonetic_statements = build_phonetic_map_sql(phonetic_points)

    lines = [
        "-- Fase 2 (CLAUDE.md) -- curadoria topic_template_map (exercise_templates + mapeamento).",
        "-- Gerado por pipeline/src/deutsch_pipeline/ingest/seed_template_map.py.",
        "-- Regras editaveis em CATEGORY_DEFAULTS/TOPIC_OVERRIDES nesse arquivo -- revisar antes de reaplicar.",
        "",
        f"-- exercise_templates: {len(template_statements)} templates do Grupo A",
        *template_statements,
        "",
        f"-- topic_template_map (content_topics): {len(topic_statements)} linhas",
        *topic_statements,
        "",
        f"-- topic_template_map (phonetic_points): {len(phonetic_statements)} linhas",
        *phonetic_statements,
        "",
    ]
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text("\n".join(lines), encoding="utf-8")

    print(f"SQL escrito em {args.out}")
    print(f"{len(template_statements)} exercise_templates, "
          f"{len(topic_statements)} mapeamentos de content_topics, "
          f"{len(phonetic_statements)} mapeamentos de phonetic_points")
    if unmapped:
        print(f"\n{len(unmapped)} content_topics sem template Grupo A aplicavel (esperado p/ categoria 14):")
        for line in unmapped:
            print("  -", line)


if __name__ == "__main__":
    main()
