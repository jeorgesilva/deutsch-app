"""Fase 15 -- geração diária automatizada de vídeo (docs/16, "Fase 13:
multi-usuário" e "Fase 14: dashboard" já tinham decisões próprias; esta é
posterior às duas, sem doc numerado ainda). Escolhe o PRÓXIMO vídeo ainda não
ingerido da playlist já curada (`video/channels.py`, `dw_video_thema` --
mesma allowlist da Fase 6, seleção automática DENTRO dela, sem confirmação
humana do tópico -- decisão do usuário, distinta da curadoria assistida
original de docs/07), ingere a legenda real e gera os 6 exercícios
(legendar/dictation/citar + TrueFalse/ComprehensionQA/Matching) na mesma
chamada.

Idempotente/self-contido: cada chamada consulta o D1 pra saber quais vídeos
já existem, sem estado passado de fora -- pode ser chamada em loop (batch
diário) ou uma vez (teste manual) sem diferença de comportamento.

Uso:
    python -m deutsch_pipeline.video.daily_batch --model hf:deepseek-ai/DeepSeek-V3
"""
import argparse
import tempfile
from pathlib import Path

from .channels import ALLOWED_PLAYLISTS, MAX_DURATION_SECONDS, MIN_DURATION_SECONDS
from .generate_video_comprehension import generate_all_comprehension_for_clip
from .generate_video_exercises import generate_exercises_for_clip
from .ingest_video_clip import download_subs, write_segments, write_video_clip
from .list_candidates import list_playlist
from .vtt_parser import parse_vtt
from ..ingest.write_exercises import query_d1

PLAYLIST_KEY = "dw_video_thema"
CANDIDATE_LIMIT = 60  # janela de busca ampla -- a maioria já pode estar ingerida


def already_ingested_ids() -> set[str]:
    rows = query_d1("SELECT url FROM video_clips WHERE start_seconds IS NULL;")
    return {row["url"].rsplit("=", 1)[-1] for row in rows}


def _real_duration(video_id: str) -> int | None:
    """`--flat-playlist --dump-json` (list_playlist) não devolve `duration`
    pra esta playlist -- achado real rodando isto pela primeira vez de forma
    automatizada (a curadoria manual da Fase 6 nunca dependia desse campo,
    o humano só olhava a lista e escolhia). Sem esse fallback, TODO candidato
    caía fora da janela de duração e o batch nunca achava vídeo novo nenhum.
    1 chamada de metadado real por candidato ainda não visto (skip_download,
    sem baixar vídeo) -- caro por candidato, mas só roda pros poucos ainda
    não ingeridos, nunca pra playlist inteira."""
    import yt_dlp

    opts = {"skip_download": True, "quiet": True, "no_warnings": True}
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
    return info.get("duration")


def pick_next_candidate() -> dict | None:
    playlist = ALLOWED_PLAYLISTS[PLAYLIST_KEY]
    videos = list_playlist(playlist["url"])[:CANDIDATE_LIMIT]
    seen = already_ingested_ids()
    for v in videos:
        if v["id"] in seen:
            continue
        duration = v.get("duration") or _real_duration(v["id"])
        if not duration or not (MIN_DURATION_SECONDS <= duration <= MAX_DURATION_SECONDS):
            continue
        v["duration"] = duration
        return v
    return None


def ingest_next_new_video(model: str) -> dict:
    playlist = ALLOWED_PLAYLISTS[PLAYLIST_KEY]
    candidate = pick_next_candidate()
    if candidate is None:
        return {"skipped": True, "reason": "sem vídeo novo disponível na playlist (dentro da janela de duração)"}

    video_id = candidate["id"]
    video_url = f"https://www.youtube.com/watch?v={video_id}"

    with tempfile.TemporaryDirectory() as tmp:
        vtt_path, quality = download_subs(video_url, Path(tmp))
        vtt_text = vtt_path.read_text(encoding="utf-8")

    segments = parse_vtt(vtt_text)
    clip_id = write_video_clip(
        video_id, video_url, playlist["nome"], playlist["channel_or_playlist"], quality,
        content_topic_id=None,
    )
    fonte_extracao = "yt-dlp-manual" if quality == "manual" else "yt-dlp-auto"
    n_segments = write_segments(clip_id, segments, fonte_extracao)

    exercicios = generate_exercises_for_clip(clip_id, model)
    compreensao = generate_all_comprehension_for_clip(clip_id, model)

    return {
        "skipped": False,
        "video_id": video_id,
        "video_clip_id": clip_id,
        "titulo": candidate.get("title"),
        "caption_quality": quality,
        "n_segments": n_segments,
        "exercicios": exercicios,
        "compreensao": {k: v["written"] for k, v in compreensao.items()},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", default="hf:deepseek-ai/DeepSeek-V3")
    args = parser.parse_args()

    result = ingest_next_new_video(args.model)
    if result["skipped"]:
        print(f"[skip] {result['reason']}")
        return
    print(f"video_clip_id={result['video_clip_id']} ('{result['titulo']}', {result['n_segments']} segmentos, "
          f"legenda {result['caption_quality']})")
    print(f"  exercicios: {result['exercicios']}")
    print(f"  compreensao: {result['compreensao']}")


if __name__ == "__main__":
    main()
