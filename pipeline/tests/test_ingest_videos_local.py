"""pipeline/scripts/ingest_videos_local.py -- regras de parada do lote e
recusa sem --remote. A ingestão real (yt-dlp, LLM, wrangler) é mockada."""
import importlib.util
import os
import subprocess
import sys
import types
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "ingest_videos_local.py"


@pytest.fixture
def script():
    spec = importlib.util.spec_from_file_location("ingest_videos_local", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fake_ingest(outcomes):
    """Devolve/lança cada item de `outcomes` em ordem e registra as chamadas."""
    calls = []

    def ingest(model):
        calls.append(model)
        item = outcomes[len(calls) - 1]
        if isinstance(item, Exception):
            raise item
        return item

    return ingest, calls


def ok(clip_id):
    return {"skipped": False, "video_clip_id": clip_id, "titulo": "t", "caption_quality": "auto",
            "exercicios": {}, "compreensao": {}}


def test_para_no_skipped(script):
    ingest, calls = fake_ingest([ok(1), ok(2), {"skipped": True, "reason": "sem vídeo novo"}, ok(4)])
    assert script.run(10, "m", ingest) == {"ok": 2, "errors": 0, "stopped": "skipped"}
    assert len(calls) == 3


def test_erro_comum_segue_e_429_para(script):
    ingest, calls = fake_ingest([
        RuntimeError("LLM caiu"),
        ok(2),
        RuntimeError("ERROR: Unable to download video subtitles for 'de': HTTP Error 429: Too Many Requests"),
        ok(4),
    ])
    assert script.run(10, "m", ingest) == {"ok": 1, "errors": 2, "stopped": "429"}
    assert len(calls) == 3


def test_respeita_count(script):
    ingest, calls = fake_ingest([ok(i) for i in range(1, 6)])
    assert script.run(3, "m", ingest) == {"ok": 3, "errors": 0, "stopped": None}
    assert len(calls) == 3


def test_erro_do_wrangler_mostra_stderr(script):
    err = subprocess.CalledProcessError(1, ["npx", "wrangler"], stderr="Authentication error [code: 10000]")
    assert "Authentication error" in script._error_text(err)


def test_recusa_sem_remote(script, monkeypatch):
    monkeypatch.setenv("D1_REMOTE", "")
    assert script.main(["--count", "1"]) == 2
    assert os.environ["D1_REMOTE"] == ""


def test_recusa_com_token_do_container(script, monkeypatch):
    monkeypatch.setenv("D1_HTTP_API_TOKEN", "x")
    monkeypatch.setenv("D1_REMOTE", "")
    assert script.main(["--remote"]) == 2
    assert os.environ["D1_REMOTE"] == ""


def test_recusa_sem_chave_do_llm(script, monkeypatch):
    # conftest apaga hugging_face_api_key e marca o .env como já carregado.
    monkeypatch.setenv("D1_REMOTE", "")
    assert script.main(["--remote", "--model", "hf:x"]) == 2
    assert os.environ["D1_REMOTE"] == ""


def test_remote_liga_d1_remote_e_usa_o_pipeline(script, monkeypatch):
    # daily_batch real não importa sob a guarda do conftest (yt_dlp herda de
    # subprocess.Popen no import) -- entra um módulo falso no lugar.
    monkeypatch.setenv("D1_REMOTE", "")  # monkeypatch restaura depois; main() grava "1"
    monkeypatch.setenv("PATH", os.environ.get("PATH", ""))  # idem para o PATH
    monkeypatch.setenv("hugging_face_api_key", "x")
    ingest, calls = fake_ingest([ok(1), {"skipped": True, "reason": "fim"}])
    fake = types.ModuleType("deutsch_pipeline.video.daily_batch")
    fake.ingest_next_new_video = ingest
    monkeypatch.setitem(sys.modules, "deutsch_pipeline.video.daily_batch", fake)

    assert script.main(["--remote", "--count", "5", "--model", "hf:x"]) == 0
    assert os.environ["D1_REMOTE"] == "1"
    assert os.environ["PATH"].split(os.pathsep)[0] == os.path.dirname(sys.executable)
    assert calls == ["hf:x", "hf:x"]
