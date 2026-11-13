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
    //
    // Fase 15 (batch diario) -- D1_HTTP_API_TOKEN e' o nome EXATO que
    // ingest/write_exercises.py le via os.environ pra escrever direto no D1
    // de PRODUÇÃO via HTTP API (não há `wrangler` CLI dentro do container,
    // Python puro -- ver o comentário longo em write_exercises.py pro
    // porquê). Token precisa de permissão "D1 Edit" no Cloudflare, escopado
    // à conta -- CRIADO PELO USUÁRIO via dashboard (não dá pra mintar um
    // token de API a partir da sessão OAuth do `wrangler login` local, as
    // duas coisas são mecanismos diferentes) e setado com
    // `wrangler secret put CLOUDFLARE_API_TOKEN` neste diretório.
    // Secret ausente vira "" aqui; write_exercises.py trata "" como "fora do
    // container" e cai no caminho `npx wrangler`, que nao existe na imagem --
    // por isso o aviso explicito.
    if (!env.CLOUDFLARE_API_TOKEN) {
      console.error("CLOUDFLARE_API_TOKEN ausente -- o batch diario nao consegue gravar no D1");
    }
    this.envVars = {
      GEMINI_API_KEY: env.GEMINI_API_KEY ?? "",
      hugging_face_api_key: env.HUGGINGFACE_API_KEY ?? "",
      D1_HTTP_API_TOKEN: env.CLOUDFLARE_API_TOKEN ?? "",
    };
  }
}

interface Env {
  GENERATION_CONTAINER: DurableObjectNamespace<GenerationContainer>;
  GENERATION_SHARED_SECRET: string;
  GEMINI_API_KEY?: string;
  HUGGINGFACE_API_KEY?: string;
  CLOUDFLARE_API_TOKEN?: string;
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
const DAILY_TARGET_PER_TYPE = 10;
const DEFAULT_MODEL = "hf:deepseek-ai/DeepSeek-V3";

async function getReadyContainer(env: Env) {
  const container = env.GENERATION_CONTAINER.getByName(SINGLETON_ID);
  await container.startAndWaitForPorts();
  return container;
}

// Chamada INTERNA container -> container.fetch, nunca passa pelo Bearer
// (esse só protege a borda pública do Worker, ver fetch() abaixo) -- mesmo
// padrão de "endpoint interno" que /generate-topic já não precisava
// reautenticar por dentro.
async function callContainerJson(
  container: Awaited<ReturnType<typeof getReadyContainer>>,
  path: string,
  body: unknown
): Promise<any> {
  const req = new Request(`http://container${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const resp = await container.fetch(req);
  const data = (await resp.json()) as any;
  if (!resp.ok) throw new Error(data?.error ?? `HTTP ${resp.status}`);
  return data;
}

// Fase 15 -- 10 vídeos novos + 10 blocos de notícia novos por dia (docs/16
// nunca previu isso, decisão posterior do usuário). Cada item é UMA chamada
// HTTP curta e autocontida (o container decide sozinho qual é o "próximo"
// item, consultando o D1 -- ver video/daily_batch.py e
// generation/daily_reading_batch.py); loop sequencial aqui em vez de N
// chamadas em paralelo de propósito -- mantém cada request individual curta
// (evita depender de quão longo um único fetch/scheduled pode durar) e dá
// isolamento de falha por item sem esforço extra (item 7 falhando não
// derruba 1-6, mesmo espírito do checkpoint por tópico de generate_batch.py).
async function runDailyBatch(env: Env): Promise<{ video: any[]; reading: any[] }> {
  const container = await getReadyContainer(env);
  const video: any[] = [];
  const reading: any[] = [];

  for (let i = 0; i < DAILY_TARGET_PER_TYPE; i++) {
    try {
      const result = await callContainerJson(container, "/generate-video-item", { model: DEFAULT_MODEL });
      video.push(result);
      if (result.skipped) break; // playlist esgotada dentro da janela de duração -- parar de tentar
    } catch (err) {
      video.push({ error: (err as Error).message });
    }
  }

  for (let i = 0; i < DAILY_TARGET_PER_TYPE; i++) {
    try {
      const result = await callContainerJson(container, "/generate-reading-item", { model: DEFAULT_MODEL });
      reading.push(result);
      if (result.skipped) break; // feed da DW sem artigo novo -- parar de tentar
    } catch (err) {
      reading.push({ error: (err as Error).message });
    }
  }

  return { video, reading };
}

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

    // Gatilho manual -- mesma função que o cron (scheduled(), abaixo) chama
    // sozinho às 6h. Existe pra testar o batch ponta a ponta sob demanda
    // (curl) sem esperar o cron disparar, e pra rodar o primeiro lote do dia
    // em que isso foi ligado.
    if (url.pathname === "/run-daily-batch") {
      try {
        const result = await runDailyBatch(env);
        return Response.json(result);
      } catch (err) {
        return Response.json({ error: `daily batch error: ${(err as Error).message}` }, { status: 502 });
      }
    }

    try {
      const container = await getReadyContainer(env);
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

  // 06:00 CEST = 04:00 UTC (ver [triggers] em wrangler.toml) -- 10 vídeos +
  // 10 notícias novos por dia, sem confirmação/curadoria humana (decisão do
  // usuário, ver video/daily_batch.py e generation/reading_sources.py pro
  // raciocínio de cada fonte). waitUntil segura o Worker vivo além do fim
  // síncrono do evento -- necessário porque o batch inteiro (até 20 chamadas
  // sequenciais, cada uma com I/O de LLM/yt-dlp) passa fácil de 1 minuto.
  //
  // O resultado e' logado de proposito: sem isso, erro por item (que
  // runDailyBatch guarda no array em vez de lancar) e falha ao subir o
  // container nunca apareciam no log do Worker -- o cron ficou parado desde
  // 10/10/2026 (conta com pagamento em atraso) sem nenhum sinal.
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      runDailyBatch(env).then(
        (result) => {
          const errors = [...result.video, ...result.reading].filter((r) => r?.error);
          const summary = {
            video_ok: result.video.filter((r) => !r?.error && !r?.skipped).length,
            reading_ok: result.reading.filter((r) => !r?.error && !r?.skipped).length,
            errors: errors.map((r) => r.error),
          };
          if (errors.length) console.error("daily batch com erros", JSON.stringify(summary));
          else console.log("daily batch ok", JSON.stringify(summary));
        },
        (err) => {
          console.error("daily batch falhou antes do loop", (err as Error).message, (err as Error).stack);
        }
      )
    );
  },
};
