// AI-4.6a (Tech DD, 18/11/2026) -- checagem do segredo compartilhado nos
// dois Workers de container (phonetic-container e generation-container
// importam ESTA funcao; nao duplicar). Antes era
// `auth !== \`Bearer ${env.X}\``, que aceitava o cabecalho literal
// "Bearer undefined" quando o secret faltava, e comparava com `!==`, que
// para no primeiro caractere diferente.
//
// Padrao da Cloudflare (developers.cloudflare.com/workers/examples/
// protect-against-timing-attacks/): crypto.subtle.timingSafeEqual LANCA
// excecao se os buffers tiverem tamanhos diferentes -- e o cabecalho errado
// quase nunca tem o tamanho do esperado (ausente, "Bearer", outro token).
// Entao: com tamanhos diferentes, compara a entrada consigo mesma e nega;
// nunca chama timingSafeEqual(recebido, esperado) com tamanhos diferentes,
// e nunca retorna cedo (o tempo vazaria o tamanho do secret).
//
// Arquivo fora de services/<container>/: os dois workflows de deploy
// observam services/shared/** tambem.

const encoder = new TextEncoder();

export function isAuthorizedBearer(authorizationHeader: string | null, secret: string | undefined): boolean {
  // sem secret configurado, nada passa
  if (!secret) return false;

  const received = encoder.encode(authorizationHeader ?? "");
  const expected = encoder.encode(`Bearer ${secret}`);

  if (received.byteLength !== expected.byteLength) {
    return !crypto.subtle.timingSafeEqual(received, received);
  }
  return crypto.subtle.timingSafeEqual(received, expected);
}
