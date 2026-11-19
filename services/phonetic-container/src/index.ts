// Fase 14 -- Worker fino na frente do container Python (Flask/waitress,
// ver ../run.py e ../Dockerfile). Padrao singleton (docs Cloudflare
// Containers): so' precisamos de UMA instancia rodando pra um app pessoal,
// nao balanceamento entre varias. Unico trabalho deste Worker: checar o
// segredo compartilhado antes de repassar pro container -- sem isso,
// qualquer um que ache a URL publica consumiria inferencia (paga) a toa.
import { Container } from "@cloudflare/containers";
import { isAuthorizedBearer } from "../../shared/bearer";

export class PhoneticContainer extends Container {
  defaultPort = 8080;
  // service.py expoe /health (nao o "/ping" default do pacote) -- setar
  // explicito, senao o probe de startup bate em rota inexistente.
  pingEndpoint = "/health";
  // AI-4.2 (Tech DD, 18/11/2026): era 30m. Container fica fora do spend
  // limit da Cloudflare (QA-5), entao tempo ocioso acordado e' custo sem teto.
  // 10m e nao 5m: o cold start carrega wav2vec2/faster-whisper, e uma sessao
  // que alterna itens de texto e de voz pegaria cold start a toda hora.
  sleepAfter = "10m";
  // modelos ja vem baked-in na imagem (Dockerfile baixa em build-time) --
  // o container nao precisa de rede em runtime, entao mantem fechado por
  // padrao (defesa em profundidade, nao um requisito funcional).
  enableInternet = false;
}

interface Env {
  PHONETIC_CONTAINER: DurableObjectNamespace<PhoneticContainer>;
  // opcional no tipo porque pode faltar em runtime -- isAuthorizedBearer
  // nega tudo nesse caso (AI-4.6a)
  PHONETIC_SHARED_SECRET?: string;
}

const SINGLETON_ID = "singleton";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    // /health fica fora do gate de segredo -- so' confirma que o Worker
    // (nao o container) esta no ar, sem vazar nada sensivel.
    if (url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }

    if (!env.PHONETIC_SHARED_SECRET) {
      console.error("PHONETIC_SHARED_SECRET ausente: todo request autenticado responde 401 (AI-4.6a)");
    }
    if (!isAuthorizedBearer(request.headers.get("Authorization"), env.PHONETIC_SHARED_SECRET)) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    const container = env.PHONETIC_CONTAINER.getByName(SINGLETON_ID);
    await container.startAndWaitForPorts();
    return container.fetch(request);
  },
};
