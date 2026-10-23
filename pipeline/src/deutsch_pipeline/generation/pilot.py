"""Piloto de decisão do motor de geração (Fase 0, CLAUDE.md).

Gera exercicios do template "Completar lacunas com a regência correta" (Grupo A)
para os tópicos de regência selecionados em topics.py, suportando tanto
Structured Outputs via Pydantic quanto pós-processamento determinístico via Regex.
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path

from . import llm_client
from .schemas import FillBlankBatchResponse  # 📦 Import do nosso novo contrato de dados
from .prompts import SYSTEM_PROMPT, TEMPLATE_NAME, build_user_prompt
from .topics import load_pilot_topics

OUTPUT_DIR = Path(__file__).resolve().parents[3] / "output" / "piloto"

JSON_ARRAY_RE = re.compile(r"\[.*\]", re.DOTALL)


def extract_json_array(raw: str) -> list[dict]:
    """O modelo às vezes envolve o JSON em ```json ... ``` ou adiciona texto solto
    antes/depois apesar da instrução. Extrai o primeiro array JSON válido."""
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
    """Corta gap_answer de dentro de sentence_full para montar a lacuna --
    mecanicamente, nunca autorado pelo LLM como string separada (ver prompts.py).
    Retorna None se gap_answer não aparece literalmente em sentence_full."""
    if not sentence_full or not gap_answer:
        return None
    idx = sentence_full.find(gap_answer)
    if idx == -1:
        return None
    return sentence_full[:idx] + "___" + sentence_full[idx + len(gap_answer):]


def build_exercise_fields_gapfill(item: dict, topic) -> dict:
    """Contrato padrão (GapFillGovernanceEngine/FillBlankEngine): LLM autora
    sentence_full + gap_answer, o programa cava o prompt mecanicamente.
    """
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
    schema_class=None,
) -> list[dict]:
    """Parametrizado por prompt. Detecta automaticamente se o modelo suporta
    Structured Outputs nativos (Pydantic) ou se precisa cair no fallback de Regex.
    """
    user_prompt = user_prompt_builder(topic, n_items)
    last_error = None
    
    # 🔍 FEATURE DETECTION: Identifica se o modelo possui suporte a Saídas Estruturadas
    use_structured = (
        model.startswith("hf:") or 
        model.startswith("gemini") or 
        model.startswith("gemma") or 
        model.startswith("azure:")
    )

    for attempt in range(1, max_retries + 2):
        try:
            if use_structured:
                # 🛡️ CAMINHO PRO: Execução segura com garantia de esquema via Pydantic
                structured_data = llm_client.chat_structured(
                    model=model,
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    schema_class=FillBlankBatchResponse,
                    temperature=0.4
                )
                items = structured_data["exercises"]
            else:
                # 🔄 CAMINHO FALLBACK: Texto livre + pós-processamento por Regex (Ollama, Claude, etc.)
                raw = llm_client.chat(model, system_prompt, user_prompt, temperature=0.7)
                items = extract_json_array(raw)
            
            # Validação sanitária estrutural mínima do array
            not_dicts = [type(x).__name__ for x in items if not isinstance(x, dict)]
            if not_dicts:
                raise ValueError(f"Array JSON válido mas com itens que não são objetos: {not_dicts}")
            break
            
        except Exception as e:
            last_error = e
            print(f"  [retry {attempt}] falha na geração/validação estrutural: {e}", file=sys.stderr)
    else:
        raise RuntimeError(f"Falhou após {max_retries + 1} tentativas: {last_error}")

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
    parser.add_argument("--model", required=True, help="Nome do modelo (ex.: hf:deepseek-ai/DeepSeek-V3 ou mistral-small)")
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
