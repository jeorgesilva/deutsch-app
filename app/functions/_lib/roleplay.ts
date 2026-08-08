// Fase 10/11 -- mecanismo de roleplay multi-turno compartilhado por
// StructuredSpeechEngine (persona "moderador", nao hostil, Grupo B item 7)
// e HostileRoleplayEngine (4 personas hostis, Grupo D, docs/05 itens
// 95-98). Avaliacao de idioma so' no FECHAMENTO, nunca durante a conversa
// -- mesma logica de canal separado ja usada no resto do projeto
// (showed_up vs correction_json), aqui expressa como "conversa livre, nota
// so' no final". Schema (roleplay_sessions/roleplay_messages,
// 0009_structured_speech.sql) ja nasceu com `engine`/`persona` como
// colunas livres de proposito, pensado pra este momento -- nenhuma
// migration nova precisou entrar pra generalizar.
import { chat, ChatMessage, DEFAULT_CHAT_MODEL, extractJsonObject } from "./llmClient";
import { Env, RoleplayMessageRow, RoleplaySessionRow, SessionPlanRow } from "./types";

export type PersonaKey =
  | "moderador"
  | "hostile_press"
  | "hostile_competitor"
  | "hostile_tech"
  | "hostile_court"
  | "assigned_position";

export interface PersonaConfig {
  key: PersonaKey;
  label: string;
  group: "moderator" | "hostile";
  // qual `roleplay_sessions.engine` esta persona grava -- dado ao inves de
  // if/else espalhado nos endpoints (docs/05: AssignedPositionSpeechEngine
  // e' explicitamente "variante do HostileRoleplayEngine", mesmo mecanismo,
  // engine/persona diferentes).
  engine: string;
  // so' as 4 personas hostis tem intensidade (docs/05 item 96: "indicador
  // visual do nivel, 1 a 4") -- ordem e' hipotese de design (coletiva de
  // imprensa e' o degrau mais previsivel/scriptado, tribunal o mais formal
  // e de maior autoridade), nao veio especificada no docs -- ajustavel com
  // uso real, nunca trava a ordem em que o usuario pode entrar (docs/09,
  // achado #8: escada sugerida, nao bloqueada). assigned_position nao tem
  // intensidade -- nao e' hostil, e' um exercicio de argumentacao, docs/09
  // ainda assim lista como parte do catalogo do Grupo D junto das 4.
  intensity?: number;
  description: string; // mostrado na escada, antes do usuario entrar
  systemPrompt: (topic: string | null) => string;
}

// Regra de seguranca de design, vale pras 4 personas hostis: "hostil" e'
// adversarial-PROFISSIONAL (jornalista cetico, promotor, concorrente,
// interrogador tecnico questionando o CONTEUDO do argumento) -- nunca
// insulto pessoal, humilhacao ou assedio. O usuario tem ansiedade social
// diagnosticada (LSAS=76, docs/03) -- e' uma escada de EXPOSICAO
// controlada, nao hostilidade de verdade. Todo prompt abaixo inclui essa
// restricao explicitamente.
const HOSTILITY_GUARDRAIL =
  "IMPORTANTE: sua hostilidade é inteiramente PROFISSIONAL e focada no CONTEÚDO do argumento do usuário -- questione, pressione, aponte contradições e lacunas, mas NUNCA insulte a pessoa, nunca seja humilhante ou pessoal. É prática de exposição controlada para ansiedade social, não hostilidade de verdade.";

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

function hostilePressSystemPrompt(topic: string | null): string {
  const scenarioLine = topic?.trim()
    ? topic.trim()
    : "(nenhum tema definido -- invente uma decisão/anúncio controverso plausível de uma empresa ou instituição, e apresente o cenário na sua primeira mensagem)";

  return `Você é um jornalista cético e experiente conduzindo uma coletiva de imprensa em ALEMÃO. O usuário está no papel de porta-voz/responsável, defendendo publicamente uma decisão ou posição.

Cenário: ${scenarioLine}

Regras de condução:
- TODA a conversa em ALEMÃO, do início ao fim.
- Primeira mensagem: apresente-se brevemente como jornalista, exponha o cenário/decisão em questão, e faça a primeira pergunta incisiva pedindo a posição do usuário.
- A cada resposta: cobre lacunas, peça exemplos concretos e números, aponte contradições entre o que foi dito antes e agora, questione a credibilidade do argumento -- postura cética e insistente de jornalismo investigativo.
- NUNCA corrija gramática/vocabulário durante a conversa -- avaliação só no fechamento, separada.
- Mensagens curtas (2-4 frases) -- é uma coletiva, perguntas diretas, não monólogos.
- ${HOSTILITY_GUARDRAIL}`;
}

function hostileCourtSystemPrompt(topic: string | null): string {
  const scenarioLine = topic?.trim()
    ? topic.trim()
    : "(nenhum tema definido -- invente um cenário plausível de audiência/tribunal em que o usuário precisa justificar uma decisão ou posição, e apresente-o na sua primeira mensagem)";

  return `Você é uma juíza (ou promotor) conduzindo uma audiência formal em ALEMÃO. O usuário precisa justificar e defender uma posição/decisão perante o tribunal.

Cenário: ${scenarioLine}

Regras de condução:
- TODA a conversa em ALEMÃO, registro formal/jurídico do início ao fim.
- Primeira mensagem: abra a audiência formalmente, exponha o que está sendo questionado, e peça a posição inicial do usuário.
- A cada resposta: exija justificativa clara e evidência para cada afirmação, aponte inconsistências lógicas com rigor formal, mantenha tom de autoridade -- é uma audiência, não uma conversa informal.
- NUNCA corrija gramática/vocabulário durante a conversa -- avaliação só no fechamento, separada.
- Mensagens curtas (2-4 frases), sempre no registro formal apropriado a um tribunal.
- ${HOSTILITY_GUARDRAIL}`;
}

function hostileCompetitorSystemPrompt(topic: string | null): string {
  const scenarioLine = topic?.trim()
    ? topic.trim()
    : "(nenhum tema definido -- invente um cenário plausível de negociação ou debate competitivo de negócios, e apresente-o na sua primeira mensagem)";

  return `Você é um concorrente de negócios hostil, numa negociação/debate competitivo em ALEMÃO, tentando desestabilizar a posição do usuário.

Cenário: ${scenarioLine}

Regras de condução:
- TODA a conversa em ALEMÃO, do início ao fim.
- Primeira mensagem: apresente-se e o cenário competitivo brevemente, e provoque a primeira resposta do usuário.
- A cada resposta: questione premissas, minimize os argumentos do usuário, seja competitivo e um pouco arrogante, tente desviar o assunto pra pontos fracos -- postura de rival de negócios, nunca de vilão de filme.
- NUNCA corrija gramática/vocabulário durante a conversa -- avaliação só no fechamento, separada.
- Mensagens curtas (2-4 frases) -- tom direto, competitivo.
- ${HOSTILITY_GUARDRAIL}`;
}

function hostileTechSystemPrompt(topic: string | null): string {
  const scenarioLine = topic?.trim()
    ? topic.trim()
    : "(nenhum tema definido -- invente um cenário plausível de interrogatório técnico sobre um projeto/decisão técnica, e apresente-o na sua primeira mensagem)";

  return `Você é um interrogador técnico especializado, conduzindo um interrogatório rigoroso em ALEMÃO sobre um tópico técnico/profissional que o usuário precisa defender.

Cenário: ${scenarioLine}

Regras de condução:
- TODA a conversa em ALEMÃO, registro técnico-formal do início ao fim.
- Primeira mensagem: exponha brevemente o que está sendo interrogado e faça a primeira pergunta de precisão técnica.
- A cada resposta: cobre precisão terminológica exata, peça especificações e detalhamento técnico, conteste qualquer imprecisão de vocabulário -- foco em rigor técnico, não em hostilidade pessoal.
- NUNCA corrija gramática/vocabulário durante a conversa -- avaliação só no fechamento, separada.
- Mensagens curtas (2-4 frases), sempre exigindo precisão.
- ${HOSTILITY_GUARDRAIL}`;
}

function assignedPositionSystemPrompt(topic: string | null): string {
  const topicLine = topic?.trim()
    ? topic.trim()
    : "(nenhum tema definido -- invente você mesmo um tema de debate atual B2/C1)";

  return `Você conduz uma prática de "Speech de posição atribuída" para alemão B2/C1+, persona "Moderator": curioso, exigente, mas NUNCA hostil.

Cenário: o USUÁRIO vai defender uma posição que VOCÊ atribui -- não escolhida por ele -- sobre um tema controverso. Treina argumentar por um lado que pode não ser a opinião pessoal dele.

Tema: ${topicLine}

Regras de condução, MUITO diferente de uma conversa comum -- siga a ordem exatamente:
- TODA a conversa em ALEMÃO, do início ao fim.
- PRIMEIRA mensagem (só essa, e só essa): apresente o tema e ATRIBUA uma posição específica e clara que o usuário deve defender (ex.: "Ihr Thema: ... Ihre zugewiesene Position: Sie müssen dafür argumentieren, dass ..."). NÃO faça nenhuma pergunta ainda -- só convide o usuário a apresentar o argumento inicial dele defendendo essa posição.
- A PARTIR da segunda mensagem sua (depois que o usuário já apresentou o argumento inicial): funcione como um moderador curioso fazendo perguntas de sustentação -- peça exemplos, questione um ponto fraco, apresente um contra-argumento plausível, sempre soando genuinamente interessado, nunca sarcástico ou hostil.
- NUNCA corrija gramática/vocabulário durante a conversa -- avaliação só no fechamento, separada.
- Mensagens curtas (2-4 frases).`;
}

const PERSONAS: Record<PersonaKey, PersonaConfig> = {
  moderador: {
    key: "moderador",
    label: "Moderator",
    group: "moderator",
    engine: "StructuredSpeechEngine",
    description: "Moderador curioso, não hostil -- conduz o debate com perguntas de acompanhamento.",
    systemPrompt: moderatorSystemPrompt,
  },
  hostile_press: {
    key: "hostile_press",
    label: "Jornalista",
    group: "hostile",
    engine: "HostileRoleplayEngine",
    intensity: 1,
    description: "Coletiva de imprensa -- jornalista cético cobrando exemplos e contradições.",
    systemPrompt: hostilePressSystemPrompt,
  },
  hostile_competitor: {
    key: "hostile_competitor",
    label: "Concorrente",
    group: "hostile",
    engine: "HostileRoleplayEngine",
    intensity: 2,
    description: "Concorrente de negócios hostil -- questiona premissas, tenta desestabilizar.",
    systemPrompt: hostileCompetitorSystemPrompt,
  },
  hostile_tech: {
    key: "hostile_tech",
    label: "Interrogador técnico",
    group: "hostile",
    engine: "HostileRoleplayEngine",
    intensity: 3,
    description: "Interrogatório técnico -- exige precisão terminológica e registro formal.",
    systemPrompt: hostileTechSystemPrompt,
  },
  hostile_court: {
    key: "hostile_court",
    label: "Tribunal",
    group: "hostile",
    engine: "HostileRoleplayEngine",
    intensity: 4,
    description: "Audiência formal -- juíza/promotor exigindo justificativa rigorosa.",
    systemPrompt: hostileCourtSystemPrompt,
  },
  assigned_position: {
    key: "assigned_position",
    label: "Posição atribuída",
    group: "moderator",
    engine: "AssignedPositionSpeechEngine",
    description: "Você recebe uma posição pra defender (não escolhida por você) -- o moderador pergunta depois. Não hostil.",
    systemPrompt: assignedPositionSystemPrompt,
  },
};

// as 5 personas do catalogo de Grupo D (docs/05 itens 95-99) -- 4 hostis +
// posicao atribuida (nao hostil, mas explicitamente "variante do
// HostileRoleplayEngine" no docs, e docs/09 lista as 5 juntas no mesmo
// catalogo/escada). "moderador" fica de fora -- e' Grupo B (item 7,
// StructuredSpeechEngine), acessado pelo planejador, nao pela escada.
export const GRUPO_D_PERSONAS: PersonaConfig[] = [
  PERSONAS.hostile_press,
  PERSONAS.hostile_competitor,
  PERSONAS.hostile_tech,
  PERSONAS.hostile_court,
  PERSONAS.assigned_position,
];

function getPersona(key: string): PersonaConfig {
  const persona = PERSONAS[key as PersonaKey];
  if (!persona) throw new Error(`persona de roleplay desconhecida: "${key}"`);
  return persona;
}

export function getGrupoDPersona(key: string): PersonaConfig {
  const persona = getPersona(key);
  if (!GRUPO_D_PERSONAS.includes(persona)) {
    throw new Error(`"${key}" não é uma persona válida do Grupo D`);
  }
  return persona;
}

const EVALUATION_SYSTEM_PROMPT = `Você é um avaliador de alemão B2/C1+. Vai receber a transcrição completa de uma sessão de roleplay/debate em alemão entre um interlocutor (LLM, numa persona fixa) e um usuário aprendendo alemão. Avalie SOMENTE as falas do USUÁRIO, nunca as do interlocutor.

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
- "clareza_estrutural": true se o usuário apresentou uma posição, justificou, lidou com pelo menos um contraponto/pressão do interlocutor e chegou a uma conclusão ao longo da conversa (mesmo que espalhado em várias mensagens, não numa única).
- "argumentacao": avaliação curta em PORTUGUÊS da qualidade e coerência dos argumentos do usuário, incluindo como ele reagiu sob pressão.
- "fluencia_e_naturalidade": avaliação curta em PORTUGUÊS de quão natural/fluente o alemão do usuário soou (não só correção gramatical).
- "erros": erros reais de gramática/regência/caso/idiomatismo encontrados nas falas do usuário. "trecho" e "sugestao" ficam em ALEMÃO, "problema" em PORTUGUÊS.
- "pontos_fortes": pontos fortes reais (nunca inventar se não houver nenhum genuíno) -- sempre em PORTUGUÊS. Isso inclui coragem/persistência sob pressão, não só qualidade linguística.
- "cefr_estimate": estimativa honesta ("B1", "B2", "B2+", "C1", "C1+").`;

export async function getActiveSpeechPlan(db: D1Database): Promise<SessionPlanRow | null> {
  return db
    .prepare(`SELECT * FROM session_plans WHERE scope = 'structured_speech' AND completed_at IS NULL ORDER BY id DESC LIMIT 1`)
    .first<SessionPlanRow>();
}

// contagem de sessoes ja FECHADAS por persona -- usado pela escada de
// exposicao (docs/09, ExposureLadder) pra mostrar "ja praticado N vezes",
// nunca pra travar acesso (a ordem e' sugerida, nunca bloqueada).
export async function countClosedSessionsByPersona(db: D1Database): Promise<Record<string, number>> {
  const { results } = await db
    .prepare(`SELECT persona, COUNT(*) as n FROM roleplay_sessions WHERE status = 'closed' GROUP BY persona`)
    .all<{ persona: string; n: number }>();
  const counts: Record<string, number> = {};
  for (const row of results ?? []) counts[row.persona] = row.n;
  return counts;
}

export async function startSession(
  env: Env,
  engine: string,
  personaKey: string,
  topic: string | null
): Promise<{ sessionId: number; openingMessage: string }> {
  const persona = getPersona(personaKey);

  const result = await env.DB.prepare(`INSERT INTO roleplay_sessions (engine, persona, topic) VALUES (?, ?, ?)`)
    .bind(engine, personaKey, topic)
    .run();
  const sessionId = result.meta.last_row_id as number;

  // instrucao de kickoff nunca e' persistida como mensagem -- so' serve
  // pra puxar a primeira fala do interlocutor; gravar isso como "user" na
  // transcricao inflaria a avaliacao de fechamento com texto que o usuario
  // nunca disse de verdade.
  const opening = await chat(
    env,
    DEFAULT_CHAT_MODEL,
    [
      { role: "system", content: persona.systemPrompt(topic) },
      { role: "user", content: "(início da sessão -- apresente o cenário e faça sua primeira pergunta/observação)" },
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

  const persona = getPersona(session.persona);

  const { results } = await env.DB.prepare(`SELECT role, content FROM roleplay_messages WHERE session_id = ? ORDER BY id`)
    .bind(sessionId)
    .all<RoleplayMessageRow>();
  const history = results ?? [];

  const messages: ChatMessage[] = [
    { role: "system", content: persona.systemPrompt(session.topic) },
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

  const persona = getPersona(session.persona);

  const { results } = await env.DB.prepare(`SELECT role, content FROM roleplay_messages WHERE session_id = ? ORDER BY id`)
    .bind(sessionId)
    .all<RoleplayMessageRow>();
  const transcript = (results ?? [])
    .map((m) => `${m.role === "user" ? "USUARIO" : persona.label.toUpperCase()}: ${m.content}`)
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
