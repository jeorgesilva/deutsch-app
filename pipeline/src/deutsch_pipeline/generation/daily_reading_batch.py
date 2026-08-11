"""Fase 15 -- geração diária automatizada de bloco de leitura. Combina
`reading_sources.py` (fato real, RSS da DW) + `generate_reading_block.py`
(texto original B2/C1 inspirado no fato, nunca copiado -- regra do CLAUDE.md
inalterada) + `generate_reading_block_items.py` (as 10 engines) numa chamada
só, auto-contida (sem curadoria humana escolhendo o artigo nem os parâmetros
de cada engine -- decisão do usuário, ver reading_sources.py pro raciocínio
completo de por que não há busca ao vivo por LLM aqui).

Uso:
    python -m deutsch_pipeline.generation.daily_reading_batch --model hf:deepseek-ai/DeepSeek-V3
"""
import argparse

from .generate_reading_block import generate_text, write_reading_block
from .generate_reading_block_items import generate_all_items_for_block
from .reading_sources import FONTE_NOME, build_fatos_text, pick_next_unused
from ..ingest.write_exercises import query_d1

NIVEL = "B2/C1"


def create_next_reading_block(model: str) -> dict:
    candidate = pick_next_unused(query_d1)
    if candidate is None:
        return {"skipped": True, "reason": "sem artigo novo no feed da DW (todos já viraram bloco)"}

    fatos = build_fatos_text(candidate)
    draft = generate_text(model, fatos, FONTE_NOME, NIVEL)

    n_lt_matches = None
    try:
        import language_tool_python
        lt = language_tool_python.LanguageTool("de-DE")
        try:
            n_lt_matches = len(lt.check(draft["texto"]))
        finally:
            lt.close()
    except Exception:
        pass  # LanguageTool indisponível não bloqueia a gravação -- mesmo espírito de "nunca travar" já usado no harness

    block_id = write_reading_block(draft["titulo"], draft["texto"], FONTE_NOME, candidate["link"], NIVEL)
    itens = generate_all_items_for_block(block_id, model)

    return {
        "skipped": False,
        "reading_block_id": block_id,
        "titulo": draft["titulo"],
        "fonte_url": candidate["link"],
        "n_palavras": len(draft["texto"].split()),
        "languagetool_matches": n_lt_matches,
        "itens": {k: v["written"] for k, v in itens.items()},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", default="hf:deepseek-ai/DeepSeek-V3")
    args = parser.parse_args()

    result = create_next_reading_block(args.model)
    if result["skipped"]:
        print(f"[skip] {result['reason']}")
        return
    print(f"reading_block_id={result['reading_block_id']} ('{result['titulo']}', "
          f"{result['n_palavras']} palavras, {result['languagetool_matches']} matches LT)")
    print(f"  fonte: {result['fonte_url']}")
    print(f"  itens: {result['itens']}")


if __name__ == "__main__":
    main()
