// Fase 14 -- Worker fino na frente do container Python (Flask/waitress,
// ver ../run.py e ../Dockerfile). Padrao singleton (docs Cloudflare
// Containers): so' precisamos de UMA instancia rodando pra um app pessoal,
// nao balanceamento entre varias. Unico trabalho deste Worker: checar o
// segredo compartilhado antes de repassar pro container -- sem isso,
// qualquer um que ache a URL publica consumiria inferencia (paga) a toa.
import { Container } from "@cloudflare/containers";

export class PhoneticContainer extends Container {
  defaultPort = 8080;
  // service.py expoe /health (nao o "/ping" default do pacote) -- setar
  // explicito, senao o probe de startup bate em rota inexistente.
  pingEndpoint = "/health";
  sleepAfter = "30m";
  // modelos ja vem baked-in na imagem (Dockerfile baixa em build-time) --
  // o container nao precisa de rede em runtime, entao mantem fechado por
  // padrao (defesa em profundidade, nao um requisito funcional).
  enableInternet = false;
}

interface Env {
  PHONETIC_CONTAINER: DurableObjectNamespace<PhoneticContainer>;
  PHONETIC_SHARED_SECRET: string;
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

    const auth = request.headers.get("Authorization");
    if (auth !== `Bearer ${env.PHONETIC_SHARED_SECRET}`) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    const container = env.PHONETIC_CONTAINER.getByName(SINGLETON_ID);
    await container.startAndWaitForPorts();
    return container.fetch(request);
  },
};
