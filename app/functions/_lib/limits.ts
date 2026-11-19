// AI-4.2 (Tech DD, 18/11/2026) -- tetos de gasto por chamada, num lugar so'
// para ajustar depois de uso real. Junto com a allowlist (AI-4.1), e' o que
// segura o custo do LLM (Hugging Face) e do container fonetico, que ficam
// fora do spend limit da Cloudflare (QA-5, "teto por construcao").

// max_tokens e timeout de cada chamada ao LLM (_lib/llmClient.ts). Saida em
// JSON tem folga maior: se o max_tokens cortar o JSON no meio, a correcao
// inteira falha.
export const LLM_BUDGETS = {
  // paragrafo de 3-5 frases; e' opcional, entao o timeout e' curto (a
  // resposta da tentativa espera por ele)
  explain: { maxTokens: 350, timeoutMs: 15_000 },
  roleplayOpening: { maxTokens: 400, timeoutMs: 30_000 },
  // 2-4 frases por turno
  roleplayTurn: { maxTokens: 300, timeoutMs: 30_000 },
  roleplayEvaluation: { maxTokens: 2000, timeoutMs: 60_000 },
  essayRubric: { maxTokens: 2000, timeoutMs: 60_000 },
  quickOpinionTopic: { maxTokens: 200, timeoutMs: 20_000 },
  quickOpinionRubric: { maxTokens: 1200, timeoutMs: 45_000 },
} as const;

// Container fonetico (_lib/phonetics.ts). Cobre o cold start com os modelos
// wav2vec2/faster-whisper, que fica mais frequente com sleepAfter de 10 min.
export const PHONETIC_TIMEOUT_MS = 90_000;

// Tetos de tamanho do que o cliente manda e acaba num prompt ou no container.
export const MAX_CHARS = {
  attemptResponse: 1_000, // resposta de exercicio deterministico (curta)
  roleplayMessage: 2_000,
  essayText: 6_000, // ~800 palavras; a meta e' 230 (WORD_TARGET)
  quickOpinionText: 3_000,
  quickOpinionTopic: 300, // vem do cliente e entra no prompt
  synthesizeText: 1_500, // fala de abertura da persona, 2-4 frases
  planThemeText: 500, // entra no system prompt do roleplay e da redacao
  planTargetVocabulary: 1_000,
} as const;

// ~2,2 MB de audio: ~2 min a 128 kbps, com folga para Opus/AAC do MediaRecorder.
export const MAX_AUDIO_BASE64_CHARS = 3_000_000;

// Falas do usuario por sessao de roleplay. O historico inteiro vai em cada
// turno e na avaliacao de fechamento, entao o custo cresce com o numero de
// turnos.
export const MAX_ROLEPLAY_USER_TURNS = 15;

export function textTooLong(label: string, max: number): Response {
  return Response.json({ error: `${label} passa do limite de ${max} caracteres` }, { status: 413 });
}

export function audioTooLong(): Response {
  return Response.json({ error: "gravação longa demais (máximo de ~2 minutos)" }, { status: 413 });
}
