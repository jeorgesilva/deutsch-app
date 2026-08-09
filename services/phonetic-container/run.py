"""Fase 14 -- entrypoint do container Cloudflare. Serve o MESMO Flask app
de deutsch_pipeline.phonetics.service (nenhuma rota/logica duplicada) via
waitress (WSGI de producao) em 0.0.0.0:8080 -- precisa abrir a porta rapido
pra passar no timeout de 20s do startAndWaitForPorts() do container (ver
CLAUDE.md, Fase 14); os modelos (wav2vec2/faster-whisper) continuam
lazy-load na primeira chamada real, ja cacheados na imagem (Dockerfile
baixa em build-time), entao o lazy-load em si e' rapido, so' nao pode
bloquear a abertura da porta.
"""
from waitress import serve

from deutsch_pipeline.phonetics.service import app

if __name__ == "__main__":
    serve(app, host="0.0.0.0", port=8080)
