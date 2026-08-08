"""Fase 7 (CLAUDE.md) -- pipeline de geracao em lote pro DictationEngine
(docs/05 item 28, variante TTS): gera a frase-fonte via LLM (mesmo harness de
5 gates de sempre), sintetiza audio via Piper (tts/synthesize.py), sobe pro
R2 (tts/upload_r2.py), grava em `exercises` com phonetic_point_id (nao
content_topic_id) e audio_ref/source_type='tts'.

Generaliza generate_batch.py: mesmo generation/pilot.py generate_for_topic,
mesmo harness (validation/harness.py), mesmo checkpoint-por-topico -- so o
carregamento de "topico" (via phonetic_points em vez de content_topics,
generation/prompts_dictation.py phonetic_point_to_topic) e o passo extra de
audio antes de gravar no D1 sao diferentes. Nao reusa generate_batch.py
diretamente porque a chave de FK e' outra (phonetic_point_id) e o fluxo tem
um passo a mais (TTS+upload) que nao existe pros templates de texto puro.

Uso:
    python -m deutsch_pipeline.generation.generate_dictation_batch --model hf:deepseek-ai/DeepSeek-V3 --n-per-point 5
    python -m deutsch_pipeline.generation.generate_dictation_batch --model hf:deepseek-ai/DeepSeek-V3 --point-ids 1,2,3 --n-per-point 5
"""
import argparse
import json
import time
import unicodedata
from pathlib import Path

from ..ingest.write_exercises import build_insert, execute_d1, query_d1
from ..tts.synthesize import DEFAULT_VOICE, synthesize_to_file
from ..tts.upload_r2 import upload_audio
from ..validation.harness import validate_batch
from .pilot import generate_for_topic
from .prompts_dictation import (
    SYSTEM_PROMPT,
    TEMPLATE_NAME,
    PhoneticPoint,
    build_exercise_fields_dictation,
    build_user_prompt,
    phonetic_point_to_topic,
)

REPO_ROOT = Path(__file__).resolve().parents[4]
OUTPUT_DIR = REPO_ROOT / "pipeline" / "output" / "batch"
AUDIO_TMP_DIR = REPO_ROOT / "pipeline" / "output" / "audio_tmp"


def load_phonetic_points(point_ids: list[int] | None = None) -> list[PhoneticPoint]:
    where_extra = ""
    if point_ids:
        where_extra = f" AND pp.id IN ({','.join(str(i) for i in point_ids)})"
    sql = (
        "SELECT pp.id, pp.categoria, pp.topico, pp.prioridade, pp.descricao, pp.exemplo, pp.fonte "
        "FROM topic_template_map ttm "
        "JOIN phonetic_points pp ON ttm.phonetic_point_id = pp.id "
        "JOIN exercise_templates et ON ttm.exercise_template_id = et.id "
        f"WHERE et.nome = 'DictationEngine'{where_extra} ORDER BY pp.id;"
    )
    rows = query_d1(sql)
    return [
        PhoneticPoint(
            id=r["id"], categoria=r["categoria"], topico=r["topico"], prioridade=r["prioridade"],
            descricao=r["descricao"], exemplo=r["exemplo"], fonte=r["fonte"],
        )
        for r in rows
    ]


def safe_slug(text: str) -> str:
    # Fase 12 -- achado da Fase 9: `c.isalnum()` sozinho mantem letra
    # acentuada (e' unicode-alfanumerica em Python), o que gerava chave de
    # objeto R2 nao-ASCII e corrompia silenciosamente a leitura via
    # `env.MEDIA.get()` do Worker (upload reportava sucesso, objeto nunca
    # ficava recuperavel -- CLAUDE.md, Fase 9). NFKD decompoe acento em
    # base+diacritico combinante; o encode/decode ascii com errors="ignore"
    # descarta o diacritico, mantendo so a letra base (a-vs-ã). Corrigido
    # so nos dados ja gerados antes -- este fix e' pro GERADOR, pra lotes
    # futuros ja nascerem ASCII-safe.
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return "".join(c if c.isalnum() else "-" for c in ascii_text.lower()).strip("-")[:60]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", required=True)
    parser.add_argument("--voice", default=DEFAULT_VOICE)
    parser.add_argument("--n-per-point", type=int, default=5)
    parser.add_argument("--point-ids", type=str, default=None, help="ex.: 1,2,3 -- vazio = todos")
    args = parser.parse_args()

    point_ids = [int(x) for x in args.point_ids.split(",")] if args.point_ids else None
    points = load_phonetic_points(point_ids)
    print(f"[DictationEngine] {len(points)} pontos foneticos a gerar: {[p.id for p in points]}")

    templates_cache = {row["nome"]: row["id"] for row in query_d1("SELECT id, nome FROM exercise_templates;")}
    exercise_template_id = templates_cache["DictationEngine"]

    AUDIO_TMP_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    safe_model_name = args.model.replace(":", "_").replace("/", "_")
    lt_path = OUTPUT_DIR / f"DictationEngine_{safe_model_name}_{int(time.time())}.lt.json"

    all_exercises = []
    for pp in points:
        topic = phonetic_point_to_topic(pp)
        print(f"[{pp.id}] Gerando {args.n_per_point} frases para '{pp.topico}'...")
        t0 = time.time()
        exercises = generate_for_topic(
            args.model, topic, args.n_per_point,
            system_prompt=SYSTEM_PROMPT, template_name=TEMPLATE_NAME,
            user_prompt_builder=build_user_prompt, exercise_field_builder=build_exercise_fields_dictation,
        )
        print(f"  -> {len(exercises)} itens em {time.time() - t0:.1f}s -- validando...")
        validate_batch(exercises)

        statements, ok_count, skipped = [], 0, 0
        for i, ex in enumerate(exercises, start=1):
            if not ex.get("prompt"):
                # estrutural (frase vazia/curta demais) -- nem tenta sintetizar
                skipped += 1
                continue
            audio_ref = None
            if ex["validation_status"] == "auto_ok":
                slug = safe_slug(pp.topico)
                audio_path = AUDIO_TMP_DIR / f"dictation_{pp.id}_{i}_{slug}.wav"
                synthesize_to_file(ex["sentence_full"], audio_path, voice_name=args.voice)
                object_key = f"dictation/{pp.id}_{i}_{slug}.wav"
                upload_audio(audio_path, object_key)
                audio_ref = object_key
                ok_count += 1
            # itens flagged tambem entram no D1 (sem audio) -- ficam na fila
            # de revisao humana (validation/export_review_queue.py), mesmo
            # padrao ja usado pelos outros templates do Grupo A: nunca
            # descarta silenciosamente, so pula o que nem tem prompt usavel.
            statements.append(
                build_insert(
                    ex, content_topic_id=None, exercise_template_id=exercise_template_id,
                    phonetic_point_id=pp.id, audio_ref=audio_ref, source_type="tts" if audio_ref else None,
                )
            )
        if statements:
            execute_d1("\n".join(statements))
        print(f"  -> {ok_count}/{len(exercises)} auto_ok (audio gravado), "
              f"{len(statements) - ok_count} flagged sem audio, {skipped} pulados, gravados no D1")

        all_exercises.extend(exercises)
        lt_path.write_text(json.dumps(all_exercises, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\nCheckpoint final salvo em {lt_path}")

    by_reason: dict[str, int] = {}
    for ex in all_exercises:
        by_reason[ex["flag_reason"]] = by_reason.get(ex["flag_reason"], 0) + 1
    print("\n=== Resumo ===")
    for reason, count in sorted(by_reason.items()):
        print(f"  {reason}: {count}")


if __name__ == "__main__":
    main()
