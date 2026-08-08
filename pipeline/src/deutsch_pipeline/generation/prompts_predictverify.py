"""Fase 5 (docs/06, docs/05 item 107) -- PredictThenVerifyEngine: fase 1
usuário escolhe entre opções (ex. "como a notícia termina?") antes de ler o
trecho final; fase 2 lê e confirma. Mecanismo de previsão-depois-verificação.

Mesmo padrão de fundamentação dos outros engines desta fase: a "continuação
certa" tem que ser um trecho literal do `reading_block`, nunca inventada.
"""
import json
import random

TEMPLATE_NAME = "Predict-then-verify (Listening/Reading guess)"

SYSTEM_PROMPT = """Você é um professor de alemão B2/C1+ criando um exercício de previsão-depois-verificação a \
partir de um texto já pronto. Escolha um ponto do texto (de preferência perto do fim de um parágrafo) e \
gere: o trecho INICIAL até esse ponto (literal, copiado do texto), a continuação CERTA (o que vem a seguir no \
texto, literal), e 2 continuações ERRADAS mas plausíveis (mesmo tema, mesmo tom, mas que não é o que o texto \
realmente diz a seguir).

Para cada item gere:
- "trecho_inicial": do começo do texto (ou de um parágrafo) até o ponto de corte, LITERAL.
- "continuacao_certa": a frase ou oração que vem logo depois no texto, LITERAL.
- "continuacoes_erradas": lista de 2 continuações plausíveis mas incorretas.

Responda SOMENTE com um array JSON válido, sem texto antes ou depois, sem markdown, sem explicação."""


def build_user_prompt(texto_base: str, n_items: int) -> str:
    return f"""Texto-base:
{texto_base}

Gere exatamente {n_items} pontos de previsão distintos (cortes em posições diferentes do texto), no formato \
JSON descrito."""


def build_exercise_fields_predictverify(item: dict, texto_base: str) -> dict:
    inicial = (item.get("trecho_inicial") or "").strip()
    certa = (item.get("continuacao_certa") or "").strip()
    erradas = [e.strip() for e in (item.get("continuacoes_erradas") or []) if e and e.strip()]
    if not inicial or not certa or len(erradas) < 2:
        return {"prompt": None, "accepted_answers": [], "flag_reason": "structural_mismatch", "flag_detail": None}
    # gate mecanico: os dois trechos citados como "reais" tem que aparecer
    # literalmente no texto-base, na ordem certa (inicial antes de certa) --
    # senao a fase de "verificacao" mostraria algo que o texto nao diz.
    idx_inicial = texto_base.find(inicial)
    idx_certa = texto_base.find(certa)
    if idx_inicial == -1 or idx_certa == -1 or idx_certa < idx_inicial:
        return {
            "prompt": None, "accepted_answers": [],
            "flag_reason": "lt_flagged",
            "flag_detail": {"motivo": "trecho_inicial/continuacao_certa nao encontrados na ordem certa no texto-base"},
        }
    opcoes = [certa, *erradas[:2]]
    random.shuffle(opcoes)
    return {
        "prompt": json.dumps({"trecho_inicial": inicial, "opcoes": opcoes}, ensure_ascii=False),
        "accepted_answers": [certa],
        "flag_reason": "auto_ok",
        "flag_detail": None,
    }
