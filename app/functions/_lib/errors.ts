// Erro cuja mensagem e' feita para o usuario ler (sessao nao encontrada,
// limite de turnos...), com o status HTTP certo. Qualquer outro erro e'
// detalhe de servidor e nao deve chegar ao navegador (AI-4.6c).
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
