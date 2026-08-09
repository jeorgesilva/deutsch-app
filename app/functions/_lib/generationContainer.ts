// docs/14 -- cliente HTTP do serviço de geração sob demanda (services/
// generation-container/, Cloudflare Containers). Mesmo padrão de
// _lib/phonetics.ts: o Worker não pode rodar spaCy/LanguageTool/chamar LLM
// em lote (CLAUDE.md, "geração é sempre offline"), então um serviço à parte
// faz o trabalho pesado e devolve só o resultado já validado -- o Worker
// continua sendo o ÚNICO ponto de escrita em D1 (o container é puro
// cálculo, mesmo princípio já estabelecido pro serviço fonético).
export interface GenerationTopicInput {
  id: number;
  categoria: string;
  topico: string;
  nivel: string | null;
  regra: string;
  exemplo: string | null;
  fonte: string | null;
}

export interface GeneratedExercise {
  variation_number: number | null;
  prompt: string;
  accepted_answers: string[];
  source_rule: string | null;
  generated_by: string;
  validation_status: string;
  flag_reason: string | null;
  flag_detail: unknown;
}

export interface GenerateTopicResult {
  model_used: string;
  exercises: GeneratedExercise[];
  skipped_count: number;
}

export async function generateTopicExercises(
  serviceUrl: string,
  sharedSecret: string | undefined,
  engine: string,
  model: string,
  topic: GenerationTopicInput,
  nPerTopic: number
): Promise<GenerateTopicResult> {
  const res = await fetch(`${serviceUrl}/generate-topic`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sharedSecret ? { Authorization: `Bearer ${sharedSecret}` } : {}),
    },
    body: JSON.stringify({ engine, model, topic, n_per_topic: nPerTopic, items_per_call: nPerTopic }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`serviço de geração respondeu ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}
