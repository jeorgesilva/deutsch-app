-- Fase 13 (CLAUDE.md) -- multi-usuario. Login/logout tradicional (email+
-- senha), login obrigatorio em todo o app -- decisao do usuario. So' o
-- schema entra aqui; a conta real e' criada via POST /api/auth/register
-- (nunca com hash de senha commitado em migration versionada) e o
-- backfill de user_id nos 982 exercicios/tentativas/planos ja existentes
-- localmente e' um UPDATE de dados rodado uma vez fora do fluxo de
-- migration (documentado na sessao, nao versionado -- e' especifico deste
-- banco local, nao faz sentido reaplicar num D1 remoto vazio).

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,   -- "pbkdf2$<iteracoes>$<saltHex>$<hashHex>", ver _lib/auth.ts
  display_name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  token TEXT PRIMARY KEY,        -- 32 bytes aleatorios em hex, ver _lib/auth.ts createSession
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

-- Tabelas de ESTADO do usuario ganham user_id -- conteudo compartilhado
-- (exercises/content_topics/reading_blocks/video_clips/lexicon etc.)
-- continua sem, mesma regua ja usada em servable_exercises (Fase 4).
-- phoneme_scores nao precisa de coluna propria -- herda o dono via
-- attempts.user_id, nunca deve ser lida sem esse JOIN.
ALTER TABLE attempts ADD COLUMN user_id INTEGER REFERENCES users(id);
ALTER TABLE progress ADD COLUMN user_id INTEGER REFERENCES users(id);
ALTER TABLE session_plans ADD COLUMN user_id INTEGER REFERENCES users(id);
ALTER TABLE roleplay_sessions ADD COLUMN user_id INTEGER REFERENCES users(id);
ALTER TABLE video_mining_notes ADD COLUMN user_id INTEGER REFERENCES users(id);

-- antes desta migration, "um exercicio = uma linha de progress" era so'
-- convencao de app (_lib/progress.ts recordProgress fazia SELECT antes de
-- decidir INSERT/UPDATE, sem constraint de banco). Agora que progress e'
-- por (usuario, exercicio), a unicidade vira de verdade uma garantia de
-- schema.
CREATE UNIQUE INDEX idx_progress_user_exercise ON progress(user_id, exercise_id);
