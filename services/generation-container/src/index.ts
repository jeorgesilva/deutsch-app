// docs/14 -- Worker fino na frente do container Python (Flask/waitress, ver
// ../run.py e ../Dockerfile). Mesmo padrao singleton do phonetic-container
// (Fase 14): so' precisamos de UMA instancia, sem balanceamento.
//
// UNICA excecao a enableInternet=false do resto do projeto: este container
// PRECISA alcancar a API do provedor de LLM (Gemini/Hugging Face) pra gerar
// exercicio -- geracao sempre foi "em lote/offline, nunca num Worker"
// (CLAUDE.md), mas nunca precisou dizer "nunca alcança a internet", so
// "nunca dentro do runtime limitado de um Worker". Mitigado com
// allowedHosts restrito aos 2 hosts que o provedor de fato usa (ver
// generation/llm_client.py) -- qualquer outro host recebe 520
// (cloudflare/containers egress allowlist), mesmo com enableInternet=true.
// LanguageTool roda via subprocess Java 100% LOCAL ao container (nunca sai
// pela rede), so o LLM usa isso.
import { Container, ContainerProxy } from "@cloudflare/containers";
import type { DurableObject } from "cloudflare:workers";

// obrigatorio pra allowedHosts funcionar de verdade (docs Cloudflare:
// "Export ContainerProxy from your Worker entrypoint for outbound
// interception to work" -- sem isso o egress nao e' de fato filtrado,
// achado rodando contra o deploy real: ctx.exports.ContainerProxy is
// undefined, 500 em toda chamada).
export { ContainerProxy };

export class GenerationContainer extends Container<Env> {
  defaultPort = 8080;
  pingEndpoint = "/health";
  sleepAfter = "30m";
  enableInternet = true;
  allowedHosts = ["generativelanguage.googleapis.com", "router.huggingface.co"];

  constructor(ctx: DurableObject["ctx"], env: Env) {
    super(ctx, env);
    // hugging_face_api_key (minusculo, com underscore) e' o nome EXATO que
    // generation/llm_client.py::_chat_huggingface le via os.environ -- nao
    // é o mesmo nome do secret do Worker (HUGGINGFACE_API_KEY), que segue a
    // convenção normal de secret do Cloudflare. Errar essa tradução faz a
    // chamada falhar silenciosamente com KeyError dentro do container.
    this.envVars = {
      GEMINI_API_KEY: env.GEMINI_API_KEY ?? "",
      hugging_face_api_key: env.HUGGINGFACE_API_KEY ?? "",
    };
  }
}

interface Env {
  GENERATION_CONTAINER: DurableObjectNamespace<GenerationContainer>;
  GENERATION_SHARED_SECRET: string;
  GEMINI_API_KEY?: string;
  HUGGINGFACE_API_KEY?: string;
}

const SINGLETON_ID = "singleton";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }

    const auth = request.headers.get("Authorization");
    if (auth !== `Bearer ${env.GENERATION_SHARED_SECRET}`) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    const container = env.GENERATION_CONTAINER.getByName(SINGLETON_ID);
    await container.startAndWaitForPorts();
    return container.fetch(request);
  },
};
