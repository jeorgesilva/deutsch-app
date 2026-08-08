// Fase 9 -- correcao deterministica, uma funcao por formato de dado (nao
// por engine -- GapFillGovernanceEngine e FillBlankEngine usam o MESMO
// formato plano de string, entao a mesma funcao serve pras duas).
import { ExerciseRow } from "./types";

export interface GradeResult {
  correct: boolean;
  accepted_answers: unknown;
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function gradeTextGap(userResponse: string, acceptedAnswersJson: string): GradeResult {
  const accepted: string[] = JSON.parse(acceptedAnswersJson);
  const correct = accepted.some((a) => normalize(a) === normalize(userResponse));
  return { correct, accepted_answers: accepted };
}

function gradeWordBank(userResponse: string, acceptedAnswersJson: string): GradeResult {
  // accepted_answers do WordBankGuessEngine: lista de respostas aceitas
  // (mesmo formato do gap-fill) -- o "prompt" e' que carrega o word_bank,
  // mas a comparacao em si e' identica a um gap-fill de texto.
  return gradeTextGap(userResponse, acceptedAnswersJson);
}

function gradeUnscramble(userResponse: string, acceptedAnswersJson: string): GradeResult {
  // accepted_answers = [sequencia canonica completa] (UnscrambleEngine,
  // ParagraphOrderEngine) -- userResponse chega como os tokens escolhidos
  // pelo usuario, ja juntados com espaco pelo frontend.
  const accepted: string[] = JSON.parse(acceptedAnswersJson);
  const correct = accepted.some((a) => normalize(a) === normalize(userResponse));
  return { correct, accepted_answers: accepted };
}

// PunctuationCapsEngine testa MAIUSCULA/pontuacao especificamente -- nao
// pode normalizar case aqui (senao "eine..." minusculo passaria como
// "correto" mesmo sem o usuario ter acertado a regra que o exercicio
// testa). So trim + colapsa espaco duplo, mantem case/pontuacao exatos.
function gradeCaseSensitiveText(userResponse: string, acceptedAnswersJson: string): GradeResult {
  const accepted: string[] = JSON.parse(acceptedAnswersJson);
  const clean = (s: string) => s.trim().replace(/\s+/g, " ");
  const correct = accepted.some((a) => clean(a) === clean(userResponse));
  return { correct, accepted_answers: accepted };
}

// CompoundSegmentationEngine: accepted_answers = ["Auto|bahn|kreuz"] (partes
// separadas por "|"); usuario digita com "/" entre os componentes (docs/05:
// "Put A Slash Where The Spaces Are", adaptado) -- compara as duas listas
// de partes, nao a string inteira (senao um espaco a mais/menos reprovaria
// sem motivo linguistico).
function gradeCompoundSegmentation(userResponse: string, acceptedAnswersJson: string): GradeResult {
  const accepted: string[] = JSON.parse(acceptedAnswersJson);
  const userParts = userResponse.split("/").map((p) => p.trim().toLowerCase()).filter(Boolean);
  const correct = accepted.some((a) => {
    const acceptedParts = a.split("|").map((p) => p.trim().toLowerCase());
    return acceptedParts.length === userParts.length && acceptedParts.every((p, i) => p === userParts[i]);
  });
  return { correct, accepted_answers: accepted.map((a) => a.split("|").join("/")) };
}

interface MatchPair {
  termo: string;
  definicao: string;
}

// MatchingEngine: accepted_answers = [JSON de um array de pares inteiro].
// userResponse chega como JSON de array de pares tambem (o frontend monta
// conforme o usuario clica) -- compara como CONJUNTO (ordem nao importa).
function gradeMatching(userResponse: string, acceptedAnswersJson: string): GradeResult {
  const accepted: string[] = JSON.parse(acceptedAnswersJson);
  const acceptedPairs: MatchPair[] = JSON.parse(accepted[0]);
  let userPairs: MatchPair[];
  try {
    userPairs = JSON.parse(userResponse);
  } catch {
    return { correct: false, accepted_answers: acceptedPairs };
  }
  const key = (p: MatchPair) => `${normalize(p.termo)}::${normalize(p.definicao)}`;
  const acceptedSet = new Set(acceptedPairs.map(key));
  const correct =
    userPairs.length === acceptedPairs.length && userPairs.every((p) => acceptedSet.has(key(p)));
  return { correct, accepted_answers: acceptedPairs };
}

export function gradeAttempt(exercise: ExerciseRow, userResponse: string): GradeResult {
  switch (exercise.template_nome) {
    case "GapFillGovernanceEngine":
    case "FillBlankEngine":
      return gradeTextGap(userResponse, exercise.accepted_answers);
    case "WordBankGuessEngine":
      return gradeWordBank(userResponse, exercise.accepted_answers);
    case "UnscrambleEngine":
      return gradeUnscramble(userResponse, exercise.accepted_answers);
    case "StructuralTransformEngine":
    case "RegisterReformulationEngine":
      // mesmo formato de string plana do gap-fill (accepted_answers =
      // [forma B reescrita]) -- comparacao exata (normalizada), sem
      // tolerancia a variacao de fraseado ainda (limitacao conhecida do
      // "minimo": reescrita livre tem mais formas validas do que uma
      // lacuna, um comparador so de string vai rejeitar parafrase
      // corretas -- ok pro v1, revisitar se incomodar no uso real).
      return gradeTextGap(userResponse, exercise.accepted_answers);
    case "DictationEngine":
      // mesma logica -- accepted_answers = [frase-fonte inteira]. docs/08
      // previa diff palavra-a-palavra com tolerancia; aqui e' comparacao
      // exata pro "minimo", mesma ressalva do caso acima.
      return gradeTextGap(userResponse, exercise.accepted_answers);
    case "LetterAnagramEngine":
    case "ParagraphOrderEngine":
    case "BinaryChoiceEngine":
    case "ComprehensionQAEngine":
    case "VowelInsertEngine":
    case "PredictThenVerifyEngine":
    case "TrueFalseEngine":
      // mesmo formato plano de string do gap-fill em todos esses --
      // so muda como o "prompt" e' exibido (chips, texto com esqueleto de
      // vogal, etc.), a comparacao final e' sempre string vs. accepted_answers.
      return gradeTextGap(userResponse, exercise.accepted_answers);
    case "PunctuationCapsEngine":
      return gradeCaseSensitiveText(userResponse, exercise.accepted_answers);
    case "CompoundSegmentationEngine":
      return gradeCompoundSegmentation(userResponse, exercise.accepted_answers);
    case "MatchingEngine":
      return gradeMatching(userResponse, exercise.accepted_answers);
    case "VideoTaskEngine":
      // mesmo formato plano de string do gap-fill (accepted_answers = [trecho
      // certo]) -- so muda a apresentacao (iframe do YouTube em vez de texto).
      return gradeTextGap(userResponse, exercise.accepted_answers);
    default:
      throw new Error(`Template nao suportado pra correcao: ${exercise.template_nome}`);
  }
}
