"""Fatia A (redesenho pedagógico de Vídeo) -- "citar" (VideoTaskEngine)
deixou de ser produção de texto (idêntico a "ditado", mesmo construto sob
nome diferente -- achado real da auditoria) e virou RECONHECIMENTO por
paráfrase: dado um resumo em alemão mais simples do trecho, o usuário
aponta QUAL trecho do vídeo corresponde -- testa compreensão de paráfrase
(custo cognitivo menor que decodificação literal), diferenciando de verdade
de "ditado" (que continua bottom-up puro, sem mudança).

Único ponto do pipeline de vídeo que chama um LLM (todo o resto -- parsing
de .vtt, segmentação por sentença, ditado -- é 100% mecânico). Escopo da
chamada é mínimo e de baixo risco: parafrasear UMA frase já real e curta
(25-90 caracteres, mesmo filtro de `pick_quote_segments`), não resumir o
vídeo inteiro nem inventar fato novo. Distratores NUNCA são gerados pelo
LLM -- são outros trechos REAIS do mesmo vídeo (escolhidos em
generate_video_exercises.py, fora deste módulo), zero risco de fabricação.

Gate mecânico (não harness novo, deliberadamente simples/permissivo -- ver
CLAUDE.md sobre gate mal calibrado pra fenômeno linguístico real ser pior
que nenhum gate, achado do VowelInsertEngine): rejeita paráfrase que
compartilhe uma substring contígua longa com o trecho original -- sinal
grosseiro de "só copiou e trocou 1-2 palavras", não uma checagem
linguística fina.
"""
import json
import random
import re

TEMPLATE_NAME = "VideoTaskEngine (citar, reconhecimento)"

MIN_OVERLAP_TO_REJECT = 15

SYSTEM_PROMPT = """Você é um professor de alemão B2/C1+ criando um exercício de reconhecimento por paráfrase, \
a partir de uma frase real extraída de um vídeo.

Dada a frase original, escreva um RESUMO/PARÁFRASE curto (1 frase, alemão nível B1 -- mais simples que o \
original) que descreva o que a frase diz, SEM reutilizar trechos longos da frase original (troque a \
estrutura e o vocabulário, não só substitua 1-2 palavras) e SEM adicionar nenhuma informação que não esteja \
na frase original.

Responda SOMENTE com um objeto JSON válido, no formato {"paraphrase": "..."}, sem texto antes ou depois, \
sem markdown, sem explicação."""


def build_user_prompt(quote: str) -> str:
    return f"""Frase original (extraída de um vídeo):
"{quote}"

Escreva a paráfrase no formato JSON descrito."""


_JSON_OBJECT_RE = re.compile(r"\{.*\}", re.DOTALL)


def extract_paraphrase(raw: str) -> str | None:
    match = _JSON_OBJECT_RE.search(raw)
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    paraphrase = (data.get("paraphrase") or "").strip()
    return paraphrase or None


def _longest_common_substring_len(a: str, b: str) -> int:
    """Comparação grosseira (DP O(n*m), sentenças curtas) -- só pra pegar
    "só trocou 1-2 palavras e copiou o resto", não uma medida linguística
    fina."""
    a, b = a.lower(), b.lower()
    if not a or not b:
        return 0
    prev = [0] * (len(b) + 1)
    best = 0
    for i in range(1, len(a) + 1):
        curr = [0] * (len(b) + 1)
        for j in range(1, len(b) + 1):
            if a[i - 1] == b[j - 1]:
                curr[j] = prev[j - 1] + 1
                best = max(best, curr[j])
        prev = curr
    return best


def build_exercise_fields_citar(paraphrase: str | None, quote: str, distractor_quotes: list[str]) -> dict:
    """Monta os campos do exercício de reconhecimento -- contrato reaproveita
    o padrão já existente do WordBankGuessEngine/renderChipChoice: `prompt`
    é JSON {"trecho_gapped": paráfrase, "opcoes": [...]} (NÃO fica vazio,
    diferente de legendar/dictation -- o exercício em si, a paráfrase, deve
    aparecer antes da tentativa; só a transcrição/vídeo-fonte continua
    proibida de aparecer como leitura prévia, e a paráfrase não é a
    transcrição). `accepted_answers` = [trecho_correto].

    Gate mecânico: rejeita se a paráfrase não veio do LLM, ou se compartilha
    uma substring contígua longa com a frase original."""
    if not paraphrase:
        return {
            "prompt": None, "accepted_answers": [],
            "flag_reason": "structural_mismatch",
            "flag_detail": {"motivo": "LLM nao devolveu paraphrase valida"},
        }
    overlap = _longest_common_substring_len(paraphrase, quote)
    if overlap >= MIN_OVERLAP_TO_REJECT:
        return {
            "prompt": None, "accepted_answers": [],
            "flag_reason": "structural_mismatch",
            "flag_detail": {
                "motivo": "paraphrase compartilha trecho longo demais com o original",
                "overlap_chars": overlap,
            },
        }

    options = [quote, *distractor_quotes]
    random.shuffle(options)
    return {
        "prompt": json.dumps({"trecho_gapped": paraphrase, "opcoes": options}, ensure_ascii=False),
        "accepted_answers": [quote],
        "flag_reason": "auto_ok",
        "flag_detail": None,
    }
