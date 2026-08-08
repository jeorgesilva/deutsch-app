-- Schema inicial D1 (SQLite) — consolida docs/01, docs/02 e docs/03.
-- Rodar com: npm run db:migrate:local  (depois db:migrate:remote quando o banco existir de verdade)

-- Conteudo/topicos gramaticais — fonte: Planilha_Gramatica_Alema_B2C1.xlsx
CREATE TABLE content_topics (
  id INTEGER PRIMARY KEY,
  categoria TEXT NOT NULL,
  capitulo TEXT,
  topico TEXT NOT NULL,
  nivel TEXT,
  regra TEXT NOT NULL,
  exemplo TEXT,
  fonte TEXT
);

-- Pontos foneticos — fonte: Planilha_Fonetica_Pronuncia_Alema.xlsx
CREATE TABLE phonetic_points (
  id INTEGER PRIMARY KEY,
  categoria TEXT NOT NULL,
  topico TEXT NOT NULL,
  prioridade TEXT,
  descricao TEXT NOT NULL,
  exemplo TEXT,
  fonte TEXT
);

-- Lexico — ver docs/04-prompt-inicial-claude-code.md para a estrategia de povoamento
CREATE TABLE lexicon (
  id INTEGER PRIMARY KEY,
  lemma TEXT NOT NULL,
  pos TEXT NOT NULL,
  gender TEXT,
  plural TEXT,
  ipa TEXT,
  cefr_level TEXT,
  example_sentence TEXT,
  source TEXT,
  audio_ref TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Templates reutilizaveis do Grupo A (e os de roleplay do Grupo D)
CREATE TABLE exercise_templates (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  grupo TEXT NOT NULL,               -- A | B | D | E (ver docs/02)
  mecanismo_correcao TEXT NOT NULL,  -- 'deterministico' | 'llm_rubrica' | 'llm_roleplay'
  requires_audio INTEGER DEFAULT 0,
  requires_video INTEGER DEFAULT 0
);

-- Curadoria manual: quais templates fazem sentido para quais topicos/pontos foneticos
CREATE TABLE topic_template_map (
  id INTEGER PRIMARY KEY,
  content_topic_id INTEGER REFERENCES content_topics(id),
  phonetic_point_id INTEGER REFERENCES phonetic_points(id),
  exercise_template_id INTEGER NOT NULL REFERENCES exercise_templates(id)
);

-- Clipes de video (ZDF/DW/cenas de filme) — so link + timestamp, sem armazenar midia
CREATE TABLE video_clips (
  id INTEGER PRIMARY KEY,
  url TEXT NOT NULL,
  start_seconds INTEGER,
  end_seconds INTEGER,
  fonte TEXT,
  content_topic_id INTEGER REFERENCES content_topics(id),
  notes TEXT,
  channel_or_playlist TEXT,  -- proveniencia da curadoria (ver docs/07-sourcing-de-video.md)
  caption_quality TEXT       -- 'manual' | 'auto' | 'revisado' — legenda da emissora vs ASR do YouTube
);

-- Exercicios gerados (saida do pipeline)
CREATE TABLE exercises (
  id INTEGER PRIMARY KEY,
  exercise_template_id INTEGER NOT NULL REFERENCES exercise_templates(id),
  content_topic_id INTEGER REFERENCES content_topics(id),
  phonetic_point_id INTEGER REFERENCES phonetic_points(id),
  video_clip_id INTEGER REFERENCES video_clips(id),
  variation_number INTEGER,
  prompt TEXT NOT NULL,
  accepted_answers TEXT,   -- JSON
  source_rule TEXT,        -- regra/exemplo usado como few-shot na geracao
  audio_ref TEXT,
  generated_by TEXT,
  validation_status TEXT DEFAULT 'pending',  -- pending | auto_ok | flagged | human_reviewed
  source_type TEXT,        -- 'tts' | 'authentic_video' | null — origem do audio-alvo (docs/08-fonetica-e-fala.md)
  created_at TEXT DEFAULT (datetime('now'))
);

-- Tentativas do usuario. Note showed_up separado de correction_json —
-- validacao de exposicao nunca se mistura com feedback de idioma (docs/03).
CREATE TABLE attempts (
  id INTEGER PRIMARY KEY,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id),
  user_response TEXT,
  audio_ref TEXT,          -- Google Drive file id, se for gravacao de pronuncia
  attempted_at TEXT DEFAULT (datetime('now')),
  showed_up INTEGER DEFAULT 1,
  correction_json TEXT     -- JSON: {errors:[...], strengths:[...], cefr_estimate, ...}
);

-- Progresso / FSRS (substitui Leitner fisico)
CREATE TABLE progress (
  id INTEGER PRIMARY KEY,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id),
  stability REAL,
  difficulty REAL,
  last_review_at TEXT,
  next_review_at TEXT,
  reps INTEGER DEFAULT 0,
  lapses INTEGER DEFAULT 0
);

-- Implementation intentions (memoria prospectiva — docs/03)
CREATE TABLE session_plans (
  id INTEGER PRIMARY KEY,
  scope TEXT NOT NULL,     -- ex: 'motor semanal - shadowing', 'revisao FSRS'
  when_text TEXT,
  where_text TEXT,
  scheduled_for TEXT,
  completed_at TEXT
);

-- Bloco de leitura/noticia (aprovado — ver docs/06-bloco-texto-noticias.md).
-- texto_base e SEMPRE gerado original pelo motor de geracao, citando a fonte
-- so como inspiracao factual — nunca copiado literal de DW/ZDF/Nachrichtenleicht.
CREATE TABLE reading_blocks (
  id INTEGER PRIMARY KEY,
  titulo TEXT NOT NULL,
  texto_base TEXT NOT NULL,
  fonte_factual TEXT,      -- ex: 'DW', 'ZDF', 'Nachrichtenleicht' — inspiracao, nao copia
  fonte_url TEXT,
  nivel TEXT,
  content_topic_id INTEGER REFERENCES content_topics(id),
  created_at TEXT DEFAULT (datetime('now'))
);

-- Liga exercicios (das 10 engines novas: Matching, TrueFalse, ComprehensionQA,
-- PredictThenVerify, LetterAnagram, ParagraphOrder, BinaryChoice, VowelInsert,
-- PunctuationCaps, CompoundSegmentation) a um bloco, com ordem obrigatoria.
-- Conclusao do bloco = query (todo item filho com attempt), nao um flag guardado.
CREATE TABLE reading_block_items (
  id INTEGER PRIMARY KEY,
  reading_block_id INTEGER NOT NULL REFERENCES reading_blocks(id),
  exercise_id INTEGER NOT NULL REFERENCES exercises(id),
  ordem INTEGER NOT NULL
);

-- Transcricao real (aprovado — ver docs/07-sourcing-de-video.md), extraida via
-- yt-dlp (legenda manual da emissora com fallback pra ASR automatico, nunca a
-- YouTube Data API oficial — essa so serve video do proprio dono do canal).
-- Usada SEMPRE como gabarito pos-tentativa (VideoTaskEngine legendar/citar,
-- variante autentica do DictationEngine) — nunca mostrada como texto pra ler
-- antes do usuario tentar, mesma regra do reading_blocks acima.
CREATE TABLE video_transcript_segments (
  id INTEGER PRIMARY KEY,
  video_clip_id INTEGER NOT NULL REFERENCES video_clips(id),
  start_seconds REAL NOT NULL,
  end_seconds REAL NOT NULL,
  text TEXT NOT NULL,
  is_manual_caption INTEGER DEFAULT 0,  -- 1 = legenda oficial da emissora, 0 = ASR automatico
  fonte_extracao TEXT  -- 'yt-dlp-manual' | 'yt-dlp-auto'
);

-- Comparacao fonema a fonema (aprovado — ver docs/08-fonetica-e-fala.md).
-- target_ipa vem de phonemizer/espeak-ng sobre o texto de referencia;
-- recognized_ipa vem de um reconhecedor de fones local (wav2vec2-espeak ou
-- allosaurus — piloto empirico decide qual, por isso recognizer_model fica
-- registrado por linha, permitindo comparar candidatos no mesmo attempt).
CREATE TABLE phoneme_scores (
  id INTEGER PRIMARY KEY,
  attempt_id INTEGER NOT NULL REFERENCES attempts(id),
  target_ipa TEXT NOT NULL,
  recognized_ipa TEXT NOT NULL,
  diff_json TEXT NOT NULL,   -- JSON: alinhamento fonema a fonema (substituicoes/insercoes/omissoes)
  recognizer_model TEXT,     -- 'wav2vec2-espeak' | 'allosaurus' | 'azure' (benchmark)
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_exercises_topic ON exercises(content_topic_id);
CREATE INDEX idx_attempts_exercise ON attempts(exercise_id);
CREATE INDEX idx_progress_next_review ON progress(next_review_at);
CREATE INDEX idx_reading_block_items_block ON reading_block_items(reading_block_id, ordem);
CREATE INDEX idx_video_transcript_segments_clip ON video_transcript_segments(video_clip_id, start_seconds);
CREATE INDEX idx_phoneme_scores_attempt ON phoneme_scores(attempt_id);
