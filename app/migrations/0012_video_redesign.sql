-- Fatia A (redesenho pedagogico de Video) -- achado durante a exploracao:
-- `VideoTaskEngine` (usado desde a Fase 6) nunca teve um INSERT versionado
-- em nenhuma migration -- foi criado ad-hoc via `wrangler d1 execute` em
-- algum momento (junto com varios outros templates do bloco de leitura,
-- ids 10-19/21-23, mesma classe de lacuna, fora do escopo desta fatia).
-- Um banco novo rodando as migrations do zero nao teria essa linha, e
-- `generate_video_exercises.py` depende de `exercise_templates.nome =
-- 'VideoTaskEngine'` existir. INSERT OR IGNORE -- idempotente contra o
-- banco atual (id=20 ja existe, vira no-op) e reprodutivel do zero.
INSERT OR IGNORE INTO exercise_templates (id, nome, grupo, mecanismo_correcao, requires_audio, requires_video)
VALUES (20, 'VideoTaskEngine', 'E', 'deterministico', 0, 1);
