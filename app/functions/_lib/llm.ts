// Fase 10 -- OpinionEssayEngine: primeiro uso do terceiro mecanismo de
// correcao do projeto (LLM com rubrica estruturada, CLAUDE.md). Diferente
// da geracao em lote do pipeline (sempre offline), aqui a chamada e'
// necessariamente em tempo real -- avalia o texto que o usuario acabou de
// escrever, nao da pra pre-gerar. Isso nao viola "geracao e' sempre em
// lote": essa regra e' sobre CRIAR exercicios, nao sobre CORRIGIR uma
// resposta aberta -- o mesmo limite de CPU do Worker que bloqueia LLM local
// nao se aplica aqui porque isso e' so um fetch HTTPS pra uma API externa.
//
// A chamada em si (qual provedor, qual modelo) vive em _lib/llmClient.ts --
// generica o bastante pra trocar de API/modelo so' mudando a string do
// model, sem tocar neste arquivo (decisao do usuario). Este arquivo so'
// cuida do que e' especifico do OpinionEssayEngine: o prompt e o formato
// da rubrica.
import { chat, DEFAULT_CHAT_MODEL, extractJsonObject } from "./llmClient";
import { Env } from "./types";

export interface EssayError {
  trecho: string;
  problema: string;
  sugestao: string;
}

export interface EssayRubric {
  structure: {
    tese: boolean;
    argumentos: boolean;
    contra_argumento: boolean;
    conclusao: boolean;
  };
  word_count: number;
  vocabulary_used: string[];
  vocabulary_missing: string[];
  errors: EssayError[];
  strengths: string[];
  cefr_estimate: string;
}

const SYSTEM_PROMPT = `Você é um tutor de alemão B2/C1+, avaliando um "Diskussionsbeitrag" (parágrafo de opinião argumentativo) de ~230 palavras. A estrutura esperada tem 4 partes: tese, argumentos, contra-argumento, conclusão.

Responda SOMENTE com um objeto JSON (sem markdown, sem texto antes ou depois), exatamente neste formato:

{
  "structure": {"tese": boolean, "argumentos": boolean, "contra_argumento": boolean, "conclusao": boolean},
  "word_count": number,
  "vocabulary_used": string[],
  "vocabulary_missing": string[],
  "errors": [{"trecho": string, "problema": string, "sugestao": string}],
  "strengths": string[],
  "cefr_estimate": string
}

Regras:
- "structure": cada campo é true só se essa parte estiver claramente presente no texto.
- "word_count": contagem real de palavras do texto.
- "vocabulary_used"/"vocabulary_missing": particionam a lista de vocabulário-alvo fornecida (cada item vai para um dos dois, nenhum de fora dela).
- "errors": erros reais de gramática/regência/caso/idiomatismo. "trecho" e "sugestao" ficam em ALEMÃO (cópia literal do texto do usuário e a correção). "problema" fica em PORTUGUÊS, explicação curta e direta.
- "strengths": pontos fortes reais do texto (nunca inventar se não houver nenhum genuíno) — sempre em PORTUGUÊS. Nunca deixar vazio SE E SOMENTE SE "errors" também tiver itens (não é objetivo ter os dois vazios nem os dois cheios artificialmente) — reporte o que for verdade.
- "cefr_estimate": estimativa honesta ("B1", "B2", "B2+", "C1", "C1+"), baseada na complexidade sintática e precisão real do texto, não no que o usuário tentou fazer.`;

function buildUserPrompt(theme: string, targetVocabulary: string[], text: string): string {
  const vocabLine = targetVocabulary.length > 0 ? targetVocabulary.join(", ") : "(nenhum vocabulário-alvo definido)";
  return `Tema da semana: ${theme}\nVocabulário-alvo: ${vocabLine}\n\nTexto do usuário:\n${text}`;
}

export async function gradeOpinionEssay(
  env: Env,
  theme: string,
  targetVocabulary: string[],
  text: string
): Promise<EssayRubric> {
  const content = await chat(
    env,
    DEFAULT_CHAT_MODEL,
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(theme, targetVocabulary, text) },
    ],
    0.3
  );
  return JSON.parse(extractJsonObject(content)) as EssayRubric;
}
