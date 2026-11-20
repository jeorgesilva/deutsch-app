// AI-4.6c (Tech DD, 18/11/2026) -- erro de servidor nao chega ao navegador.
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicError, publicErrorResponse, upstreamFailure } from "../functions/_lib/errors";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("upstreamFailure", () => {
  it("erro comum: mensagem generica ao cliente, detalhe so' no log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("Hugging Face respondeu 401: token hf_SEGREDO invalido");

    const res = upstreamFailure("rota/x", err, "o serviço de IA não respondeu");

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toEqual({ error: "o serviço de IA não respondeu" });
    expect(JSON.stringify(body)).not.toContain("SEGREDO");
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toBe("rota/x");
    expect(String(log.mock.calls[0][1])).toContain("hf_SEGREDO");
  });

  it("respeita o status pedido", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(upstreamFailure("rota/x", new Error("x"), "generico", 400).status).toBe(400);
  });

  it("PublicError passa com a propria mensagem e status, sem log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = upstreamFailure("rota/x", new PublicError("sessão não encontrada", 404), "generico");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "sessão não encontrada" });
    expect(log).not.toHaveBeenCalled();
  });

  it("valor lancado que nao e' Error tambem vira mensagem generica", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = upstreamFailure("rota/x", "D1_ERROR: no such column: segredo", "generico");

    expect(await res.json()).toEqual({ error: "generico" });
    expect(log.mock.calls[0][1]).toBe("D1_ERROR: no such column: segredo");
  });
});

describe("publicErrorResponse", () => {
  it("usa a mensagem e o status do PublicError", async () => {
    const res = publicErrorResponse(new PublicError("limite de 15 falas", 409));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "limite de 15 falas" });
  });
});
