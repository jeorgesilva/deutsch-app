-- Fase 10 -- VideoMiningEngine (docs/05 item 3): usuario cola um video do
-- YouTube escolhido por ele mesmo (temptation bundling, nao curadoria como
-- o video autentico da Fase 6), assiste, anota candidatos a expressao com
-- timestamp. Sem mecanismo de correcao (docs/05: "N/A -- e' a origem de
-- novos itens do lexico, nao um exercicio corrigido") -- por isso NAO
-- passa por exercises/attempts/progress como os outros engines de hoje: as
-- notas SAO o artefato, sem nocao de certo/errado nem revisao FSRS.
CREATE TABLE video_mining_notes (
  id INTEGER PRIMARY KEY,
  video_url TEXT NOT NULL,
  timestamp_seconds REAL,
  note_text TEXT NOT NULL,
  is_candidate INTEGER DEFAULT 0,
  lexicon_id INTEGER REFERENCES lexicon(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_video_mining_notes_video ON video_mining_notes(video_url);
