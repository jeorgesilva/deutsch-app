"""Fase 5 (docs/06, docs/05 item 104) -- MatchingEngine: usuário liga cada
palavra/expressão do `reading_block` ao seu significado/sinônimo. UM
exercício por bloco (não um por par) -- a interação é "duas colunas,
formar todos os pares", uma unidade interativa só, igual à Fase 5 descreve
("D1: accepted_answers como mapa de pares").

Diferente dos templates de gap-fill: aqui não há LanguageTool nem
case-adherence -- o que precisa ser verificado é se os pares (termo →
definição) estão CORRETOS e se o termo realmente aparece no texto-base
(fundamentação, não invenção -- mesma classe de risco já vista no
RegisterReformulationEngine, mas aqui é "o termo existe no texto?" em vez de
"o conteúdo bate com o original?").
"""
import json

TEMPLATE_NAME = "Vocabulary/Synonym/Phrase Matching"

SYSTEM_PROMPT = """Você é um professor de alemão B2/C1+ criando um exercício de associação (matching) a \
partir de um texto já pronto. Escolha palavras ou expressões REALMENTE PRESENTES no texto (substantivos, \
verbos, adjetivos ou expressões fixas relevantes pro nível B2/C1 -- evite palavras triviais tipo artigos ou \
pronomes) e forneça, pra cada uma, um significado/sinônimo/definição curta em ALEMÃO SIMPLES (nível A2/B1, \
pra não exigir vocabulário mais difícil que a própria palavra sendo explicada).

Regras:
- Cada "termo" tem que aparecer literalmente no texto fornecido (mesma forma ou forma de dicionário próxima \
-- ex. se o texto tem "gestartet", o termo pode ser "starten").
- Cada "definicao" é curta (3-8 palavras), em alemão, SEM usar a mesma palavra do termo.
- Não repita a mesma raiz de palavra em dois termos diferentes.

Responda SOMENTE com um array JSON válido, cada item {"termo": "...", "definicao": "..."}, sem texto antes \
ou depois, sem markdown, sem explicação."""


def build_user_prompt(texto_base: str, n_pairs: int, label: str = "Texto-base") -> str:
    # `label` -- Fatia B (redesenho de Video): reaproveitado sem mudanca de
    # estrutura pra ancorar em transcricao de video em vez de reading_block
    # (generate_video_comprehension.py passa label="Transcrição do vídeo");
    # default identico ao original, comportamento de leitura inalterado.
    return f"""{label}:
{texto_base}

Gere exatamente {n_pairs} pares termo→definição a partir de palavras/expressões deste texto, no formato \
JSON descrito."""


def build_exercise_fields_matching(items: list[dict], texto_base: str) -> dict:
    """Recebe a lista INTEIRA de pares (não item a item, como os outros
    engines) -- vira UM exercicio so. Filtra pares cujo termo nao aparece
    de fato no texto (gate mecanico de fundamentacao)."""
    texto_lower = texto_base.lower()
    valid_pairs = []
    for item in items:
        termo = (item.get("termo") or "").strip()
        definicao = (item.get("definicao") or "").strip()
        if not termo or not definicao:
            continue
        # aceita a forma exata ou o radical (>=4 chars) pra cobrir flexao
        # verbal/nominal sem exigir lematizacao completa
        radical = termo.lower()[:max(4, len(termo) - 3)]
        if termo.lower() not in texto_lower and radical not in texto_lower:
            continue
        valid_pairs.append({"termo": termo, "definicao": definicao})

    if len(valid_pairs) < 4:
        return {
            "prompt": None,
            "accepted_answers": [],
            "flag_reason": "structural_mismatch",
            "flag_detail": {"motivo": "menos de 4 pares fundamentados no texto", "gerados": len(items)},
        }

    termos = [p["termo"] for p in valid_pairs]
    return {
        "prompt": json.dumps({"termos": termos, "definicoes": [p["definicao"] for p in valid_pairs]}, ensure_ascii=False),
        "accepted_answers": [json.dumps(valid_pairs, ensure_ascii=False)],
        "flag_reason": "auto_ok",
        "flag_detail": None,
    }
