"""Fase 5 (CLAUDE.md, docs/06) -- gera exercícios (das 10 engines novas)
ancorados num `reading_block` já gravado (generate_reading_block.py) e liga
via `reading_block_items` (ordem obrigatória).

Diferente de generate_batch.py: não há gap_answer nem LanguageTool aqui --
os itens são DERIVADOS de um texto já validado, então o risco não é
gramática, é FUNDAMENTAÇÃO (o item reflete o texto de verdade, ou o LLM
inventou?). Cada prompts_<engine>.py tem seu próprio gate mecânico de
fundamentação (checar se termo/trecho/resposta aparece literalmente no
texto-base) -- ver os módulos individuais. Dois engines (ParagraphOrder,
LetterAnagram) nem chamam o LLM -- são derivação mecânica pura do texto já
aprovado, risco zero por construção.

Uso:
    python -m deutsch_pipeline.generation.generate_reading_block_items \\
        --reading-block-id 1 --engine MatchingEngine --model hf:deepseek-ai/DeepSeek-V3 --n-items 8
    python -m deutsch_pipeline.generation.generate_reading_block_items \\
        --reading-block-id 1 --engine ParagraphOrderEngine --n-items 1
"""
import argparse
import json
import re

from . import llm_client
from . import (
    prompts_binarychoice,
    prompts_compoundsegmentation,
    prompts_comprehensionqa,
    prompts_letteranagram,
    prompts_matching,
    prompts_paragraphorder,
    prompts_predictverify,
    prompts_punctuationcaps,
    prompts_truefalse,
    prompts_vowelinsert,
)
from ..ingest.write_exercises import build_insert, execute_d1, query_d1

JSON_ARRAY_RE = re.compile(r"\[.*\]", re.DOTALL)

DB_STATUS = {
    "auto_ok": "auto_ok",
    "structural_mismatch": "flagged",
    "lt_flagged": "flagged",
}

# Engines com 1 chamada de LLM -> N itens (via builder por item), fundamentados no texto_base
MULTI_ITEM_ENGINES = {
    "TrueFalseEngine": (prompts_truefalse, prompts_truefalse.build_exercise_fields_truefalse),
    "ComprehensionQAEngine": (prompts_comprehensionqa, prompts_comprehensionqa.build_exercise_fields_comprehensionqa),
    "BinaryChoiceEngine": (prompts_binarychoice, prompts_binarychoice.build_exercise_fields_binarychoice),
    "PredictThenVerifyEngine": (prompts_predictverify, prompts_predictverify.build_exercise_fields_predictverify),
}
# Engines com 1 chamada de LLM -> 1 item so (banco de pares inteiro)
SINGLE_ITEM_ENGINES = {
    "MatchingEngine": (prompts_matching, prompts_matching.build_exercise_fields_matching),
}
# Engines sem LLM -- derivacao mecanica do texto ja aprovado
MECHANICAL_SINGLE_ENGINES = {"ParagraphOrderEngine", "PunctuationCapsEngine"}
MECHANICAL_MULTI_ENGINES = {"LetterAnagramEngine"}
# Engines com 1 chamada de LLM -> N itens, mas NAO fundamentados no texto_base
# do bloco -- puxam de phonetic_points/content_topics (anexados ao bloco so
# por coesao de sessao, docs/06).
KB_SOURCED_ENGINES = {"VowelInsertEngine", "CompoundSegmentationEngine"}

ALL_ENGINES = (
    set(MULTI_ITEM_ENGINES) | set(SINGLE_ITEM_ENGINES) | MECHANICAL_SINGLE_ENGINES
    | MECHANICAL_MULTI_ENGINES | KB_SOURCED_ENGINES
)


def extract_json_array(raw: str) -> list[dict]:
    raw = raw.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    match = JSON_ARRAY_RE.search(raw)
    if not match:
        raise ValueError(f"Nenhum array JSON encontrado na resposta:\n{raw[:500]}")
    return json.loads(match.group(0))


def load_reading_block(block_id: int) -> dict:
    rows = query_d1(f"SELECT id, titulo, texto_base FROM reading_blocks WHERE id = {block_id};")
    if not rows:
        raise ValueError(f"reading_block {block_id} nao encontrado")
    return rows[0]


def next_ordem(block_id: int) -> int:
    rows = query_d1(f"SELECT COALESCE(MAX(ordem), 0) as m FROM reading_block_items WHERE reading_block_id = {block_id};")
    return rows[0]["m"] + 1


def write_item(fields: dict, model: str, exercise_template_id: int, block_id: int, ordem: int) -> int:
    ex = {
        "prompt": fields["prompt"], "accepted_answers": fields["accepted_answers"],
        "generated_by": model, "flag_reason": fields["flag_reason"],
        "flag_detail": fields["flag_detail"],
        "validation_status": DB_STATUS[fields["flag_reason"]],
    }
    stmt = build_insert(ex, content_topic_id=None, exercise_template_id=exercise_template_id)
    execute_d1(stmt)
    exercise_id = query_d1("SELECT id FROM exercises ORDER BY id DESC LIMIT 1;")[0]["id"]
    execute_d1(
        f"INSERT INTO reading_block_items (reading_block_id, exercise_id, ordem) "
        f"VALUES ({block_id}, {exercise_id}, {ordem});"
    )
    return exercise_id


def generate_one_engine_for_block(
    block_id: int, engine: str, model: str | None = None, n_items: int = 6,
    phonetic_point_id: int | None = None, content_topic_id: int | None = None,
) -> dict:
    block = load_reading_block(block_id)
    templates_cache = {row["nome"]: row["id"] for row in query_d1("SELECT id, nome FROM exercise_templates;")}
    exercise_template_id = templates_cache[engine]
    ordem = next_ordem(block_id)
    written, by_reason = 0, {}
    model_label = model or "mechanical"

    if engine == "ParagraphOrderEngine":
        fields = prompts_paragraphorder.build_exercise_fields_paragraphorder(block["texto_base"])
        by_reason[fields["flag_reason"]] = by_reason.get(fields["flag_reason"], 0) + 1
        if fields["prompt"]:
            write_item(fields, model_label, exercise_template_id, block_id, ordem)
            written += 1

    elif engine == "PunctuationCapsEngine":
        fields = prompts_punctuationcaps.build_exercise_fields_punctuationcaps(block["texto_base"])
        by_reason[fields["flag_reason"]] = by_reason.get(fields["flag_reason"], 0) + 1
        if fields["prompt"]:
            write_item(fields, model_label, exercise_template_id, block_id, ordem)
            written += 1

    elif engine in MECHANICAL_MULTI_ENGINES:
        items = prompts_letteranagram.build_exercises_letteranagram(block["texto_base"], n_items)
        for fields in items:
            by_reason[fields["flag_reason"]] = by_reason.get(fields["flag_reason"], 0) + 1
            write_item(fields, model_label, exercise_template_id, block_id, ordem)
            ordem += 1
            written += 1

    elif engine == "VowelInsertEngine":
        if not model or not phonetic_point_id:
            raise ValueError("model e phonetic_point_id sao obrigatorios pro VowelInsertEngine")
        pp = query_d1(f"SELECT topico, descricao, exemplo FROM phonetic_points WHERE id = {phonetic_point_id};")[0]
        user_prompt = prompts_vowelinsert.build_user_prompt(pp["topico"], pp["descricao"], pp["exemplo"], n_items)
        raw = llm_client.chat(model, prompts_vowelinsert.SYSTEM_PROMPT, user_prompt, temperature=0.7)
        raw_pairs = extract_json_array(raw)
        for raw_pair in raw_pairs:
            for fields in prompts_vowelinsert.build_exercise_fields_vowelinsert_pair(raw_pair):
                by_reason[fields["flag_reason"]] = by_reason.get(fields["flag_reason"], 0) + 1
                if not fields["prompt"]:
                    continue
                write_item(fields, model, exercise_template_id, block_id, ordem)
                ordem += 1
                written += 1

    elif engine == "CompoundSegmentationEngine":
        if not model or not content_topic_id:
            raise ValueError("model e content_topic_id sao obrigatorios pro CompoundSegmentationEngine")
        ct = query_d1(f"SELECT regra, exemplo FROM content_topics WHERE id = {content_topic_id};")[0]
        user_prompt = prompts_compoundsegmentation.build_user_prompt(ct["regra"], ct["exemplo"], n_items)
        raw = llm_client.chat(model, prompts_compoundsegmentation.SYSTEM_PROMPT, user_prompt, temperature=0.7)
        raw_items = extract_json_array(raw)
        for raw_item in raw_items:
            fields = prompts_compoundsegmentation.build_exercise_fields_compoundsegmentation(raw_item)
            by_reason[fields["flag_reason"]] = by_reason.get(fields["flag_reason"], 0) + 1
            if not fields["prompt"]:
                continue
            write_item(fields, model, exercise_template_id, block_id, ordem)
            ordem += 1
            written += 1

    else:
        if not model:
            raise ValueError(f"model e' obrigatorio pro engine {engine}")
        if engine in SINGLE_ITEM_ENGINES:
            prompts_module, builder = SINGLE_ITEM_ENGINES[engine]
        else:
            prompts_module, builder = MULTI_ITEM_ENGINES[engine]

        user_prompt = prompts_module.build_user_prompt(block["texto_base"], n_items)
        raw = llm_client.chat(model, prompts_module.SYSTEM_PROMPT, user_prompt, temperature=0.6)
        raw_items = extract_json_array(raw)

        if engine in SINGLE_ITEM_ENGINES:
            fields = builder(raw_items, block["texto_base"])
            by_reason[fields["flag_reason"]] = by_reason.get(fields["flag_reason"], 0) + 1
            if fields["prompt"]:
                write_item(fields, model, exercise_template_id, block_id, ordem)
                written += 1
        else:
            for raw_item in raw_items:
                fields = builder(raw_item, block["texto_base"])
                by_reason[fields["flag_reason"]] = by_reason.get(fields["flag_reason"], 0) + 1
                if not fields["prompt"]:
                    continue
                write_item(fields, model, exercise_template_id, block_id, ordem)
                ordem += 1
                written += 1

    return {"written": written, "by_reason": by_reason}


# Fase 15 -- batch diario (generation/daily_reading_batch.py) roda os 10
# engines numa chamada so, sem curadoria humana escolhendo phonetic_point_id/
# content_topic_id caso a caso (docs/06 original previa isso manual). Pra
# VowelInsertEngine, o CHAMADOR passa o ponto fonetico (ver daily_reading_batch.py,
# rotaciona pelos 26 pontos por id do bloco -- sem estado extra); pra
# CompoundSegmentationEngine, sempre o topico 92 ("Komposita"), unico mapeado
# a esse engine desde a Fase 5, entao nao ha escolha de verdade a fazer.
ALL_ENGINES_N_ITEMS = {
    "MatchingEngine": 8, "TrueFalseEngine": 6, "ComprehensionQAEngine": 6,
    "PredictThenVerifyEngine": 3, "LetterAnagramEngine": 6, "ParagraphOrderEngine": 1,
    "BinaryChoiceEngine": 6, "VowelInsertEngine": 3, "PunctuationCapsEngine": 1,
    "CompoundSegmentationEngine": 4,
}
COMPOUND_SEGMENTATION_CONTENT_TOPIC_ID = 92  # "Komposita (Nomen-Nomen, Adjektiv-Nomen etc.)"


def generate_all_items_for_block(block_id: int, model: str) -> dict:
    phonetic_point_id = 1 + (block_id % 26)  # rotaciona pelos 26 pontos fonéticos, sem estado extra
    results = {}
    for engine, n_items in ALL_ENGINES_N_ITEMS.items():
        results[engine] = generate_one_engine_for_block(
            block_id, engine, model=model, n_items=n_items,
            phonetic_point_id=phonetic_point_id if engine == "VowelInsertEngine" else None,
            content_topic_id=COMPOUND_SEGMENTATION_CONTENT_TOPIC_ID if engine == "CompoundSegmentationEngine" else None,
        )
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reading-block-id", type=int, required=True)
    parser.add_argument("--engine", required=True, choices=sorted(ALL_ENGINES))
    parser.add_argument("--model", default=None, help="nao usado pelos engines mecanicos (ParagraphOrder/LetterAnagram/PunctuationCaps)")
    parser.add_argument("--n-items", type=int, default=6)
    parser.add_argument("--phonetic-point-id", type=int, default=None, help="obrigatorio pro VowelInsertEngine")
    parser.add_argument("--content-topic-id", type=int, default=None, help="obrigatorio pro CompoundSegmentationEngine")
    args = parser.parse_args()

    block = load_reading_block(args.reading_block_id)
    print(f"[{args.engine}] gerando pro bloco {args.reading_block_id} ('{block['titulo']}')")
    result = generate_one_engine_for_block(
        args.reading_block_id, args.engine, model=args.model, n_items=args.n_items,
        phonetic_point_id=args.phonetic_point_id, content_topic_id=args.content_topic_id,
    )
    print(f"  -> {result['written']} itens gravados em exercises + reading_block_items -- {result['by_reason']}")


if __name__ == "__main__":
    main()
