"""Curadoria "TransitionPhraseEngine / ReactionPhraseEngine" (docs/05 itens 93/94,
CLAUDE.md -- pendencia "Achado a parte... curadoria propria antes de gerar").

Popula os 36 pares gatilho->frase aprovados por Jeorge (curadoria humana em cima de
um rascunho do hf:deepseek-ai/DeepSeek-V3, semente em Planilha_Exercicios_C1plus.xlsx
itens 93/94) como content_topics (categoria nova "19. Frases fixas") +
topic_template_map + exercises.

Diferente dos outros 7 engines do Grupo A: aqui nao ha passo de geracao por LLM nem
harness de validacao (validation/harness.py) -- o gatilho (situacao em portugues) e'
o proprio prompt do card, as frases variantes em alemao sao os accepted_answers
(mecanismo deterministico com multiplas variantes aceitas), e nao sao frases
completas pra rodar LanguageTool (fragmentos terminados em "..."). validation_status
fica 'human_reviewed' direto -- curadoria manual (rascunho DeepSeek-V3 revisado por
Jeorge + Claude), nunca 'auto_ok' dos gates automaticos que nao se aplicam aqui.

4 correcoes aplicadas na curadoria (2 duplicatas obrigatorias + 2 ajustes de
registro/funcao, aprovadas no chat antes deste script existir):
  - Reacao par 6 ("descrenca"): "Das ist ja unglaublich!" (duplicava o par 1)
    -> "Das gibt's doch nicht!"
  - Transicao par 13 ("opiniao ponderada"): "Es ist meine Überzeugung, dass..."
    (duplicava o par 4) -> "Alles in allem würde ich sagen, dass..."
  - Transicao par 15 ("contribuicao formal"): "Ich möchte meinen Beitrag dazu
    leisten, dass..." (funciona como frase de acao, nao de opiniao -- "leisten"
    nao puxa naturalmente um "dass" de opiniao) -> "Ich möchte hierzu Folgendes
    beitragen:"
  - Transicao par 18 ("perspectiva baseada em dados"): "Datenbasiert betrachtet..."
    (gramatical mas artificial como adverbio) -> "Datengestützt betrachtet..."

Uso:
    python -m deutsch_pipeline.ingest.seed_phrase_bank
    (precisa que exercise_templates ja tenha as linhas TransitionPhraseEngine/
    ReactionPhraseEngine -- ja tem, seed_template_map.py Fase 2. Aborta sem
    escrever nada se a categoria "19. Frases fixas" ja existir no D1 -- rodar de
    novo sem limpar antes duplicaria os cards.)

Saida: grava no D1 local e registra o SQL aplicado em
    app/migrations/0005_seed_phrase_bank.sql
"""
from pathlib import Path

from .write_exercises import build_insert, execute_d1, query_d1, sql_value

REPO_ROOT = Path(__file__).resolve().parents[4]
OUT_MIGRATION = REPO_ROOT / "app" / "migrations" / "0005_seed_phrase_bank.sql"

CATEGORIA = "19. Frases fixas"
FONTE = ("Planilha_Exercicios_C1plus.xlsx (itens 93/94) -- rascunho "
         "hf:deepseek-ai/DeepSeek-V3, curadoria humana (Jeorge + Claude, 2026-08-05)")
TRANSICAO_REGRA = "Frase fixa de transição, registro formal — parágrafo escrito ou speech formal."
REACAO_REGRA = "Frase fixa de reação, registro coloquial — áudio de opinião ou conversa real."

# gatilho (portugues, vira o prompt do card) -> [frases variantes em alemao, viram accepted_answers]
TRANSICAO: list[tuple[str, list[str]]] = [
    ("abrir uma opinião em registro formal",
     ["Meiner Ansicht nach...", "Aus meiner Sichtweise heraus..."]),
    ("introduzir uma perspectiva pessoal formalmente",
     ["Ich bin der Auffassung, dass...", "Ich vertrete die Ansicht, dass..."]),
    ("expressar uma opinião de maneira acadêmica",
     ["Nach meiner Einschätzung...", "Aus fachlicher Perspektive betrachtet..."]),
    ("iniciar uma argumentação formal",
     ["Es ist meine Überzeugung, dass...", "Ich bin fest davon überzeugt, dass..."]),
    ("apresentar uma visão formal",
     ["Nach meiner persönlichen Erfahrung...", "Aus meiner beruflichen Perspektive..."]),
    ("declarar uma opinião profissional",
     ["Ich bin der Meinung, dass...", "Ich halte es für richtig, dass..."]),
    ("começar uma reflexão formal",
     ["Es lässt sich aus meiner Sicht feststellen, dass...", "Ich möchte betonen, dass..."]),
    ("introduzir um ponto de vista formal",
     ["Nach reiflicher Überlegung...", "Aus meiner langjährigen Erfahrung heraus..."]),
    ("expressar uma consideração formal",
     ["Ich möchte darauf hinweisen, dass...", "Es ist mir wichtig zu betonen, dass..."]),
    ("iniciar uma análise formal",
     ["Aus analytischer Sicht...", "Nach einer sorgfältigen Prüfung..."]),
    ("apresentar uma conclusão pessoal formal",
     ["Ich komme zu dem Schluss, dass...", "Nach meiner Analyse..."]),
    ("declarar uma opinião fundamentada",
     ["Basierend auf den vorliegenden Daten...", "Unter Berücksichtigung aller Faktoren..."]),
    ("expressar uma opinião ponderada",
     ["Nach Abwägung aller Argumente...", "Alles in allem würde ich sagen, dass..."]),  # corrigido (dupe do par 4)
    ("introduzir uma reflexão crítica formal",
     ["Kritisch betrachtet...", "Aus einer kritischen Perspektive heraus..."]),
    ("começar uma contribuição formal",
     ["Ich möchte hierzu Folgendes beitragen:", "Es ist mir ein Anliegen, darauf hinzuweisen..."]),  # corrigido (funcao)
    ("apresentar uma visão baseada em evidências",
     ["Gestützt auf die verfügbaren Beweise...", "Aufgrund der vorliegenden Beweislage..."]),
    ("expressar uma opinião baseada em estudos",
     ["Laut meiner Forschungsarbeit...", "Nach meinen Studien..."]),
    ("introduzir uma perspectiva baseada em dados",
     ["Datengestützt betrachtet...", "Aus der Datenanalyse ergibt sich..."]),  # corrigido (estilo)
]

REACAO: list[tuple[str, list[str]]] = [
    ("expressar surpresa com algo inesperado",
     ["Das ist ja unglaublich!", "Wow, das hätte ich nie gedacht!"]),
    ("concordar fortemente com algo",
     ["Genau so ist es!", "Da bin ich ganz deiner Meinung!"]),
    ("discordar educadamente de algo",
     ["Da bin ich anderer Meinung.", "Ich sehe das etwas anders."]),
    ("expressar dúvida sobre uma afirmação",
     ["Wirklich? Das ist schwer zu glauben.", "Bist du dir da sicher?"]),
    ("mostrar entusiasmo por uma ideia",
     ["Das klingt super!", "Ich bin total begeistert!"]),
    ("reagir com descrença a algo que ouviu",
     ["Das kann ich kaum glauben!", "Das gibt's doch nicht!"]),  # corrigido (dupe do par 1)
    ("expressar alívio após uma preocupação",
     ["Gott sei Dank!", "Das ist ja eine Erleichterung!"]),
    ("mostrar indiferença sobre um assunto",
     ["Das ist mir egal.", "Das juckt mich nicht."]),
    ("expressar admiração por alguém",
     ["Ich bin echt beeindruckt!", "Respekt, das ist echt stark!"]),
    ("reagir com espanto a uma notícia",
     ["Das ist ja Wahnsinn!", "Unglaublich, was da passiert ist!"]),
    ("expressar confusão sobre algo",
     ["Ich verstehe nur Bahnhof.", "Das ergibt für mich keinen Sinn."]),
    ("mostrar apoio a uma decisão",
     ["Ich stehe voll hinter dir.", "Das ist genau der richtige Schritt!"]),
    ("expressar frustração com uma situação",
     ["Das geht mir echt auf die Nerven!", "So ein Mist!"]),
    ("reagir com incredulidade a uma proposta",
     ["Das kann doch nicht dein Ernst sein!", "Bist du jetzt völlig verrückt?"]),
    ("expressar satisfação com um resultado",
     ["Das hat ja super geklappt!", "Ich bin echt zufrieden damit!"]),
    ("mostrar ceticismo sobre um plano",
     ["Das klingt mir zu riskant.", "Ob das wirklich funktioniert?"]),
    ("expressar otimismo sobre o futuro",
     ["Das wird schon klappen!", "Ich bin da ganz zuversichtlich!"]),
    ("reagir com desânimo a uma notícia ruim",
     ["Das ist echt hart!", "Da bin ich echt enttäuscht."]),
]


def build_content_topic_insert(capitulo: str, gatilho: str, regra: str, exemplo: str) -> str:
    values = [
        sql_value(CATEGORIA), sql_value(capitulo), sql_value(gatilho),
        sql_value("C1"), sql_value(regra), sql_value(exemplo), sql_value(FONTE),
    ]
    return ("INSERT INTO content_topics (categoria, capitulo, topico, nivel, regra, exemplo, fonte) "
            f"VALUES ({', '.join(values)});")


def main():
    existing = query_d1(f"SELECT COUNT(*) AS n FROM content_topics WHERE categoria = {sql_value(CATEGORIA)};")
    if existing[0]["n"] > 0:
        print(f"Categoria {CATEGORIA!r} já tem {existing[0]['n']} linhas em content_topics -- "
              "abortando pra não duplicar. Limpe manualmente antes de rodar de novo, se for o caso.")
        return

    # 1) content_topics
    topic_statements = [build_content_topic_insert("Transição", gatilho, TRANSICAO_REGRA, frases[0])
                         for gatilho, frases in TRANSICAO]
    topic_statements += [build_content_topic_insert("Reação", gatilho, REACAO_REGRA, frases[0])
                          for gatilho, frases in REACAO]
    execute_d1("\n".join(topic_statements))

    # 2) resolve ids recem-criados por nome (mesmo padrao de write_exercises.main())
    rows = query_d1(f"SELECT id, topico FROM content_topics WHERE categoria = {sql_value(CATEGORIA)};")
    topic_id = {row["topico"]: row["id"] for row in rows}
    templates = {row["nome"]: row["id"] for row in query_d1("SELECT id, nome FROM exercise_templates;")}
    transicao_engine_id = templates["TransitionPhraseEngine"]
    reacao_engine_id = templates["ReactionPhraseEngine"]

    # 3) topic_template_map + exercises
    map_statements, exercise_statements = [], []
    for gatilho, frases, engine_id, regra in (
        [(g, f, transicao_engine_id, TRANSICAO_REGRA) for g, f in TRANSICAO]
        + [(g, f, reacao_engine_id, REACAO_REGRA) for g, f in REACAO]
    ):
        ctid = topic_id[gatilho]
        map_statements.append(
            "INSERT INTO topic_template_map (content_topic_id, phonetic_point_id, exercise_template_id) "
            f"VALUES ({ctid}, NULL, {engine_id});"
        )
        ex = {
            "prompt": gatilho,
            "accepted_answers": frases,
            "source_rule": regra,
            "generated_by": "hf:deepseek-ai/DeepSeek-V3 + curadoria humana",
            "validation_status": "human_reviewed",
        }
        exercise_statements.append(build_insert(ex, ctid, engine_id))

    execute_d1("\n".join(map_statements))
    execute_d1("\n".join(exercise_statements))

    # 4) registra o SQL aplicado, mesmo padrao dos outros arquivos de migration gerados por script
    lines = [
        "-- Curadoria TransitionPhraseEngine/ReactionPhraseEngine (docs/05 itens 93/94).",
        "-- Gerado por pipeline/src/deutsch_pipeline/ingest/seed_phrase_bank.py -- nao editar a mao.",
        "",
        f"-- content_topics: {len(topic_statements)} linhas (categoria {CATEGORIA!r})",
        *topic_statements,
        "",
        f"-- topic_template_map: {len(map_statements)} linhas",
        *map_statements,
        "",
        f"-- exercises: {len(exercise_statements)} linhas (validation_status='human_reviewed')",
        *exercise_statements,
        "",
    ]
    OUT_MIGRATION.parent.mkdir(parents=True, exist_ok=True)
    OUT_MIGRATION.write_text("\n".join(lines), encoding="utf-8")

    print(f"{len(topic_statements)} content_topics, {len(map_statements)} topic_template_map, "
          f"{len(exercise_statements)} exercises inseridos.")
    print(f"SQL de registro escrito em {OUT_MIGRATION}")


if __name__ == "__main__":
    main()
