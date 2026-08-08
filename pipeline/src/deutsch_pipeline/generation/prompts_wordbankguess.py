"""Prompt e derivação de exercício pro template "Guess (lacunas com banco de
palavras)" (WordBankGuessEngine, Grupo A, docs/05 item 20): igual ao gap-fill,
mas em vez de campo livre o usuário escolhe entre um banco fechado de opções
(a certa + distratores) -- mecanismo de SELEÇÃO, não digitação.

docs/05 sugere distratores "gerados via OpenThesaurus/campo semântico", mas
olhando os 27 tópicos mapeados (topic_template_map: Genusregeln, Deklination,
Komparation, sufixos de formação de palavra, ortografia -- ver CLAUDE.md),
quase todos testam FORMA gramatical, não vocabulário: o distrator certo é uma
variante ERRADA da mesma categoria (terminação de caso errada, sufixo errado,
grafia errada, pronome relativo errado), não um sinônimo de dicionário.
OpenThesaurus serviria pra topicos de vocabulário/sinônimo, que não é o caso
de nenhum dos 27 aqui -- por isso o LLM gera os distratores diretamente (mesma
lógica de "o programa decide a forma certa, o LLM só varia" da regra de
constrained generation do CLAUDE.md, só que agora pedindo TAMBÉM as formas
erradas plausíveis). Sem integração externa nova; se algum tópico futuro
precisar de distrator lexical/semântico de verdade, aí sim vale integrar
OpenThesaurus -- não construir isso especulativamente antes da necessidade
aparecer (mesmo princípio já aplicado ao não construir um gate estrutural
novo pro StructuralTransformEngine antes de reproduzir o problema).

Contrato de dados: reaproveita EXATAMENTE sentence_full/gap_answer/
accepted_answers do contrato de lacuna (generation/pilot.py,
build_exercise_fields_gapfill) -- os gates do harness (case-adherence,
LanguageTool, alternativas) continuam batendo em cima dessas 3 chaves sem
nenhuma mudança. O que muda é o campo "prompt": em vez de string com "___",
vira um objeto JSON {"prompt_gapped": "...", "word_bank": [...]} (mesmo
padrão de repropósito do campo prompt já usado por UnscrambleEngine pra
guardar os tokens embaralhados) -- o Worker (Fase 9) monta os chips a partir
de "word_bank" e a lacuna a partir de "prompt_gapped".
"""
import json
import random

from .pilot import build_exercise_fields_gapfill
from .topics import Topic

TEMPLATE_NAME = "Guess (lacunas com banco de palavras)"

SYSTEM_PROMPT = """Você é um gerador de material didático de alemão nível B2/C1, seguindo a metodologia \
Grammatik aktiv (Cornelsen). Sua tarefa é gerar exercícios de múltipla escolha: uma frase com uma lacuna \
testando UM ponto gramatical específico, MAIS um banco de opções (a resposta certa + distratores) pra \
preencher essa lacuna -- a partir de UMA regra gramatical e UM exemplo já corretos, fornecidos abaixo. Você \
NÃO decide a regra -- ela já está dada. Sua única liberdade é variar vocabulário, sujeito e contexto mantendo \
a MESMA regra.

Para cada item gere:
- "sentence_full": UMA frase alemã completa e gramaticalmente correta, nível B2/C1, aplicando a regra inteira.
- "gap_answer": o trecho EXATO que deve ser cortado de "sentence_full" pra virar a lacuna -- tem que aparecer \
literalmente como substring CONTÍGUA em "sentence_full".
- "accepted_answers": lista de 1-2 strings equivalentes aceitáveis (variações de grafia legítimas), sempre \
incluindo "gap_answer".
- "distractors": lista de EXATAMENTE 2 opções ERRADAS pra colocar na mesma lacuna -- cada distrator tem que \
ser da MESMA categoria gramatical/morfológica de "gap_answer" (ex.: se "gap_answer" é uma terminação de \
declinação, os distratores são OUTRAS terminações da mesma tabela de declinação; se é um artigo, os \
distratores são os OUTROS artigos possíveis; se é um sufixo de formação de palavra, os distratores usam \
OUTROS sufixos plausíveis mas errados pra aquela palavra; se é uma questão de ortografia, os distratores são \
grafias incorretas plausíveis) -- nunca uma palavra de categoria totalmente diferente (ex. não misture um \
substantivo com uma preposição). Cada distrator, colocado na lacuna no lugar de "gap_answer", tem que deixar \
a frase ERRADA de um jeito que testa exatamente a regra -- não pode ser uma alternativa que também estaria \
gramaticalmente correta ali.

ATENÇÃO -- dois problemas recorrentes a evitar:
1. Se a regra descrever um padrão de sufixo/prefixo (ex. "palavras terminadas em -nis são neutras"), NUNCA \
escreva o sufixo com hífen solto dentro da frase (ex. "-nis") -- isso quebra o corretor ortográfico que valida \
a frase. Em vez disso, cite o sufixo entre aspas ou dentro de uma palavra completa (ex.: "Substantive, die auf \
'nis' enden, wie Erlaubnis, sind meistens neutral." -- ou simplesmente cite só a palavra de exemplo sem repetir \
o sufixo isolado).
2. SEMPRE gere "distractors" com EXATAMENTE 2 itens (nunca deixe a lista vazia nem com 1 só) -- isso vale pra \
TODO tópico, sem exceção. Pra tópicos de ORTOGRAFIA (grafia, maiúscula/minúscula, pontuação), "gap_answer" tem \
que conter de fato a letra/padrão que a regra testa (ex.: se a regra é sobre s/ss/ß, a palavra escolhida pra \
lacuna PRECISA ter um desses), e os distratores são a MESMA palavra grafada ERRADO conforme a regra teria \
previsto o oposto (ex.: gap_answer "weiße" com vogal longa → distratores "weisse"/"weiss"; gap_answer "Schuss" \
com vogal curta → distratores "Schuß"/"Schuhs"; pra maiúscula/minúscula, gap_answer "Schwimmen" substantivado → \
distratores "schwimmen"/"Schwimmen." -- versão minúscula errada e outra variante plausível). Pra tópicos de \
NÚMEROS (cardinais, ordinais, frações, decimais), os distratores são a MESMA quantidade/posição mas com a \
FORMA errada (ex.: gap_answer "Drei Viertel" → distratores "Drittel Drei"/"Drei-Viertel" com hífen errado, ou \
uma fração DIFERENTE plausível como "Ein Viertel"; gap_answer "sieben Komma zwei" → distratores "sieben Punkt \
zwei"/"sieben Komma zwei Grad" com palavra a mais).

Responda SOMENTE com um array JSON válido, sem texto antes ou depois, sem markdown, sem explicação."""


def build_user_prompt(topic: Topic, n_items: int) -> str:
    return f"""Regra gramatical (categoria: {topic.categoria}, tópico: {topic.topico}, nível {topic.nivel}):
{topic.regra}

Exemplo-fonte já curado (use como modelo de estrutura, não repita literalmente):
{topic.exemplo}

Gere exatamente {n_items} itens novos e distintos entre si, no formato JSON descrito (incluindo \
"distractors"). Não repita o exemplo-fonte nem frases quase idênticas entre os itens."""


MIN_DISTRACTORS = 2


def build_exercise_fields_wordbankguess(item: dict, topic: Topic) -> dict:
    base = build_exercise_fields_gapfill(item, topic)
    if base["flag_reason"] == "structural_mismatch":
        return base

    gap_answer = base["gap_answer"]
    # comparacao EXATA (case-sensitive), nao lower() -- topicos de
    # Groß-/Kleinschreibung tem como distrator de proposito a MESMA palavra
    # só com a caixa errada ("schwimmen" vs "Schwimmen"), que um dedup
    # case-insensitive descartaria por engano tratando como duplicata da
    # resposta aceita (achado real rodando contra dados, nao teorico).
    accepted_exact = {a.strip() for a in base["accepted_answers"]}
    raw_distractors = item.get("distractors") or []
    # gate mecanico: distrator vazio, duplicado entre si, ou igual a alguma
    # resposta aceita (o que tornaria a "opcao errada" na verdade certa) --
    # nunca deixa passar pro usuario escolher entre duas opcoes corretas.
    seen = set()
    distractors = []
    for d in raw_distractors:
        d = (d or "").strip()
        if not d or d in accepted_exact or d in seen:
            continue
        seen.add(d)
        distractors.append(d)

    if not gap_answer or not base["prompt"] or len(distractors) < MIN_DISTRACTORS:
        return {
            **base,
            "flag_reason": "structural_mismatch",
        }

    word_bank = [gap_answer, *distractors[:MIN_DISTRACTORS]]
    random.shuffle(word_bank)

    return {
        **base,
        "prompt": json.dumps(
            {"prompt_gapped": base["prompt"], "word_bank": word_bank}, ensure_ascii=False
        ),
    }
