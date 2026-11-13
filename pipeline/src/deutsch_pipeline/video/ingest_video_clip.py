"""Fase 6 (CLAUDE.md, docs/07) -- baixa a legenda (nunca o vídeo) de UM
vídeo já aprovado na curadoria, grava `video_clips` + `video_transcript_segments`
no D1.

Uso:
    python -m deutsch_pipeline.video.list_candidates dw_video_thema
    python -m deutsch_pipeline.video.ingest_video_clip --video-id Jdff8DelHSg \\
        --url "https://www.youtube.com/watch?v=Jdff8DelHSg" \\
        --channel-or-playlist "@dwlearngerman / Das Video-Thema" \\
        --fonte "DW Das Video-Thema" --content-topic-id 62
"""
import argparse
import tempfile
from pathlib import Path

import yt_dlp

from .vtt_parser import parse_vtt
from ..ingest.write_exercises import execute_d1, query_d1, sql_value


def download_subs(video_url: str, out_dir: Path) -> tuple[Path, str]:
    """Tenta legenda MANUAL primeiro, cai pra automatica (ASR) so se nao
    houver -- retorna (caminho_do_vtt, qualidade: 'manual'|'auto')."""
    base = out_dir / "%(id)s"
    for write_flag, quality in (({"writesubtitles": True}, "manual"), ({"writeautomaticsub": True}, "auto")):
        opts = {
            "skip_download": True,
            "subtitleslangs": ["de"],
            "subtitlesformat": "vtt",
            "outtmpl": str(base),
            "quiet": True,
            "no_warnings": True,
            **write_flag,
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([video_url])
        vtt_files = list(out_dir.glob("*.de.vtt"))
        if vtt_files:
            return vtt_files[0], quality
    raise RuntimeError(f"Nenhuma legenda em alemao (manual ou automatica) encontrada pra {video_url}")


def write_video_clip(
    video_id: str, url: str, fonte: str, channel_or_playlist: str, caption_quality: str,
    content_topic_id: int | None, start_seconds: int | None = None, end_seconds: int | None = None,
) -> int:
    stmt = (
        "INSERT INTO video_clips (url, start_seconds, end_seconds, fonte, content_topic_id, "
        "channel_or_playlist, caption_quality) VALUES ("
        f"{sql_value(url)}, {start_seconds if start_seconds is not None else 'NULL'}, "
        f"{end_seconds if end_seconds is not None else 'NULL'}, {sql_value(fonte)}, "
        f"{content_topic_id if content_topic_id else 'NULL'}, {sql_value(channel_or_playlist)}, "
        f"{sql_value(caption_quality)});"
    )
    execute_d1(stmt)
    return query_d1("SELECT id FROM video_clips ORDER BY id DESC LIMIT 1;")[0]["id"]


def write_segments(video_clip_id: int, segments, fonte_extracao: str) -> int:
    if not segments:
        return 0
    statements = []
    for seg in segments:
        statements.append(
            "INSERT INTO video_transcript_segments "
            "(video_clip_id, start_seconds, end_seconds, text, is_manual_caption, fonte_extracao) VALUES ("
            f"{video_clip_id}, {seg.start_seconds}, {seg.end_seconds}, {sql_value(seg.text)}, "
            f"{1 if fonte_extracao == 'yt-dlp-manual' else 0}, {sql_value(fonte_extracao)});"
        )
    execute_d1("\n".join(statements))
    return len(statements)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video-id", required=True)
    parser.add_argument("--url", required=True)
    parser.add_argument("--fonte", required=True)
    parser.add_argument("--channel-or-playlist", required=True)
    parser.add_argument("--content-topic-id", type=int, default=None)
    args = parser.parse_args()

    with tempfile.TemporaryDirectory() as tmp:
        vtt_path, quality = download_subs(args.url, Path(tmp))
        print(f"Legenda baixada: {vtt_path.name} (qualidade: {quality})")
        vtt_text = vtt_path.read_text(encoding="utf-8")

    segments = parse_vtt(vtt_text)
    print(f"{len(segments)} segmentos parseados")

    clip_id = write_video_clip(
        args.video_id, args.url, args.fonte, args.channel_or_playlist, quality, args.content_topic_id,
    )
    fonte_extracao = "yt-dlp-manual" if quality == "manual" else "yt-dlp-auto"
    n_written = write_segments(clip_id, segments, fonte_extracao)
    print(f"video_clips id={clip_id}, {n_written} segmentos gravados em video_transcript_segments "
          f"(caption_quality={quality}{' -- recomendado revisar antes de usar' if quality == 'auto' else ''})")


if __name__ == "__main__":
    main()
