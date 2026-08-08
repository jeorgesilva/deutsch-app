-- Fase 10 -- OpinionEssayEngine (docs/05 item 4): terceiro mecanismo de
-- correcao do projeto (LLM com rubrica estruturada), primeiro a usar.
-- Diferente do Grupo A, nao e' multiplicado por topico -- e' um unico
-- exercicio por tema semanal, criado dinamicamente quando o usuario
-- preenche o tema no planejador (nao vem do pipeline offline).

-- session_plans ganha o tema/vocabulario-alvo do escopo opinion_essay
-- (campos genericos, mas so preenchidos por esse escopo por ora) e o
-- vinculo com o exercicio dinamico criado pra ele -- assim, se o usuario
-- reabrir o planejador ou reenviar o texto, sabemos qual `exercises` row
-- reaproveitar em vez de criar uma nova a cada tentativa.
ALTER TABLE session_plans ADD COLUMN theme_text TEXT;
ALTER TABLE session_plans ADD COLUMN target_vocabulary TEXT;
ALTER TABLE session_plans ADD COLUMN exercise_id INTEGER REFERENCES exercises(id);

INSERT INTO exercise_templates (id, nome, grupo, mecanismo_correcao, requires_audio, requires_video)
VALUES (24, 'OpinionEssayEngine', 'B', 'llm_rubrica', 0, 0);
