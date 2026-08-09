-- docs/14 -- dashboard de progresso e geracao sob demanda. Duas peças de
-- schema que faltavam, achadas inspecionando 0001_init.sql/0011_users.sql
-- de verdade (nao suposicao): `attempts` nao tinha coluna de acerto/erro
-- (so showed_up/correction_json), e nao existia ligacao nenhuma entre
-- `exercises` e `lexicon`.

-- Acerto/erro por tentativa. NULLABLE de proposito -- NULL pra engines sem
-- correcao binaria (Shadowing, RecordedOpinion, rubrica de LLM de escrita
-- aberta/roleplay), nunca false. Gravada no mesmo ponto onde o Worker ja
-- decide Rating.Good/Again pro FSRS (attempts.ts/recordProgress) -- nao
-- reprocessa logica de correcao em tempo real em lugar nenhum daqui pra
-- frente.
ALTER TABLE attempts ADD COLUMN correct INTEGER;

-- Liga exercicio a lemma do lexico -- conteudo, sem user_id, mesma regua
-- ja usada em topic_template_map (curadoria/derivacao de conteudo
-- compartilhado, nao estado por usuario). Povoada via spaCy lematizando o
-- texto reconstruido de cada exercicio contra lexicon.lemma.
CREATE TABLE exercise_lexicon_refs (
  id INTEGER PRIMARY KEY,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id),
  lexicon_id INTEGER NOT NULL REFERENCES lexicon(id)
);

-- Job assincrono de geracao sob demanda (docs/14): disparo sempre por acao
-- explicita do usuario, nunca automatico. status: 'pending' | 'running' |
-- 'done' | 'failed'. Frontend faz polling -- nunca trava esperando
-- sincrono (um lote pode levar dezenas de segundos a minutos).
CREATE TABLE topic_regeneration_jobs (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  content_topic_id INTEGER NOT NULL REFERENCES content_topics(id),
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  error TEXT
);

CREATE INDEX idx_exercise_lexicon_refs_exercise ON exercise_lexicon_refs(exercise_id);
CREATE INDEX idx_exercise_lexicon_refs_lexicon ON exercise_lexicon_refs(lexicon_id);
CREATE INDEX idx_topic_regeneration_jobs_user ON topic_regeneration_jobs(user_id, status);
