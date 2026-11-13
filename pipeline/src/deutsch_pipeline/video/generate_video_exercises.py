"""Fase 6 (CLAUDE.md, docs/07), redesenhado na Fatia A do redesenho
pedagógico de Vídeo -- gera exercícios em cima de um `video_clips` já
ingerido (`ingest_video_clip.py`, transcrição real via yt-dlp):

- "legendar" (VideoTaskEngine, produção de texto, docs/05 item 12): antes
  gerava 1 exercício-monólito com a transcrição inteira do clipe (achado
  pedagógico real: excede memória de trabalho, viola o princípio de unidade
  <2min do projeto). Agora quebra o clipe em SENTENÇAS via
  `vtt_parser.merge_into_sentences` e gera 1 exercício por sentença, cada
  um com seu próprio sub-clipe -- mesma granularidade de "citar", cobertura
  total do vídeo em sequência. Não chama LLM -- é derivação mecânica da
  transcrição real, mesmo espírito de antes.
- "citar" (VideoTaskEngine, docs/05 item 44): deixou de ser produção de
  texto (idêntico a "dictation", mesmo construto sob nome diferente -- achado
  pedagógico real) e virou RECONHECIMENTO por paráfrase: dado um resumo em
  alemão mais simples (1 chamada de LLM por trecho, `prompts_video_citar.py`,
  gate mecânico de fundamentação próprio), o usuário aponta qual trecho do
  vídeo corresponde. Distratores são sempre trechos REAIS do mesmo vídeo,
  nunca inventados.
- "dictation" (variante autêntica do `DictationEngine`, item 28,
  `source_type='authentic_video'`): sem mudança -- continua bottom-up puro,
  ouvir e digitar de volta.

Uso:
    python -m deutsch_pipeline.video.generate_video_exercises --video-clip-id 1 --engine legendar
    python -m deutsch_pipeline.video.generate_video_exercises --video-clip-id 1 --engine citar --n-items 3 --model hf:deepseek-ai/DeepSeek-V3
    python -m deutsch_pipeline.video.generate_video_exercises --video-clip-id 1 --engine dictation --n-items 3
"""
import argparse
import random

from . import prompts_video_citar
from .ingest_video_clip import write_video_clip
from .vtt_parser import merge_into_sentences
from ..generation import llm_client
from ..ingest.write_exercises import build_insert, execute_d1, query_d1

MIN_QUOTE_LEN = 25
MAX_QUOTE_LEN = 90


def load_clip(video_clip_id: int) -> dict:
    rows = query_d1(f"SELECT * FROM video_clips WHERE id = {video_clip_id};")
    if not rows:
        raise ValueError(f"video_clip {video_clip_id} nao encontrado")
    return rows[0]


def load_segments(video_clip_id: int) -> list[dict]:
    return query_d1(
        f"SELECT start_seconds, end_seconds, text, is_manual_caption, fonte_extracao "
        f"FROM video_transcript_segments WHERE video_clip_id = {video_clip_id} ORDER BY start_seconds;"
    )


def pick_quote_segments(segments: list[dict], n: int, offset: int = 0) -> list[dict]:
    """Escolhe segmentos de tamanho medio (nem fragmento minusculo tipo 'Ja.',
    nem frase truncada demais) -- espalhados ao longo do clipe, nao todos do
    comeco.

    `offset` desloca o ponto de partida da amostragem -- Fase 12, achado
    real: "citar" (VideoTaskEngine) e a variante autentica do
    DictationEngine chamavam esta funcao com os MESMOS argumentos (mesmos
    `segments`, mesmo `n`), entao sempre pegavam exatamente os mesmos
    segmentos -- redundancia cosmetica com 1 video so, mas viraria
    problema real ao escalar pra mais videos (CLAUDE.md, "Pendencia
    conhecida" da Fase 6). Chamadores agora passam offsets diferentes por
    engine (ver ENGINE_OFFSETS) pra sair com trechos DIFERENTES do mesmo
    clipe."""
    candidates = [s for s in segments if MIN_QUOTE_LEN <= len(s["text"]) <= MAX_QUOTE_LEN]
    if len(candidates) <= n:
        return candidates
    step = len(candidates) // n
    start = offset % step
    return [candidates[(start + i * step) % len(candidates)] for i in range(n)]


# offset por engine -- so importa quando as DUAS rodam contra o mesmo
# video_clip_id (caso comum: "citar" e "dictation" no mesmo video).
ENGINE_OFFSETS = {"citar": 0, "dictation": 1}


def write_exercise(prompt, accepted_answers, exercise_template_id, video_clip_id, generated_by, source_type=None):
    ex = {
        # exercises.prompt e' NOT NULL -- estes exercicios nao mostram texto
        # pre-tentativa (regra docs/07: transcricao so aparece como gabarito
        # pos-tentativa), entao string vazia, nunca None.
        "prompt": prompt or "", "accepted_answers": accepted_answers,
        "generated_by": generated_by, "flag_reason": "auto_ok",
        "flag_detail": None, "validation_status": "auto_ok",
    }
    stmt = build_insert(ex, content_topic_id=None, exercise_template_id=exercise_template_id, source_type=source_type)
    # build_insert nao seta video_clip_id (parametro novo) -- injeta via UPDATE
    # pra nao duplicar a funcao so por causa de 1 coluna a mais.
    execute_d1(stmt)
    exercise_id = query_d1("SELECT id FROM exercises ORDER BY id DESC LIMIT 1;")[0]["id"]
    execute_d1(f"UPDATE exercises SET video_clip_id = {video_clip_id} WHERE id = {exercise_id};")
    return exercise_id


def _write_sub_clip(clip: dict, start_seconds: float, end_seconds: float) -> int:
    return write_video_clip(
        video_id=clip["url"].rsplit("=", 1)[-1], url=clip["url"], fonte=clip["fonte"],
        channel_or_playlist=clip["channel_or_playlist"], caption_quality=clip["caption_quality"],
        content_topic_id=clip["content_topic_id"],
        start_seconds=int(start_seconds), end_seconds=int(end_seconds) + 1,
    )


def _run_legendar(clip: dict, segments: list[dict], templates: dict, generated_by: str) -> int:
    sentences = merge_into_sentences(segments)
    written = 0
    for sent in sentences:
        sub_clip_id = _write_sub_clip(clip, sent["start_seconds"], sent["end_seconds"])
        write_exercise(
            None, [sent["text"]], templates["VideoTaskEngine"], sub_clip_id,
            generated_by, source_type="authentic_video",
        )
        written += 1
    return written


def _run_dictation(clip: dict, segments: list[dict], templates: dict, generated_by: str, n_items: int) -> int:
    quotes = pick_quote_segments(segments, n_items, offset=ENGINE_OFFSETS["dictation"])
    written = 0
    for seg in quotes:
        sub_clip_id = _write_sub_clip(clip, seg["start_seconds"], seg["end_seconds"])
        write_exercise(
            None, [seg["text"]], templates["DictationEngine"], sub_clip_id,
            generated_by, source_type="authentic_video",
        )
        written += 1
    return written


def _run_citar(clip: dict, segments: list[dict], templates: dict, model: str, n_items: int) -> tuple[int, int]:
    # reconhecimento por parafrase (unico engine que chama LLM, ver
    # prompts_video_citar.py). Distratores sao outros trechos REAIS do mesmo
    # video (candidatos de tamanho medio, mesmo filtro de pick_quote_segments),
    # nunca inventados.
    candidates = [s for s in segments if MIN_QUOTE_LEN <= len(s["text"]) <= MAX_QUOTE_LEN]
    targets = pick_quote_segments(segments, n_items, offset=ENGINE_OFFSETS["citar"])
    written, skipped = 0, 0
    for target in targets:
        distractor_pool = [c["text"] for c in candidates if c["text"] != target["text"]]
        if len(distractor_pool) < 1:
            print(f"  [pulado] sem trecho distrator disponivel pra '{target['text'][:40]}...'")
            skipped += 1
            continue
        distractors = random.sample(distractor_pool, k=min(2, len(distractor_pool)))

        user_prompt = prompts_video_citar.build_user_prompt(target["text"])
        raw = llm_client.chat(model, prompts_video_citar.SYSTEM_PROMPT, user_prompt, temperature=0.7)
        paraphrase = prompts_video_citar.extract_paraphrase(raw)
        fields = prompts_video_citar.build_exercise_fields_citar(paraphrase, target["text"], distractors)

        if not fields["prompt"]:
            print(f"  [flagged] {fields['flag_detail']}")
            skipped += 1
            continue

        sub_clip_id = _write_sub_clip(clip, target["start_seconds"], target["end_seconds"])
        write_exercise(
            fields["prompt"], fields["accepted_answers"], templates["VideoTaskEngine"], sub_clip_id,
            model, source_type="authentic_video",
        )
        written += 1
    return written, skipped


def generate_exercises_for_clip(video_clip_id: int, model: str, n_items: int = 3) -> dict:
    """Roda os 3 engines (legendar/dictation/citar) num video_clip PAI ja
    ingerido -- usado pelo batch diario (video/daily_batch.py), que quer
    cobertura completa de um video novo numa chamada so, em vez do CLI que
    roda 1 engine por vez (--engine)."""
    clip = load_clip(video_clip_id)
    segments = load_segments(video_clip_id)
    templates = {row["nome"]: row["id"] for row in query_d1("SELECT id, nome FROM exercise_templates;")}
    generated_by = f"yt-dlp:{clip['caption_quality']}"

    n_legendar = _run_legendar(clip, segments, templates, generated_by)
    n_dictation = _run_dictation(clip, segments, templates, generated_by, n_items)
    n_citar, n_citar_skipped = _run_citar(clip, segments, templates, model, n_items)
    return {
        "legendar": n_legendar, "dictation": n_dictation,
        "citar": n_citar, "citar_skipped": n_citar_skipped,
        "total": n_legendar + n_dictation + n_citar,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video-clip-id", type=int, required=True)
    parser.add_argument("--engine", required=True, choices=["legendar", "citar", "dictation"])
    parser.add_argument("--n-items", type=int, default=3, help="so pra citar/dictation")
    parser.add_argument("--model", default=None, help="obrigatorio pro engine citar (unico que chama LLM)")
    args = parser.parse_args()

    clip = load_clip(args.video_clip_id)
    segments = load_segments(args.video_clip_id)
    print(f"[{args.engine}] video_clip {args.video_clip_id} ('{clip['fonte']}'), {len(segments)} segmentos")

    templates = {row["nome"]: row["id"] for row in query_d1("SELECT id, nome FROM exercise_templates;")}
    generated_by = f"yt-dlp:{clip['caption_quality']}"

    if args.engine == "legendar":
        written = _run_legendar(clip, segments, templates, generated_by)
        print(f"  -> {written} exercicios (legendar, 1 por sentenca via merge_into_sentences), "
              f"cobertura total do clipe em sequencia")
        return

    if args.engine == "dictation":
        written = _run_dictation(clip, segments, templates, generated_by, args.n_items)
        print(f"  -> {written} exercicios (dictation), cada um com seu proprio video_clips (janela de tempo)")
        return

    if not args.model:
        raise SystemExit("--model e' obrigatorio pro engine citar (unico que chama LLM)")
    written, skipped = _run_citar(clip, segments, templates, args.model, args.n_items)
    print(f"  -> {written} exercicios (citar, reconhecimento por parafrase), {skipped} descartados pelo gate")


if __name__ == "__main__":
    main()
