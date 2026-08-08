"""Fase 4 (CLAUDE.md) -- pipeline de geracao em lote pro Grupo A.

Generaliza generation/pilot.py (que so cobria os 4 topicos hardcoded do piloto
da Fase 0) pra qualquer topico mapeado a um exercise_template via
topic_template_map (curadoria da Fase 2) -- consulta o D1, nao uma lista fixa.
--engine seleciona qual template gerar (ENGINE_PROMPTS abaixo); cada um so
precisa de um modulo de prompt (system_prompt/template_name/build_user_prompt)
seguindo o mesmo contrato (sentence_full + gap_answer + accepted_answers) --
generation/pilot.py generate_for_topic, o harness (validation/harness.py) e
o resto deste script sao 100% reutilizados, nao mudam por engine (docs/05
item 17 e' explicito sobre isso pro FillBlankEngine: "pode reusar a mesma
engine de GapFillGovernanceEngine, diferindo so na fonte da regra").

Roda os 4 gates do harness e grava direto em `exercises` no D1 -- mesmo fluxo
ponta a ponta demonstrado na Fase 3, agora parametrizado por topico/engine em
vez de rodar so contra o piloto.

Resiliente a infra de provedor instavel (achado rodando contra Public AI/
EuroLLM-22B, GPU doada sem SLA): (1) --items-per-call fatia n-per-topic em
chamadas menores -- completion grande e' mais propenso a estourar timeout de
gateway sob carga; (2) checkpoint por topico -- grava no D1 e no arquivo
incremental apos CADA topico, nao so no fim do lote inteiro, entao uma falha
no topico N nao derruba o trabalho ja feito nos topicos 1..N-1.

Uso:
    python -m deutsch_pipeline.generation.generate_batch --engine GapFillGovernanceEngine --model mistral-small:22b-instruct-2409-q3_K_M --topic-ids 21,32,78 --n-per-topic 5
    python -m deutsch_pipeline.generation.generate_batch --engine FillBlankEngine --model gemini-2.5-flash --topic-ids 36,41,47
    (sem --topic-ids, roda em TODOS os topicos mapeados ao --engine escolhido)
"""
import argparse
import json
import time
from pathlib import Path

from ..ingest.write_exercises import build_insert, execute_d1, query_d1
from ..validation.harness import validate_batch
from . import prompts as gapfill_prompts
from . import prompts_fillblank as fillblank_prompts
from . import prompts_registerreformulation
from . import prompts_structuraltransform
from . import prompts_unscramble
from . import prompts_wordbankguess
from .model_routing import resolve_model
from .pilot import build_exercise_fields_gapfill, generate_for_topic
from .topics import Topic

REPO_ROOT = Path(__file__).resolve().parents[4]
OUTPUT_DIR = REPO_ROOT / "pipeline" / "output" / "batch"

# Registro dos templates do Grupo A com geracao propria -- adicionar aqui
# conforme os outros templates ganharem seu prompts_<nome>.py (docs/05).
ENGINE_PROMPTS = {
    "GapFillGovernanceEngine": gapfill_prompts,
    "FillBlankEngine": fillblank_prompts,
    "UnscrambleEngine": prompts_unscramble,
    "StructuralTransformEngine": prompts_structuraltransform,
    "RegisterReformulationEngine": prompts_registerreformulation,
    "WordBankGuessEngine": prompts_wordbankguess,
}
TEMPLATE_NAME_TO_ENGINE = {mod.TEMPLATE_NAME: name for name, mod in ENGINE_PROMPTS.items()}

# Templates cujo prompts_<nome>.py nao segue o contrato de lacuna
# (sentence_full + gap_answer) -- exportam seu proprio
# build_exercise_fields_<nome> e entram aqui pra generate_for_topic_chunked
# usar no lugar do default (pilot.build_exercise_fields_gapfill).
EXERCISE_FIELD_BUILDERS = {
    "UnscrambleEngine": prompts_unscramble.build_exercise_fields_unscramble,
    "StructuralTransformEngine": prompts_structuraltransform.build_exercise_fields_structuraltransform,
    "RegisterReformulationEngine": prompts_registerreformulation.build_exercise_fields_structuraltransform,
    "WordBankGuessEngine": prompts_wordbankguess.build_exercise_fields_wordbankguess,
}


def load_topics(engine_name: str, topic_ids: list[int] | None = None) -> list[Topic]:
    where_extra = ""
    if topic_ids:
        where_extra = f" AND ct.id IN ({','.join(str(i) for i in topic_ids)})"
    sql = (
        "SELECT ct.id, ct.categoria, ct.topico, ct.nivel, ct.regra, ct.exemplo, ct.fonte "
        "FROM topic_template_map ttm "
        "JOIN content_topics ct ON ttm.content_topic_id = ct.id "
        "JOIN exercise_templates et ON ttm.exercise_template_id = et.id "
        f"WHERE et.nome = '{engine_name}'{where_extra} ORDER BY ct.id;"
    )
    rows = query_d1(sql)
    return [
        Topic(
            id=r["id"], categoria=r["categoria"], topico=r["topico"], nivel=r["nivel"],
            regra=r["regra"], exemplo=r["exemplo"], fonte=r["fonte"],
        )
        for r in rows
    ]


def already_generated_topic_ids(model: str) -> set[str]:
    rows = query_d1(
        "SELECT DISTINCT ct.topico FROM exercises e "
        "JOIN content_topics ct ON e.content_topic_id = ct.id "
        f"WHERE e.generated_by = '{model}';"
    )
    return {r["topico"] for r in rows}


def generate_for_topic_chunked(
    model: str, topic: Topic, n_total: int, items_per_call: int, prompts_module,
    exercise_field_builder=build_exercise_fields_gapfill,
) -> list[dict]:
    """Fatia n_total em chamadas de ate items_per_call -- completion menor,
    mais chamadas. Renumera variation pra nao colidir entre fatias."""
    exercises = []
    remaining = n_total
    while remaining > 0:
        chunk_n = min(items_per_call, remaining)
        chunk = generate_for_topic(
            model, topic, chunk_n,
            system_prompt=prompts_module.SYSTEM_PROMPT,
            template_name=prompts_module.TEMPLATE_NAME,
            user_prompt_builder=prompts_module.build_user_prompt,
            exercise_field_builder=exercise_field_builder,
        )
        offset = len(exercises)
        for i, ex in enumerate(chunk, start=1):
            ex["variation"] = offset + i
        exercises.extend(chunk)
        remaining -= chunk_n
    return exercises


def write_to_d1(exercises: list[dict], topics_cache: dict, templates_cache: dict) -> tuple[int, int]:
    statements, skipped = [], 0
    for ex in exercises:
        if not ex.get("prompt"):
            skipped += 1
            continue
        engine_name = TEMPLATE_NAME_TO_ENGINE.get(ex.get("template"))
        content_topic_id = topics_cache.get(ex.get("topic"))
        exercise_template_id = templates_cache.get(engine_name)
        if content_topic_id is None or exercise_template_id is None:
            skipped += 1
            continue
        statements.append(build_insert(ex, content_topic_id, exercise_template_id))
    if statements:
        execute_d1("\n".join(statements))
    return len(statements), skipped


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--engine", required=True, choices=sorted(ENGINE_PROMPTS.keys()))
    parser.add_argument("--model", required=True)
    parser.add_argument("--n-per-topic", type=int, default=5)
    parser.add_argument("--items-per-call", type=int, default=5, help="fatia n-per-topic em chamadas menores (default: sem fatiar)")
    parser.add_argument("--topic-ids", type=str, default=None, help="ex.: 21,32,78 -- vazio = todos")
    parser.add_argument("--skip-existing", action="store_true", help="pula topicos que ja tem exercicio desse model no D1")
    args = parser.parse_args()

    prompts_module = ENGINE_PROMPTS[args.engine]
    exercise_field_builder = EXERCISE_FIELD_BUILDERS.get(args.engine, build_exercise_fields_gapfill)
    topic_ids = [int(x) for x in args.topic_ids.split(",")] if args.topic_ids else None
    topics = load_topics(args.engine, topic_ids)
    if args.skip_existing:
        done = already_generated_topic_ids(args.model)
        topics = [t for t in topics if t.topico not in done]

    print(f"[{args.engine}] {len(topics)} topicos a gerar: {[t.id for t in topics]}")

    topics_cache = {row["topico"]: row["id"] for row in query_d1("SELECT id, topico FROM content_topics;")}
    templates_cache = {row["nome"]: row["id"] for row in query_d1("SELECT id, nome FROM exercise_templates;")}

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    safe_model_name = args.model.replace(':', '_').replace('/', '_')
    lt_path = OUTPUT_DIR / f"{args.engine}_{safe_model_name}_{int(time.time())}.lt.json"

    all_exercises = []
    for topic in topics:
        model_for_topic = resolve_model(topic, args.model)
        if model_for_topic != args.model:
            print(f"[{topic.id}] '{topic.topico}' e' um padrao historicamente fraco -- "
                  f"forcando {model_for_topic} em vez de {args.model}")
        print(f"[{topic.id}] Gerando {args.n_per_topic} itens para '{topic.topico}' (em blocos de {args.items_per_call})...")
        t0 = time.time()
        exercises = generate_for_topic_chunked(
            model_for_topic, topic, args.n_per_topic, args.items_per_call, prompts_module,
            exercise_field_builder=exercise_field_builder,
        )
        print(f"  -> {len(exercises)} itens em {time.time() - t0:.1f}s -- validando e gravando...")

        validate_batch(exercises)
        inserted, skipped = write_to_d1(exercises, topics_cache, templates_cache)
        # validation_status (nao flag_reason) pra contar repaired_alternate junto
        # com auto_ok -- os dois sao "auto_ok" pro D1 (validation/harness.py DB_STATUS).
        ok = sum(1 for e in exercises if e["validation_status"] == "auto_ok")
        print(f"  -> {ok}/{len(exercises)} auto_ok, {inserted} gravados no D1 ({skipped} pulados)")

        all_exercises.extend(exercises)
        lt_path.write_text(json.dumps(all_exercises, ensure_ascii=False, indent=2), encoding="utf-8")  # checkpoint

    print(f"\nCheckpoint final salvo em {lt_path}")

    by_reason: dict[str, int] = {}
    for ex in all_exercises:
        by_reason[ex["flag_reason"]] = by_reason.get(ex["flag_reason"], 0) + 1
    print("\n=== Resumo ===")
    for reason, count in sorted(by_reason.items()):
        print(f"  {reason}: {count}")

    print("\n=== Por topico ===")
    by_topic: dict[str, dict[str, int]] = {}
    for ex in all_exercises:
        by_topic.setdefault(ex["topic"], {}).setdefault(ex["flag_reason"], 0)
        by_topic[ex["topic"]][ex["flag_reason"]] += 1
    for topic, counts in by_topic.items():
        total = sum(counts.values())
        ok = counts.get("auto_ok", 0)
        print(f"  {topic[:60]:60s} {ok}/{total} auto_ok  {counts}")


if __name__ == "__main__":
    main()
