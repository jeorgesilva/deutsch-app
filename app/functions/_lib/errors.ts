// AI-4.6c (Tech DD, 18/11/2026) -- erro de servidor nao chega ao navegador.
// Antes, ~15 respostas devolviam err.message cru: erro da Hugging Face,
// saida crua do LLM, nome de variavel de ambiente, erro do D1. Agora:
//   - PublicError: mensagem feita para o usuario ler (sessao nao
//     encontrada, limite de turnos...), com o status HTTP certo;
//   - qualquer outro erro: detalhe so' no log do servidor
//     (`wrangler pages deployment tail`), mensagem generica ao cliente.
// As mensagens genericas dizem que e' falha TECNICA, nunca algo que pareca
// feedback de idioma (QA-4).

export class PublicError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "PublicError";
  }
}

export function publicErrorResponse(err: PublicError): Response {
  return Response.json({ error: err.message }, { status: err.status });
}

export const PUBLIC_MESSAGES = {
  llm: "o serviço de IA não respondeu; tente de novo em alguns minutos",
  phonetic: "serviço fonético indisponível; tente de novo em alguns minutos",
  phoneticNotConfigured: "serviço fonético não configurado",
  tts: "síntese de voz indisponível",
  // app.js mostra "Geração falhou: <isto>"
  regenerationJob: "erro no serviço de geração (detalhe no log do servidor)",
} as const;

export function logServerError(where: string, err: unknown): void {
  console.error(where, err instanceof Error ? (err.stack ?? err.message) : String(err));
}

// PublicError passa com a propria mensagem e status; o resto vira log +
// mensagem generica.
export function upstreamFailure(where: string, err: unknown, publicMessage: string, status = 502): Response {
  if (err instanceof PublicError) return publicErrorResponse(err);
  logServerError(where, err);
  return Response.json({ error: publicMessage }, { status });
}
