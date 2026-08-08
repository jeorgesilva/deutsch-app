"""Fase 5 (docs/06, docs/05 item 110) -- BinaryChoiceEngine: dentro do texto
corrido do `reading_block`, pontos marcados oferecem escolha forçada entre 2
palavras (ex. "der/die Bericht") -- mais leve que o WordBankGuessEngine
(banco aberto), aqui é sempre par fechado de 2.

Mesmo padrão de fundamentação do TrueFalseEngine/ComprehensionQAEngine: o
LLM escolhe um TRECHO real do texto e a palavra "certa" tem que ser a que
está literalmente lá -- o gate mecânico confirma isso antes de aceitar.
"""
import json
import random

TEMPLATE_NAME = "Circle The Correct Word (par binário no texto corrido)"

SYSTEM_PROMPT = """Você é um professor de alemão B2/C1+ criando um exercício de escolha binária a partir de \
um texto já pronto. Escolha pontos do texto onde há uma decisão gramatical clara (artigo/gênero, caso, forma \
verbal, ortografia) e gere um par: a palavra CERTA (exatamente como aparece no texto) e uma palavra ERRADA \
plausível (mesma categoria gramatical, ex. outro artigo, outra terminação de caso, outra forma verbal -- \
nunca uma palavra de categoria totalmente diferente).

Para cada item gere:
- "trecho": um trecho de 6 a 12 palavras do texto, EXATAMENTE como aparece lá (copie literalmente), contendo \
a palavra-alvo.
- "palavra_certa": a palavra-alvo, exatamente como aparece no trecho.
- "palavra_errada": a alternativa errada plausível.

Responda SOMENTE com um array JSON válido, sem texto antes ou depois, sem markdown, sem explicação."""


def build_user_prompt(texto_base: str, n_items: int) -> str:
    return f"""Texto-base:
{texto_base}

Gere exatamente {n_items} pontos de escolha binária distintos, cobrindo partes diferentes do texto, no \
formato JSON descrito."""


def build_exercise_fields_binarychoice(item: dict, texto_base: str) -> dict:
    trecho = (item.get("trecho") or "").strip()
    certa = (item.get("palavra_certa") or "").strip()
    errada = (item.get("palavra_errada") or "").strip()
    if not trecho or not certa or not errada or certa == errada:
        return {"prompt": None, "accepted_answers": [], "flag_reason": "structural_mismatch", "flag_detail": None}
    # gate mecanico: o trecho tem que ser literal do texto-base, E a palavra
    # certa tem que aparecer literalmente dentro do trecho -- garante que
    # nao e' um trecho parafraseado/inventado nem uma "resposta certa" que
    # nao bate com o texto de verdade.
    if trecho not in texto_base or certa not in trecho:
        return {
            "prompt": None, "accepted_answers": [],
            "flag_reason": "lt_flagged",
            "flag_detail": {"motivo": "trecho ou palavra_certa nao encontrados literalmente no texto-base"},
        }
    idx = trecho.find(certa)
    trecho_gapped = trecho[:idx] + "___" + trecho[idx + len(certa):]
    opcoes = [certa, errada]
    random.shuffle(opcoes)
    return {
        "prompt": json.dumps({"trecho_gapped": trecho_gapped, "opcoes": opcoes}, ensure_ascii=False),
        "accepted_answers": [certa],
        "flag_reason": "auto_ok",
        "flag_detail": None,
    }
