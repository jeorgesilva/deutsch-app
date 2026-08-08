"""Checagem deterministica de aderencia a regra gramatical -- responde a pergunta
que o LanguageTool nao responde: "esta frase testa mesmo o caso que o topico
diz testar?" (ver relatorio de auditoria da Fase 0).

Achado da auditoria: no topico "...mit Dativ", 5/5 itens gerados pelo Mistral
usaram verbos/preposicoes fixos de Akkusativ (stolz auf, sich freuen ueber,
denken an) -- o LanguageTool nao flagou nenhum porque as frases sao
gramaticalmente validas em si, so nao testam a regencia pedida. Essa funcao
usa a feature morfologica "Case" do spaCy no token logo apos a lacuna pra
confirmar que o caso bate com o que o nome do topico promete (topics.py,
Topic.expected_case). So roda quando o topico declara um caso fixo -- os
dois topicos sem caso fixo (Wechselpraeposition, regencia mista) retornam
"n/a" e nao sao bloqueados por esta checagem.
"""
import re
from dataclasses import dataclass

import spacy

_NLP = None

# Generaliza o EXPECTED_CASE_BY_TOPIC hardcoded do piloto (so 4 topicos) pra
# qualquer um dos 100 topicos da KB: topico termina em "mit Akkusativ/Dativ/
# Genitiv" -> regencia fixa de UM caso so (ex. id 34, 35, 32). Deliberadamente
# conservador -- NAO casa "Verben mit Nominativ, Akkusativ und Dativ" (id 31)
# nem "Position von Dativ- und Akkusativobjekt" (id 3), que citam varios casos
# e nao tem um unico caso-alvo pra checar. Precisao > cobertura: um falso "n/a"
# so significa "esse topico nao passa por este gate", nunca um falso "mismatch"
# barrando conteudo correto.
_CASE_SUFFIX_RE = re.compile(r"\bmit (Akkusativ|Dativ|Genitiv)$")
_CASE_MAP = {"Akkusativ": "Acc", "Dativ": "Dat", "Genitiv": "Gen"}


def infer_expected_case(topic_name: str) -> str | None:
    match = _CASE_SUFFIX_RE.search(topic_name.strip())
    return _CASE_MAP[match.group(1)] if match else None


def get_nlp():
    global _NLP
    if _NLP is None:
        _NLP = spacy.load("de_core_news_lg")
    return _NLP


@dataclass
class CaseCheckResult:
    status: str  # "ok" | "mismatch" | "n/a" | "no_case_token"
    expected_case: str | None
    found_case: str | None
    found_token: str | None
    detail: str


def check_case_adherence(sentence_full: str, gap_answer: str, expected_case: str | None) -> CaseCheckResult:
    if expected_case is None:
        return CaseCheckResult("n/a", None, None, None, "tópico não declara caso fixo")

    gap_start = sentence_full.find(gap_answer)
    if gap_start == -1:
        return CaseCheckResult(
            "no_case_token", expected_case, None, None,
            "gap_answer não encontrado em sentence_full (deveria ter sido barrado antes desta checagem)",
        )
    gap_end = gap_start + len(gap_answer)

    doc = get_nlp()(sentence_full)
    following = [t for t in doc if t.idx >= gap_end]

    for tok in following[:3]:
        case_values = tok.morph.get("Case")
        if case_values:
            found = case_values[0]
            status = "ok" if found == expected_case else "mismatch"
            return CaseCheckResult(
                status, expected_case, found, tok.text,
                f"token '{tok.text}' logo após a lacuna está em {found}, esperado {expected_case}",
            )

    return CaseCheckResult(
        "no_case_token", expected_case, None, None,
        "nenhum token com Case morfológico marcado nos 3 tokens seguintes à lacuna",
    )
