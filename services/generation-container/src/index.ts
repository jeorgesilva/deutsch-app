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
import { Container } from "@cloudflare/containers";
import type { DurableObject } from "cloudflare:workers";

export class GenerationContainer extends Container<Env> {
  defaultPort = 8080;
  pingEndpoint = "/health";
  sleepAfter = "30m";
  // achado testando o deploy real: enableInternet=true + allowedHosts
  // (com ContainerProxy exportado, exigido pra outbound interception)
  // deixava o container preso em "not running, consider calling start()"
  // -- mecanismo pouco documentado, não consegui isolar a causa exata sem
  // acesso a log do container em si. Caiu pro enableInternet=true simples
  // (mesmo padrão já comprovado do phonetic-container, só invertido) --
  // sem allowlist de host no nível de rede, mas o acesso já é protegido
  // por GENERATION_SHARED_SECRET, e os únicos hosts que o código de fato
  // alcança são os que generation/llm_client.py sabe chamar (Gemini/HF,
  // dado o "engine"/"model" que o Worker principal envia, sempre de uma
  // lista fixa -- nunca input arbitrário de usuário final).
  enableInternet = true;

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

    try {
      const container = env.GENERATION_CONTAINER.getByName(SINGLETON_ID);
      await container.startAndWaitForPorts();
      return await container.fetch(request);
    } catch (err) {
      // nunca deixar isso virar a pagina generica "error code: 1101" do
      // Cloudflare -- devolve o erro de verdade pro chamador (docs/16:
      // "tratar cota estourada/provedor indisponivel como erro legivel,
      // nunca travamento silencioso" -- vale igual pra falha do proprio
      // container, achado depurando o primeiro deploy real).
      return Response.json(
        { error: `container error: ${(err as Error).message}`, stack: (err as Error).stack },
        { status: 502 }
      );
    }
  },
};
