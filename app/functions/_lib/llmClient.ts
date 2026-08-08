// Fase 10 -- abstracao de provedor de LLM pro Worker, espelhando
// pipeline/src/deutsch_pipeline/generation/llm_client.py de proposito
// (mesmo principio: chat(model, ...) decide o provedor pelo PREFIXO do
// nome do model, quem chama nunca sabe nem precisa saber qual API esta
// por tras). Trocar de provedor ou modelo no futuro e' so' trocar a
// STRING do model (ou DEFAULT_CHAT_MODEL abaixo) -- nenhum chamador muda.
//
// Diferente do pipeline (sempre geracao single-turn via chat(model,
// system, user)), aqui o contrato ja nasce como `messages` (historico
// completo) desde o primeiro uso, porque StructuredSpeechEngine precisa de
// conversa multi-turno -- um contrato single-turn teria que ser reescrito
// assim que o primeiro caso de uso multi-turno aparecesse.
//
// So' Hugging Face esta implementado agora (decisao do usuario). Os outros
// branches ficam como stub com erro claro em vez de codigo morto ou TODO
// silencioso -- mas a FORMA de adicionar um provedor novo (mais um
// `model.startsWith(...)`, mais uma funcao _chatXxx, mais um secret em
// .dev.vars) e' identica ao padrao ja validado no pipeline.
import { Env } from "./types";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export const DEFAULT_CHAT_MODEL = "hf:deepseek-ai/DeepSeek-V3";

export async function chat(env: Env, model: string, messages: ChatMessage[], temperature = 0.7): Promise<string> {
  if (model.startsWith("hf:")) return chatHuggingFace(env, model.slice(3), messages, temperature);
  if (model.startsWith("gemini") || model.startsWith("gemma")) return chatGemini(model, messages, temperature);
  if (model.startsWith("claude")) return chatClaude(model, messages, temperature);
  throw new Error(
    `provedor de LLM nao implementado pro prefixo do model "${model}" -- adicione um branch novo em _lib/llmClient.ts (mesmo padrao do pipeline, generation/llm_client.py)`
  );
}

async function chatHuggingFace(env: Env, model: string, messages: ChatMessage[], temperature: number): Promise<string> {
  if (!env.HUGGINGFACE_API_KEY) {
    throw new Error("HUGGINGFACE_API_KEY nao configurado");
  }
  const res = await fetch("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.HUGGINGFACE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, temperature, messages }),
  });
  if (!res.ok) {
    throw new Error(`Hugging Face respondeu ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content ?? "";
}

// stubs -- pra ativar, seguir o mesmo padrao de _chat_gemini/_chat_claude
// em pipeline/src/deutsch_pipeline/generation/llm_client.py: ler a chave
// do Env (adicionar o campo em types.ts), montar o request no formato da
// API, extrair o texto da resposta. Nenhum outro arquivo deste projeto
// precisa mudar -- so' quem chama chat() com um model desse prefixo passa
// a funcionar.
async function chatGemini(model: string, _messages: ChatMessage[], _temperature: number): Promise<string> {
  throw new Error(`provedor Gemini ainda nao implementado no Worker (model "${model}") -- ver llm_client.py::_chat_gemini`);
}

async function chatClaude(model: string, _messages: ChatMessage[], _temperature: number): Promise<string> {
  throw new Error(`provedor Claude ainda nao implementado no Worker (model "${model}") -- ver llm_client.py::_chat_claude`);
}

// mesmo problema ja resolvido em generation/pilot.py (extract_json_array) --
// modelos as vezes envolvem o JSON em cerca de markdown ou acrescentam uma
// frase antes/depois mesmo com instrucao explicita pra nao fazer isso.
// Extrai o primeiro bloco {...} balanceado, ignora o resto.
export function extractJsonObject(raw: string): string {
  const start = raw.indexOf("{");
  if (start === -1) throw new Error("resposta do LLM nao contem JSON: " + raw.slice(0, 200));
  let depth = 0;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === "{") depth++;
    else if (raw[i] === "}") {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  throw new Error("JSON do LLM nao fechou balanceado: " + raw.slice(0, 200));
}
