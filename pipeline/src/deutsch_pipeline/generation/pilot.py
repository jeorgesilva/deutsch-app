"""Piloto de decisao do motor de geracao (Fase 0, CLAUDE.md).

Gera exercicios do template "Completar lacunas com a regencia correta" (Grupo A)
para os 4 topicos de regencia selecionados em topics.py, contra um modelo Ollama
local, usando regra+exemplo da planilha como few-shot (nunca inventa a regra).

Uso:
    python -m deutsch_pipeline.generation.pilot --model mistral-small --n-per-topic 5
    python -m deutsch_pipeline.generation.pilot --model deepseek-r1-multi-7b --n-per-topic 5

Saida: pipeline/output/piloto/<model>.json -- lista de exercicios no formato
docs/02 "Exemplo concreto" (topic/template/variation/prompt/accepted_answers/
source_rule/generated_by/validation_status), mais sentence_full (frase completa,
usada depois pela validacao do LanguageTool).
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path

from . import llm_client
from .prompts import SYSTEM_PROMPT, TEMPLATE_NAME, build_user_prompt
from .topics import load_pilot_topics

OUTPUT_DIR = Path(__file__).resolve().parents[3] / "output" / "piloto"

JSON_ARRAY_RE = re.compile(r"\[.*\]", re.DOTALL)


def extract_json_array(raw: str) -> list[dict]:
    """O modelo as vezes envolve o JSON em ```json ... ``` ou adiciona texto solto
    antes/depois apesar da instrucao. Extrai o primeiro array JSON valido."""
    raw = raw.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    match = JSON_ARRAY_RE.search(raw)
    if not match:
        raise ValueError(f"Nenhum array JSON encontrado na resposta:\n{raw[:500]}")
    return json.loads(match.group(0))


def build_prompt_gapped(sentence_full: str, gap_answer: str) -> str | None:
    """Corta gap_answer de dentro de sentence_full pra montar a lacuna --
    mecanicamente, nunca autorado pelo LLM como string separada (ver prompts.py).
    Retorna None se gap_answer nao aparece literalmente em sentence_full: isso
    e o gate estrutural que a auditoria da Fase 0 mostrou estar ausente."""
    if not sentence_full or not gap_answer:
        return None
    idx = sentence_full.find(gap_answer)
    if idx == -1:
        return None
    return sentence_full[:idx] + "___" + sentence_full[idx + len(gap_answer):]


def build_exercise_fields_gapfill(item: dict, topic) -> dict:
    """Contrato padrao (GapFillGovernanceEngine/FillBlankEngine): LLM autora
    sentence_full + gap_answer, o programa carva o prompt mecanicamente
    (build_prompt_gapped). Extraido do corpo antigo de generate_for_topic pra
    virar o default de exercise_field_builder -- outros templates do Grupo A
    (ex. UnscrambleEngine, generation/prompts_unscramble.py) que nao tem
    lacuna passam um builder proprio sem tocar neste."""
    sentence_full = item.get("sentence_full")
    gap_answer = item.get("gap_answer")
    prompt_gapped = build_prompt_gapped(sentence_full, gap_answer)
    accepted_answers = item.get("accepted_answers") or []
    if gap_answer and gap_answer not in accepted_answers:
        accepted_answers = [gap_answer, *accepted_answers]
    return {
        "prompt": prompt_gapped,
        "sentence_full": sentence_full,
        "gap_answer": gap_answer,
        "accepted_answers": accepted_answers,
        "flag_reason": "pending" if prompt_gapped else "structural_mismatch",
    }


def generate_for_topic(
    model: str,
    topic,
    n_items: int,
    system_prompt: str = SYSTEM_PROMPT,
    template_name: str = TEMPLATE_NAME,
    user_prompt_builder=build_user_prompt,
    exercise_field_builder=build_exercise_fields_gapfill,
    max_retries: int = 2,
) -> list[dict]:
    """Parametrizado por prompt (system_prompt/template_name/user_prompt_builder)
    em vez de hardcoded no import -- generaliza pra qualquer template do Grupo A,
    nao so GapFillGovernanceEngine. exercise_field_builder decide como os campos
    prompt/gap_answer/accepted_answers/flag_reason saem do item bruto do LLM --
    default preserva o contrato de lacuna (sentence_full + gap_answer); templates
    sem lacuna (ex. UnscrambleEngine) passam um builder proprio. Defaults
    preservam o comportamento antigo (piloto da Fase 0) pra quem chama sem
    passar esses argumentos."""
    user_prompt = user_prompt_builder(topic, n_items)
    last_error = None
    for attempt in range(1, max_retries + 2):
        raw = llm_client.chat(model, system_prompt, user_prompt, temperature=0.7)
        try:
            items = extract_json_array(raw)
            not_dicts = [type(x).__name__ for x in items if not isinstance(x, dict)]
            if not_dicts:
                raise ValueError(f"array JSON valido mas com itens que nao sao objetos: {not_dicts}")
            break
        except (ValueError, json.JSONDecodeError) as e:
            last_error = e
            print(f"  [retry {attempt}] falha ao parsear JSON: {e}", file=sys.stderr)
    else:
        raise RuntimeError(f"Falhou apos {max_retries + 1} tentativas: {last_error}")

    exercises = []
    for i, item in enumerate(items, start=1):
        fields = exercise_field_builder(item, topic)
        exercises.append(
            {
                "topic": topic.topico,
                "categoria": topic.categoria,
                "template": template_name,
                "variation": i,
                "source_rule": topic.regra,
                "source_example": topic.exemplo,
                "expected_case": topic.expected_case,
                "generated_by": model,
                "validation_status": "pending",
                **fields,
            }
        )
    return exercises


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", required=True, help="Nome do modelo Ollama (ex.: mistral-small)")
    parser.add_argument("--n-per-topic", type=int, default=5)
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args()

    topics = load_pilot_topics()
    out_path = args.out or (OUTPUT_DIR / f"{args.model.replace(':', '_')}.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)

    all_exercises = []
    for topic in topics:
        print(f"Gerando {args.n_per_topic} itens para '{topic.topico}' com {args.model}...")
        t0 = time.time()
        exercises = generate_for_topic(args.model, topic, args.n_per_topic)
        print(f"  -> {len(exercises)} itens em {time.time() - t0:.1f}s")
        all_exercises.extend(exercises)

    out_path.write_text(json.dumps(all_exercises, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n{len(all_exercises)} exercicios salvos em {out_path}")


if __name__ == "__main__":
    main()
