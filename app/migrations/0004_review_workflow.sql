-- Fase 4 (CLAUDE.md) -- fecha o ciclo de confiabilidade de exercicios gerados por LLM.
-- Contexto: DeepSeek-V3 tem yield baixo (63% auto_ok bruto no lote
-- hf_deepseek-ai_DeepSeek-V3_1785884087), mas nenhum automatismo sozinho
-- (nem o Gemini a 98%) foi verificado por humano -- o schema ja previa isso
-- (validation_status inclui 'human_reviewed' desde 0001_init.sql) mas nada no
-- pipeline usava esse estado ainda. Esta migration da a base pra 3 coisas:
--   1. Gate estrutural de serving: so auto_ok/human_reviewed sao servidos.
--   2. Guardar POR QUE um item foi flagged (nao so que foi) -- ate agora
--      flag_reason/case_check/languagetool_matches so existiam no JSON local
--      de generate_batch.py, nunca chegavam no D1.
--   3. Um 5o valor de validation_status ('rejected') pra fila de revisao
--      humana poder descartar sem hard-delete (mantem auditoria de que foi
--      gerado e por que foi rejeitado).

-- validation_status agora: pending | auto_ok | flagged | human_reviewed | rejected
-- (coluna e' TEXT livre, sem CHECK constraint -- vocabulario e' convencao,
-- documentado aqui e em validation/harness.py)

ALTER TABLE exercises ADD COLUMN flag_reason TEXT;
ALTER TABLE exercises ADD COLUMN flag_detail TEXT; -- JSON: case_check/languagetool_matches/removed_alternates relevantes (validation/harness.py)

-- Gate estrutural: nenhuma query de composicao de sessao (Fase 9) deve ler
-- direto de `exercises` -- le daqui, que so expoe o que ja foi validado (auto_ok)
-- ou revisado por humano (human_reviewed). 'flagged'/'pending'/'rejected' nunca
-- aparecem aqui, mesmo que alguem esqueca o filtro no app depois.
CREATE VIEW IF NOT EXISTS servable_exercises AS
SELECT * FROM exercises
WHERE validation_status IN ('auto_ok', 'human_reviewed');
