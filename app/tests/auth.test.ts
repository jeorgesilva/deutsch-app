// AI-4.1 (Tech DD, 18/11/2026) -- allowlist de e-mails. Fora de functions/
// de proposito: o Pages roteia arquivos de functions/, e o tsconfig do app
// so' cobre functions/**. O vitest acha *.test.ts em qualquer pasta.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  isEmailAllowed,
  parseAllowedEmails,
  verifyPassword,
} from "../functions/_lib/auth";

describe("parseAllowedEmails", () => {
  it("separa por virgula, tira espaco e baixa a caixa", () => {
    expect(parseAllowedEmails(" Eu@Exemplo.de , outra@exemplo.de")).toEqual(
      new Set(["eu@exemplo.de", "outra@exemplo.de"])
    );
  });

  it("ignora entradas vazias", () => {
    expect(parseAllowedEmails(" , ,eu@exemplo.de,, ")).toEqual(new Set(["eu@exemplo.de"]));
  });

  it("devolve conjunto vazio sem a variavel", () => {
    expect(parseAllowedEmails(undefined).size).toBe(0);
    expect(parseAllowedEmails("").size).toBe(0);
  });
});

describe("isEmailAllowed", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("aceita e-mail da lista, sem diferenca de caixa ou espaco", () => {
    const env = { ALLOWED_EMAILS: "eu@exemplo.de" };
    expect(isEmailAllowed(env, "eu@exemplo.de")).toBe(true);
    expect(isEmailAllowed(env, "  EU@Exemplo.DE ")).toBe(true);
  });

  it("recusa e-mail fora da lista", () => {
    expect(isEmailAllowed({ ALLOWED_EMAILS: "eu@exemplo.de" }, "outro@exemplo.de")).toBe(false);
  });

  it("nao aceita prefixo nem sufixo de um e-mail da lista", () => {
    const env = { ALLOWED_EMAILS: "eu@exemplo.de" };
    expect(isEmailAllowed(env, "eu@exemplo.de.evil")).toBe(false);
    expect(isEmailAllowed(env, "xeu@exemplo.de")).toBe(false);
  });

  it("falha fechada: sem a variavel, ou so' com virgulas, ninguem passa", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(isEmailAllowed({}, "eu@exemplo.de")).toBe(false);
    expect(isEmailAllowed({ ALLOWED_EMAILS: "" }, "eu@exemplo.de")).toBe(false);
    expect(isEmailAllowed({ ALLOWED_EMAILS: " , " }, "eu@exemplo.de")).toBe(false);
  });
});

// Achado da 2d: login de e-mail inexistente pulava o PBKDF2. O hash de
// mentira so' resolve se fizer verifyPassword percorrer o MESMO caminho de
// um hash real -- formato igual e o PBKDF2 inteiro rodando.
describe("DUMMY_PASSWORD_HASH", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("tem o mesmo formato de um hash real (prefixo, iteracoes, tamanho do salt e do hash)", async () => {
    const real = (await hashPassword("qualquer-senha")).split("$");
    const dummy = DUMMY_PASSWORD_HASH.split("$");
    expect(dummy).toHaveLength(real.length);
    expect(dummy[0]).toBe(real[0]);
    expect(dummy[1]).toBe(real[1]);
    expect(dummy[2]).toHaveLength(real[2].length);
    expect(dummy[3]).toHaveLength(real[3].length);
    expect(dummy[2]).toMatch(/^[0-9a-f]+$/);
    expect(dummy[3]).toMatch(/^[0-9a-f]+$/);
  });

  it("faz verifyPassword rodar o PBKDF2 completo e devolver false", async () => {
    const deriveBits = vi.spyOn(crypto.subtle, "deriveBits");
    expect(await verifyPassword("qualquer-senha", DUMMY_PASSWORD_HASH)).toBe(false);
    expect(deriveBits).toHaveBeenCalledTimes(1);
    const [params] = deriveBits.mock.calls[0] as [Pbkdf2Params, ...unknown[]];
    expect(params.iterations).toBe(Number(DUMMY_PASSWORD_HASH.split("$")[1]));
    expect((params.salt as Uint8Array).byteLength).toBe(16);
  });
});
