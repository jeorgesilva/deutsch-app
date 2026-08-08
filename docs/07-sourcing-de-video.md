# 07 — Sourcing de vídeo e transcrição real (aprovado)

Resposta à lacuna "onde e como os vídeos serão selecionados e apresentados" para os exercícios do Grupo E (`VideoTaskEngine` e variantes). Os engines de legendagem/citação/ditado (itens 12, 28, 29, 42, 44 de `docs/05`) já presumiam um "texto-fonte do clipe" pra comparar, mas nunca especificavam de onde esse texto vinha — essa é a lacuna que este documento fecha.

## Por que isso é mais barato que o bloco de leitura/notícia

No `docs/06` (bloco de leitura/notícia) o texto-base precisa ser **gerado do zero** pelo motor de geração, porque as fontes gratuitas de texto em alemão (DW Top-Thema, ZDF, Nachrichtenleicht) são simples demais pro nível B2/C1. Para vídeo, a situação é melhor: a DW publica conteúdo em vídeo **já no nível certo, com transcrição oficial**, então não precisa gerar nada — só extrair o que já existe.

## Ferramenta: yt-dlp

- **YouTube Data API v3** (`captions.download`) — só baixa legenda de vídeo que o próprio usuário autenticado é dono. Não serve pra vídeo de terceiro (DW, ZDF). Descartada.
- **`youtube-transcript-api`** — funciona, mas tem histórico recorrente de bloqueio de IP em 2025/2026 (principalmente IP de nuvem). Como o pipeline roda local, o risco é menor, mas é uma ferramenta mais frágil em geral.
- **`yt-dlp`** (adotada) — baixa só a legenda sem baixar o vídeo, suporta legenda manual E automática, converte pra `.srt`/`.vtt` com timestamp, tem API Python nativa (`import yt_dlp`, chamável direto do pipeline) e também lista metadados de playlist inteira sem baixar nada — uma ferramenta só pra descoberta e extração.

```
# legenda de um video especifico, sem baixar o video
yt-dlp --skip-download --write-subs --write-auto-subs --sub-langs de \
  --convert-subs vtt -o "%(id)s.%(ext)s" "<url>"

# listar uma playlist/canal inteiro so com metadados (duracao, titulo), pra filtrar candidatos
yt-dlp --flat-playlist --dump-json "<url-da-playlist>"
```

Dependência adicionada em `pipeline/pyproject.toml`.

## Fontes adotadas

| Fonte | Nível | O que oferece | Papel no projeto |
|---|---|---|---|
| **DW "Das Video-Thema"** (canal `@dwlearngerman`) | **B2/C1 explícito** | Vídeo curto + Manuskript oficial (transcrição) + vocabulário, feito pra aprendiz | **Fonte principal.** Bate exatamente no nível do projeto — melhor que qualquer fonte de texto achada pro `docs/06`. |
| **DW "Deutsche Grammatik" (B2-C2)** | B2-C2 | Vídeos explicativos de gramática | Bom pra contextualizar um `content_topic`; explicação sobre a língua, não uso autêntico — apoio, não clipe principal de legendagem/ditado. |
| **ZDF logo! Nachrichten** (`@logo-nachrichten`) | Infantil, abaixo de B1 | Vídeo diário + texto companheiro (`logo.de`) | Opcional, só como vocabulário-base/nível fácil — mesma ressalva de nível já registrada no `docs/06` pra ZDF como fonte de texto. |
| DW "Nicos Weg" | A1-B1 | Novela pedagógica com legenda | Nível errado pro projeto — descartada. |
| Cenas de filme (itens 42/44) | Variável | Sem legenda publicada geralmente | Não entram no pipeline automático — transcrição pontual manual na curadoria quando o item for usado. |

## Qualidade da legenda: manual vs. automática

`yt-dlp` distingue legenda enviada pela emissora (`--write-subs`) de ASR automático do YouTube (`--write-auto-subs`). Emissora profissional como a DW costuma publicar legenda manual (obrigação de acessibilidade), mais confiável que ASR — um erro de transcrição automática viraria um "erro" injusto pro usuário nos engines de diff determinístico. Regra adotada: o pipeline tenta legenda manual primeiro, cai pra automática só se não houver manual, e grava qual das duas foi usada (`video_clips.caption_quality`) pra decidir se o clipe entra direto ou passa por revisão humana rápida — mesma filosofia de curadoria assistida já usada em `topic_template_map`.

## Schema adotado

```sql
-- ja aplicado em app/migrations/0001_init.sql

-- video_clips ganhou dois campos novos:
--   channel_or_playlist TEXT  -- proveniencia da curadoria
--   caption_quality TEXT      -- 'manual' | 'auto' | 'revisado'

CREATE TABLE video_transcript_segments (
  id INTEGER PRIMARY KEY,
  video_clip_id INTEGER NOT NULL REFERENCES video_clips(id),
  start_seconds REAL NOT NULL,
  end_seconds REAL NOT NULL,
  text TEXT NOT NULL,
  is_manual_caption INTEGER DEFAULT 0,
  fonte_extracao TEXT  -- 'yt-dlp-manual' | 'yt-dlp-auto'
);
```

## Pipeline de seleção de vídeo

Curadoria assistida, não busca aberta na internet:

1. Lista curta de canais/playlists permitidos no config do pipeline (`@dwlearngerman`: Video-Thema, Deutsche Grammatik; `@logo-nachrichten` opcional).
2. Script lista os vídeos da playlist (`--flat-playlist --dump-json`, sem baixar nada), filtra por duração e por disponibilidade de legenda em alemão.
3. Pra cada candidato aprovado: baixa a legenda, popula `video_transcript_segments`, cria a linha em `video_clips` com a janela de tempo escolhida (`start_seconds`/`end_seconds` — um vídeo de 5-8 min pode virar 2-3 clipes menores, mantendo unidades curtas). Ligação com `content_topic_id` continua curadoria humana, mesmo padrão do `topic_template_map`.
4. Apresentação: `iframe` do YouTube, nunca baixar/re-hospedar o vídeo em si — só a transcrição (texto puro, pequena) entra no D1.

## O que isso resolve nos engines já especificados

- **`VideoTaskEngine (subtipo: legendar)`** (itens 12, 29, 42) — ganha transcrição real pra comparar (exceto cenas de filme, ver ressalva acima).
- **`VideoTaskEngine (subtipo: citar)`** (item 44) — citação exata vira trivial de conferir (mesma ressalva de filme).
- **`DictationEngine`** (item 28) — ganha uma variante de áudio autêntico (`source_type` diferencia de TTS), usando `video_transcript_segments` como gabarito.

## Direito autoral

**Regra adotada, mesma régua do `docs/06`: a transcrição nunca é mostrada ao usuário como texto pra ler antes da tentativa.** Só aparece depois, como gabarito/diff de correção — exatamente como o `DictationEngine` já fazia com TTS. Isso evita abrir uma exceção à regra de "nunca copiar texto de terceiro como conteúdo de leitura": aqui o uso é sempre pós-tentativa, como material de correção, nunca como o conteúdo em si.

Nota honesta sobre os Termos de Serviço do YouTube: tecnicamente restringem baixar conteúdo fora de um link de download oficial, e rotulam legenda automática como "só para referência pessoal" (proibindo redistribuição). Uso pessoal, não-comercial, sem redistribuir, sem mostrar a transcrição como conteúdo principal — exatamente o caso aqui — cai na leitura de risco baixo sob a qual `yt-dlp` opera há anos, mas não é uma permissão explícita confirmada. Mesma postura honesta já registrada no `docs/06` pra DW/ZDF como fonte de texto: risco baixo pra uso solo, licença não confirmada formalmente.

## Sobre a referência islcollective.com

O exemplo trazido (vídeo do Pink Panther, present simple) é conteúdo curado por humano — um professor escolheu o vídeo e escreveu o exercício à mão, em inglês, pra ESL. Não é fonte de transcrição automática nem reaproveitável como conteúdo (idioma errado, direitos de autor individual). O que vale aproveitar de lá é o formato: quiz curto amarrado a um clipe específico, foco gramatical único por exercício, estrutura pré/durante/pós-assistir — coerente com a decomposição em engines específicas já adotada, útil como referência de UX/pacing na implementação, não como fonte de dado.

## Fase de trabalho

Adicionada como Fase 6 no `CLAUDE.md` (sourcing e transcrição de vídeo do Grupo E), entre o bloco de leitura/notícia (Fase 5) e o TTS em lote (Fase 7, antiga Fase 6).
