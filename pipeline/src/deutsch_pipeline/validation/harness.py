"""Fase 3 (CLAUDE.md) -- harness de validacao reutilizavel, generalizado a
partir dos 3 gates corrigidos na auditoria da Fase 0 (ver
validation/languagetool_check.py e validation/rule_adherence.py), mais um 4o
gate encontrado faltando durante a demonstracao da Fase 3: os 3 gates
originais so checavam "sentence_full" (que usa accepted_answers[0] == gap_answer)
-- nunca as outras strings de accepted_answers. Rodando o harness "completo"
contra dados reais, achamos respostas alternativas erradas escapando por essa
brecha (ex.: accepted_answers=["auf","auff"] -- "auff" nao e' palavra alema,
e' erro de digitacao do modelo, nao uma variante de grafia legitima como
"ueber" pra "über"). Gate 4 (check_alternate_answers) reconstroi a frase com
CADA resposta aceita (nao so a primeira) e roda LanguageTool em cada uma.

API publica: validate_batch(exercises) -- roda os 4 gates numa lista de
exercicios gerados (formato generation/pilot.py: topic/sentence_full/
gap_answer/accepted_answers/prompt/expected_case) e devolve a mesma lista
com "validation_status" preenchido em duas granularidades:

- ex["flag_reason"]: diagnostico fino -- "auto_ok" | "repaired_alternate" |
  "structural_mismatch" | "case_mismatch" | "lt_flagged" | "bad_alternate_answer".
  Desde a migration 0004_review_workflow.sql tambem vai pro D1 (coluna
  flag_reason), junto com flag_detail (JSON) -- antes so existia no JSON local,
  o que deixava a fila de revisao humana sem saber POR QUE algo foi flagged.
- ex["validation_status"]: vocabulario do schema real (exercises.validation_status:
  'pending' | 'auto_ok' | 'flagged' | 'human_reviewed' | 'rejected', este ultimo
  adicionado em 0004 pra fila de revisao poder descartar sem hard-delete) --
  e' isso que ingest/write_exercises.py grava no banco.

Uso:
    from deutsch_pipeline.validation.harness import validate_batch
    validated = validate_batch(exercises)
"""
from .rule_adherence import check_case_adherence

DB_STATUS = {
    "auto_ok": "auto_ok",
    "repaired_alternate": "auto_ok",
    "structural_mismatch": "flagged",
    "case_mismatch": "flagged",
    "lt_flagged": "flagged",
    "bad_alternate_answer": "flagged",
}


def find_bad_alternates(languagetool, sentence_full: str, gap_answer: str, accepted_answers: list[str]) -> list[dict]:
    """Reconstroi sentence_full com CADA resposta aceita (exceto gap_answer,
    ja coberto pelo check de sentence_full em si) e roda LanguageTool em cada
    uma. Ao contrario da versao antiga (check_alternate_answers, que parava na
    primeira falha), verifica TODAS -- pra permitir reparo mecanico (remover so
    as alternativas ruins, ex. "auff" de digitacao) em vez de descartar o item
    inteiro por causa de UMA alternativa ruim quando a frase e o gap_answer ja
    passaram limpo em todos os outros gates."""
    idx = sentence_full.find(gap_answer)
    if idx == -1:
        return []
    prefix, suffix = sentence_full[:idx], sentence_full[idx + len(gap_answer):]

    bad = []
    for alt in accepted_answers:
        if alt == gap_answer:
            continue
        candidate = prefix + alt + suffix
        matches = languagetool.check(candidate)
        if matches:
            bad.append({
                "alternate": alt,
                "reconstructed": candidate,
                "rule_id": matches[0].rule_id,
                "message": matches[0].message,
            })
    return bad


def validate_batch(exercises: list[dict], languagetool=None) -> list[dict]:
    """Roda os 3 gates. Se languagetool=None, abre e fecha um servidor local
    de-DE pra chamada (custo de startup do Java soh 1x por batch)."""
    owns_tool = languagetool is None
    if owns_tool:
        import language_tool_python
        languagetool = language_tool_python.LanguageTool("de-DE")

    try:
        for ex in exercises:
            if ex.get("flag_reason") == "structural_mismatch" or ex.get("validation_status") == "structural_mismatch":
                ex["flag_reason"] = "structural_mismatch"
                ex["case_check"] = {"status": "skipped"}
                ex["languagetool_matches"] = []
                ex["flag_detail"] = None
                ex["validation_status"] = DB_STATUS["structural_mismatch"]
                continue

            sentence = ex.get("sentence_full") or ""

            case_result = check_case_adherence(
                sentence_full=sentence,
                gap_answer=ex.get("gap_answer") or "",
                expected_case=ex.get("expected_case"),
            )
            ex["case_check"] = {
                "status": case_result.status,
                "expected_case": case_result.expected_case,
                "found_case": case_result.found_case,
                "found_token": case_result.found_token,
                "detail": case_result.detail,
            }

            matches = languagetool.check(sentence)
            ex["languagetool_matches"] = [
                {
                    "rule_id": m.rule_id,
                    "message": m.message,
                    "context": m.context,
                    "offset": m.offset,
                    "length": m.error_length,
                    "replacements": m.replacements[:5],
                }
                for m in matches
            ]

            if case_result.status == "mismatch":
                ex["flag_reason"] = "case_mismatch"
                ex["flag_detail"] = ex["case_check"]
            elif matches:
                ex["flag_reason"] = "lt_flagged"
                ex["flag_detail"] = {"languagetool_matches": ex["languagetool_matches"][:3]}
            else:
                bad_alts = find_bad_alternates(
                    languagetool, sentence, ex.get("gap_answer") or "", ex.get("accepted_answers") or []
                )
                ex["alternate_answer_check"] = bad_alts or None
                if bad_alts:
                    bad_values = {b["alternate"] for b in bad_alts}
                    repaired = [a for a in (ex.get("accepted_answers") or []) if a not in bad_values]
                    ex["removed_alternates"] = bad_alts
                    if repaired:
                        # gap_answer sempre sobrevive (nunca esta em bad_alts --
                        # find_bad_alternates pula ele -- e sentence_full ja
                        # passou LanguageTool limpo pra chegar ate aqui), entao
                        # repaired nunca deveria vir vazio; o else abaixo e'
                        # so uma rede de seguranca defensiva.
                        ex["accepted_answers"] = repaired
                        ex["flag_reason"] = "repaired_alternate"
                        ex["flag_detail"] = {"removed_alternates": bad_alts}
                    else:
                        ex["flag_reason"] = "bad_alternate_answer"
                        ex["flag_detail"] = {"removed_alternates": bad_alts}
                else:
                    ex["flag_reason"] = "auto_ok"
                    ex["flag_detail"] = None
            ex["validation_status"] = DB_STATUS[ex["flag_reason"]]
    finally:
        if owns_tool:
            languagetool.close()

    return exercises
