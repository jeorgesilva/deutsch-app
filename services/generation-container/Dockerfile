# docs/14 -- imagem do container Cloudflare pro servico de geracao sob
# demanda (LLM via API + spaCy + LanguageTool). Build context = este
# diretorio (npm run vendor roda antes e copia o minimo necessario de
# pipeline/ pra vendor/, ver prepare-vendor.sh -- Docker COPY nao alcanca
# fora do build context).
FROM python:3.11-slim

# default-jre-headless: language_tool_python roda um servidor LanguageTool
# LOCAL via subprocess Java (nunca sai do container -- so' o LLM em si usa
# rede, ver src/index.ts enableInternet+allowedHosts).
RUN apt-get update && apt-get install -y --no-install-recommends \
    default-jre-headless \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# modelo spaCy (rule_adherence.py) e o pacote Java do LanguageTool (~200MB,
# baixado por language_tool_python na primeira instanciacao) em BUILD-time --
# mesmo motivo do phonetic-container: cold start nao pode depender de rede
# externa nem do timeout de 20s do startAndWaitForPorts.
RUN python -m spacy download de_core_news_lg
RUN python -c "import language_tool_python; language_tool_python.LanguageTool('de-DE').close()"

# mesma estrutura de pastas do repo (pipeline/src/...) -- os modulos
# vendorizados importam entre si com import relativo (from .topics import
# Topic etc.), preservar o pacote deutsch_pipeline intacto evita precisar
# reescrever nenhum import.
COPY vendor/pipeline/src/deutsch_pipeline/__init__.py /app/pipeline/src/deutsch_pipeline/__init__.py
COPY vendor/pipeline/src/deutsch_pipeline/generation/ /app/pipeline/src/deutsch_pipeline/generation/
COPY vendor/pipeline/src/deutsch_pipeline/validation/ /app/pipeline/src/deutsch_pipeline/validation/
COPY run.py /app/run.py

ENV PYTHONPATH=/app/pipeline/src
ENV PYTHONUNBUFFERED=1

EXPOSE 8080

CMD ["python", "run.py"]
