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
import { WorkflowEntrypoint } from "cloudflare:workers";
import type { DurableObject, WorkflowEvent, WorkflowStep } from "cloudflare:workers";

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
  HEALTHCHECKS_PING_URL?: string;
  DAILY_BATCH: Workflow;
  TOPIC_REGENERATION: Workflow<RegenerationParams>;
  DB: D1Database;
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
//
// 14/11/2026 -- virou Workflow. Rodando dentro do scheduled(), o batch era
// cancelado aos 15 min (teto de Cron Trigger) e o resumo + heartbeat nunca
// rodavam; erro por item ficava so' no array e sumia junto. Agora cada item e'
// um step duravel (resultado persistido; se a instancia cair, retoma do
// ultimo step concluido), todo erro e' logado na hora e o heartbeat e' o
// ultimo step.
//
// So' leitura (decisao do usuario, 14/11/2026): video saiu do batch na nuvem.
// O YouTube devolve 429 no download de legenda pro IP de datacenter do
// container; ingestao de video passou a ser script local, do IP residencial.
// /generate-video-item continua no container, so' nao e' mais chamado daqui.

// Resultado de step precisa ser serializavel e fica persistido pelo Workflow:
// guarda so' o que o resumo usa, nao o JSON inteiro do container.
type ItemResult = { skipped?: boolean; error?: string; reason?: string; id?: number };

function summarizeItem(raw: any): ItemResult {
  if (raw?.skipped) return { skipped: true, reason: String(raw.reason ?? "") };
  return { id: raw?.reading_block_id };
}

export class DailyBatchWorkflow extends WorkflowEntrypoint<Env> {
  async run(_event: Readonly<WorkflowEvent<unknown>>, step: WorkflowStep) {
    const reading: ItemResult[] = [];

    for (let i = 1; i <= DAILY_TARGET_PER_TYPE; i++) {
      const name = `reading-${i}`;
      let result: ItemResult;
      // step.do lanca depois de esgotar os retries; o catch fica FORA dele
      // pra uma falha de item virar {error} logado na hora em vez de derrubar
      // o Workflow antes do heartbeat. 1 retry: falha transitoria de LLM/rede
      // costuma passar.
      try {
        result = await step.do(
          name,
          { retries: { limit: 1, delay: "30 seconds", backoff: "constant" }, timeout: "10 minutes" },
          async () =>
            summarizeItem(
              await callContainerJson(await getReadyContainer(this.env), "/generate-reading-item", { model: DEFAULT_MODEL })
            )
        );
      } catch (err) {
        const message = (err as Error).message;
        console.error(`daily batch item falhou: ${name}`, message);
        result = { error: message };
      }
      reading.push(result);
      if (result.skipped) break; // feed da DW sem artigo novo
    }

    // Conta como falha pro healthchecks (decisao do usuario, 14/11/2026): o
    // batch rejeitar, QUALQUER erro por item, ou nada novo entrar (inclusive
    // quando o feed so' devolve skipped). Sucesso parcial com erro manda
    // /fail de proposito -- degradacao nao fica escondida.
    const errors = reading.filter((r) => r.error);
    const summary = {
      reading_ok: reading.filter((r) => !r.error && !r.skipped).length,
      errors: errors.map((r) => r.error),
    };
    const ok = errors.length === 0 && summary.reading_ok > 0;
    await step.do("heartbeat", { retries: { limit: 0, delay: "1 second" } }, async () => {
      if (errors.length) console.error("daily batch com erros", JSON.stringify(summary));
      else if (!ok) console.error("daily batch sem item novo", JSON.stringify(summary));
      else console.log("daily batch ok", JSON.stringify(summary));
      await pingHealthcheck(this.env, ok);
    });
    return summary;
  }
}

// docs/19, 4c -- geracao sob demanda, antes rodando no waitUntil da Pages
// Function (cancelado ~30 s depois da resposta; um lote real leva minutos).
// A Pages Function continua dona do job: cria a linha 'pending' em
// topic_regeneration_jobs, resolve topico + engines mapeados e dispara uma
// instancia por job (id "job-<id>", entao o mesmo job nunca roda duas vezes).
// Daqui pra frente quem escreve no D1 e' este Workflow; o container segue
// D1-blind em /generate-topic.
//
// Requisitos da revisao de 14/11 (docs/19, 4c):
// - so' trabalha se pending -> running mudar uma linha;
// - todo INSERT e o 'done' exigem status = 'running' (o watchdog do Pages pode
//   ter marcado 'failed' no meio, e ai o job para em vez de ressuscitar);
// - cada engine grava de uma vez (DB.batch e' atomico) e o retry nao repete
//   engine ja gravado: gerar e gravar sao steps separados, entao o retry do
//   step de gravacao reusa os MESMOS itens (resultado persistido do step de
//   geracao) e a checagem pelo prompt do 1o item pega o caso de o batch ter
//   commitado e o step ter caido antes de registrar o resultado.
interface RegenerationTopic {
  id: number;
  categoria: string;
  topico: string;
  nivel: string | null;
  regra: string;
  exemplo: string | null;
  fonte: string | null;
}

interface RegenerationParams {
  jobId: number;
  contentTopicId: number;
  topic: RegenerationTopic;
  engines: { id: number; nome: string }[];
}

// mesmo valor de antes no topicRegeneration.ts: 1 chamada de LLM por engine
const REGEN_N_PER_TOPIC = 5;

// ja no formato das colunas: resultado de step precisa ser serializavel
type RegenRow = {
  variation_number: number | null;
  prompt: string;
  accepted_answers: string;
  source_rule: string | null;
  generated_by: string | null;
  validation_status: string;
  flag_reason: string | null;
  flag_detail: string | null;
};

const JOB_IS_RUNNING = `EXISTS (SELECT 1 FROM topic_regeneration_jobs WHERE id = ? AND status = 'running')`;

export class TopicRegenerationWorkflow extends WorkflowEntrypoint<Env, RegenerationParams> {
  async run(event: Readonly<WorkflowEvent<RegenerationParams>>, step: WorkflowStep) {
    const { jobId, contentTopicId, topic, engines } = event.payload;
    const db = this.env.DB;

    const claimed = await step.do("claim", async () => {
      const res = await db
        .prepare(`UPDATE topic_regeneration_jobs SET status = 'running' WHERE id = ? AND status = 'pending'`)
        .bind(jobId)
        .run();
      return res.meta.changes === 1;
    });
    if (!claimed) {
      console.warn(`topic regeneration: job ${jobId} nao estava pending, nada feito`);
      return { skipped: true };
    }

    const errors: string[] = [];
    let inserted = 0;
    let stopped = false;

    for (const engine of engines) {
      try {
        const rows = await step.do(
          `generate-${engine.nome}`,
          { retries: { limit: 1, delay: "30 seconds", backoff: "constant" }, timeout: "10 minutes" },
          async (): Promise<RegenRow[]> => {
            const data = await callContainerJson(await getReadyContainer(this.env), "/generate-topic", {
              engine: engine.nome,
              model: DEFAULT_MODEL,
              topic,
              n_per_topic: REGEN_N_PER_TOPIC,
              items_per_call: REGEN_N_PER_TOPIC,
            });
            return (data.exercises ?? []).map((ex: any) => ({
              variation_number: ex.variation_number ?? null,
              prompt: ex.prompt,
              accepted_answers: JSON.stringify(ex.accepted_answers ?? []),
              source_rule: ex.source_rule ?? null,
              generated_by: ex.generated_by ?? null,
              validation_status: ex.validation_status,
              flag_reason: ex.flag_reason ?? null,
              flag_detail: ex.flag_detail != null ? JSON.stringify(ex.flag_detail) : null,
            }));
          }
        );

        const written = await step.do(
          `write-${engine.nome}`,
          { retries: { limit: 2, delay: "10 seconds", backoff: "constant" } },
          async () => {
            if (rows.length === 0) return { inserted: 0, stopped: false };
            const already = await db
              .prepare(`SELECT 1 FROM exercises WHERE content_topic_id = ? AND exercise_template_id = ? AND prompt = ? LIMIT 1`)
              .bind(contentTopicId, engine.id, rows[0].prompt)
              .first();
            if (already) return { inserted: rows.length, stopped: false };

            const results = await db.batch(
              rows.map((r) =>
                db
                  .prepare(
                    `INSERT INTO exercises (exercise_template_id, content_topic_id, variation_number, prompt,
                                             accepted_answers, source_rule, generated_by, validation_status,
                                             flag_reason, flag_detail)
                     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${JOB_IS_RUNNING}`
                  )
                  .bind(
                    engine.id,
                    contentTopicId,
                    r.variation_number,
                    r.prompt,
                    r.accepted_answers,
                    r.source_rule,
                    r.generated_by,
                    r.validation_status,
                    r.flag_reason,
                    r.flag_detail,
                    jobId
                  )
              )
            );
            const n = results.reduce((acc, res) => acc + (res.meta.changes ?? 0), 0);
            // 0 linhas com itens pra gravar = o job saiu de 'running' (watchdog)
            return { inserted: n, stopped: n === 0 };
          }
        );
        inserted += written.inserted;
        if (written.stopped) {
          stopped = true;
          break;
        }
      } catch (err) {
        // mesmo criterio do batch diario: um engine falhando nao derruba os
        // outros; o job termina 'failed' com os erros no fim
        const message = `${engine.nome}: ${(err as Error).message}`;
        console.error("topic regeneration: engine falhou", jobId, message);
        errors.push(message);
      }
    }

    if (stopped) {
      console.warn(`topic regeneration: job ${jobId} saiu de running no meio, parado`);
      return { inserted, stopped: true };
    }

    await step.do("finish", async () => {
      const stmt = errors.length
        ? db
            .prepare(
              `UPDATE topic_regeneration_jobs SET status = 'failed', error = ?, completed_at = datetime('now')
               WHERE id = ? AND status = 'running'`
            )
            .bind(errors.join(" | ").slice(0, 500), jobId)
        : db
            .prepare(
              `UPDATE topic_regeneration_jobs SET status = 'done', completed_at = datetime('now')
               WHERE id = ? AND status = 'running'`
            )
            .bind(jobId);
      await stmt.run();
    });
    console.log("topic regeneration terminou", JSON.stringify({ jobId, inserted, errors }));
    return { inserted, errors };
  }
}

// Fase 6.1 -- dead man's switch (healthchecks.io). O check alerta tanto no
// /fail quanto na AUSENCIA de ping no periodo, entao cobre tambem o caso do
// cron nem disparar. Falha do proprio ping so' loga: nunca derruba o job.
async function pingHealthcheck(env: Env, ok: boolean) {
  const base = env.HEALTHCHECKS_PING_URL?.replace(/\/+$/, "");
  if (!base) {
    console.warn("HEALTHCHECKS_PING_URL ausente -- heartbeat do batch diario nao enviado");
    return;
  }
  try {
    await fetch(ok ? base : `${base}/fail`, { signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    console.error("ping do healthchecks falhou", (err as Error).message);
  }
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

    // Gatilho manual -- cria uma instancia do mesmo DailyBatchWorkflow que o
    // `schedules` do wrangler.toml dispara as 04:00 UTC. Responde na hora com
    // o id (o batch leva dezenas de minutos); o andamento fica no painel de
    // Workflows ou em GET /daily-batch-status?id=. Tambem faz o ping de
    // heartbeat no fim -- disparar a mao num dia em que o cron falhou conta
    // como "rodou".
    if (url.pathname === "/run-daily-batch") {
      const instance = await env.DAILY_BATCH.create();
      return Response.json({ instance_id: instance.id });
    }
    if (url.pathname === "/daily-batch-status") {
      const id = url.searchParams.get("id");
      if (!id) return Response.json({ error: "id obrigatorio" }, { status: 400 });
      const instance = await env.DAILY_BATCH.get(id);
      return Response.json(await instance.status());
    }

    // docs/19, 4c -- chamado pela Pages Function (start.ts) logo depois de
    // criar o job 'pending'. O andamento fica no proprio job, que o frontend
    // ja consulta; id fixo por job faz um segundo disparo falhar no create.
    if (url.pathname === "/topic-regeneration" && request.method === "POST") {
      const params = (await request.json()) as RegenerationParams;
      if (!Number.isInteger(params?.jobId) || !params.topic?.topico || !params.engines?.length) {
        return Response.json({ error: "jobId, topic e engines sao obrigatorios" }, { status: 400 });
      }
      try {
        const instance = await env.TOPIC_REGENERATION.create({ id: `job-${params.jobId}`, params });
        return Response.json({ instance_id: instance.id });
      } catch (err) {
        return Response.json({ error: `nao criou a instancia: ${(err as Error).message}` }, { status: 409 });
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
};
