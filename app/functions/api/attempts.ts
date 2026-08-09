// POST /api/attempts -- Fase 9 (CLAUDE.md): grava tentativa, corrige
// (deterministicamente OU via servico fonetico local, dependendo do
// template), agenda proxima revisao via FSRS. body: {exercise_id,
// user_response} pros 18 templates de texto, {exercise_id, audio_base64}
// pra ReadAloudEngine/SpokenGapFillEngine.
import { getCurrentUser, unauthorized } from "../_lib/auth";
import { gradeAttempt } from "../_lib/grading";
import { recordProgress } from "../_lib/progress";
import { scoreReadAloud, scoreSpokenGapFill } from "../_lib/phonetics";
import { AUDIO_FIRST_TEMPLATES, Env, ExerciseRow } from "../_lib/types";

interface AttemptBody {
  exercise_id: number;
  user_response?: string;
  audio_base64?: string;
}

// FSRS pra esses dois templates segue SEMPRE a checagem LEXICAL (a palavra/
// frase certa foi dita?), nunca a similaridade de pronuncia -- mesmo
// principio de nunca misturar "showed_up"/qualidade de pronuncia com
// correcao de conteudo (CLAUDE.md). ReadAloudEngine nao tem checagem
// lexical (le um texto dado, nao inventa palavra) -- unico caso onde a
// similaridade de pronuncia decide o rating, com um limiar provisorio de
// v1 (0.5 -- docs/08 nunca definiu um limiar "certo/errado", so
// similaridade continua; ajustar depois de uso real).
const PHONETIC_TEMPLATES = new Set(["ReadAloudEngine", "SpokenGapFillEngine"]);
const PRONUNCIATION_OK_THRESHOLD = 0.5;

// ShadowingEngine (docs/05 item 2): "nenhuma correcao automatica por
// padrao" -- o usuario grava a si mesmo e ouve so a PROPRIA gravacao pra
// auto-comparacao, ela nunca sai do navegador. Servidor so registra que a
// pessoa apareceu (showed_up=1) -- mesmo principio de "validacao por ter
// tentado" ja usado em Speech/Grupo D, so que aqui e' a UNICA coisa que
// existe (nao ha um segundo canal de "feedback de idioma" nesta variante
// base -- essa fica pro item 117, ShadowingEngine com correcao, fase
// futura). FSRS sempre agenda como Rating.Good -- nao ha resposta errada
// possivel num exercicio sem correcao.
const SHADOWING_TEMPLATES = new Set(["ShadowingEngine"]);

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getCurrentUser({ request, env });
  if (!user) return unauthorized();

  const body = (await request.json()) as AttemptBody;
  if (!body?.exercise_id) {
    return Response.json({ error: "exercise_id e obrigatorio" }, { status: 400 });
  }

  const exercise = await env.DB.prepare(
    `SELECT e.id, e.exercise_template_id, et.nome as template_nome, e.content_topic_id,
            e.prompt, e.accepted_answers, e.source_rule, e.audio_ref
     FROM servable_exercises e
     JOIN exercise_templates et ON e.exercise_template_id = et.id
     WHERE e.id = ?`
  )
    .bind(body.exercise_id)
    .first<ExerciseRow>();

  if (!exercise) {
    return Response.json({ error: "exercicio nao encontrado ou nao servivel" }, { status: 404 });
  }

  if (PHONETIC_TEMPLATES.has(exercise.template_nome)) {
    if (typeof body.audio_base64 !== "string") {
      return Response.json({ error: "audio_base64 e obrigatorio pra esse template" }, { status: 400 });
    }
    return handlePhoneticAttempt(env, user.id, exercise, body.audio_base64);
  }

  if (SHADOWING_TEMPLATES.has(exercise.template_nome)) {
    return handleShadowingAttempt(env, user.id, exercise.id);
  }

  if (typeof body.user_response !== "string") {
    return Response.json({ error: "user_response e obrigatorio" }, { status: 400 });
  }

  const grade = gradeAttempt(exercise, body.user_response);

  await env.DB.prepare(
    `INSERT INTO attempts (exercise_id, user_response, showed_up, user_id) VALUES (?, ?, 1, ?)`
  )
    .bind(exercise.id, body.user_response, user.id)
    .run();

  const next = await recordProgress(env, user.id, exercise.id, grade.correct);

  return Response.json({
    correct: grade.correct,
    accepted_answers: grade.accepted_answers,
    // gabarito pos-tentativa (frase-fonte) -- so pros templates audio-primeiro
    // (DictationEngine, que chega com prompt=null na sessao). Pros outros,
    // "prompt" e' um esqueleto/gap/estrutura JSON, nao a resposta -- mostrar
    // ele como "gabarito" seria confuso (achado real testando o VowelInsertEngine:
    // mostrava a frase ainda com a lacuna, nao a palavra certa).
    source_sentence: AUDIO_FIRST_TEMPLATES.has(exercise.template_nome) ? exercise.prompt : null,
    next_review_at: next.next_review_at,
  });
};

async function handleShadowingAttempt(env: Env, userId: number, exerciseId: number): Promise<Response> {
  await env.DB.prepare(`INSERT INTO attempts (exercise_id, showed_up, user_id) VALUES (?, 1, ?)`)
    .bind(exerciseId, userId)
    .run();
  const next = await recordProgress(env, userId, exerciseId, true);
  return Response.json({ correct: true, next_review_at: next.next_review_at });
}

async function handlePhoneticAttempt(env: Env, userId: number, exercise: ExerciseRow, audioBase64: string): Promise<Response> {
  const serviceUrl = env.PHONETIC_SERVICE_URL;
  if (!serviceUrl) {
    return Response.json({ error: "PHONETIC_SERVICE_URL nao configurado" }, { status: 500 });
  }

  let userResponse: string | null = null;
  let correct: boolean;
  let lexical: { transcribed: string; accepted_answers: string[]; correct: boolean } | null = null;
  let pronunciation: { target_ipa: string; recognized_ipa: string; similarity: number; alignment: unknown };

  try {
    if (exercise.template_nome === "ReadAloudEngine") {
      const score = await scoreReadAloud(serviceUrl, env.PHONETIC_SHARED_SECRET, exercise.prompt, audioBase64);
      correct = score.similarity >= PRONUNCIATION_OK_THRESHOLD;
      pronunciation = score;
    } else {
      const accepted: string[] = JSON.parse(exercise.accepted_answers);
      const sentenceFull = exercise.prompt.replace("___", accepted[0]);
      const score = await scoreSpokenGapFill(serviceUrl, env.PHONETIC_SHARED_SECRET, sentenceFull, accepted, audioBase64);
      userResponse = score.lexical.transcribed;
      correct = score.lexical.correct;
      lexical = score.lexical;
      pronunciation = score.pronunciation;
    }
  } catch (err) {
    return Response.json(
      { error: `servico fonetico indisponivel (${(err as Error).message})` },
      { status: 502 }
    );
  }

  const attemptResult = await env.DB.prepare(
    `INSERT INTO attempts (exercise_id, user_response, showed_up, user_id) VALUES (?, ?, 1, ?)`
  )
    .bind(exercise.id, userResponse, userId)
    .run();
  const attemptId = attemptResult.meta.last_row_id;

  await env.DB.prepare(
    `INSERT INTO phoneme_scores (attempt_id, target_ipa, recognized_ipa, diff_json, recognizer_model)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(attemptId, pronunciation.target_ipa, pronunciation.recognized_ipa, JSON.stringify(pronunciation.alignment), "wav2vec2-espeak")
    .run();

  const next = await recordProgress(env, userId, exercise.id, correct);

  return Response.json({
    correct,
    lexical,
    pronunciation,
    // so revelado agora -- ver TARGET_AUDIO_HIDDEN_TEMPLATES em types.ts.
    target_audio_url: exercise.audio_ref ? `/media/${exercise.audio_ref}` : null,
    next_review_at: next.next_review_at,
  });
}
