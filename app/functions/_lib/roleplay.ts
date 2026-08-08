// Fase 10 -- StructuredSpeechEngine (docs/05 item 7): usuario confirmou a
// migracao pra LLM-roleplay, persona "moderador" (NAO hostil -- contraste
// deliberado com as personas do Grupo D, que ainda nao existem). Sessao de
// chat multi-turno; avaliacao de idioma so' no FECHAMENTO, nunca durante a
// conversa (quebraria a imersao) -- mesma logica de canal separado ja
// usada no resto do projeto (showed_up vs correction_json), aqui expressa
// como "conversa livre, nota so' no final".
import { chat, ChatMessage, DEFAULT_CHAT_MODEL, extractJsonObject } from "./llmClient";
import { Env, RoleplayMessageRow, RoleplaySessionRow, SessionPlanRow } from "./types";

function moderatorSystemPrompt(topic: string | null): string {
  const topicLine = topic?.trim()
    ? topic.trim()
    : "(nenhum tema definido -- escolha você mesmo um tema de debate atual e relevante para prática de alemão B2/C1, e apresente-o na sua primeira mensagem)";

  return `Você é um moderador de debate/discurso estruturado para prática de alemão B2/C1+. Sua persona é "Moderator": curioso, exigente, mas NUNCA hostil ou intimidador.

Tema desta sessão: ${topicLine}

Regras de condução:
- TODA a conversa acontece em ALEMÃO -- você fala alemão com o usuário do início ao fim, nunca português.
- Na primeira mensagem, apresente o tema brevemente e peça a posição inicial do usuário (ex.: "Wie stehen Sie zu...?").
- Depois disso, a cada resposta do usuário: faça UMA pergunta de acompanhamento substantiva -- peça exemplos, questione um ponto fraco do argumento, apresente um contra-argumento plausível, ou peça para aprofundar. Sempre soando genuinamente interessado, nunca sarcástico ou agressivo.
- Empurre a conversa organicamente em direção a uma estrutura de debate completa ao longo da sessão (tese -> justificativa -> lidar com um contra-argumento -> conclusão), sem anunciar essa estrutura ao usuário.
- NUNCA corrija gramática, vocabulário ou erros durante a conversa -- isso quebraria a imersão. A avaliação de idioma acontece só no final, numa etapa separada.
- Mantenha cada mensagem sua curta (2-4 frases) -- é uma conversa, não um monólogo.`;
}

const EVALUATION_SYSTEM_PROMPT = `Você é um avaliador de alemão B2/C1+. Vai receber a transcrição completa de uma sessão de debate/discurso estruturado entre um "Moderator" (LLM) e um usuário aprendendo alemão. Avalie SOMENTE as falas do USUARIO, nunca as do Moderator.

Responda SOMENTE com um objeto JSON (sem markdown, sem texto antes ou depois), exatamente neste formato:

{
  "clareza_estrutural": boolean,
  "argumentacao": string,
  "fluencia_e_naturalidade": string,
  "erros": [{"trecho": string, "problema": string, "sugestao": string}],
  "pontos_fortes": string[],
  "cefr_estimate": string
}

Regras:
- "clareza_estrutural": true se o usuário apresentou uma posição, justificou, lidou com pelo menos um contraponto e chegou a uma conclusão ao longo da conversa (mesmo que espalhado em várias mensagens, não numa única).
- "argumentacao": avaliação curta em PORTUGUÊS da qualidade e coerência dos argumentos do usuário.
- "fluencia_e_naturalidade": avaliação curta em PORTUGUÊS de quão natural/fluente o alemão do usuário soou (não só correção gramatical).
- "erros": erros reais de gramática/regência/caso/idiomatismo encontrados nas falas do usuário. "trecho" e "sugestao" ficam em ALEMÃO, "problema" em PORTUGUÊS.
- "pontos_fortes": pontos fortes reais (nunca inventar se não houver nenhum genuíno) -- sempre em PORTUGUÊS.
- "cefr_estimate": estimativa honesta ("B1", "B2", "B2+", "C1", "C1+").`;

export async function getActiveSpeechPlan(db: D1Database): Promise<SessionPlanRow | null> {
  return db
    .prepare(`SELECT * FROM session_plans WHERE scope = 'structured_speech' AND completed_at IS NULL ORDER BY id DESC LIMIT 1`)
    .first<SessionPlanRow>();
}

export async function startSession(env: Env, topic: string | null): Promise<{ sessionId: number; openingMessage: string }> {
  const result = await env.DB.prepare(
    `INSERT INTO roleplay_sessions (engine, persona, topic) VALUES ('StructuredSpeechEngine', 'moderador', ?)`
  )
    .bind(topic)
    .run();
  const sessionId = result.meta.last_row_id as number;

  // instrucao de kickoff nunca e' persistida como mensagem -- so' serve
  // pra puxar a primeira fala do moderador; gravar isso como "user" na
  // transcricao inflaria a avaliacao de fechamento com texto que o usuario
  // nunca disse de verdade.
  const opening = await chat(
    env,
    DEFAULT_CHAT_MODEL,
    [
      { role: "system", content: moderatorSystemPrompt(topic) },
      { role: "user", content: "(início da sessão -- apresente o tema e peça minha posição inicial)" },
    ],
    0.8
  );

  await env.DB.prepare(`INSERT INTO roleplay_messages (session_id, role, content) VALUES (?, 'assistant', ?)`)
    .bind(sessionId, opening)
    .run();

  return { sessionId, openingMessage: opening };
}

export async function postMessage(env: Env, sessionId: number, userText: string): Promise<string> {
  const session = await env.DB.prepare(`SELECT * FROM roleplay_sessions WHERE id = ?`)
    .bind(sessionId)
    .first<RoleplaySessionRow>();
  if (!session) throw new Error("sessão não encontrada");
  if (session.status !== "active") throw new Error("sessão já encerrada");

  const { results } = await env.DB.prepare(`SELECT role, content FROM roleplay_messages WHERE session_id = ? ORDER BY id`)
    .bind(sessionId)
    .all<RoleplayMessageRow>();
  const history = results ?? [];

  const messages: ChatMessage[] = [
    { role: "system", content: moderatorSystemPrompt(session.topic) },
    ...history.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
    { role: "user", content: userText },
  ];

  const reply = await chat(env, DEFAULT_CHAT_MODEL, messages, 0.8);

  await env.DB.prepare(`INSERT INTO roleplay_messages (session_id, role, content) VALUES (?, 'user', ?)`)
    .bind(sessionId, userText)
    .run();
  await env.DB.prepare(`INSERT INTO roleplay_messages (session_id, role, content) VALUES (?, 'assistant', ?)`)
    .bind(sessionId, reply)
    .run();

  return reply;
}

export async function closeSession(env: Env, sessionId: number): Promise<unknown> {
  const session = await env.DB.prepare(`SELECT * FROM roleplay_sessions WHERE id = ?`)
    .bind(sessionId)
    .first<RoleplaySessionRow>();
  if (!session) throw new Error("sessão não encontrada");
  if (session.status === "closed" && session.evaluation_json) {
    return JSON.parse(session.evaluation_json);
  }

  const { results } = await env.DB.prepare(`SELECT role, content FROM roleplay_messages WHERE session_id = ? ORDER BY id`)
    .bind(sessionId)
    .all<RoleplayMessageRow>();
  const transcript = (results ?? [])
    .map((m) => `${m.role === "user" ? "USUARIO" : "MODERATOR"}: ${m.content}`)
    .join("\n\n");

  const raw = await chat(
    env,
    DEFAULT_CHAT_MODEL,
    [
      { role: "system", content: EVALUATION_SYSTEM_PROMPT },
      { role: "user", content: transcript || "(sessão encerrada sem nenhuma fala do usuário)" },
    ],
    0.3
  );
  const evaluation = JSON.parse(extractJsonObject(raw));

  await env.DB.prepare(`UPDATE roleplay_sessions SET status = 'closed', evaluation_json = ?, closed_at = ? WHERE id = ?`)
    .bind(JSON.stringify(evaluation), new Date().toISOString(), sessionId)
    .run();

  return evaluation;
}

export async function getHistory(db: D1Database, sessionId: number): Promise<RoleplayMessageRow[]> {
  const { results } = await db
    .prepare(`SELECT * FROM roleplay_messages WHERE session_id = ? ORDER BY id`)
    .bind(sessionId)
    .all<RoleplayMessageRow>();
  return results ?? [];
}
