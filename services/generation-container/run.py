"""docs/14 -- entrypoint do container Cloudflare. Serve o MESMO Flask app de
deutsch_pipeline.generation.service (nenhuma rota/logica duplicada) via
waitress (WSGI de producao) em 0.0.0.0:8080 -- precisa abrir a porta rapido
pra passar no timeout de 20s do startAndWaitForPorts() do container (ver
CLAUDE.md, Fase 14); spaCy/LanguageTool ja vem cacheados na imagem
(Dockerfile baixa em build-time), mas o carregamento em si (spaCy lazy-load
em get_nlp(), LanguageTool novo a cada /generate-topic) so acontece durante
uma requisicao de verdade, nunca bloqueia a abertura da porta.
"""
from waitress import serve

from deutsch_pipeline.generation.service import app

if __name__ == "__main__":
    serve(app, host="0.0.0.0", port=8080)
