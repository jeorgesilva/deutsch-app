"""Fase 7 (CLAUDE.md) -- upload de audio pro bucket R2 `deutsch-media` via
`wrangler r2 object put`, mesmo mecanismo de autenticacao ja usado pro D1
local (ingest/write_exercises.py query_d1/execute_d1) -- reaproveita a sessao
`wrangler login` ja ativa, sem precisar gerar/guardar credenciais S3-compativeis
novas no .env.

Uso:
    from deutsch_pipeline.tts.upload_r2 import upload_audio
    key = upload_audio(Path("out.wav"), "dictation/vokale-01.wav")
"""
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
APP_DIR = REPO_ROOT / "app"
BUCKET = "deutsch-media"


def upload_audio(local_path: Path, object_key: str) -> str:
    """Sobe local_path pro bucket em object_key (--remote, bucket real, nao o
    emulador local do wrangler dev). Retorna object_key pra gravar em
    exercises.audio_ref."""
    subprocess.run(
        [
            "npx", "wrangler", "r2", "object", "put", f"{BUCKET}/{object_key}",
            f"--file={local_path}", "--remote",
        ],
        cwd=APP_DIR, capture_output=True, text=True, check=True,
    )
    return object_key
