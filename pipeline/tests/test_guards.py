import os
import socket
import subprocess

import pytest

from conftest import BlockedInTests
from deutsch_pipeline.generation import llm_client
from deutsch_pipeline.ingest import write_exercises


def test_rede_bloqueada():
    with pytest.raises(BlockedInTests):
        socket.create_connection(("example.com", 443))


def test_loopback_bloqueado():
    with pytest.raises(BlockedInTests):
        socket.socket().connect(("127.0.0.1", 11434))  # Ollama


def test_subprocess_bloqueado():
    with pytest.raises(BlockedInTests):
        subprocess.run(["echo", "x"])


def test_d1_local_bloqueado():
    with pytest.raises(BlockedInTests):
        write_exercises.query_d1("SELECT 1;")


def test_dotenv_nao_recarrega():
    llm_client._ensure_env_loaded()
    assert "hugging_face_api_key" not in os.environ
    assert "GEMINI_API_KEY" not in os.environ
