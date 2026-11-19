// AI-4.1 (Tech DD, 18/11/2026) -- tetos do limite de login. So' a parte
// pura; a consulta ao D1 fica para o teste manual local (Fase 3).
import { describe, expect, it } from "vitest";
import { clientIp, isOverLimit, MAX_FAILURES_PER_EMAIL, MAX_FAILURES_PER_IP } from "../functions/_lib/loginThrottle";

describe("isOverLimit", () => {
  it("tetos aprovados: 5 por ip, 20 por e-mail", () => {
    expect(MAX_FAILURES_PER_IP).toBe(5);
    expect(MAX_FAILURES_PER_EMAIL).toBe(20);
  });

  it("libera abaixo dos dois tetos", () => {
    expect(isOverLimit({ by_ip: 4, by_email: 19 })).toBe(false);
  });

  it("bloqueia ao chegar no teto por ip", () => {
    expect(isOverLimit({ by_ip: 5, by_email: 0 })).toBe(true);
  });

  it("bloqueia ao chegar no teto por e-mail, mesmo com ip limpo", () => {
    expect(isOverLimit({ by_ip: 0, by_email: 20 })).toBe(true);
  });
});

describe("clientIp", () => {
  it("usa o CF-Connecting-IP", () => {
    const req = new Request("https://x.test/api/auth/login", { headers: { "CF-Connecting-IP": "203.0.113.7" } });
    expect(clientIp(req)).toBe("203.0.113.7");
  });

  it("sem o cabecalho, cai numa chave unica", () => {
    expect(clientIp(new Request("https://x.test/api/auth/login"))).toBe("sem-ip");
  });
});
