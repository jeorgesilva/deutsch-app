"""Fase 5 (docs/06, docs/05 item 106) -- ComprehensionQAEngine: perguntas
abertas curtas sobre fatos específicos do `reading_block` (quem/o quê/quando/
onde) -- diferente do OpenPromptEngine (opinião livre), aqui há uma resposta
certa ancorada no texto.
"""
TEMPLATE_NAME = "Comprehension Questions"

SYSTEM_PROMPT = """Você é um professor de alemão B2/C1+ criando perguntas de compreensão de leitura a partir \
de um texto já pronto. Gere perguntas FECHADAS de fato (quem, o quê, quando, onde, quanto) cuja resposta está \
EXPLICITAMENTE no texto -- nunca peça opinião, interpretação livre ou inferência não suportada pelo texto.

Para cada item gere:
- "pergunta": pergunta curta em alemão.
- "respostas_aceitas": lista de 1-3 formas curtas aceitáveis de responder (variações de fraseado pra mesma \
resposta factual, ex. "vier Astronauten" e "vier").

Responda SOMENTE com um array JSON válido, sem texto antes ou depois, sem markdown, sem explicação."""


def build_user_prompt(texto_base: str, n_items: int, label: str = "Texto-base") -> str:
    # `label` -- Fatia B (redesenho de Video), mesmo padrao de prompts_matching.py.
    return f"""{label}:
{texto_base}

Gere exatamente {n_items} perguntas de compreensão factual distintas, cobrindo partes diferentes do texto, \
no formato JSON descrito."""


MIN_LEN = 6


def build_exercise_fields_comprehensionqa(item: dict, texto_base: str) -> dict:
    pergunta = (item.get("pergunta") or "").strip()
    respostas = [r.strip() for r in (item.get("respostas_aceitas") or []) if r and r.strip()]
    if len(pergunta) < MIN_LEN or not respostas:
        return {
            "prompt": None,
            "accepted_answers": [],
            "flag_reason": "structural_mismatch",
            "flag_detail": None,
        }
    # gate mecanico: pelo menos UMA resposta aceita tem que aparecer
    # (literalmente ou como substring) no texto-base -- senao a "resposta
    # certa" pode ser um fato inventado, nao extraido do texto.
    texto_lower = texto_base.lower()
    grounded = any(r.lower() in texto_lower for r in respostas)
    if not grounded:
        return {
            "prompt": pergunta,
            "accepted_answers": respostas,
            "flag_reason": "lt_flagged",
            "flag_detail": {"motivo": "nenhuma resposta aceita encontrada literalmente no texto-base"},
        }
    return {
        "prompt": pergunta,
        "accepted_answers": respostas,
        "flag_reason": "auto_ok",
        "flag_detail": None,
    }
