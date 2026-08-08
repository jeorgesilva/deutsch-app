-- Fase 10 -- StructuredSpeechEngine (docs/05 item 7): usuario confirmou a
-- adaptacao pra LLM-roleplay (docs/05: "migra para o mecanismo do
-- HostileRoleplayEngine (Grupo D) com persona 'moderador', nao hostil").
-- Schema desenhado pra ser reaproveitado pelo Grupo D depois (mesmo
-- mecanismo, personas diferentes) -- por isso `engine`/`persona` sao
-- colunas livres, nao um enum fixo do item 7 especificamente.
--
-- Sessao de chat multi-turno; avaliacao so' no FECHAMENTO (evaluation_json),
-- pra nao quebrar a imersao no meio da conversa -- mesmo principio de
-- "showed_up separado de correction_json" ja usado no resto do projeto,
-- aqui expresso como "conversa livre, nota so' no final".
CREATE TABLE roleplay_sessions (
  id INTEGER PRIMARY KEY,
  engine TEXT NOT NULL,          -- 'StructuredSpeechEngine' (Grupo D reusa depois)
  persona TEXT NOT NULL,         -- 'moderador' etc -- chave pro system prompt
  topic TEXT,
  status TEXT DEFAULT 'active',  -- 'active' | 'closed'
  evaluation_json TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  closed_at TEXT
);

CREATE TABLE roleplay_messages (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES roleplay_sessions(id),
  role TEXT NOT NULL,   -- 'user' | 'assistant'
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_roleplay_messages_session ON roleplay_messages(session_id, id);
