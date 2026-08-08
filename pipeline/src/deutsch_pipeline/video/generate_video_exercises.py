"""Fase 6 (CLAUDE.md, docs/07) -- gera exercícios em cima de um `video_clips`
já ingerido (`ingest_video_clip.py`, transcrição real via yt-dlp): as duas
variantes determinísticas de `VideoTaskEngine` (legendar = docs/05 item 12,
citar = item 44) e a variante autêntica do `DictationEngine` (item 28,
`source_type='authentic_video'` em vez de `'tts'`).

Não chama NENHUM LLM -- a transcrição já é real e ancorada (é o ponto do
docs/07: melhor que gerar texto do zero, só extrai o que já existe). Único
trabalho aqui é RECORTAR: "legendar" usa o clipe inteiro já ingerido; "citar"
e a variante do DictationEngine recortam segmentos curtos em clipes-janela
próprios (cada um com seu `start_seconds`/`end_seconds`), porque a interação
precisa saber ONDE no vídeo pular pra aquele trecho especificamente.

Uso:
    python -m deutsch_pipeline.video.generate_video_exercises --video-clip-id 1 --engine legendar
    python -m deutsch_pipeline.video.generate_video_exercises --video-clip-id 1 --engine citar --n-items 3
    python -m deutsch_pipeline.video.generate_video_exercises --video-clip-id 1 --engine dictation --n-items 3
"""
import argparse

from .ingest_video_clip import write_video_clip
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


def pick_quote_segments(segments: list[dict], n: int) -> list[dict]:
    """Escolhe segmentos de tamanho medio (nem fragmento minusculo tipo 'Ja.',
    nem frase truncada demais) -- espalhados ao longo do clipe, nao todos do
    comeco."""
    candidates = [s for s in segments if MIN_QUOTE_LEN <= len(s["text"]) <= MAX_QUOTE_LEN]
    if len(candidates) <= n:
        return candidates
    step = len(candidates) // n
    return [candidates[i * step] for i in range(n)]


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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video-clip-id", type=int, required=True)
    parser.add_argument("--engine", required=True, choices=["legendar", "citar", "dictation"])
    parser.add_argument("--n-items", type=int, default=3, help="so pra citar/dictation")
    args = parser.parse_args()

    clip = load_clip(args.video_clip_id)
    segments = load_segments(args.video_clip_id)
    print(f"[{args.engine}] video_clip {args.video_clip_id} ('{clip['fonte']}'), {len(segments)} segmentos")

    templates = {row["nome"]: row["id"] for row in query_d1("SELECT id, nome FROM exercise_templates;")}
    generated_by = f"yt-dlp:{clip['caption_quality']}"

    if args.engine == "legendar":
        full_text = " ".join(s["text"] for s in segments)
        exercise_id = write_exercise(
            None, [full_text], templates["VideoTaskEngine"], args.video_clip_id,
            generated_by, source_type="authentic_video",
        )
        print(f"  -> 1 exercicio (legendar, clipe inteiro), id={exercise_id}, "
              f"{len(full_text.split())} palavras no gabarito")
        return

    quotes = pick_quote_segments(segments, args.n_items)
    template_id = templates["VideoTaskEngine"] if args.engine == "citar" else templates["DictationEngine"]
    written = 0
    for seg in quotes:
        sub_clip_id = write_video_clip(
            video_id=clip["url"].rsplit("=", 1)[-1], url=clip["url"], fonte=clip["fonte"],
            channel_or_playlist=clip["channel_or_playlist"], caption_quality=clip["caption_quality"],
            content_topic_id=clip["content_topic_id"],
            start_seconds=int(seg["start_seconds"]), end_seconds=int(seg["end_seconds"]) + 1,
        )
        write_exercise(
            None, [seg["text"]], template_id, sub_clip_id, generated_by, source_type="authentic_video",
        )
        written += 1
    print(f"  -> {written} exercicios ({args.engine}), cada um com seu proprio video_clips (janela de tempo)")


if __name__ == "__main__":
    main()
