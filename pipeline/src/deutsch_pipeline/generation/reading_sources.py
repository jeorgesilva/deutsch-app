"""Fase 15 -- fonte factual automatizada pro bloco de leitura diário. docs/06
sempre exigiu fato REAL por trás do texto gerado (nunca "LLM inventa a
notícia"), mas até aqui esse fato vinha de mim (Claude) buscando manualmente
via WebSearch/WebFetch a cada bloco -- curadoria assistida, sem jeito de rodar
sozinha às 6h da manhã. Decisão do usuário: sem busca ao vivo por LLM (Hugging
Face Inference Providers não tem ferramenta de busca HOSPEDADA, só
function-calling client-side -- confirmado consultando a doc oficial nesta
sessão; contratar API de busca paga nova ficou descartado) -- em vez disso,
RSS público da DW (`rss.dw.com`, já citável como fonte pelo CLAUDE.md, mesma
allowlist de "DW/ZDF/Nachrichtenleicht") como fato determinístico e real, e o
LLM (DeepSeek-V3 via HF) só reescreve pro nível B2/C1, mesmo papel que sempre
teve.

Sem revisão humana do item escolhido -- risco editorial aceito conscientemente
pelo usuário (feed de notícias gerais pode trazer temas pesados: guerra,
desastre, crime). Se isso virar problema na prática, o próximo ajuste é
filtrar por `<category>` antes de escolher.
"""
import xml.etree.ElementTree as ET

DW_RSS_URL = "https://rss.dw.com/xml/rss-de-all"
FONTE_NOME = "DW"


def fetch_dw_candidates(limit: int = 30) -> list[dict]:
    import requests

    resp = requests.get(DW_RSS_URL, headers={"User-Agent": "Mozilla/5.0"}, timeout=20)
    resp.raise_for_status()
    root = ET.fromstring(resp.content)
    items = []
    for item in root.findall("./channel/item")[:limit]:
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        description = (item.findtext("description") or "").strip()
        if not title or not link or not description:
            continue
        items.append({"title": title, "link": link, "description": description})
    return items


def pick_next_unused(query_d1) -> dict | None:
    """`query_d1` é passado como parâmetro (não importado direto) pra este
    módulo não depender de qual transporte de D1 o chamador está usando
    (wrangler CLI local ou HTTP API dentro do container)."""
    used_urls = {row["fonte_url"] for row in query_d1("SELECT fonte_url FROM reading_blocks;")}
    for candidate in fetch_dw_candidates():
        if candidate["link"] not in used_urls:
            return candidate
    return None


def build_fatos_text(candidate: dict) -> str:
    return f"{candidate['title']}\n\n{candidate['description']}"
