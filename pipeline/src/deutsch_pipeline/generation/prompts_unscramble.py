"""Prompt e derivação de exercício pro template "Unscramble" (UnscrambleEngine,
Grupo A, docs/05 item 19): pega uma frase correta que respeita a regra de
ordem do tópico (V2, TeKaMoLo, posição de Nebensatz etc.), embaralha os
tokens, usuário reordena.

Contrato diferente do GapFillGovernanceEngine/FillBlankEngine: não há lacuna
-- o LLM autora só "sentence_full" (a frase inteira, já na ordem correta,
aplicando a regra). O programa nunca confia em word order gerado por LLM como
"gabarito" cego: a MESMA sentence_full validada pelos gates (LanguageTool,
adequação à regra) é o que vira tanto o embaralhamento quanto a resposta
aceita -- não existem duas fontes de verdade como no bug estrutural da Fase 0.

`build_exercise_fields_unscramble` é o extension point equivalente a
`build_exercise_fields_gapfill` (generation/pilot.py): gera os campos
prompt/gap_answer/accepted_answers/flag_reason a partir do item bruto do LLM,
mas com semântica própria --
- "gap_answer" aqui é a frase INTEIRA (não um trecho) -- reaproveita os gates
  do harness (validation/harness.py) sem modificá-los: check_case_adherence
  vira "n/a" (nenhum destes 21 tópicos declara caso fixo no nome) e
  find_bad_alternates só compara alternativas ADICIONAIS (nenhuma ainda,
  accepted_answers começa com 1 sequência só) contra a própria frase.
- "prompt" é um array JSON dos tokens embaralhados (não uma string com "___")
  -- o Worker monta a área de chips a partir dele (docs/05: "Tokens como
  chips clicáveis").
"""
import json
import random
import re

from .topics import Topic

TEMPLATE_NAME = "Unscramble"

SYSTEM_PROMPT = """Você é um gerador de material didático de alemão nível B2/C1, seguindo a metodologia \
Grammatik aktiv (Cornelsen). Sua tarefa é gerar frases alemãs completas e gramaticalmente corretas que \
ilustrem UMA regra de ORDEM DE PALAVRAS específica (posição do verbo, ordem dos complementos no Mittelfeld, \
posição de Nebensatz, pronome relativo etc.), a partir de UMA regra gramatical e UM exemplo já corretos, \
fornecidos abaixo. Você NÃO decide a regra -- ela já está dada. Sua única liberdade é variar vocabulário, \
sujeito e contexto (situações cotidianas, profissionais, de viagem, de notícia) mantendo a MESMA regra de ordem.

Estas frases viram um exercício de reordenar: o programa embaralha os tokens e o usuário reconstrói a ordem \
certa -- por isso a frase que você gerar precisa ser a ÚNICA ordem natural e correta para o conteúdo dela \
(evite frases onde mais de uma ordem de palavras seria igualmente natural em alemão, o que tornaria o \
exercício ambíguo).

Para cada item gere:
- "sentence_full": UMA frase alemã completa, nível B2/C1, aplicando a regra de ordem inteira. Use frases de \
tamanho médio (6 a 12 palavras) -- curta demais não dá exercício de reordenar, longa demais vira ambígua \
demais pra ter uma única ordem certa.
- "accepted_answers": deixe como lista vazia [] -- o programa deriva a resposta aceita da própria \
sentence_full, não invente variantes de ordem aqui.

Responda SOMENTE com um array JSON válido, sem texto antes ou depois, sem markdown, sem explicação."""


def build_user_prompt(topic: Topic, n_items: int) -> str:
    return f"""Regra de ordem de palavras (categoria: {topic.categoria}, tópico: {topic.topico}, nível {topic.nivel}):
{topic.regra}

Exemplo-fonte já curado (use como modelo de estrutura, não repita literalmente):
{topic.exemplo}

Gere exatamente {n_items} frases novas e distintas entre si, no formato JSON descrito. Não repita o \
exemplo-fonte nem frases quase idênticas entre os itens."""


_TOKEN_RE = re.compile(r"\S+")
MIN_TOKENS = 3


def tokenize(sentence: str) -> list[str]:
    """Separa por espaço em branco -- pontuação final fica grudada no último
    token (ex. "Kino."), embaralhada junto com o resto. É a granularidade mais
    simples que cobre os 21 tópicos (posição de verbo/complemento/Nebensatz),
    coerente com "embaralha os blocos/tokens" do docs/05."""
    return _TOKEN_RE.findall(sentence)


def shuffle_tokens(tokens: list[str]) -> list[str]:
    """Reembaralha até garantir uma ordem diferente da original -- um
    "quebra-cabeça" já resolvido de saída não testa nada."""
    if len(tokens) <= 1:
        return list(tokens)
    shuffled = list(tokens)
    while shuffled == tokens:
        random.shuffle(shuffled)
    return shuffled


def build_exercise_fields_unscramble(item: dict, topic: Topic) -> dict:
    sentence_full = (item.get("sentence_full") or "").strip()
    tokens = tokenize(sentence_full)
    if len(tokens) < MIN_TOKENS:
        return {
            "prompt": None,
            "sentence_full": sentence_full,
            "gap_answer": sentence_full,
            "accepted_answers": [sentence_full] if sentence_full else [],
            "flag_reason": "structural_mismatch",
        }
    shuffled = shuffle_tokens(tokens)
    return {
        "prompt": json.dumps(shuffled, ensure_ascii=False),
        "sentence_full": sentence_full,
        # gap_answer = frase inteira: faz os gates de caso/alternativas do
        # harness tratarem "a frase inteira" como a unidade a validar, sem
        # precisar mudar validation/harness.py pra este template.
        "gap_answer": sentence_full,
        "accepted_answers": [sentence_full],
        "flag_reason": "pending",
    }
