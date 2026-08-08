"""Fase 5 (docs/06, docs/05 item 113) -- CompoundSegmentationEngine:
adaptação do "Put A Slash Where The Spaces Are" pro princípio de Komposita
-- usuário marca onde cada palavra-componente começa dentro de um
substantivo composto longo. Usa `content_topics` categoria 15 (Wortbildung),
tópico Komposita.

Mesmo princípio de derivação mecânica de gap-fill/Unscramble: o LLM autora
o composto E a lista de partes, mas o gate NUNCA confia cegamente --
verifica que concatenar as partes reproduz o composto EXATAMENTE (nenhuma
letra perdida/trocada, o que aconteceria se o LLM "esquecesse" um
Fugenelement como o -s- de "Bahnhofsuhr" ao segmentar).
"""
TEMPLATE_NAME = "Compound Segmentation (Put A Slash, adaptado)"

SYSTEM_PROMPT = """Você é um professor de alemão B2/C1+ criando um exercício de segmentação de palavras \
compostas (Komposita), a partir da regra e do exemplo já curados abaixo. Gere substantivos compostos alemães \
REAIS (2-4 componentes), cada um com a segmentação exata em componentes -- incluindo qualquer Fugenelement \
(elemento de ligação, ex. o "-s-" de "Bahnhofsuhr" ou o "-n-" de "Tassenrand") como um segmento próprio da \
lista, nunca omitido nem grudado errado num componente vizinho.

Para cada item gere:
- "composto": a palavra composta inteira, uma só string.
- "partes": lista ORDENADA de strings que, concatenadas exatamente na ordem dada, reproduzem "composto" \
caractere por caractere (incluindo Fugenelemente como itens próprios da lista).

Responda SOMENTE com um array JSON válido, sem texto antes ou depois, sem markdown, sem explicação."""


def build_user_prompt(regra: str, exemplo: str, n_items: int) -> str:
    return f"""Regra: {regra}
Exemplo-fonte já curado: {exemplo}

Gere exatamente {n_items} substantivos compostos novos e distintos entre si (nível B2/C1, vocabulário útil, \
não repita o exemplo-fonte), no formato JSON descrito."""


MIN_PARTS = 2


def build_exercise_fields_compoundsegmentation(item: dict) -> dict:
    composto = (item.get("composto") or "").strip()
    partes = [p for p in (item.get("partes") or []) if p]
    if len(composto) < 6 or len(partes) < MIN_PARTS:
        return {"prompt": None, "accepted_answers": [], "flag_reason": "structural_mismatch", "flag_detail": None}
    # gate mecanico: concatenar as partes tem que reproduzir o composto
    # EXATAMENTE -- senao a segmentacao "certa" perderia/trocaria letras
    # (ex. Fugenelement esquecido), e o usuario nunca conseguiria acertar.
    if "".join(partes) != composto:
        return {
            "prompt": None, "accepted_answers": [],
            "flag_reason": "lt_flagged",
            "flag_detail": {"motivo": "concatenacao das partes nao reproduz o composto exatamente", "partes": partes, "composto": composto},
        }
    return {
        "prompt": composto,
        "accepted_answers": ["|".join(partes)],
        "flag_reason": "auto_ok",
        "flag_detail": None,
    }
