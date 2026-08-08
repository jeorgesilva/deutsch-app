"""Fase 6 -- parser de legenda .vtt (baixada via yt-dlp) pra segmentos com
timestamp, formato que `video_transcript_segments` espera.
"""
import re
from dataclasses import dataclass

_TIME_RE = re.compile(
    r"(\d{2}):(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[.,](\d{3})"
)
_TAG_RE = re.compile(r"<[^>]+>")


def _to_seconds(h: str, m: str, s: str, ms: str) -> float:
    return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000


@dataclass
class Segment:
    start_seconds: float
    end_seconds: float
    text: str


def parse_vtt(vtt_text: str) -> list[Segment]:
    """Parser tolerante: junta linhas de texto de cada bloco, remove tags de
    estilo (<c>, <00:00:01.000>), ignora blocos duplicados consecutivos
    (comum em legenda com rolagem tipo karaoke, onde o mesmo texto aparece
    em 2-3 blocos seguidos com timestamps quase iguais)."""
    lines = vtt_text.splitlines()
    segments: list[Segment] = []
    i = 0
    while i < len(lines):
        match = _TIME_RE.search(lines[i])
        if not match:
            i += 1
            continue
        start = _to_seconds(*match.groups()[0:4])
        end = _to_seconds(*match.groups()[4:8])
        i += 1
        text_lines = []
        while i < len(lines) and lines[i].strip() and not _TIME_RE.search(lines[i]):
            text_lines.append(_TAG_RE.sub("", lines[i]).strip())
            i += 1
        text = " ".join(t for t in text_lines if t).strip()
        if text and (not segments or segments[-1].text != text):
            segments.append(Segment(start, end, text))
    return segments
