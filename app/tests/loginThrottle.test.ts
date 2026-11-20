// AI-4.1 (Tech DD, 18/11/2026) -- limite de login. A reserva atomica (o
// INSERT ... SELECT WHERE) roda no D1 e foi testada contra o pages dev com
// requests simultaneos (Fase 3 e revisao do push); aqui fica a parte pura.
import { describe, expect, it } from "vitest";
import { clientIp, LOGIN_WINDOW_MINUTES, MAX_FAILURES_PER_EMAIL, MAX_FAILURES_PER_IP } from "../functions/_lib/loginThrottle";

describe("tetos do limite de login", () => {
  it("aprovados: 5 por ip, 20 por e-mail, janela de 15 minutos", () => {
    expect(MAX_FAILURES_PER_IP).toBe(5);
    expect(MAX_FAILURES_PER_EMAIL).toBe(20);
    expect(LOGIN_WINDOW_MINUTES).toBe(15);
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
