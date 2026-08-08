"""Abstracao fina sobre o provedor de LLM usado na geracao (Fase 0-4).

Decisao original do CLAUDE.md: Ollama 100% local (Mistral Small). Revista
nesta sessao -- a maquina de geracao nao aguenta o modelo local por memoria
(RAM insuficiente pra rodar o q3_K_M com folga) -- usando Gemini via API como
motor a partir daqui. generation/pilot.py so pede chat(model, system, user) ->
str; nem pilot.py nem os 4 gates do harness (validation/harness.py) sabem ou
precisam saber qual provedor esta por tras -- a validacao roda igual sobre o
texto gerado, seja qual for a origem.

GEMINI_API_KEY vem de app-root/.env (nao commitado -- ver .gitignore).
"""
import os
from pathlib import Path

_ENV_LOADED = False


def _ensure_env_loaded():
    global _ENV_LOADED
    if _ENV_LOADED:
        return
    from dotenv import load_dotenv
    repo_root = Path(__file__).resolve().parents[4]
    load_dotenv(repo_root / ".env")
    _ENV_LOADED = True


def chat(model: str, system_prompt: str, user_prompt: str, temperature: float = 0.7) -> str:
    if model.startswith("azure:"):
        return _chat_azure_openai(model.removeprefix("azure:"), system_prompt, user_prompt, temperature)
    if model.startswith("hf:"):
        return _chat_huggingface(model.removeprefix("hf:"), system_prompt, user_prompt, temperature)
    if model.startswith("publicai:"):
        return _chat_publicai(model.removeprefix("publicai:"), system_prompt, user_prompt, temperature)
    if model.startswith("gemini") or model.startswith("gemma"):
        return _chat_gemini(model, system_prompt, user_prompt, temperature)
    if model.startswith("claude"):
        return _chat_claude(model, system_prompt, user_prompt, temperature)
    return _chat_ollama(model, system_prompt, user_prompt, temperature)


def _chat_ollama(model: str, system_prompt: str, user_prompt: str, temperature: float) -> str:
    import ollama
    response = ollama.chat(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        options={"temperature": temperature},
    )
    return response["message"]["content"]


def _chat_gemini(model: str, system_prompt: str, user_prompt: str, temperature: float) -> str:
    _ensure_env_loaded()
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    response = client.models.generate_content(
        model=model,
        contents=user_prompt,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=temperature,
        ),
    )
    return response.text


def _chat_claude(model: str, system_prompt: str, user_prompt: str, temperature: float) -> str:
    _ensure_env_loaded()
    import anthropic

    # nome com typo no .env do usuario (CLAAUDE_API_KEY) -- aceita os dois pra
    # nao quebrar se for corrigido depois.
    api_key = os.environ.get("CLAUDE_API_KEY") or os.environ.get("CLAAUDE_API_KEY")
    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model=model,
        max_tokens=4096,
        temperature=temperature,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )
    return "".join(block.text for block in response.content if block.type == "text")


def _chat_azure_openai(deployment: str, system_prompt: str, user_prompt: str, temperature: float) -> str:
    _ensure_env_loaded()
    from openai import AzureOpenAI

    api_key = os.environ.get("openai_key_1") or os.environ.get("AZURE_OPENAI_API_KEY")
    endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT", "https://deutsche.openai.azure.com/")
    api_version = os.environ.get("AZURE_OPENAI_API_VERSION", "2026-07-01")

    client = AzureOpenAI(api_key=api_key, azure_endpoint=endpoint, api_version=api_version)
    response = client.chat.completions.create(
        model=deployment,
        temperature=temperature,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )
    return response.choices[0].message.content


def _chat_huggingface(model: str, system_prompt: str, user_prompt: str, temperature: float) -> str:
    """Inference Providers (router.huggingface.co) -- API compativel com OpenAI,
    reusa o mesmo SDK que o Azure ja usa, so troca base_url/chave."""
    _ensure_env_loaded()
    from openai import OpenAI

    api_key = os.environ["hugging_face_api_key"]
    client = OpenAI(base_url="https://router.huggingface.co/v1", api_key=api_key)
    response = client.chat.completions.create(
        model=model,
        temperature=temperature,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )
    return response.choices[0].message.content


def _chat_publicai(model: str, system_prompt: str, user_prompt: str, temperature: float) -> str:
    """Public AI (platform.publicai.co) -- API compativel com OpenAI, hospeda
    Apertus/EuroLLM entre outros modelos abertos europeus. Usa requests puro,
    nao o SDK da OpenAI -- o SDK leva bloqueio do WAF (Cloudflare) nesse
    provedor especifico, requests simples passa direto (testado empiricamente)."""
    _ensure_env_loaded()
    import requests

    api_key = os.environ["public_ai"]
    base_url = os.environ.get("PUBLICAI_BASE_URL", "https://api.publicai.co/v1")
    payload = {
        "model": model,
        "temperature": temperature,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    import time as _time

    last_error = None
    max_attempts = 5
    for attempt in range(1, max_attempts + 1):
        try:
            response = requests.post(
                f"{base_url}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=payload,
                timeout=600,
            )
            response.raise_for_status()
            return response.json()["choices"][0]["message"]["content"]
        except requests.exceptions.HTTPError as e:
            last_error = e
            if e.response.status_code == 504 and attempt < max_attempts:
                # backoff exponencial (5s, 10s, 20s, 40s) -- gateway sob carga
                # (GPU doada, best-effort, sem SLA) precisa de folga entre
                # tentativas, martelar sem pausa so piora.
                wait = 5 * (2 ** (attempt - 1))
                print(f"  [publicai retry {attempt}/{max_attempts}] 504, esperando {wait}s...", file=__import__("sys").stderr)
                _time.sleep(wait)
                continue
            raise
    raise last_error
