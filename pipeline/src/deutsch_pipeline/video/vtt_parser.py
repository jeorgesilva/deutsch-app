"""Fase 6 -- parser de legenda .vtt (baixada via yt-dlp) pra segmentos com
timestamp, formato que `video_transcript_segments` espera.
"""
import re
from dataclasses import dataclass

_TIME_RE = re.compile(
    r"(\d{2}):(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[.,](\d{3})"
)
_TAG_RE = re.compile(r"<[^>]+>")
_SENTENCE_END_RE = re.compile(r"[.!?]$")


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


def merge_into_sentences(segments: list[dict]) -> list[dict]:
    """Junta blocos de legenda .vtt consecutivos até o texto bufferizado
    terminar em pontuação final (`.`/`!`/`?`) -- cada bloco de legenda é uma
    unidade de APRESENTAÇÃO de legenda (limitada por caracteres por linha/
    tempo de leitura), não uma unidade linguística: uma sentença pode ser
    cortada no meio entre 2+ blocos, ou um bloco pode conter 2 sentenças
    curtas juntas. Sem isso, "legendar" (generate_video_exercises.py) tratava
    o vídeo inteiro como 1 exercício monólito -- achado pedagógico real:
    excede memória de trabalho (~2:39min de dictation numa unidade só) e
    viola o princípio de unidade <2min do projeto. Com isso, a granularidade
    de "legendar" fica igual à de "citar" (frases curtas), cobrindo o clipe
    inteiro em sequência em vez de 3 trechos soltos.

    Opera sobre dicts genéricos (start_seconds/end_seconds/text) -- mesmo
    formato que `query_d1` devolve pra `video_transcript_segments`, sem
    precisar converter de/pra `Segment`. Ao fim, despeja o buffer restante
    mesmo sem pontuação final (garante cobertura total -- não perde a
    última sentença só porque a legenda não fechou com ponto)."""
    if not segments:
        return []
    sentences: list[dict] = []
    buffer_start: float | None = None
    buffer_text: list[str] = []
    last_end: float | None = None
    for seg in segments:
        if buffer_start is None:
            buffer_start = seg["start_seconds"]
        buffer_text.append(seg["text"])
        last_end = seg["end_seconds"]
        joined = " ".join(buffer_text).strip()
        if _SENTENCE_END_RE.search(joined):
            sentences.append({"start_seconds": buffer_start, "end_seconds": last_end, "text": joined})
            buffer_start = None
            buffer_text = []
    if buffer_text:
        joined = " ".join(buffer_text).strip()
        if joined:
            sentences.append({"start_seconds": buffer_start, "end_seconds": last_end, "text": joined})
    return sentences
