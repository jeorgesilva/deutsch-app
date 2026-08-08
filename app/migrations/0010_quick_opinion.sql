-- Fase 11 -- QuickOpinionSpeechEngine (docs/05 item 103, "Einerseits...
-- andererseits..."). Diferente do resto do Grupo D (HostileRoleplayEngine/
-- AssignedPositionSpeechEngine, que usam roleplay_sessions/roleplay_messages,
-- sem exercises/attempts), este item volta a usar exercises/attempts --
-- docs/05 descreve o stack como "D1 (attempts) + gravacao ou texto + LLM
-- rubrica leve", nao chat multi-turno. Flash prompt: sem session_plans,
-- gerado sob demanda a cada chamada (mesmo espirito on-demand da escada de
-- exposicao), exercicio dinamico de uso unico -- mesmo padrao ja usado por
-- OpinionEssayEngine/RecordedOpinionEngine (0006/0007), so' que sem
-- reaproveitar linha entre tentativas (aqui cada tentativa e' um topico
-- novo, nao ha "o mesmo tema da semana" pra reaproveitar).
INSERT INTO exercise_templates (id, nome, grupo, mecanismo_correcao, requires_audio, requires_video)
VALUES (26, 'QuickOpinionSpeechEngine', 'D', 'llm_rubrica', 0, 0);
