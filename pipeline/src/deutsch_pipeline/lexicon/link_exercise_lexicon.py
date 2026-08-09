"""docs/14 -- liga exercises a lexicon (tabela exercise_lexicon_refs, migration
0013) pra viabilizar o contador de vocabulario do dashboard. lexicon estava
com so' 1 linha (source='video_mining') quando essa fatia comecou -- decisao
do usuario: em vez de depender de uma seed maior (curadoria via wiktextract
sobre as planilhas, item pendente do CLAUDE.md nunca executado), lematiza o
texto de cada exercicio via spaCy e CRIA a linha em lexicon na hora se o
lemma ainda nao existir (source='exercise_derived', sem genero/plural/IPA --
enriquecimento via Wiktionary fica pra outra fatia, mesmo principio de "nao
construir infra antes da necessidade aparecer" ja usado no WordBankGuessEngine).

exercises.prompt nao e' sempre texto plano -- cada engine guarda o dado de um
jeito diferente (array de tokens embaralhados, JSON com sub-campos, situacao
em PORTUGUES pro par de frases fixas). build_exercise_text reconstroi o texto
ALEMAO real por template antes de lematizar; ver a exploracao de amostras reais
de cada engine que motivou cada branch.

Idempotente por construcao: so processa exercicios que AINDA NAO TEM nenhuma
linha em exercise_lexicon_refs -- serve tanto pro backfill retroativo (uma
vez, todos os exercicios) quanto pro passo novo no pipeline de geracao
(chamado no fim de generate_batch.py, so os exercicios do lote que acabou de
gravar ja caem nesse filtro naturalmente).

Uso:
    python -m deutsch_pipeline.lexicon.link_exercise_lexicon
    D1_REMOTE=1 python -m deutsch_pipeline.lexicon.link_exercise_lexicon   # contra o D1 remoto
"""
import json
import os
import re
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
APP_DIR = REPO_ROOT / "app"

# spaCy POS (universal) -> rotulo em alemao ja usado em lexicon.pos (ver a
# unica linha existente antes desta fatia: pos='Substantiv'). So' classes de
# conteudo -- nunca artigo/preposicao/pronome, que nao sao "vocabulario"
# nesse sentido.
POS_MAP = {
    "NOUN": "Substantiv",
    "VERB": "Verb",
    "ADJ": "Adjektiv",
    "ADV": "Adverb",
}

_nlp = None


def _load_spacy():
    global _nlp
    if _nlp is None:
        import spacy
        _nlp = spacy.load("de_core_news_lg")
    return _nlp


D1_TARGET = "--remote" if os.environ.get("D1_REMOTE") else "--local"


def query_d1(sql: str) -> list[dict]:
    result = subprocess.run(
        ["npx", "wrangler", "d1", "execute", "deutsch-db", D1_TARGET, "--json", "--command", sql],
        cwd=APP_DIR, capture_output=True, text=True, check=True,
    )
    return json.loads(result.stdout)[0]["results"]


def execute_d1(sql: str) -> None:
    subprocess.run(
        ["npx", "wrangler", "d1", "execute", "deutsch-db", D1_TARGET, "-y", "--command", sql],
        cwd=APP_DIR, capture_output=True, text=True, check=True,
    )


def sql_str(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _fill_gap(text: str, answer: str) -> str:
    return text.replace("___", answer or "")


def _safe_json(raw: str | None):
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return None


# Templates cujo `prompt` nao e' texto alemao utilizavel de jeito nenhum --
# TransitionPhraseEngine/ReactionPhraseEngine guardam a SITUACAO em
# portugues (gatilho do card); lematizar isso como alemao produziria lixo.
# OpinionEssayEngine/QuickOpinionSpeechEngine/RecordedOpinionEngine sao
# exercicios DINAMICOS (tema/roteiro digitado no planejador, nao conteudo
# curado) -- fora de escopo de vocabulario-fonte por ora, mesma decisao que
# ja deixa a resposta do usuario fora do lexico (so o conteudo do exercicio
# em si e' fonte, nunca a tentativa).
_NO_TEXT_TEMPLATES = {"OpinionEssayEngine", "QuickOpinionSpeechEngine", "RecordedOpinionEngine"}


def build_exercise_text(template_nome: str, prompt: str, accepted_answers_json: str | None) -> str:
    """Reconstroi o texto alemao real de um exercicio a partir do formato de
    armazenamento especifico do template -- ver CLAUDE.md pra cada engine."""
    accepted = _safe_json(accepted_answers_json) or []
    accepted = [a for a in accepted if isinstance(a, str)]

    if template_nome in _NO_TEXT_TEMPLATES:
        return ""

    if template_nome in ("GapFillGovernanceEngine", "FillBlankEngine", "SpokenGapFillEngine"):
        return _fill_gap(prompt or "", accepted[0] if accepted else "")

    if template_nome == "WordBankGuessEngine":
        data = _safe_json(prompt)
        if not data:
            return prompt or ""
        sentence = _fill_gap(data.get("prompt_gapped", ""), accepted[0] if accepted else "")
        return sentence + " " + " ".join(data.get("word_bank", []))

    if template_nome in ("UnscrambleEngine", "ParagraphOrderEngine"):
        return accepted[0] if accepted else (prompt or "")

    if template_nome in ("StructuralTransformEngine", "RegisterReformulationEngine"):
        return f"{prompt or ''} {accepted[0] if accepted else ''}"

    if template_nome in ("DictationEngine", "ShadowingEngine", "ReadAloudEngine"):
        return accepted[0] if accepted else (prompt or "")

    if template_nome == "VideoTaskEngine":
        base = accepted[0] if accepted else ""
        data = _safe_json(prompt)
        extra = " ".join(str(v) for v in data.values() if isinstance(v, str)) if data else (prompt or "")
        return f"{base} {extra}".strip()

    if template_nome == "LetterAnagramEngine":
        data = _safe_json(prompt)
        if data and data.get("frase_contexto"):
            return data["frase_contexto"]
        return accepted[0] if accepted else (prompt or "")

    if template_nome == "MatchingEngine":
        data = _safe_json(prompt)
        if not data:
            return prompt or ""
        return " ".join(data.get("termos", [])) + " " + " ".join(data.get("definicoes", []))

    if template_nome in ("TransitionPhraseEngine", "ReactionPhraseEngine"):
        return " ".join(accepted)

    if template_nome == "BinaryChoiceEngine":
        data = _safe_json(prompt)
        if not data:
            return prompt or ""
        sentence = _fill_gap(data.get("trecho_gapped", ""), accepted[0] if accepted else "")
        return sentence + " " + " ".join(data.get("opcoes", []))

    if template_nome == "PredictThenVerifyEngine":
        data = _safe_json(prompt)
        if not data:
            return f"{prompt or ''} {' '.join(accepted)}"
        return data.get("trecho_inicial", "") + " " + " ".join(data.get("opcoes", []))

    if template_nome == "ComprehensionQAEngine":
        return f"{prompt or ''} {' '.join(accepted)}"

    if template_nome == "TrueFalseEngine":
        # accepted_answers = ["true"/"false"] -- nao e' texto alemao, so' o
        # prompt (a afirmacao em si) importa aqui.
        return prompt or ""

    if template_nome == "PunctuationCapsEngine":
        # accepted_answers[0] tem a forma com maiuscula/pontuacao corretas --
        # melhor fonte que o prompt (mesmo conteudo, so em minusculo).
        return accepted[0] if accepted else (prompt or "")

    if template_nome == "CompoundSegmentationEngine":
        return prompt or ""  # a palavra composta inteira

    if template_nome == "VowelInsertEngine":
        # prompt tem o esqueleto de vogal embutido (ex. "_f_n") sem
        # delimitador unico pra substituicao segura -- inclui como esta (o
        # token corrompido so' nao bate com nenhum lemma real, inofensivo) e
        # complementa com a palavra certa via accepted_answers.
        return f"{prompt or ''} {' '.join(accepted)}"

    # fallback conservador pra template nao mapeado: so accepted_answers,
    # nunca o prompt cru (podia ser JSON ou nao-alemao nao previsto aqui).
    return " ".join(accepted)


def lemmatize_content_words(nlp, text: str) -> set[tuple[str, str]]:
    if not text or not text.strip():
        return set()
    doc = nlp(text)
    out = set()
    for tok in doc:
        if not tok.is_alpha or len(tok.text) < 2:
            continue
        pos_label = POS_MAP.get(tok.pos_)
        if not pos_label:
            continue
        out.add((tok.lemma_, pos_label))
    return out


def link_new_exercises(template_filter: list[str] | None = None) -> tuple[int, int]:
    """Processa exercicios sem nenhuma linha em exercise_lexicon_refs ainda.
    Retorna (exercicios_processados, exercicios_com_pelo_menos_1_ref)."""
    nlp = _load_spacy()

    where_template = ""
    if template_filter:
        names = ",".join(sql_str(t) for t in template_filter)
        where_template = f"AND et.nome IN ({names})"

    rows = query_d1(f"""
        SELECT e.id, et.nome as template_nome, e.prompt, e.accepted_answers
        FROM exercises e
        JOIN exercise_templates et ON e.exercise_template_id = et.id
        WHERE e.id NOT IN (SELECT DISTINCT exercise_id FROM exercise_lexicon_refs)
        {where_template}
    """)
    if not rows:
        return 0, 0

    existing = query_d1("SELECT id, lemma, pos FROM lexicon")
    lemma_to_id = {(r["lemma"], r["pos"]): r["id"] for r in existing}

    per_exercise_pairs: dict[int, set[tuple[str, str]]] = {}
    needed_pairs: set[tuple[str, str]] = set()

    for row in rows:
        text = build_exercise_text(row["template_nome"], row["prompt"], row["accepted_answers"])
        pairs = lemmatize_content_words(nlp, text)
        per_exercise_pairs[row["id"]] = pairs
        for p in pairs:
            if p not in lemma_to_id:
                needed_pairs.add(p)

    if needed_pairs:
        insert_stmts = [
            f"INSERT INTO lexicon (lemma, pos, source) VALUES ({sql_str(lemma)}, {sql_str(pos)}, 'exercise_derived');"
            for lemma, pos in sorted(needed_pairs)
        ]
        execute_d1("\n".join(insert_stmts))
        refreshed = query_d1("SELECT id, lemma, pos FROM lexicon")
        lemma_to_id = {(r["lemma"], r["pos"]): r["id"] for r in refreshed}

    ref_stmts = []
    exercises_with_refs = 0
    for exercise_id, pairs in per_exercise_pairs.items():
        lexicon_ids = {lemma_to_id[p] for p in pairs if p in lemma_to_id}
        if lexicon_ids:
            exercises_with_refs += 1
        for lexicon_id in lexicon_ids:
            ref_stmts.append(
                f"INSERT INTO exercise_lexicon_refs (exercise_id, lexicon_id) VALUES ({exercise_id}, {lexicon_id});"
            )

    if ref_stmts:
        # lote grande -- fatia pra nao estourar limite de statement do D1
        # local (mesmo padrao ja usado em write_exercises.py pra lotes grandes).
        CHUNK = 200
        for i in range(0, len(ref_stmts), CHUNK):
            execute_d1("\n".join(ref_stmts[i:i + CHUNK]))

    return len(rows), exercises_with_refs


def main():
    processed, with_refs = link_new_exercises()
    print(f"{processed} exercicios processados, {with_refs} ganharam pelo menos 1 exercise_lexicon_refs.")


if __name__ == "__main__":
    main()
