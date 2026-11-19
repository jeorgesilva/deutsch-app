// AI-4.6a (Tech DD, 18/11/2026) -- isAuthorizedBearer, usado pelos dois
// Workers de container. Mora em services/shared/, mas o unico runner de
// teste TS do repo e' o vitest do app.
//
// O Node nao tem crypto.subtle.timingSafeEqual (extensao do Workers). O
// substituto abaixo usa o timingSafeEqual do node:crypto, que -- como o do
// Workers -- LANCA excecao com tamanhos diferentes. Se a funcao chamar a
// comparacao com tamanhos diferentes, o teste quebra.
import { timingSafeEqual as nodeTimingSafeEqual } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isAuthorizedBearer } from "../../services/shared/bearer";

const subtle = crypto.subtle as SubtleCrypto & { timingSafeEqual?: (a: Uint8Array, b: Uint8Array) => boolean };
const compare = vi.fn((a: Uint8Array, b: Uint8Array) => nodeTimingSafeEqual(a, b));

beforeAll(() => {
  Object.defineProperty(subtle, "timingSafeEqual", { value: compare, configurable: true, writable: true });
});

afterAll(() => {
  delete subtle.timingSafeEqual;
});

beforeEach(() => {
  compare.mockClear();
});

describe("isAuthorizedBearer", () => {
  const secret = "s3cr3t-compartilhado";

  it("aceita o cabecalho exato", () => {
    expect(isAuthorizedBearer(`Bearer ${secret}`, secret)).toBe(true);
  });

  it("recusa outro token do mesmo tamanho", () => {
    expect(isAuthorizedBearer(`Bearer ${"x".repeat(secret.length)}`, secret)).toBe(false);
  });

  it("recusa tamanhos diferentes sem lancar excecao e sem retornar cedo", () => {
    for (const header of [null, "", "Bearer", `Bearer ${secret}x`, `bearer ${secret}`.slice(1)]) {
      expect(isAuthorizedBearer(header, secret)).toBe(false);
    }
    // a comparacao rodou em todos os casos (nada de retorno antecipado)
    expect(compare).toHaveBeenCalledTimes(5);
  });

  it("sem secret, nada passa -- nem o literal 'Bearer undefined'", () => {
    expect(isAuthorizedBearer("Bearer undefined", undefined)).toBe(false);
    expect(isAuthorizedBearer("Bearer ", "")).toBe(false);
    expect(isAuthorizedBearer(null, undefined)).toBe(false);
  });
});
