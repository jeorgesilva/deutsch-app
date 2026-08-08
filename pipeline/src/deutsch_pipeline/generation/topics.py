"""Carrega os topicos reais de Planilha_Gramatica_Alema_B2C1.xlsx usados no piloto da Fase 0.

Selecao (ver docs/04-prompt-inicial-claude-code.md): 4 topicos de regencia de caso
(preposicional), categorias "Praeposition" e "Verben, Adjektive, Nomen und ihre
Ergaenzungen" -- a regra e o exemplo ja curados na planilha viram o few-shot da
geracao (docs/02, "Exemplo concreto"). Nada aqui inventa regra gramatical nova.
"""
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

RAW_XLSX = Path(__file__).resolve().parents[4] / "data" / "raw" / "Planilha_Gramatica_Alema_B2C1.xlsx"

# Topicos selecionados pelo nome exato da coluna "Topico Gramatical" na planilha.
PILOT_TOPIC_NAMES = [
    "Wechselpräpositionen",
    "Verben, Nomen und Adjektive mit Präpositionen",
    "Verben, Adjektive und Nomen mit festen Präpositionen mit Akkusativ",
    "Verben, Adjektive und Nomen mit festen Präpositionen mit Dativ",
]

@dataclass
class Topic:
    id: int
    categoria: str
    topico: str
    nivel: str
    regra: str
    exemplo: str
    fonte: str

    @property
    def expected_case(self) -> str | None:
        """Caso gramatical fixo que o NOME do topico declara, se houver --
        usado pela checagem de aderencia a regra (validation/rule_adherence.py).
        Generalizado por regex (infer_expected_case), nao mais hardcoded pros
        4 topicos do piloto -- cobre qualquer um dos 100 topicos da KB."""
        from ..validation.rule_adherence import infer_expected_case
        return infer_expected_case(self.topico)


def load_pilot_topics(xlsx_path: Path = RAW_XLSX) -> list[Topic]:
    df = pd.read_excel(xlsx_path)
    topics = []
    for idx, row in df.iterrows():
        if row["Tópico Gramatical"] in PILOT_TOPIC_NAMES:
            topics.append(
                Topic(
                    id=idx,
                    categoria=row["Categoria"],
                    topico=row["Tópico Gramatical"],
                    nivel=str(row["Nível"]),
                    regra=row["Descrição / Regra"],
                    exemplo=row["Exemplo"],
                    fonte=row["Fonte"],
                )
            )
    missing = set(PILOT_TOPIC_NAMES) - {t.topico for t in topics}
    if missing:
        raise ValueError(f"Topicos nao encontrados na planilha: {missing}")
    return topics


if __name__ == "__main__":
    for t in load_pilot_topics():
        print(f"[{t.id}] {t.categoria} | {t.topico} ({t.nivel})")
        print(f"  regra:   {t.regra}")
        print(f"  exemplo: {t.exemplo}")
