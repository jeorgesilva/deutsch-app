// docs/14 -- dashboard de progresso. Quatro agregacoes, todas escopadas por
// user_id (estado do usuario, mesma regua de progress/session_plans desde a
// Fase 13). Nenhuma delas grava nada -- so leitura.
import { GRAMMAR_TEMPLATES, PHONETICS_TEMPLATES } from "./types";

export interface TopicMasteryRow {
  content_topic_id: number;
  categoria: string;
  topico: string;
  total: number;
  mastered: number;
  fraction: number; // mastered/total, 0-1
  dominated: boolean; // fraction === 1 -- mesmo criterio que decide o botao de geracao sob demanda (Passo 5)
}

// Fracao do lote ja "dominada" (docs/14: pelo menos 1 acerto por exercicio,
// nao acerto de primeira -- puniria aprendizado normal). Diferente do
// mastery_pct de _lib/categories.ts (usado nos cards da home), que e' uma
// heuristica de RETENCAO via FSRS (stability/21 dias) -- os dois convivem
// de proposito, servem telas/perguntas diferentes (retencao ao longo do
// tempo vs. "ja vi esse exercicio certo pelo menos uma vez").
export async function getTopicMastery(
  db: D1Database,
  userId: number,
  group: "grammar" | "phonetics"
): Promise<TopicMasteryRow[]> {
  const templates = group === "grammar" ? GRAMMAR_TEMPLATES : PHONETICS_TEMPLATES;
  const sourceTable = group === "grammar" ? "content_topics" : "phonetic_points";
  const topicIdCol = group === "grammar" ? "content_topic_id" : "phonetic_point_id";
  const placeholders = templates.map(() => "?").join(",");

  const rows = await db
    .prepare(
      `SELECT src.id as content_topic_id, src.categoria as categoria, src.topico as topico,
              COUNT(DISTINCT e.id) as total,
              COUNT(DISTINCT mastered.exercise_id) as mastered
       FROM ${sourceTable} src
       JOIN servable_exercises e ON e.${topicIdCol} = src.id
       JOIN exercise_templates et ON et.id = e.exercise_template_id
       LEFT JOIN (
         SELECT DISTINCT exercise_id FROM attempts WHERE user_id = ? AND correct = 1
       ) mastered ON mastered.exercise_id = e.id
       WHERE et.nome IN (${placeholders})
       GROUP BY src.id
       ORDER BY src.id ASC`
    )
    .bind(userId, ...templates)
    .all<{ content_topic_id: number; categoria: string; topico: string; total: number; mastered: number }>();

  return (rows.results ?? []).map((r) => ({
    ...r,
    fraction: r.total > 0 ? r.mastered / r.total : 0,
    dominated: r.total > 0 && r.mastered === r.total,
  }));
}

export interface UsageDay {
  date: string; // YYYY-MM-DD
  count: number;
}

export async function getUsageCalendar(db: D1Database, userId: number): Promise<UsageDay[]> {
  const rows = await db
    .prepare(
      `SELECT date(attempted_at) as date, COUNT(*) as count
       FROM attempts
       WHERE user_id = ?
       GROUP BY date(attempted_at)
       ORDER BY date ASC`
    )
    .bind(userId)
    .all<UsageDay>();
  return rows.results ?? [];
}

export interface VocabularyWord {
  lexicon_id: number;
  lemma: string;
  pos: string;
  gender: string | null;
  plural: string | null;
  ipa: string | null;
  cefr_level: string | null;
  example_sentence: string | null;
}

export interface VocabularyStats {
  total: number;
  by_pos: Record<string, number>;
  words: VocabularyWord[] | null; // so preenchido quando `pos` foi passado (detalhamento sob demanda)
}

// "Contato" = pelo menos 1 attempt correct=1 num exercicio que referencia o
// lemma (exercise_lexicon_refs) -- contagem de LEMMAS distintos, nao de
// eventos (docs/14).
export async function getVocabularyStats(
  db: D1Database,
  userId: number,
  pos: string | null
): Promise<VocabularyStats> {
  const contactedIds = await db
    .prepare(
      `SELECT DISTINCT l.id as id, l.pos as pos
       FROM lexicon l
       JOIN exercise_lexicon_refs elr ON elr.lexicon_id = l.id
       JOIN attempts a ON a.exercise_id = elr.exercise_id
       WHERE a.user_id = ? AND a.correct = 1`
    )
    .bind(userId)
    .all<{ id: number; pos: string }>();

  const rows = contactedIds.results ?? [];
  const by_pos: Record<string, number> = {};
  for (const r of rows) by_pos[r.pos] = (by_pos[r.pos] ?? 0) + 1;

  let words: VocabularyWord[] | null = null;
  if (pos) {
    const detail = await db
      .prepare(
        `SELECT DISTINCT l.id as lexicon_id, l.lemma, l.pos, l.gender, l.plural, l.ipa, l.cefr_level, l.example_sentence
         FROM lexicon l
         JOIN exercise_lexicon_refs elr ON elr.lexicon_id = l.id
         JOIN attempts a ON a.exercise_id = elr.exercise_id
         WHERE a.user_id = ? AND a.correct = 1 AND l.pos = ?
         ORDER BY l.lemma ASC`
      )
      .bind(userId, pos)
      .all<VocabularyWord>();
    words = detail.results ?? [];
  }

  return { total: rows.length, by_pos, words };
}

export interface WordOfTheDay {
  lexicon_id: number;
  lemma: string;
  pos: string;
  gender: string | null;
  plural: string | null;
  ipa: string | null;
  // "definicao" nao existe como dado real em lugar nenhum do projeto (nem
  // lexicon nem lookupWiktionary tem esse campo) -- nunca fabricar isso via
  // LLM sem gate, mesmo principio de "geracao e' sempre constrained pela KB"
  // do CLAUDE.md. So' mostra o que e' de fato sourced: a propria frase do
  // exercicio onde a palavra apareceu.
  exemplo: string | null;
}

interface CandidateRow {
  lexicon_id: number;
  lemma: string;
  pos: string;
  gender: string | null;
  plural: string | null;
  ipa: string | null;
  exercise_id: number;
  template_nome: string;
  prompt: string;
  accepted_answers: string;
}

// Reconstroi um texto-exemplo real a partir do formato de armazenamento de
// CADA template ancorado a bloco de leitura -- so' esse subconjunto entra
// aqui (docs/14: "exercicio ligado por reading_block_items"), espelha
// pipeline/.../lexicon/link_exercise_lexicon.py::build_exercise_text, sem
// tentar cobrir os outros templates que nunca aparecem ligados a um bloco.
function fillGap(text: string, answer: string): string {
  return text.replace("___", answer ?? "");
}

function reconstructExample(row: CandidateRow): string | null {
  let accepted: string[] = [];
  try {
    const parsed = JSON.parse(row.accepted_answers);
    if (Array.isArray(parsed)) accepted = parsed.filter((a): a is string => typeof a === "string");
  } catch {
    /* accepted_answers malformado -- segue sem */
  }

  switch (row.template_nome) {
    case "BinaryChoiceEngine": {
      const data = safeJsonObject(row.prompt);
      if (!data) return row.prompt || null;
      return fillGap(String(data.trecho_gapped ?? ""), accepted[0] ?? "");
    }
    case "ComprehensionQAEngine":
      return accepted[0] ? `${row.prompt} — ${accepted[0]}` : row.prompt || null;
    case "PredictThenVerifyEngine": {
      const data = safeJsonObject(row.prompt);
      if (!data) return row.prompt || null;
      return `${String(data.trecho_inicial ?? "")} ${accepted[0] ?? ""}`.trim();
    }
    case "TrueFalseEngine":
      return row.prompt || null;
    case "VowelInsertEngine":
      return accepted[0] ? row.prompt.replace(/\S*_\S*/, accepted[0]) : row.prompt || null;
    case "PunctuationCapsEngine":
      return accepted[0] ?? row.prompt ?? null;
    case "CompoundSegmentationEngine":
      return row.prompt || null;
    case "LetterAnagramEngine": {
      const data = safeJsonObject(row.prompt);
      return (data?.frase_contexto as string) || accepted[0] || row.prompt || null;
    }
    case "ParagraphOrderEngine":
      return accepted[0] || row.prompt || null;
    case "MatchingEngine": {
      const data = safeJsonObject(row.prompt);
      if (!data) return row.prompt || null;
      const termos = Array.isArray(data.termos) ? data.termos.join(", ") : "";
      const definicoes = Array.isArray(data.definicoes) ? data.definicoes.join(", ") : "";
      return `${termos} — ${definicoes}`;
    }
    default:
      return row.prompt || accepted[0] || null;
  }
}

function safeJsonObject(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// "Palavra do dia" = lemma contatado numa tentativa ERRADA (correct=0) de um
// exercicio ligado a um bloco de leitura (docs/14: e' assim que "vem da
// sessao de noticias" fica preciso). Selecao deterministica por dia (mesmo
// candidato o dia inteiro, muda no dia seguinte) via um hash simples da data
// -- sem precisar de tabela nova pra guardar "ja mostrado hoje".
export async function getWordOfTheDay(db: D1Database, userId: number): Promise<WordOfTheDay | null> {
  const rows = await db
    .prepare(
      `SELECT DISTINCT l.id as lexicon_id, l.lemma, l.pos, l.gender, l.plural, l.ipa,
              e.id as exercise_id, et.nome as template_nome, e.prompt, e.accepted_answers
       FROM lexicon l
       JOIN exercise_lexicon_refs elr ON elr.lexicon_id = l.id
       JOIN attempts a ON a.exercise_id = elr.exercise_id
       -- fix(known-issues #4): era "JOIN exercises e" direto -- deixava
       -- exercicio em quarentena (flagged/rejected/pending) aparecer como
       -- "palavra do dia" com prompt/accepted_answers expostos. servable_exercises
       -- (app/migrations/0004_review_workflow.sql) e' SELECT * FROM exercises
       -- WHERE validation_status IN ('auto_ok','human_reviewed'), mesmas colunas.
       JOIN servable_exercises e ON e.id = elr.exercise_id
       JOIN exercise_templates et ON et.id = e.exercise_template_id
       JOIN reading_block_items rbi ON rbi.exercise_id = elr.exercise_id
       WHERE a.user_id = ? AND a.correct = 0
       ORDER BY l.id ASC, e.id ASC`
    )
    .bind(userId)
    .all<CandidateRow>();

  const candidates = rows.results ?? [];
  if (candidates.length === 0) return null;

  const today = new Date().toISOString().slice(0, 10);
  let seed = 0;
  for (let i = 0; i < today.length; i++) seed = (seed * 31 + today.charCodeAt(i)) >>> 0;
  const chosen = candidates[seed % candidates.length];

  return {
    lexicon_id: chosen.lexicon_id,
    lemma: chosen.lemma,
    pos: chosen.pos,
    gender: chosen.gender,
    plural: chosen.plural,
    ipa: chosen.ipa,
    exemplo: reconstructExample(chosen),
  };
}
