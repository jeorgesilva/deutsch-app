"""4d(a) (docs/19, decisão do usuário 14/11/2026): escala ReadAloudEngine e
SpokenGapFillEngine, que tinham 1 item-piloto cada, reaproveitando frases que
o app já serve -- sem LLM novo e sem regra nova:

- ReadAloud <- frases do DictationEngine ligadas a um ponto fonético
  (`phonetic_point_id`, geradas por `generation/prompts_dictation.py`). A
  mesma frase fica nos dois templates (decisão 1a).
- SpokenGapFill <- itens do GapFillGovernanceEngine (o que a spec do item 115
  pede), só fora dos tópicos que exigem revisão humana -- Dativo fixo e
  Funktionsverbgefüge, pelo mesmo `model_routing.is_weak_topic` (decisão 2a).

Os `phonetics/create_*_exercise.py` continuam servindo pra item avulso pela
CLI; aqui não são chamados porque (1) a chave R2 deles é só o slug da frase
cortado em 40 caracteres -- em lote, duas frases com o mesmo começo
sobrescrevem o mesmo áudio -- e (2) não gravam `phonetic_point_id`. A chave
daqui leva o id do exercício de origem.

Idempotente: frase que já existe no template de destino (mesmo `prompt`) é
pulada, então rodar de novo depois de uma falha só completa o que faltou. O
áudio sobe antes do INSERT; uma falha no meio deixa no máximo .wav órfão no
R2, que a rodada seguinte sobrescreve com a mesma chave.

Fica fora de `pipeline/src/` pelo mesmo motivo do `ingest_videos_local.py`:
mudança ali dispara o redeploy dos dois containers.

Uso, a partir da raiz do repo:
    PYTHONPATH=pipeline/src .venv/bin/python pipeline/scripts/escalar_foneticos.py --remote --dry-run
    PYTHONPATH=pipeline/src .venv/bin/python pipeline/scripts/escalar_foneticos.py --remote --limit 1
    PYTHONPATH=pipeline/src .venv/bin/python pipeline/scripts/escalar_foneticos.py --remote --template ReadAloudEngine
    PYTHONPATH=pipeline/src .venv/bin/python pipeline/scripts/escalar_foneticos.py --remote
"""
import argparse
import json
import os
import sys
import unicodedata
from collections import Counter
from pathlib import Path

from deutsch_pipeline.generation.model_routing import is_weak_topic
from deutsch_pipeline.generation.topics import Topic
from deutsch_pipeline.ingest.write_exercises import build_insert

AUDIO_TMP_DIR = Path(__file__).resolve().parents[1] / "output" / "audio_tmp"
CHUNK = 20  # INSERTs por chamada ao wrangler

SOURCES_SQL = (
    "SELECT e.id, t.nome AS template, e.prompt, e.accepted_answers, e.content_topic_id, "
    "e.phonetic_point_id, ct.topico "
    "FROM servable_exercises e JOIN exercise_templates t ON t.id = e.exercise_template_id "
    "LEFT JOIN content_topics ct ON ct.id = e.content_topic_id "
    "WHERE t.nome IN ('DictationEngine', 'GapFillGovernanceEngine') ORDER BY e.id;"
)
# `exercises`, não a view: item rejeitado no destino também conta como existente.
EXISTING_SQL = (
    "SELECT t.nome AS template, e.prompt FROM exercises e "
    "JOIN exercise_templates t ON t.id = e.exercise_template_id "
    "WHERE t.nome IN ('ReadAloudEngine', 'SpokenGapFillEngine');"
)
DEST_FOLDER = {"ReadAloudEngine": "readaloud", "SpokenGapFillEngine": "spokengapfill"}


def topic_needs_review(topico: str | None) -> bool:
    # is_weak_topic só olha o nome do tópico (expected_case + lista de FVG).
    if topico is None:
        return True
    return is_weak_topic(Topic(id=0, categoria="", topico=topico, nivel="", regra="", exemplo="", fonte=""))


def select(sources: list[dict], existing: list[dict], needs_review=topic_needs_review,
           limit: int | None = None, template: str | None = None) -> tuple[list[dict], Counter]:
    """Itens a criar (no máximo `limit` por template; só `template`, se dado) e
    contagem dos pulados por motivo."""
    plan, skipped = [], Counter()
    seen = {(row["template"], row["prompt"]) for row in existing}
    per_template = Counter()
    for row in sources:
        if row["template"] == "DictationEngine":
            if row["phonetic_point_id"] is None:
                skipped["ditado_sem_ponto_fonetico"] += 1
                continue
            item = {
                "template": "ReadAloudEngine", "prompt": row["prompt"],
                "accepted_answers": [row["prompt"]], "sentence_full": row["prompt"],
                "content_topic_id": None, "phonetic_point_id": row["phonetic_point_id"],
            }
        else:
            if needs_review(row["topico"]):
                skipped["topico_exige_revisao_humana"] += 1
                continue
            accepted = json.loads(row["accepted_answers"])
            if row["prompt"].count("___") != 1 or not accepted:
                skipped["lacuna_invalida"] += 1
                continue
            item = {
                "template": "SpokenGapFillEngine", "prompt": row["prompt"], "accepted_answers": accepted,
                # mesma reconstrução do attempts.ts (replace da 1ª lacuna pela 1ª resposta)
                "sentence_full": row["prompt"].replace("___", accepted[0], 1),
                "content_topic_id": row["content_topic_id"], "phonetic_point_id": None,
            }
        if template is not None and item["template"] != template:
            continue
        key = (item["template"], item["prompt"])
        if key in seen:
            skipped["ja_existe_no_destino"] += 1
            continue
        if limit is not None and per_template[item["template"]] >= limit:
            continue
        seen.add(key)
        per_template[item["template"]] += 1
        item["source_id"] = row["id"]
        plan.append(item)
    return plan, skipped


def object_key(item: dict) -> str:
    # Chave R2 sempre ASCII (CLAUDE.md): NFKD descarta o diacrítico.
    ascii_text = unicodedata.normalize("NFKD", item["sentence_full"]).encode("ascii", "ignore").decode("ascii")
    slug = "".join(c if c.isalnum() else "-" for c in ascii_text.lower()).strip("-")[:40]
    return f"{DEST_FOLDER[item['template']]}/{item['source_id']}_{slug}.wav"


def write(plan: list[dict], template_ids: dict, voice: str, synthesize, upload, execute) -> int:
    """Sintetiza e sobe o áudio de cada item; grava os INSERTs em blocos de CHUNK."""
    AUDIO_TMP_DIR.mkdir(parents=True, exist_ok=True)
    pending, written = [], 0
    for i, item in enumerate(plan, 1):
        key = object_key(item)
        wav = AUDIO_TMP_DIR / key.replace("/", "_")
        synthesize(item["sentence_full"], wav, voice_name=voice)
        upload(wav, key)
        ex = {
            "prompt": item["prompt"],
            "accepted_answers": item["accepted_answers"],
            "generated_by": voice,
            "flag_reason": "auto_ok",
            "flag_detail": None,
            "validation_status": "auto_ok",
        }
        pending.append(build_insert(
            ex, content_topic_id=item["content_topic_id"],
            exercise_template_id=template_ids[item["template"]],
            phonetic_point_id=item["phonetic_point_id"], audio_ref=key, source_type="tts",
        ))
        if len(pending) == CHUNK or i == len(plan):
            execute("\n".join(pending))
            written += len(pending)
            pending = []
            print(f"[{i}/{len(plan)}] gravados até aqui: {written}")
    return written


def print_plan(plan: list[dict], skipped: Counter) -> None:
    by_template = Counter(item["template"] for item in plan)
    print(f"a criar: {dict(by_template)}")
    print(f"pulados: {dict(skipped)}")
    points = Counter(item["phonetic_point_id"] for item in plan if item["template"] == "ReadAloudEngine")
    if points:
        print(f"ReadAloud por phonetic_point_id: {dict(sorted(points.items()))}")
    for template in DEST_FOLDER:
        for item in [it for it in plan if it["template"] == template][:3]:
            print(f"  {template} <- #{item['source_id']}: {item['prompt']!r} -> {object_key(item)}")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--remote", action="store_true",
                        help="obrigatório: lê e grava no D1/R2 de produção (wrangler --remote)")
    parser.add_argument("--dry-run", action="store_true", help="só mostra o que seria criado")
    parser.add_argument("--limit", type=int, default=None, help="máximo de itens novos por template")
    parser.add_argument("--template", choices=sorted(DEST_FOLDER), default=None,
                        help="só este template de destino (padrão: os dois)")
    args = parser.parse_args(argv)

    if not args.remote:
        print("recusado: passe --remote (as frases de origem estão no D1 de produção).", file=sys.stderr)
        return 2
    if os.environ.get("D1_HTTP_API_TOKEN"):
        print("recusado: D1_HTTP_API_TOKEN está definido -- esse é o caminho do container; "
              "aqui a gravação é pelo wrangler --remote.", file=sys.stderr)
        return 2
    os.environ["D1_REMOTE"] = "1"

    from deutsch_pipeline.ingest.write_exercises import execute_d1, query_d1

    plan, skipped = select(query_d1(SOURCES_SQL), query_d1(EXISTING_SQL), limit=args.limit, template=args.template)
    print_plan(plan, skipped)
    if args.dry_run or not plan:
        return 0

    # Piper só aqui: o --dry-run não precisa do modelo de voz.
    from deutsch_pipeline.tts.synthesize import DEFAULT_VOICE, MODELS_DIR, synthesize_to_file
    from deutsch_pipeline.tts.upload_r2 import upload_audio

    if not (MODELS_DIR / f"{DEFAULT_VOICE}.onnx").exists():
        print(f"recusado: voz {DEFAULT_VOICE} ausente em {MODELS_DIR} -- rode "
              f"`python -m piper.download_voices {DEFAULT_VOICE}` e mova o .onnx e o .onnx.json pra lá.",
              file=sys.stderr)
        return 2

    template_ids = {row["nome"]: row["id"] for row in query_d1(
        "SELECT id, nome FROM exercise_templates WHERE nome IN ('ReadAloudEngine', 'SpokenGapFillEngine');")}
    written = write(plan, template_ids, DEFAULT_VOICE, synthesize_to_file, upload_audio, execute_d1)
    print(f"resumo: {written} itens gravados")
    return 0


if __name__ == "__main__":
    sys.exit(main())
