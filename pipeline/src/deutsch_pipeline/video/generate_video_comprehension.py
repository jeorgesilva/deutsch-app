"""Fatia B (redesenho pedagógico de Video) -- gera exercícios de compreensão
ancorados no video_clip PAI (clipe inteiro), reaproveitando SEM MUDANÇA os 4
engines já existentes do bloco de leitura (`generation/prompts_matching.py`,
`prompts_truefalse.py`, `prompts_comprehensionqa.py`, `prompts_predictverify.py`)
-- zero engine novo, só muda o ANCORAMENTO: em vez de popular
`reading_block_items` (tabela que não existe pro vídeo), o exercício aponta
`video_clip_id` pro clipe PAI (mesmo grupo por `url` que `videoGroups.ts` já
usa pro hub de Vídeo) -- múltiplos exercícios podem compartilhar o mesmo
`video_clip_id` pai sem conflito de schema.

Resolve o desbalanço bottom-up/top-down da auditoria pedagógica (achado #2):
"legendar"/"citar"/"ditado" só testam decodificação, nada testa compreensão
global. `PredictThenVerifyEngine` aqui também cobre a pré-escuta (achado #4)
-- e fica estruturalmente MAIS correto que na Leitura: não existe painel de
vídeo/transcrição persistente igual ao `#block-context` de texto, então a
única forma de "verificar" é o feedback pós-tentativa padrão (accepted_answers),
sem o vazamento que a versão de Leitura tem (texto inteiro já visível antes
de prever).

`texto_base` = todos os `video_transcript_segments` do clipe concatenados
(mesma junção " ".join(...) que "legendar" usava antes da Fatia A quebrar
ele em sentenças -- a função de servir de base pro LLM não desapareceu, só
mudou de consumidor).

Uso:
    python -m deutsch_pipeline.video.generate_video_comprehension \\
        --video-clip-id 1 --engine TrueFalseEngine --model hf:deepseek-ai/DeepSeek-V3 --n-items 4
    python -m deutsch_pipeline.video.generate_video_comprehension \\
        --video-clip-id 1 --engine MatchingEngine --model hf:deepseek-ai/DeepSeek-V3 --n-items 6
"""
import argparse
import json
import re

from ..generation import llm_client, prompts_comprehensionqa, prompts_matching, prompts_truefalse
from ..ingest.write_exercises import build_insert, execute_d1, query_d1
from .generate_video_exercises import load_clip, load_segments

JSON_ARRAY_RE = re.compile(r"\[.*\]", re.DOTALL)

DB_STATUS = {
    "auto_ok": "auto_ok",
    "structural_mismatch": "flagged",
    "lt_flagged": "flagged",
}

# Mesmo registro de generate_reading_block_items.py, so' com os engines que
# de fato servem pra video. PredictThenVerifyEngine FICOU DE FORA -- achado
# real na auditoria (3 itens gerados e rejeitados, ver exercises.id 1093-1095):
# seu campo `trecho_inicial` embute um pedaco cru da transcricao como texto
# visivel no prompt, o que funciona pro bloco de leitura (ler o texto E' o
# exercicio) mas viola a regra especifica de video (CLAUDE.md: "nunca
# mostrar transcricao de video como texto pra ler antes da tentativa") --
# precisaria de um redesenho ciente de timestamp (video truncado ate o
# corte, sem nenhum texto), fora do escopo desta fatia.
MULTI_ITEM_ENGINES = {
    "TrueFalseEngine": (prompts_truefalse, prompts_truefalse.build_exercise_fields_truefalse),
    "ComprehensionQAEngine": (prompts_comprehensionqa, prompts_comprehensionqa.build_exercise_fields_comprehensionqa),
}
SINGLE_ITEM_ENGINES = {
    "MatchingEngine": (prompts_matching, prompts_matching.build_exercise_fields_matching),
}
ALL_ENGINES = set(MULTI_ITEM_ENGINES) | set(SINGLE_ITEM_ENGINES)

FONTE_LABEL = "Transcrição do vídeo"


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


def build_texto_base(video_clip_id: int) -> str:
    segments = load_segments(video_clip_id)
    return " ".join(s["text"] for s in segments)


def write_item(fields: dict, model: str, exercise_template_id: int, video_clip_id: int) -> int:
    ex = {
        "prompt": fields["prompt"], "accepted_answers": fields["accepted_answers"],
        "generated_by": model, "flag_reason": fields["flag_reason"],
        "flag_detail": fields["flag_detail"],
        "validation_status": DB_STATUS[fields["flag_reason"]],
    }
    stmt = build_insert(ex, content_topic_id=None, exercise_template_id=exercise_template_id, source_type="authentic_video")
    execute_d1(stmt)
    exercise_id = query_d1("SELECT id FROM exercises ORDER BY id DESC LIMIT 1;")[0]["id"]
    execute_d1(f"UPDATE exercises SET video_clip_id = {video_clip_id} WHERE id = {exercise_id};")
    return exercise_id


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video-clip-id", type=int, required=True, help="id do clipe PAI (video_clips.start_seconds IS NULL)")
    parser.add_argument("--engine", required=True, choices=sorted(ALL_ENGINES))
    parser.add_argument("--model", required=True)
    parser.add_argument("--n-items", type=int, default=4)
    args = parser.parse_args()

    clip = load_clip(args.video_clip_id)
    texto_base = build_texto_base(args.video_clip_id)
    templates_cache = {row["nome"]: row["id"] for row in query_d1("SELECT id, nome FROM exercise_templates;")}
    exercise_template_id = templates_cache[args.engine]
    written, by_reason = 0, {}

    if args.engine in SINGLE_ITEM_ENGINES:
        prompts_module, builder = SINGLE_ITEM_ENGINES[args.engine]
    else:
        prompts_module, builder = MULTI_ITEM_ENGINES[args.engine]

    user_prompt = prompts_module.build_user_prompt(texto_base, args.n_items, label=FONTE_LABEL)
    raw = llm_client.chat(args.model, prompts_module.SYSTEM_PROMPT, user_prompt, temperature=0.6)
    raw_items = extract_json_array(raw)
    print(f"[{args.engine}] {len(raw_items)} itens brutos gerados pro video_clip {args.video_clip_id} ('{clip['fonte']}')")

    if args.engine in SINGLE_ITEM_ENGINES:
        fields = builder(raw_items, texto_base)
        by_reason[fields["flag_reason"]] = by_reason.get(fields["flag_reason"], 0) + 1
        if fields["prompt"]:
            write_item(fields, args.model, exercise_template_id, args.video_clip_id)
            written += 1
    else:
        for raw_item in raw_items:
            fields = builder(raw_item, texto_base)
            by_reason[fields["flag_reason"]] = by_reason.get(fields["flag_reason"], 0) + 1
            if not fields["prompt"]:
                continue
            write_item(fields, args.model, exercise_template_id, args.video_clip_id)
            written += 1

    print(f"  -> {written} itens gravados em exercises (video_clip_id={args.video_clip_id}) -- {by_reason}")


if __name__ == "__main__":
    main()
