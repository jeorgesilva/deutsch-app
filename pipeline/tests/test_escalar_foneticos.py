"""pipeline/scripts/escalar_foneticos.py -- seleção das frases de origem,
chave R2 e gravação em blocos. D1, Piper e R2 são mockados."""
import importlib.util
import json
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "escalar_foneticos.py"


@pytest.fixture
def script():
    spec = importlib.util.spec_from_file_location("escalar_foneticos", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def dictation(id_, prompt, point):
    return {"id": id_, "template": "DictationEngine", "prompt": prompt,
            "accepted_answers": json.dumps([prompt]), "content_topic_id": None,
            "phonetic_point_id": point, "topico": None}


def gapfill(id_, prompt, accepted, topico="Wechselpräpositionen", topic_id=7):
    return {"id": id_, "template": "GapFillGovernanceEngine", "prompt": prompt,
            "accepted_answers": json.dumps(accepted), "content_topic_id": topic_id,
            "phonetic_point_id": None, "topico": topico}


def test_readaloud_vem_do_ditado_com_ponto_fonetico(script):
    plan, skipped = script.select([dictation(1, "Das Buch ist dick.", 5), dictation(2, "Ohne Ponto.", None)], [])
    assert [(it["template"], it["source_id"], it["phonetic_point_id"]) for it in plan] == [("ReadAloudEngine", 1, 5)]
    assert plan[0]["accepted_answers"] == ["Das Buch ist dick."]
    assert plan[0]["content_topic_id"] is None
    assert skipped == {"ditado_sem_ponto_fonetico": 1}


def test_spokengapfill_reconstroi_a_frase_como_o_attempts_ts(script):
    plan, _ = script.select([gapfill(3, "Sie stellte das ___.", ["in Frage", "inFrage"])], [])
    assert plan[0]["template"] == "SpokenGapFillEngine"
    assert plan[0]["prompt"] == "Sie stellte das ___."
    assert plan[0]["accepted_answers"] == ["in Frage", "inFrage"]
    assert plan[0]["sentence_full"] == "Sie stellte das in Frage."
    assert plan[0]["content_topic_id"] == 7


def test_topicos_de_dativo_fixo_e_fvg_ficam_de_fora(script):
    sources = [
        gapfill(1, "Er hilft ___ Freund.", ["dem"], topico="Verben, Adjektive und Nomen mit festen Präpositionen mit Dativ"),
        gapfill(2, "Sie ___ Kritik.", ["übt"], topico="Funktionsverbgefüge 1"),
        gapfill(3, "Er wartet ___ den Bus.", ["auf"], topico="Verben, Adjektive und Nomen mit festen Präpositionen mit Akkusativ"),
        gapfill(4, "Sem tópico ___.", ["x"], topico=None),
    ]
    plan, skipped = script.select(sources, [])
    assert [it["source_id"] for it in plan] == [3]
    assert skipped == {"topico_exige_revisao_humana": 3}


def test_lacuna_invalida_e_pulada(script):
    sources = [gapfill(1, "Sem lacuna.", ["x"]), gapfill(2, "Duas ___ e ___.", ["x"]), gapfill(3, "Vazia ___.", [])]
    plan, skipped = script.select(sources, [])
    assert plan == []
    assert skipped == {"lacuna_invalida": 3}


def test_idempotente_e_sem_duplicata_na_origem(script):
    sources = [dictation(1, "Frase A.", 1), dictation(2, "Frase A.", 2), dictation(3, "Frase B.", 1)]
    existing = [{"template": "ReadAloudEngine", "prompt": "Frase B."}]
    plan, skipped = script.select(sources, existing)
    assert [it["source_id"] for it in plan] == [1]
    assert skipped == {"ja_existe_no_destino": 2}


def test_limit_vale_por_template(script):
    sources = [dictation(i, f"Frase {i}.", 1) for i in range(1, 4)] + [gapfill(9, "Er ___.", ["x"])]
    plan, _ = script.select(sources, [], limit=1)
    assert [(it["template"], it["source_id"]) for it in plan] == [("ReadAloudEngine", 1), ("SpokenGapFillEngine", 9)]


def test_chave_r2_ascii_com_id_de_origem(script):
    item = {"template": "ReadAloudEngine", "source_id": 42,
            "sentence_full": "Die Mühle steht am Fluß, schön gelegen und weit weg."}
    key = script.object_key(item)
    assert key == "readaloud/42_die-muhle-steht-am-flu--schon-gelegen-un.wav"
    assert key.isascii()


def test_mesmo_comeco_nao_colide(script):
    base = "Die Mitarbeiterin stellte den Erfolg des Projekts "
    a = {"template": "SpokenGapFillEngine", "source_id": 1, "sentence_full": base + "in Frage."}
    b = {"template": "SpokenGapFillEngine", "source_id": 2, "sentence_full": base + "zur Diskussion."}
    assert script.object_key(a) != script.object_key(b)


def test_write_grava_em_blocos_com_audio_antes(script, monkeypatch, tmp_path):
    monkeypatch.setattr(script, "AUDIO_TMP_DIR", tmp_path)
    monkeypatch.setattr(script, "CHUNK", 2)
    plan, _ = script.select([dictation(i, f"Frase {i}.", 3) for i in range(1, 4)], [])
    events = []
    written = script.write(
        plan, {"ReadAloudEngine": 50, "SpokenGapFillEngine": 51}, "voz",
        synthesize=lambda text, path, voice_name: events.append(("tts", text)),
        upload=lambda path, key: events.append(("r2", key)),
        execute=lambda sql: events.append(("d1", sql.count("INSERT INTO exercises"))),
    )
    assert written == 3
    assert [e for e in events if e[0] == "d1"] == [("d1", 2), ("d1", 1)]
    assert events.index(("r2", "readaloud/1_frase-1.wav")) < events.index(("d1", 2))
    sql_args = []
    script.write(plan[:1], {"ReadAloudEngine": 50}, "voz", lambda *a, **k: None, lambda *a: None, sql_args.append)
    assert "VALUES (50, NULL, 3, NULL, NULL, 'Frase 1.'" in sql_args[0]
    assert "'readaloud/1_frase-1.wav', 'voz', 'auto_ok', 'auto_ok', NULL, 'tts')" in sql_args[0]


def test_main_recusa_sem_remote(script):
    assert script.main([]) == 2


def test_main_recusa_com_token_do_container(script, monkeypatch):
    monkeypatch.setenv("D1_HTTP_API_TOKEN", "x")
    assert script.main(["--remote", "--dry-run"]) == 2
