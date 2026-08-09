// Feedback em linguagem natural pra toda tentativa dos templates
// deterministicos (Grupo A) -- decisao do usuario: um paragrafo gerado por
// LLM a cada resposta (certa OU errada), nao so' a regra estatica curada
// (exercises.source_rule, que ja existia no banco mas nunca era devolvida
// pro frontend). Mesmo mecanismo de _lib/llmClient.ts ja usado pelo
// OpinionEssayEngine/roleplay -- e' so' um fetch HTTPS externo, nao viola
// "geracao e' sempre em lote" (essa regra e' sobre CRIAR exercicio, nao
// sobre explicar uma resposta que o usuario acabou de dar).
import { chat, DEFAULT_CHAT_MODEL } from "./llmClient";
import { Env, ExerciseRow } from "./types";

const SYSTEM_PROMPT = `Você é um tutor de alemão B2/C1+ dando feedback logo após o usuário responder um exercício. Escreva UM PARÁGRAFO curto (3-5 frases), em português, sem markdown, sem título, sem listas.

Se o resultado for INCORRETO: explique especificamente o que está errado na resposta do usuário e por quê, citando a regra gramatical envolvida (use o texto de "Regra" se houver) e qual é a forma certa. Seja concreto sobre O QUE o usuário escreveu, não genérico.

Se o resultado for CORRETO: confirme o acerto e explique BREVEMENTE por que essa é a forma certa, reforçando a lógica da regra — não é redundante, ajuda a fixar o padrão.

Responda só com o parágrafo, nada antes ou depois.`;

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export async function explainAttempt(
  env: Env,
  exercise: Pick<ExerciseRow, "template_nome" | "prompt" | "accepted_answers" | "source_rule">,
  userResponse: string,
  correct: boolean
): Promise<string | null> {
  const lines = [
    `Template: ${exercise.template_nome}`,
    `Exercício (bruto, pode ser texto simples ou JSON dependendo do template): ${truncate(exercise.prompt, 600)}`,
    `Respostas aceitas: ${truncate(exercise.accepted_answers, 400)}`,
    exercise.source_rule ? `Regra: ${exercise.source_rule}` : null,
    `Resposta do usuário: ${truncate(userResponse, 300)}`,
    `Resultado: ${correct ? "CORRETO" : "INCORRETO"}`,
  ].filter((l): l is string => l !== null);

  try {
    const content = await chat(
      env,
      DEFAULT_CHAT_MODEL,
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: lines.join("\n") },
      ],
      0.4
    );
    return content.trim();
  } catch {
    // feedback e' complementar -- uma falha na API externa nunca pode
    // bloquear o registro da tentativa/FSRS, so' fica sem o paragrafo.
    return null;
  }
}
