// docs/14/16 -- Worker fino na frente do container Python (Flask/waitress,
// ver ../run.py e ../Dockerfile). Mesmo padrao singleton do phonetic-
// container (Fase 14): so' precisamos de UMA instancia, sem balanceamento.
//
// enableInternet: a premissa de que "Cloudflare Containers bloqueiam
// internet por padrao" estava ERRADA -- conferido em
// node_modules/@cloudflare/containers/README.md e dist/lib/container.js:325
// ("enableInternet = true"), o default do pacote (0.3.7) e' TRUE. Este
// container so precisa alcancar generativelanguage.googleapis.com/
// router.huggingface.co (generation/llm_client.py); mantido SEM
// allowedHosts/ContainerProxy de proposito -- ver o achado abaixo sobre por
// que essa combinacao quebrou. LanguageTool roda via subprocess Java 100%
// LOCAL ao container (nunca sai pela rede), so' o LLM usa a rede.
import { Container } from "@cloudflare/containers";
import type { DurableObject } from "cloudflare:workers";

export class GenerationContainer extends Container<Env> {
  defaultPort = 8080;
  pingEndpoint = "/health";
  sleepAfter = "30m";
  // Explicito por clareza de leitura, mesmo sendo o default do pacote.
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

// ACHADO REAL (nao flakiness de plataforma beta -- confirmado lendo
// node_modules/@cloudflare/containers/dist/lib/container.js 0.3.7 linha a
// linha): os dois erros do ciclo de debug de hoje eram dois bugs
// concretos e reproduziveis, nao um so' e nao aleatorio.
//
// 1. "ContainerProxy is undefined" -- ContainerProxy so e' exigido quando
//    `usingInterception` fica true (container.js:361-368), disparado por
//    allowedHosts/deniedHosts/outboundByHost/outbound OU por uma config de
//    outbound PERSISTIDA no storage do proprio Durable Object
//    (container.js:1065-1104, ctx.storage.kv -- nao e' parte do bundle do
//    Worker, sobrevive a qualquer redeploy de codigo). O primeiro deploy
//    de hoje setou allowedHosts contra o ID "singleton"; isso gravou uma
//    outbound-config no storage DAQUELE DO especifico. Remover
//    allowedHosts/ContainerProxy do codigo depois NUNCA limpa esse
//    storage -- nao existe setter que zera usingInterception de volta
//    (so' cresce). Por isso "enableInternet=false, sem export, config
//    byte-a-byte igual ao phonetic-container" ainda dava
//    "ContainerProxy is undefined": o CODIGO batia, o ESTADO do DO
//    "singleton" nao -- phonetic-container nunca usou allowedHosts, entao
//    nunca gravou essa config. enableInternet em si nunca entra nessa
//    checagem (conferido no source) -- a teoria "ContainerProxy exigido
//    por enableInternet, nao so allowedHosts" nao se sustenta.
// 2. "not running" / "no container instance" -- o texto do proprio erro do
//    SDK (container.js:874) aponta max_instances (=1 no wrangler.toml)
//    como causa provavel. Trocar o ID fixo por crypto.randomUUID() por
//    request (teste de isolamento de hoje) faz CADA request tentar
//    provisionar uma instancia nova, brigando com o teto de 1 instancia
//    enquanto a instancia "singleton" antiga ainda podia estar viva
//    (sleepAfter=30m). Explica por que trocar SO' o ID de DO (mantendo
//    enableInternet/export "identicos") mudou o erro: ID novo = sem
//    storage antigo do bug 1, mas caiu direto no bug 2.
//
// Fix: ID fixo de novo (nunca randomUUID por request -- reintroduz o bug
// 2 sempre), mas um literal NOVO (nunca usado antes) pra nascer com
// storage limpo em vez de reaproveitar "singleton", ja poluido pelo bug 1.
const SINGLETON_ID = "generation-v1-clean";

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
