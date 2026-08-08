"""Fase 6 (CLAUDE.md, docs/07-sourcing-de-video.md) -- lista curada de canais/
playlists permitidos pro sourcing de vídeo. Curadoria assistida, não busca
aberta -- mesmo padrão do `topic_template_map` (Fase 2): a fonte é escolhida
por humano, não descoberta automática.
"""

ALLOWED_PLAYLISTS = {
    "dw_video_thema": {
        "url": "https://www.youtube.com/playlist?list=PL5113EDF7E1116D32",
        "nome": "DW Das Video-Thema",
        "nivel": "B2/C1",
        "channel_or_playlist": "@dwlearngerman / Das Video-Thema",
    },
}

# Duracao em segundos -- vídeos de 5-8 min viram 2-3 clipes menores (docs/07),
# mas pro pipeline automatico filtramos por um teto que ainda cabe como
# clipe unico sem precisar cortar manualmente.
MIN_DURATION_SECONDS = 60
MAX_DURATION_SECONDS = 360
