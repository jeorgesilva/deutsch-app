"""Fase 5 (docs/06, docs/05 item 111) -- VowelInsertEngine: usa
`phonetic_points` (prioridade Alta: duração vocálica curta/longa tipo
Staat/Stadt, Umlaute) pra gerar pares mínimos propositais -- mesma
palavra-esqueleto, resposta certa muda conforme o contexto da frase.

Diferente dos outros engines desta fase: não deriva do `reading_block.
texto_base` (o texto de uma notícia genérica não necessariamente contém
pares mínimos fonéticos) -- gera conteúdo NOVO a partir de `phonetic_points`,
igual ao DictationEngine (Fase 7). Anexado ao mesmo `reading_block` via
`reading_block_items` só por coesão de sessão (linha repetida em todo item
do docs/05 -- "faz parte de um reading_block" descreve a arquitetura de
bloco/crédito-por-item, não exige que o conteúdo venha do MESMO artigo).

Diferente do DictationEngine: aqui a "resposta certa" nunca é confiada
cegamente ao LLM -- o esqueleto (consoantes fixas, vogais como lacuna) é
derivado MECANICAMENTE da palavra completa que o LLM forneceu (mesmo
princípio de "o programa deriva, o LLM só varia" do resto do projeto),
então esqueleto e resposta NUNCA podem divergir.
"""

TEMPLATE_NAME = "Insert The Vowels (pares mínimos fonéticos)"

SYSTEM_PROMPT = """Você é um professor de alemão B2/C1+ criando um exercício de pares mínimos fonéticos, a \
partir de UM ponto fonético (duração vocálica ou Umlaut) já curado, fornecido abaixo. Gere pares mínimos REAIS \
do alemão -- DUAS PALAVRAS DIFERENTES (nunca a mesma palavra duas vezes!) com o mesmo "esqueleto" de \
consoantes na MESMA ordem, diferindo só na vogal (curta vs. longa, ou com/sem Umlaut) -- ex. "Staat"/"Stadt" \
(mesmo esqueleto St_t, vogal diferente), "Höhle"/"Hölle", "Miete"/"Mitte". NUNCA repita a mesma palavra pras \
duas metades do par (ex. "Weg" duas vezes com sentidos diferentes NÃO é um par mínimo -- não tem vogal \
diferente pra escolher).

ATENÇÃO: as duas palavras do par têm que ser palavras REAIS do alemão padrão (nunca invente uma forma pra \
forçar a semelhança -- ex. "Wegg", "Sonn", "Ratt" NÃO existem). É esperado e normal que a diferença apareça \
como consoante DOBRADA vs. simples (ex. "offen" vogal curta vs. "Ofen" vogal longa, "Bann" vs. "Bahn") -- as \
duas palavras não precisam ter o mesmo número de letras.

Para cada par gere:
- "palavra_1" / "palavra_2": as duas palavras REALMENTE DIFERENTES do par mínimo.
- "frase_1": frase alemã nível B2/C1 usando "palavra_1", com contexto que deixa claro que é ELA (não a outra \
do par) -- não cite "palavra_2" nessa frase.
- "frase_2": o mesmo pra "palavra_2".

Responda SOMENTE com um array JSON válido de PARES (não de palavras soltas), sem texto antes ou depois, sem \
markdown, sem explicação."""


def build_user_prompt(ponto_topico: str, ponto_descricao: str, ponto_exemplo: str, n_pairs: int) -> str:
    return f"""Ponto fonético: {ponto_topico}
{ponto_descricao}
Exemplo-fonte já curado: {ponto_exemplo}

Gere exatamente {n_pairs} pares mínimos DIFERENTES entre si (não repita o mesmo par duas vezes), no formato \
JSON descrito (cada item do array é um PAR completo: palavra_1/frase_1/palavra_2/frase_2)."""


_VOWELS = "aeiouäöüAEIOUÄÖÜ"
MIN_LEN = 3


def make_skeleton(palavra: str) -> str:
    return "".join("_" if c in _VOWELS else c for c in palavra)


def _build_one(palavra: str, frase: str) -> dict | None:
    """Retorna None se palavra/frase nao passarem no gate mecanico basico
    (existe, tem tamanho minimo, aparece de fato na frase)."""
    if len(palavra) < MIN_LEN or not frase or not palavra.isalpha() or palavra not in frase:
        return None
    skeleton = make_skeleton(palavra)
    frase_gapped = frase.replace(palavra, skeleton, 1)
    return {
        "prompt": frase_gapped,
        "accepted_answers": [palavra],
        "flag_reason": "auto_ok",
        "flag_detail": None,
    }


def build_exercise_fields_vowelinsert_pair(item: dict) -> list[dict]:
    """Recebe UM PAR (palavra_1/frase_1/palavra_2/frase_2) e devolve ATE 2
    exercicios -- um por metade do par. Gate mecanico: as duas palavras tem
    que ser DIFERENTES (senao nao e' par minimo nenhum -- achado real: o LLM
    as vezes repete a MESMA palavra duas vezes com sentidos diferentes, que
    nao testa vogal nenhuma). NAO exige mesmo esqueleto de consoantes --
    achado real (2a tentativa, rodando contra dados): pares minimos de
    duracao vocalica em alemao costumam marcar a diferenca com consoante
    DOBRADA vs simples (Bann/Bahn, offen/Ofen), nao com o mesmo esqueleto;
    exigir esqueleto identico empurrou o LLM a INVENTAR palavras falsas
    ("Wegg", "Sonn", "Ratt") so pra bater a regra. Fundamentacao (palavra
    aparece na frase) + auditoria manual cobrem a qualidade aqui, nao um
    gate estrutural rigido demais pro fenomeno linguistico real."""
    p1, f1 = (item.get("palavra_1") or "").strip(), (item.get("frase_1") or "").strip()
    p2, f2 = (item.get("palavra_2") or "").strip(), (item.get("frase_2") or "").strip()

    if not p1 or not p2 or p1.lower() == p2.lower():
        return [{
            "prompt": None, "accepted_answers": [], "flag_reason": "structural_mismatch",
            "flag_detail": {"motivo": "par com a mesma palavra repetida ou vazia", "palavra_1": p1, "palavra_2": p2},
        }]

    results = []
    for palavra, frase in ((p1, f1), (p2, f2)):
        built = _build_one(palavra, frase)
        if built is None:
            results.append({
                "prompt": None, "accepted_answers": [], "flag_reason": "lt_flagged",
                "flag_detail": {"motivo": "palavra nao encontrada literalmente na frase correspondente", "palavra": palavra},
            })
        else:
            results.append(built)
    return results
