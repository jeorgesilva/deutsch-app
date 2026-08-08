"""Fase 6 (docs/07) -- lista os vídeos de uma playlist permitida
(`video/channels.py`), sem baixar nada (`--flat-playlist --dump-json`),
filtrando por duração. Passo 1 da curadoria assistida: humano escolhe qual
vídeo vira clipe antes de rodar `ingest_video_clip.py`.

Uso:
    python -m deutsch_pipeline.video.list_candidates dw_video_thema
"""
import argparse
import json
import subprocess

from .channels import ALLOWED_PLAYLISTS, MAX_DURATION_SECONDS, MIN_DURATION_SECONDS


def list_playlist(playlist_url: str) -> list[dict]:
    result = subprocess.run(
        ["yt-dlp", "--flat-playlist", "--dump-json", playlist_url],
        capture_output=True, text=True, check=True,
    )
    return [json.loads(line) for line in result.stdout.splitlines() if line.strip()]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("playlist_key", choices=sorted(ALLOWED_PLAYLISTS.keys()))
    parser.add_argument("--limit", type=int, default=15)
    args = parser.parse_args()

    playlist = ALLOWED_PLAYLISTS[args.playlist_key]
    print(f"Listando '{playlist['nome']}' ({playlist['url']})...")
    videos = list_playlist(playlist["url"])[: args.limit]

    candidatos = [
        v for v in videos
        if v.get("duration") and MIN_DURATION_SECONDS <= v["duration"] <= MAX_DURATION_SECONDS
    ]
    print(f"\n{len(candidatos)}/{len(videos)} dentro da janela de duração "
          f"({MIN_DURATION_SECONDS}-{MAX_DURATION_SECONDS}s):\n")
    for v in candidatos:
        mins = v["duration"] // 60
        secs = v["duration"] % 60
        print(f"  {v['id']}  [{mins}:{secs:02d}]  {v.get('title')}")

    print(f"\nPra ingerir um: python -m deutsch_pipeline.video.ingest_video_clip "
          f"--video-id <id> --url https://www.youtube.com/watch?v=<id> "
          f"--fonte \"{playlist['nome']}\" --channel-or-playlist \"{playlist['channel_or_playlist']}\"")


if __name__ == "__main__":
    main()
