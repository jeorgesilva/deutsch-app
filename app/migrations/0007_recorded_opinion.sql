-- Fase 10 -- RecordedOpinionEngine (docs/05 itens 5 e 25: "Áudio de opinião
-- gravado" / "Audio journal", mesma engine, item 25 sem roteiro fixo).
-- Sem correcao automatica (mesmo mecanismo do ShadowingEngine -- 'nenhum'):
-- so valida exposicao (showed_up=1). Reusa session_plans.theme_text (ja
-- adicionado em 0006) como campo de ROTEIRO opcional pro escopo
-- opinion_audio -- generico o bastante, sem precisar de coluna nova.
INSERT INTO exercise_templates (id, nome, grupo, mecanismo_correcao, requires_audio, requires_video)
VALUES (25, 'RecordedOpinionEngine', 'B', 'nenhum', 1, 0);
