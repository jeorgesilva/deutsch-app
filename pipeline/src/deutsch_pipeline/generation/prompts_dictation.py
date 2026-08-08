"""Prompt e derivação de exercício pro template "Dictation" (DictationEngine,
Grupo A, docs/05 item 28, variante TTS): toca um áudio gerado a partir de uma
frase que ilustra um `phonetic_point` (não um `content_topic` -- fonética, não
gramática); usuário digita o que ouviu; comparação é diff palavra-a-palavra
contra o texto-fonte (implementação do diff é Fase 9/frontend, fora do
escopo deste módulo).

`topics.Topic` foi desenhado em cima de `content_topics` (categoria/tópico/
regra/exemplo/fonte) -- `phonetic_point_to_topic` adapta uma linha de
`phonetic_points` (categoria/tópico/prioridade/descricao/exemplo/fonte) pro
mesmo formato por duck-typing, reaproveitando 100% de generation/pilot.py
generate_for_topic sem tocar nele: nivel<-prioridade, regra<-descricao. Nunca
declara caso fixo (infer_expected_case não casa com nome de ponto fonético),
então o gate de aderência a caso do harness sempre retorna "n/a" pra esses
itens -- comportamento seguro, não é um problema.
"""
import re
from dataclasses import dataclass

from .topics import Topic

# Rede de seguranca mecanica -- achado real rodando contra dados: mesmo com
# instrucao explicita, o LLM as vezes embute transcricao IPA entre colchetes
# (ex. "[ʔanˌfaŋ]") ou seta de entonacao ("↘"/"↗") dentro de sentence_full.
# Isso quebra o exercicio de duas formas: (1) Piper tenta "ler" o texto entre
# colchetes, produzindo audio sem sentido; (2) accepted_answers fica com um
# simbolo que o usuario NUNCA conseguiria digitar depois de so OUVIR a frase,
# entao toda tentativa correta seria marcada errada. Remove antes de sintetizar.
_IPA_BRACKET_RE = re.compile(r"\s*[\[/][^\]/]*[\]/]")
_INTONATION_ARROW_RE = re.compile(r"\s*[↘↗↑↓]")
# apostrofo/ˈ solto -- usado tanto pra marcar acento tonico ("Pa'pier") quanto
# pra citar uma palavra entre aspas simples ("des Wortes 'Kommunikation'").
# Nos dois casos quebra o ditado: TTS nao vocaliza a marca, e o usuario nunca
# vai digitar algo que so ouviu, entao accepted_answers ficaria com um
# caractere impossivel de acertar. Frases geradas aqui sao registro neutro/
# formal (nunca viu contracao coloquial legitima do tipo "geht's" nas
# amostras revisadas) -- risco de falso-positivo aceitavel.
_APOSTROPHE_RE = re.compile(r"['ˈ]")


def _strip_phonetic_notation(text: str) -> str:
    text = _IPA_BRACKET_RE.sub("", text)
    text = _INTONATION_ARROW_RE.sub("", text)
    text = _APOSTROPHE_RE.sub("", text)
    return re.sub(r"\s+", " ", text).strip()

TEMPLATE_NAME = "Dictation"

SYSTEM_PROMPT = """Você é um gerador de material didático de alemão nível B2/C1, seguindo a metodologia \
PONS Die große Grammatik Deutsch. Sua tarefa é gerar frases alemãs completas e gramaticalmente corretas que \
ILUSTREM CLARAMENTE um ponto de fonética específico (contraste de som, duração vocálica, consoante etc.), a \
partir de UMA descrição e UM exemplo já corretos, fornecidos abaixo. Você NÃO decide o ponto fonético -- ele \
já está dado. Sua única liberdade é variar vocabulário, sujeito e contexto (situações cotidianas, \
profissionais, de viagem) mantendo o MESMO contraste fonético.

Essas frases vão virar áudio (TTS) pra um exercício de ditado: o usuário ouve, escreve o que entendeu, e o \
sistema compara com o texto-fonte. Por isso:
- A frase TEM que conter pelo menos uma palavra que exemplifica de forma clara e inequívoca o ponto fonético \
descrito (o mesmo tipo de palavra do exemplo-fonte, não uma referência genérica ao assunto).
- Use frases de tamanho médio (6 a 12 palavras) -- curta demais não dá material pra ditado, longa demais é \
cansativa de transcrever de ouvido.
- Evite nomes próprios raros, siglas ou números por extenso que dificultem a transcrição sem testar o ponto \
fonético em si.

Para cada item gere:
- "sentence_full": UMA frase alemã completa, nível B2/C1, ilustrando o ponto fonético.

ATENÇÃO -- crítico: "sentence_full" vai virar áudio (TTS) E vai ser comparada com o que o usuário DIGITAR depois \
de ouvir. Por isso "sentence_full" tem que ser SOMENTE texto alemão padrão (letras, espaços, pontuação normal \
.,!? -- nada mais). NUNCA inclua:
- transcrição fonética/IPA entre colchetes ou barras (ex. NÃO escreva "[ʔanˌfaŋ]" ou "/an.faŋ/");
- símbolos de seta ou entonação (ex. NÃO escreva "↘" ou "↗" no final da frase);
- apóstrofo ou qualquer marca ANTES de uma sílaba pra indicar acento tônico (ex. NÃO escreva "das 'Wetter" ou \
"Pa'pier" pra marcar a sílaba acentuada);
- fragmento de palavra citado solto com hífen pra indicar posição (ex. NÃO escreva "o -i- é o Inlaut" ou "H- é \
o Anlaut") -- se a regra é sobre posição de som na palavra (Anlaut/Inlaut/Auslaut), descreva usando a PALAVRA \
INTEIRA e uma frase normal (ex.: "Der erste Laut in 'Himmel' ist ein H." -- mesmo aqui, sem aspas de marcação \
extra, e' melhor dizer isso como frase comum, nao como anotacao).
O ponto fonético (duração vocálica, Knacklaut, acento tônico, entonação de pergunta etc.) tem que ficar \
implícito na ESCOLHA das palavras e no TIPO de frase (ex.: pra entonação descendente, use uma afirmação ou \
pergunta-Wh comum; pra Knacklaut, escolha palavras que comecem com vogal; pra acento tônico, simplesmente \
inclua a palavra normal sem marcar onde fica o acento) -- NUNCA marcado explicitamente no texto com símbolos.

Responda SOMENTE com um array JSON válido, sem texto antes ou depois, sem markdown, sem explicação."""


def build_user_prompt(topic: Topic, n_items: int) -> str:
    return f"""Ponto fonético (categoria: {topic.categoria}, ponto: {topic.topico}, prioridade {topic.nivel}):
{topic.regra}

Exemplo-fonte já curado (mostra o tipo de contraste/palavra a ilustrar, não repita literalmente):
{topic.exemplo}

Gere exatamente {n_items} frases novas e distintas entre si, no formato JSON descrito. Não repita o \
exemplo-fonte nem frases quase idênticas entre os itens."""


MIN_LEN = 8


def build_exercise_fields_dictation(item: dict, topic: Topic) -> dict:
    sentence_full = _strip_phonetic_notation((item.get("sentence_full") or "").strip())
    if len(sentence_full) < MIN_LEN:
        return {
            "prompt": None,
            "sentence_full": sentence_full,
            "gap_answer": sentence_full,
            "accepted_answers": [sentence_full] if sentence_full else [],
            "flag_reason": "structural_mismatch",
        }
    return {
        # prompt = a propria frase -- o Worker (Fase 9) NUNCA deve renderizar
        # este campo como texto pro usuario ler antes da tentativa (mesma
        # regra ja estabelecida pro DictationEngine com video autentico,
        # CLAUDE.md); serve so como fallback/gabarito, o que o usuario ve
        # de fato e' o audio via audio_ref.
        "prompt": sentence_full,
        "sentence_full": sentence_full,
        "gap_answer": sentence_full,
        "accepted_answers": [sentence_full],
        "flag_reason": "pending",
    }


@dataclass
class PhoneticPoint:
    id: int
    categoria: str
    topico: str
    prioridade: str
    descricao: str
    exemplo: str
    fonte: str


def phonetic_point_to_topic(pp: PhoneticPoint) -> Topic:
    return Topic(
        id=pp.id, categoria=pp.categoria, topico=pp.topico, nivel=pp.prioridade,
        regra=pp.descricao, exemplo=pp.exemplo, fonte=pp.fonte,
    )
