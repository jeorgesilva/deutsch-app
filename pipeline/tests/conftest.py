"""Guardas globais dos testes do pipeline: nenhum teste chama API de LLM,
abre conexão de rede (nem localhost: Ollama, LanguageTool) ou roda
subprocesso (wrangler d1/r2, ffmpeg, yt-dlp, espeak). Teste que precisar
de um desses mocka a função de alto nível (llm_client.chat,
write_exercises.execute_d1...), nunca afrouxa a guarda.
"""
import socket
import subprocess

import pytest

# Nomes lidos pelo código (ver .env.example) + os que os SDKs leem sozinhos.
SECRET_ENV_VARS = (
    "hugging_face_api_key", "HF_TOKEN", "HUGGINGFACE_API_KEY", "HUGGING_FACE_HUB_TOKEN",
    "GEMINI_API_KEY", "GOOGLE_API_KEY",
    "CLAUDE_API_KEY", "CLAAUDE_API_KEY", "ANTHROPIC_API_KEY",
    "openai_key_1", "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_API_VERSION", "OPENAI_API_KEY",
    "public_ai", "PUBLICAI_BASE_URL",
    "D1_HTTP_API_TOKEN", "D1_REMOTE", "CLOUDFLARE_API_TOKEN",
    "OLLAMA_HOST",
)


class BlockedInTests(RuntimeError):
    pass


def _blocked(what):
    def _raise(*_args, **_kwargs):
        raise BlockedInTests(f"{what} bloqueado em teste")
    return _raise


@pytest.fixture(autouse=True)
def isolamento(monkeypatch):
    for name in SECRET_ENV_VARS:
        monkeypatch.delenv(name, raising=False)

    # llm_client carrega o .env da raiz na primeira chamada -- sem isso as
    # chaves reais voltariam depois do delenv acima.
    from deutsch_pipeline.generation import llm_client
    monkeypatch.setattr(llm_client, "_ENV_LOADED", True)

    monkeypatch.setattr(socket.socket, "connect", _blocked("socket.connect"))
    monkeypatch.setattr(socket.socket, "connect_ex", _blocked("socket.connect_ex"))
    monkeypatch.setattr(socket, "create_connection", _blocked("socket.create_connection"))
    monkeypatch.setattr(socket, "getaddrinfo", _blocked("socket.getaddrinfo"))

    # wrangler d1 execute --local grava no D1 local sem precisar de rede; e
    # link_exercise_lexicon.D1_TARGET é decidido no import, antes desta fixture.
    for fn in ("run", "Popen", "call", "check_call", "check_output"):
        monkeypatch.setattr(subprocess, fn, _blocked(f"subprocess.{fn}"))
