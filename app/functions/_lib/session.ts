// Fase 9 -- composicao de sessao: prioriza itens FSRS vencidos (progress.
// next_review_at <= agora), depois itens nunca vistos (sem linha em
// progress), sempre intercalando template -- CLAUDE.md: "nunca servir o
// mesmo template/modalidade duas vezes seguidas".
import { AUDIO_FIRST_TEMPLATES, ExerciseRow, SUPPORTED_TEMPLATES, TARGET_AUDIO_HIDDEN_TEMPLATES } from "./types";

// "Home por categoria" (docs/12) -- escopa composeSession a uma categoria
// de content_topics ou phonetic_points (Gramatica/Fonetica). Sem `scope`,
// comportamento identico ao de sempre (pool inteiro, usado pelo card
// "Revisao de hoje"). `templates` normalmente e' GRAMMAR_TEMPLATES ou
// PHONETICS_TEMPLATES (types.ts), mas aceita um subconjunto ainda menor --
// e' assim que o filtro de formato do frontend funciona, sem endpoint novo.
export interface SessionScope {
  kind: "content_topic" | "phonetic_point";
  categoria: string;
  templates: readonly string[];
}

export async function composeSession(
  db: D1Database,
  userId: number,
  limit: number,
  scope?: SessionScope
): Promise<ExerciseRow[]> {
  const templates = scope ? scope.templates : SUPPORTED_TEMPLATES;
  const placeholders = templates.map(() => "?").join(",");
  const now = new Date().toISOString();

  const scopeJoin = scope
    ? scope.kind === "content_topic"
      ? "JOIN content_topics ct ON e.content_topic_id = ct.id AND ct.categoria = ?"
      : "JOIN phonetic_points pp ON e.phonetic_point_id = pp.id AND pp.categoria = ?"
    : "";
  const scopeParams = scope ? [scope.categoria] : [];

  // vencidos primeiro (revisao FSRS), depois novos (nunca tentados) -- pega
  // mais que "limit" de cada balde pra sobrar material pra intercalar
  // (se so 1 template tivesse itens vencidos, intercalar exigiria pular
  // pro balde de novos mesmo assim). progress agora e' por (usuario,
  // exercicio) -- Fase 13: cada usuario tem seu proprio agendamento FSRS
  // sobre o mesmo conteudo compartilhado, dai o AND p.user_id = ? no JOIN
  // (nao um WHERE separado -- precisa ficar na condicao do JOIN pro LEFT
  // JOIN de "novos" abaixo continuar funcionando como "nunca visto por
  // ESTE usuario", nao "nunca visto por ninguem").
  const due = await db
    .prepare(
      `SELECT e.id, e.exercise_template_id, et.nome as template_nome, e.content_topic_id,
              e.prompt, e.accepted_answers, e.source_rule, e.audio_ref,
              vc.url as video_url, vc.start_seconds as video_start_seconds, vc.end_seconds as video_end_seconds
       FROM servable_exercises e
       JOIN exercise_templates et ON e.exercise_template_id = et.id
       JOIN progress p ON p.exercise_id = e.id AND p.user_id = ?
       LEFT JOIN video_clips vc ON e.video_clip_id = vc.id
       ${scopeJoin}
       WHERE et.nome IN (${placeholders}) AND p.next_review_at <= ?
       ORDER BY p.next_review_at ASC LIMIT 50`
    )
    .bind(userId, ...scopeParams, ...templates, now)
    .all<ExerciseRow>();

  const novos = await db
    .prepare(
      `SELECT e.id, e.exercise_template_id, et.nome as template_nome, e.content_topic_id,
              e.prompt, e.accepted_answers, e.source_rule, e.audio_ref,
              vc.url as video_url, vc.start_seconds as video_start_seconds, vc.end_seconds as video_end_seconds
       FROM servable_exercises e
       JOIN exercise_templates et ON e.exercise_template_id = et.id
       LEFT JOIN progress p ON p.exercise_id = e.id AND p.user_id = ?
       LEFT JOIN video_clips vc ON e.video_clip_id = vc.id
       ${scopeJoin}
       WHERE et.nome IN (${placeholders}) AND p.id IS NULL
       ORDER BY RANDOM() LIMIT 50`
    )
    .bind(userId, ...scopeParams, ...templates)
    .all<ExerciseRow>();

  const pool = [...(due.results ?? []), ...(novos.results ?? [])];
  return interleave(pool, limit);
}

// Formata um ExerciseRow (linha crua do D1) pro formato que o frontend
// consome -- regras de ocultacao de prompt/audio (AUDIO_FIRST_TEMPLATES/
// TARGET_AUDIO_HIDDEN_TEMPLATES) num unico lugar, reusado por /api/session,
// /api/reading-blocks/:id e /api/video-groups (sem isso cada endpoint novo
// reimplementaria a mesma regra de "nunca mostrar a frase-fonte antes da
// tentativa").
export function formatExerciseForClient(ex: ExerciseRow) {
  // Fatia A (redesenho de Video) -- "esconder o prompt" pro VideoTaskEngine
  // especificamente agora depende do CONTEUDO (prompt vazio = nada pra
  // mostrar antes da tentativa), nao so do NOME do template. Antes, todo
  // VideoTaskEngine escondia o prompt incondicionalmente; agora "citar"
  // (reconhecimento por parafrase) usa o MESMO template mas com prompt
  // preenchido de proposito (a parafrase e' o proprio exercicio, precisa
  // aparecer antes -- so a transcricao/video-fonte continua proibida de
  // aparecer como leitura previa). NAO generalizar pra DictationEngine/
  // ShadowingEngine -- esses guardam a frase-fonte REAL em `prompt` (nao
  // vazio) e dependem do esconde-sempre/revela-depois original.
  const audioFirst =
    AUDIO_FIRST_TEMPLATES.has(ex.template_nome) &&
    (ex.template_nome !== "VideoTaskEngine" || ex.prompt === "");
  const audioHidden = TARGET_AUDIO_HIDDEN_TEMPLATES.has(ex.template_nome);
  return {
    id: ex.id,
    template: ex.template_nome,
    prompt: audioFirst ? null : ex.prompt,
    audio_url: ex.audio_ref && !audioHidden ? `/media/${ex.audio_ref}` : null,
    video_url: ex.video_url,
    video_start_seconds: ex.video_start_seconds,
    video_end_seconds: ex.video_end_seconds,
    content_topic_id: ex.content_topic_id,
  };
}

// Greedy: percorre o pool em ordem (vencidos > novos), a cada passo pega o
// primeiro item cujo template != template do item anterior escolhido. Se
// nenhum servir (pool ficou so com repeticoes do ultimo template), aceita
// repetir -- e' um fallback raro, melhor que travar a sessao.
function interleave(pool: ExerciseRow[], limit: number): ExerciseRow[] {
  const remaining = [...pool];
  const chosen: ExerciseRow[] = [];
  let lastTemplate: string | null = null;

  while (chosen.length < limit && remaining.length > 0) {
    let idx = remaining.findIndex((ex) => ex.template_nome !== lastTemplate);
    if (idx === -1) idx = 0;
    const [item] = remaining.splice(idx, 1);
    chosen.push(item);
    lastTemplate = item.template_nome;
  }
  return chosen;
}
