// Fase 11 -- QuickOpinionSpeechEngine (docs/05 item 103, "Einerseits...
// andererseits..."). Flash prompt: topico gerado sob demanda (nao vem do
// pipeline offline, nao ha KB curada pra "opiniao rapida do dia" -- mesmo
// principio ja usado pelas personas hostis, que tambem inventam cenario
// quando nenhum topico fixo existe). Rubrica LEVE de proposito -- resposta
// e' curta e espontanea, diferente do OpinionEssayEngine (~230 palavras,
// estrutura de 4 partes obrigatoria).
import { chat, DEFAULT_CHAT_MODEL, extractJsonObject } from "./llmClient";
import { Env } from "./types";

const TOPIC_SYSTEM_PROMPT = `Você gera um tópico rápido de opinião para prática de alemão B2/C1+ -- o usuário vai responder usando a estrutura "Einerseits... andererseits..." (por um lado... por outro lado...), então o tópico precisa DEIXAR ESPAÇO pra ele construir esse contraste, não fazer isso por ele.

IMPORTANTE: NÃO escreva "einerseits/andererseits" nem monte o contraste você mesmo no tópico -- só apresente um tema cotidiano/atual que admite naturalmente duas perspectivas, como uma pergunta neutra simples (ex.: "Sollte man im Homeoffice arbeiten dürfen?", não "Einerseits ist Homeoffice praktisch, andererseits..."). Quem contrasta os dois lados é o USUÁRIO, na resposta dele.

Responda SOMENTE com essa pergunta curta e direta em ALEMÃO (sem markdown, sem aspas, só a pergunta).`;

export async function generateQuickOpinionTopic(env: Env): Promise<string> {
  const raw = await chat(
    env,
    DEFAULT_CHAT_MODEL,
    [
      { role: "system", content: TOPIC_SYSTEM_PROMPT },
      { role: "user", content: "Gere um tópico novo, diferente dos clichês mais óbvios." },
    ],
    0.9
  );
  return raw.trim();
}

export interface QuickOpinionError {
  trecho: string;
  problema: string;
  sugestao: string;
}

export interface QuickOpinionRubric {
  used_contrast_structure: boolean;
  errors: QuickOpinionError[];
  strengths: string[];
  cefr_estimate: string;
}

const GRADE_SYSTEM_PROMPT = `Você é um tutor de alemão B2/C1+, avaliando uma resposta RÁPIDA e CURTA de opinião (formato "Einerseits... andererseits..."). Rubrica LEVE -- não espere um texto longo nem estruturado como um ensaio, é fala espontânea.

Responda SOMENTE com um objeto JSON (sem markdown, sem texto antes ou depois), exatamente neste formato:

{
  "used_contrast_structure": boolean,
  "errors": [{"trecho": string, "problema": string, "sugestao": string}],
  "strengths": string[],
  "cefr_estimate": string
}

Regras:
- "used_contrast_structure": true se a resposta pondera claramente dois lados (não precisa usar literalmente "einerseits/andererseits", mas precisa contrastar duas perspectivas de verdade).
- "errors": erros reais de gramática/regência/caso/idiomatismo. "trecho" e "sugestao" ficam em ALEMÃO, "problema" em PORTUGUÊS.
- "strengths": pontos fortes reais (nunca inventar se não houver nenhum genuíno) -- sempre em PORTUGUÊS.
- "cefr_estimate": estimativa honesta ("B1", "B2", "B2+", "C1", "C1+"), calibrada pro tamanho curto -- não penalize só por ser breve, avalie a qualidade do que foi dito.`;

export async function gradeQuickOpinion(env: Env, topic: string, text: string): Promise<QuickOpinionRubric> {
  const content = await chat(
    env,
    DEFAULT_CHAT_MODEL,
    [
      { role: "system", content: GRADE_SYSTEM_PROMPT },
      { role: "user", content: `Tópico: ${topic}\n\nResposta do usuário:\n${text}` },
    ],
    0.3
  );
  return JSON.parse(extractJsonObject(content)) as QuickOpinionRubric;
}
