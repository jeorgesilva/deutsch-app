"""Prompt e derivação de exercício pro template "Umformung von Sätzen"
(StructuralTransformEngine, Grupo A, docs/05 item 21): LLM gera uma frase na
forma A (ex. voz ativa, discurso direto, oração verbal) e a mesma frase na
forma B definida pelo tópico (Konjunktiv II, Passiv, discurso indireto,
Nominalisierung etc.); usuário lê a forma A e reescreve na forma B.

Risco estrutural diferente dos templates anteriores: aqui o LLM
NECESSARIAMENTE autora DUAS strings relacionadas (sentence_a + sentence_b) --
exatamente a classe de bug que a auditoria da Fase 0 encontrou (duas versões
podendo divergir sem ninguém notar). Mitigação, sem duplicar
validation/harness.py: as duas frases são concatenadas num único
"sentence_full" (`f"{sentence_a} {sentence_b}"`) antes de entrar no harness --
o LanguageTool roda sobre o texto inteiro (pega erro em QUALQUER uma das
duas), e "gap_answer" = sentence_b faz o gate de estrutura localizar
corretamente onde ela começa dentro do texto concatenado, sem precisar mudar
harness.py. O que o harness NÃO verifica (nem verificava antes desta engine):
se sentence_b é de fato a transformação certa, não só uma frase gramatical
qualquer -- por isso o SYSTEM_PROMPT é explícito sobre o marcador morfológico
esperado por categoria de tópico. Se a auditoria manual do piloto encontrar um
padrão sistemático de erro (like o caso "...mit Dativ" da Fase 0), aí sim vale
generalizar validation/rule_adherence.py com uma checagem estrutural dedicada
-- não construir isso especulativamente antes de ter o problema reproduzido.
"""
from .topics import Topic

TEMPLATE_NAME = "Umformung von Sätzen"

SYSTEM_PROMPT = """Você é um gerador de material didático de alemão nível B2/C1, seguindo a metodologia \
Grammatik aktiv (Cornelsen). Sua tarefa é gerar PARES de frases: uma frase na FORMA A (a forma de partida, \
que o usuário vai LER) e a MESMA frase reescrita na FORMA B (a transformação que o usuário precisa PRODUZIR), \
a partir de UMA regra gramatical e UM exemplo já corretos, fornecidos abaixo. Você NÃO decide a regra -- ela \
já está dada. Sua única liberdade é variar vocabulário, sujeito e contexto (situações cotidianas, \
profissionais, de viagem, de notícia) mantendo a MESMA transformação.

Para cada item gere:
- "sentence_a": frase alemã completa, nível B2/C1, na forma de PARTIDA descrita pela regra (ex.: voz ativa, \
discurso direto, condição real, oração verbal, forma sem nominalização -- o lado "antes" da regra).
- "sentence_b": a MESMA frase reescrita na forma de CHEGADA descrita pela regra (ex.: Konjunktiv II, Passiv, \
discurso indireto, oração nominalizada -- o lado "depois"). sentence_b tem que ser uma transformação REAL de \
sentence_a, com o MESMO conteúdo/situação, não uma frase nova sobre outro assunto.

IMPORTANTE -- sentence_b precisa conter o marcador gramatical concreto da transformação pedida, não só ser \
uma paráfrase natural:
- Konjunktiv II (presente): würde + infinitivo, OU forma de Präteritum/Umlaut de verbo forte (hätte/wäre/käme...).
- Konjunktiv II (passado): sempre hätte/wäre + Partizip II -- nunca würde no passado.
- Passiv de processo (Vorgangspassiv): werden (conjugado no tempo pedido) + Partizip II.
- Passiv com modal: modal conjugado + Partizip II + werden no infinitivo, no final.
- Alternativas ao Passiv: sich lassen + infinitivo, OU sein + zu + infinitivo.
- bekommen-Passiv: bekommen/kriegen/erhalten (conjugado) + Partizip II.
- Konjunktiv I (discurso indireto, presente): forma de Konjunktiv I (sei, habe, könne, wolle, solle, komme...) \
-- se idêntica ao indicativo, use Konjunktiv II como substituto (regra padrão do alemão).
- Konjunktiv I (discurso indireto, passado): sempre habe/sei + Partizip II.
- Nominalisierung: o núcleo verbal da oração vira um substantivo (geralmente com sufixo -ung/-heit/-keit ou \
infinitivo substantivado), a frase toda fica mais compacta, tipicamente com uma preposição regendo o \
substantivo no lugar da oração.
- Equivalência preposição/advérbio/conector: se sentence_a usa preposição+substantivo, sentence_b usa o \
advérbio conjuntivo OU o conector subordinativo equivalente (conforme a regra específica pedir), mantendo o \
mesmo sentido temporal/causal/modal.

ATENÇÃO -- problemas recorrentes a evitar:
1. Quando a regra pede SÓ mudança de voz (Aktiv→Passiv, ex. "Passiv in allen Zeiten", "Passivsätze ohne \
Subjekt"), sentence_b tem que ficar EXATAMENTE no mesmo tempo verbal que sentence_a -- Präsens→Präsens, \
Perfekt→Perfekt (sind/sind + Partizip + worden), Präteritum→Präteritum (wurde/wurden + Partizip), \
Plusquamperfekt→Plusquamperfekt (war/waren + Partizip + worden), Futur I→Futur I (wird/werden + Partizip + \
werden). NUNCA troque o tempo verbal de propósito na transformação (ex. reescrever um Perfekt ativo como um \
Präteritum passivo) -- só a voz muda, o tempo é o mesmo dos dois lados.
2. sentence_a e sentence_b NUNCA podem ser a mesma frase. Se a regra descreve só a forma-alvo sem mencionar \
explicitamente uma forma de partida diferente (ex. "Passiv mit Modalverben in allen Zeiten", "Indirekte Rede \
-- Vergangenheit"), você tem que INVENTAR a forma de partida correspondente antes da transformação: pra \
Passiv com modal, sentence_a é a versão ATIVA com o mesmo modal e mesmo tempo (ex. "Man kann die Dokumente \
morgen abholen." → "Die Dokumente können morgen abgeholt werden."); pra Indirekte Rede (presente ou \
passado), sentence_a é sempre a fala DIRETA entre aspas com dois-pontos (ex. "Er sagt: 'Ich habe den Zug \
verpasst.'" → "Er sagt, er habe den Zug verpasst.").

Responda SOMENTE com um array JSON válido, sem texto antes ou depois, sem markdown, sem explicação."""


def build_user_prompt(topic: Topic, n_items: int) -> str:
    return f"""Regra de transformação (categoria: {topic.categoria}, tópico: {topic.topico}, nível {topic.nivel}):
{topic.regra}

Exemplo-fonte já curado (use como modelo de estrutura A→B, não repita literalmente):
{topic.exemplo}

Gere exatamente {n_items} pares novos e distintos entre si, no formato JSON descrito (sentence_a/sentence_b). \
Não repita o exemplo-fonte nem pares quase idênticos entre os itens."""


MIN_LEN = 8  # caracteres -- guarda contra item vazio/curto demais pra ser uma frase


def _as_lt_sentence(s: str) -> str:
    """So pro campo sentence_full (nunca visto pelo usuario, so alimenta o
    gate LanguageTool): alguns topicos (ex. Links-/Rechtsattribute) produzem
    SINTAGMAS nominais, nao frases completas -- comecam com artigo minusculo
    de proposito ("die von uns besichtigte Wohnung") e nao tem ponto final,
    o que e' gramaticalmente correto pro sintagma mas quebra a suposicao do
    LanguageTool de que esta checando frases (capitaliza a primeira letra E
    garante ponto final, senao as duas metades viram UMA frase continua pro
    parser do LT, que ai flagga a maiuscula do meio como errada -- achado
    rodando contra dados reais, nao teorico). Corrige so a copia usada no
    gate, sem tocar em prompt/accepted_answers (o que o usuario ve continua
    com a grafia original). Pra frases completas (a maioria dos topicos), ja
    comecam maiusculas e terminam em pontuacao -- e' um no-op."""
    if not s:
        return s
    s = s[0].upper() + s[1:]
    # aspas de fechamento (discurso direto, ex. "...vergessen.'") ja contam
    # como fim de frase -- acrescentar ponto depois delas e' o proprio erro
    # de pontuacao que o LanguageTool passou a acusar (ZEICHENSETZUNG_DIREKTE_REDE).
    if s[-1] not in ".!?'\"'’”":
        s += "."
    return s


def build_exercise_fields_structuraltransform(item: dict, topic: Topic) -> dict:
    sentence_a = (item.get("sentence_a") or "").strip()
    sentence_b = (item.get("sentence_b") or "").strip()
    # Achado real (nao teorico) rodando lote completo: em topicos cuja regra
    # so descreve a FORMA-ALVO sem mencionar explicitamente uma forma de
    # partida (ex. "Passiv mit Modalverben", "Indirekte Rede -- Vergangenheit"),
    # o LLM as vezes devolve sentence_a == sentence_b -- exercicio sem
    # proposito (nada pra transformar). Gate mecanico, nao so prompt: pega
    # TODA ocorrencia, nao so a maioria dos casos.
    identical = sentence_a.strip().lower() == sentence_b.strip().lower()
    if len(sentence_a) < MIN_LEN or len(sentence_b) < MIN_LEN or identical:
        return {
            "prompt": sentence_a or None,
            "sentence_full": None,
            "gap_answer": sentence_b,
            "accepted_answers": [sentence_b] if sentence_b else [],
            "flag_reason": "structural_mismatch",
        }
    return {
        "prompt": sentence_a,
        # concatenado (nao gap_answer sozinho) pro LanguageTool checar as DUAS
        # frases num unico gate -- ver docstring do modulo.
        "sentence_full": f"{_as_lt_sentence(sentence_a)} {_as_lt_sentence(sentence_b)}",
        "gap_answer": sentence_b,
        "accepted_answers": [sentence_b],
        "flag_reason": "pending",
    }
