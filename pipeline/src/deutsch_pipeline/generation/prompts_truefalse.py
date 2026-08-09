"""Fase 5 (docs/06, docs/05 item 105) -- TrueFalseEngine: usuário julga se
afirmações sobre o `reading_block` são verdadeiras ou falsas -- treina
previsão ativa (julgar antes/durante a leitura), não só leitura passiva.

Cada afirmação vira UM exercício (interação é "uma de cada vez"). Risco
principal aqui é o mesmo do ComprehensionQAEngine: a afirmação (verdadeira
OU falsa) tem que estar de fato ancorada no texto -- uma afirmação falsa
"óbvia demais" (sem relação nenhuma com o conteúdo) não testa compreensão de
leitura, testa senso comum. Por isso o SYSTEM_PROMPT pede uma "distorção"
plausível (trocar um dado real por um parecido) pras falsas, não uma
invenção aleatória.
"""
TEMPLATE_NAME = "True/False (previsão)"

SYSTEM_PROMPT = """Você é um professor de alemão B2/C1+ criando um exercício de Verdadeiro/Falso a partir de \
um texto já pronto. Gere afirmações em alemão sobre fatos do texto -- aproximadamente metade VERDADEIRAS \
(reformulação fiel de um fato do texto, com outras palavras) e metade FALSAS (mesmo fato, mas com UM detalhe \
trocado por algo plausível e parecido -- ex. um número diferente, uma data diferente, o sujeito trocado por \
outro do texto -- nunca uma invenção sem relação com o texto).

Para cada item gere:
- "afirmacao": frase em alemão sobre o texto (verdadeira ou falsa).
- "verdadeiro": true ou false.
- "trecho_confirmacao": o trecho EXATO do texto original que confirma se é verdadeira ou mostra qual é o fato \
real (pra afirmações falsas, cite o trecho que mostra o dado CORRETO que foi trocado).

Responda SOMENTE com um array JSON válido, sem texto antes ou depois, sem markdown, sem explicação."""


def build_user_prompt(texto_base: str, n_items: int, label: str = "Texto-base") -> str:
    # `label` -- Fatia B (redesenho de Video), mesmo padrao de prompts_matching.py.
    return f"""{label}:
{texto_base}

Gere exatamente {n_items} afirmações (mistura de verdadeiras e falsas, nunca todas do mesmo tipo em \
sequência) no formato JSON descrito."""


MIN_LEN = 8


def build_exercise_fields_truefalse(item: dict, texto_base: str) -> dict:
    afirmacao = (item.get("afirmacao") or "").strip()
    trecho = (item.get("trecho_confirmacao") or "").strip()
    verdadeiro = item.get("verdadeiro")
    if len(afirmacao) < MIN_LEN or verdadeiro is None or not trecho:
        return {
            "prompt": None,
            "accepted_answers": [],
            "flag_reason": "structural_mismatch",
            "flag_detail": None,
        }
    # gate mecanico: o trecho de confirmacao tem que aparecer de fato no
    # texto-base (senao a "prova" da resposta certa seria inventada)
    if trecho not in texto_base:
        return {
            "prompt": afirmacao,
            "accepted_answers": ["true" if verdadeiro else "false"],
            "flag_reason": "lt_flagged",
            "flag_detail": {"motivo": "trecho_confirmacao nao encontrado literalmente no texto-base", "trecho": trecho},
        }
    return {
        "prompt": afirmacao,
        "accepted_answers": ["true" if verdadeiro else "false"],
        "flag_reason": "auto_ok",
        "flag_detail": {"trecho_confirmacao": trecho},
    }
