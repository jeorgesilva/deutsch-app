"""docs/14 -- servico HTTP de geracao sob demanda, mesmo padrao ja
estabelecido em phonetics/service.py (Fase 8/14): Worker do Pages nao pode
rodar LLM/spaCy/LanguageTool em tempo real (CLAUDE.md, "geracao e sempre em
lote/offline, nunca num Worker"), entao um servico a parte faz o trabalho
pesado e devolve so o resultado ja validado -- o Worker continua sendo o
UNICO ponto de escrita em D1 (mesmo principio ja usado pelo servico
fonetico: "servico e puro calculo").

Diferente do servico fonetico (que roda 100% local em PyTorch), este roda
dentro do container de geracao (services/generation-container/) com saida
pra internet HABILITADA e restrita por allowlist (services/generation-
container/src/index.ts: enableInternet=true + allowedHosts=[gemini, hf] --
unica excecao ao container fonetico continuar fechado) -- ver decisao
registrada na sessao que criou este arquivo.

Reaproveita 100% o motor de geracao/validacao ja existente
(generation/pilot.py::generate_for_topic, validation/harness.py::
validate_batch, generation/model_routing.py::resolve_model) -- este modulo
so' e' um roteador HTTP fino em cima do que generate_batch.py ja faz em
lote/CLI, escopado a UM topico + UM engine por chamada (o Worker decide
quais engines chamar consultando topic_template_map, e faz uma chamada por
engine mapeado).

Uso:
    python -m deutsch_pipeline.generation.service [--port 5006]
"""
import argparse
import traceback

from flask import Flask, jsonify, request

from ..validation.harness import validate_batch
from . import prompts as gapfill_prompts
from . import prompts_fillblank as fillblank_prompts
from . import prompts_registerreformulation
from . import prompts_structuraltransform
from . import prompts_unscramble
from . import prompts_wordbankguess
from .daily_reading_batch import create_next_reading_block
from .model_routing import resolve_model
from .pilot import build_exercise_fields_gapfill, generate_for_topic
from .topics import Topic
from ..video.daily_batch import ingest_next_new_video

app = Flask(__name__)

# Mesmo registro de generate_batch.py (ENGINE_PROMPTS/EXERCISE_FIELD_BUILDERS)
# -- so os 6 engines de Grupo A ancorados a content_topic_id (nunca
# reading_blocks/video_clips, que sao um eixo estruturalmente separado --
# docs/14) tem geracao sob demanda.
ENGINE_PROMPTS = {
    "GapFillGovernanceEngine": gapfill_prompts,
    "FillBlankEngine": fillblank_prompts,
    "UnscrambleEngine": prompts_unscramble,
    "StructuralTransformEngine": prompts_structuraltransform,
    "RegisterReformulationEngine": prompts_registerreformulation,
    "WordBankGuessEngine": prompts_wordbankguess,
}
EXERCISE_FIELD_BUILDERS = {
    "UnscrambleEngine": prompts_unscramble.build_exercise_fields_unscramble,
    "StructuralTransformEngine": prompts_structuraltransform.build_exercise_fields_structuraltransform,
    "RegisterReformulationEngine": prompts_registerreformulation.build_exercise_fields_structuraltransform,
    "WordBankGuessEngine": prompts_wordbankguess.build_exercise_fields_wordbankguess,
}


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/generate-topic")
def generate_topic_endpoint():
    body = request.get_json(force=True)
    engine = body.get("engine")
    model = body.get("model")
    topic_data = body.get("topic") or {}
    n_per_topic = int(body.get("n_per_topic") or 5)
    items_per_call = int(body.get("items_per_call") or 5)

    if engine not in ENGINE_PROMPTS:
        return jsonify({"error": f"engine não suportado pra geração sob demanda: {engine}"}), 400
    if not model:
        return jsonify({"error": "model é obrigatório"}), 400
    if not topic_data.get("topico") or not topic_data.get("regra"):
        return jsonify({"error": "topic.topico e topic.regra são obrigatórios"}), 400

    topic = Topic(
        id=topic_data.get("id") or 0,
        categoria=topic_data.get("categoria") or "",
        topico=topic_data["topico"],
        nivel=topic_data.get("nivel"),
        regra=topic_data["regra"],
        exemplo=topic_data.get("exemplo"),
        fonte=topic_data.get("fonte"),
    )
    model_used = resolve_model(topic, model)
    prompts_module = ENGINE_PROMPTS[engine]
    exercise_field_builder = EXERCISE_FIELD_BUILDERS.get(engine, build_exercise_fields_gapfill)

    try:
        exercises = []
        remaining = n_per_topic
        while remaining > 0:
            chunk_n = min(items_per_call, remaining)
            chunk = generate_for_topic(
                model_used, topic, chunk_n,
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
    except Exception as e:  # provedor de LLM instavel/cota estourada etc.
        return jsonify({"error": f"falha na geração (provedor {model_used}): {e}"}), 502

    validate_batch(exercises)

    # itens sem prompt utilizavel (gate estrutural falhou) nunca viram linha
    # em exercises -- mesmo criterio de write_exercises.py::main.
    out = []
    skipped = 0
    for ex in exercises:
        if not ex.get("prompt"):
            skipped += 1
            continue
        out.append({
            "variation_number": ex.get("variation"),
            "prompt": ex["prompt"],
            "accepted_answers": ex.get("accepted_answers") or [],
            "source_rule": ex.get("source_rule"),
            "generated_by": ex.get("generated_by"),
            "validation_status": ex.get("validation_status", "pending"),
            "flag_reason": ex.get("flag_reason"),
            "flag_detail": ex.get("flag_detail"),
        })

    return jsonify({"model_used": model_used, "exercises": out, "skipped_count": skipped})


# Fase 15 -- geração diária automatizada (vídeo + notícia). Diferente de
# /generate-topic (D1-blind, o Worker do Pages faz os INSERTs), estes dois
# escrevem direto no D1 de PRODUÇÃO via HTTP API (ver ingest/write_exercises.py,
# D1_HTTP_API_TOKEN) -- a orquestração aqui é multi-passo e stateful (ingerir
# legenda -> gerar 6 exercícios -> ou sourcing de notícia -> gerar bloco -> 10
# engines), replicar isso como Worker-faz-todos-os-INSERTs duplicaria a lógica
# inteira em TypeScript; o princípio "Worker é o único escritor" (docs/14) foi
# desenhado pra 1 chamada de LLM -> poucas linhas, não pra este caso.
@app.post("/generate-video-item")
def generate_video_item_endpoint():
    body = request.get_json(silent=True) or {}
    model = body.get("model") or "hf:deepseek-ai/DeepSeek-V3"
    try:
        result = ingest_next_new_video(model)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"falha ingerindo vídeo: {e}"}), 502
    return jsonify(result)


@app.post("/generate-reading-item")
def generate_reading_item_endpoint():
    body = request.get_json(silent=True) or {}
    model = body.get("model") or "hf:deepseek-ai/DeepSeek-V3"
    try:
        result = create_next_reading_block(model)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"falha gerando bloco de leitura: {e}"}), 502
    return jsonify(result)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=5006)
    args = parser.parse_args()
    app.run(host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
