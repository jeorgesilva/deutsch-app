"""Fase 10 (Grupo B, docs/05 item 2) -- popula ShadowingEngine clonando o
audio ja gerado/validado do DictationEngine (fonte 'tts', Fase 7). Nao ha
geracao nova: docs/05 descreve o mecanismo de correcao como "nenhuma
automatica por padrao" -- o usuario ouve o trecho-alvo, grava a si mesmo
repetindo, e ouve so a propria gravacao pra auto-comparacao (a gravacao
nunca sai do navegador, nao ha nada pro servidor validar). O mesmo audio
Piper que ja serve o DictationEngine e' um trecho-alvo igualmente valido
pra shadowing -- zero custo de geracao nova, zero risco de erro novo
(conteudo ja passou pelos 5 gates do harness quando virou DictationEngine).

Fica de fora deliberadamente: os 3 itens DictationEngine com
source_type='authentic_video' -- tem audio_ref NULL (o audio-fonte e' o
video do YouTube em si, tocado via iframe; renderDictation no frontend so
sabe tocar <audio src>, nunca foi ligado a video_clip_id) e video_clip_id
setado. Achado a parte, nao bloqueante pro ShadowingEngine: registrado no
CLAUDE.md como pendencia do DictationEngine, nao desta fatia.

Uso:
    python -m deutsch_pipeline.generation.generate_shadowing_batch
    (idempotente: aborta sem escrever nada se ShadowingEngine ja tiver
    linhas em exercises)
"""
from ..ingest.write_exercises import execute_d1, query_d1


def main():
    existing = query_d1(
        "SELECT COUNT(*) as c FROM exercises e "
        "JOIN exercise_templates et ON e.exercise_template_id = et.id "
        "WHERE et.nome = 'ShadowingEngine';"
    )
    if existing[0]["c"] > 0:
        print(f"ShadowingEngine ja tem {existing[0]['c']} exercicios -- abortando (idempotente).")
        return

    templates = {row["nome"]: row["id"] for row in query_d1("SELECT id, nome FROM exercise_templates;")}
    if "ShadowingEngine" not in templates:
        # mecanismo_correcao = 'nenhum' -- os 3 valores documentados no
        # schema (deterministico/llm_rubrica/llm_roleplay) nao cobrem
        # "sem correcao automatica por design" (docs/05 item 2); sem
        # CHECK constraint no schema, texto livre e' seguro aqui.
        execute_d1(
            "INSERT INTO exercise_templates (nome, grupo, mecanismo_correcao, requires_audio) "
            "VALUES ('ShadowingEngine', 'B', 'nenhum', 1);"
        )
        templates = {row["nome"]: row["id"] for row in query_d1("SELECT id, nome FROM exercise_templates;")}
    shadowing_id = templates["ShadowingEngine"]

    execute_d1(
        "INSERT INTO exercises (exercise_template_id, content_topic_id, phonetic_point_id, "
        "video_clip_id, variation_number, prompt, accepted_answers, source_rule, audio_ref, "
        "generated_by, validation_status, source_type) "
        "SELECT "
        f"{shadowing_id}, e.content_topic_id, e.phonetic_point_id, e.video_clip_id, "
        "e.variation_number, e.prompt, e.accepted_answers, e.source_rule, e.audio_ref, "
        "'clonado de DictationEngine (Fase 10, ShadowingEngine base -- mesmo audio, sem correcao)', "
        "e.validation_status, e.source_type "
        "FROM exercises e JOIN exercise_templates et ON e.exercise_template_id = et.id "
        "WHERE et.nome = 'DictationEngine' AND e.source_type = 'tts' "
        "AND e.validation_status IN ('auto_ok', 'human_reviewed');"
    )

    inserted = query_d1(
        "SELECT COUNT(*) as c FROM exercises e "
        "JOIN exercise_templates et ON e.exercise_template_id = et.id "
        "WHERE et.nome = 'ShadowingEngine';"
    )
    print(f"ShadowingEngine: {inserted[0]['c']} exercicios inseridos (clonados do audio TTS do DictationEngine).")


if __name__ == "__main__":
    main()
