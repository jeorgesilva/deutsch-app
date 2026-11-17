"""validation/harness.py::apply_review_policy -- docs/19, 4d(b). Roda sobre a
saida de validate_batch, entao os itens ja chegam com validation_status."""
from deutsch_pipeline.validation.export_review_queue import _flag_detail_summary
from deutsch_pipeline.validation.harness import apply_review_policy


def item(flag_reason, validation_status, flag_detail=None):
    return {"prompt": "Die Polizei untersucht den Vorfall.", "flag_reason": flag_reason,
            "validation_status": validation_status, "flag_detail": flag_detail}


def test_registerreformulation_auto_ok_vai_pra_revisao():
    out = apply_review_policy([item("auto_ok", "auto_ok"), item("repaired_alternate", "auto_ok")],
                              "RegisterReformulationEngine")
    assert [(e["flag_reason"], e["validation_status"]) for e in out] == [
        ("human_review_required", "flagged"), ("human_review_required", "flagged")]
    assert "conteúdo" in _flag_detail_summary(out[0]["flag_detail"])


def test_motivo_mais_especifico_de_outro_gate_e_mantido():
    lt = {"languagetool_matches": [{"message": "concordância"}]}
    out = apply_review_policy([item("lt_flagged", "flagged", lt)], "RegisterReformulationEngine")
    assert (out[0]["flag_reason"], out[0]["flag_detail"]) == ("lt_flagged", lt)


def test_outros_engines_nao_mudam():
    out = apply_review_policy([item("auto_ok", "auto_ok")], "StructuralTransformEngine")
    assert (out[0]["flag_reason"], out[0]["validation_status"]) == ("auto_ok", "auto_ok")
