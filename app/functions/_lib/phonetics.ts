// Fase 9 -- cliente do servico HTTP local de correcao fonetica
// (pipeline/src/deutsch_pipeline/phonetics/service.py). O Worker nao pode
// rodar wav2vec2/PyTorch (mesmo limite de CPU que ja bloqueia LLM em tempo
// real dentro de um Worker, CLAUDE.md) -- esse servico roda na maquina do
// usuario e o Worker chama via fetch, igual a qualquer outra API externa.
export interface PhoneticAlignmentBlock {
  op: "equal" | "replace" | "delete" | "insert";
  target: string[];
  recognized: string[];
}

export interface ReadAloudScore {
  target_ipa: string;
  recognized_ipa: string;
  similarity: number;
  alignment: PhoneticAlignmentBlock[];
}

export interface SpokenGapFillScore {
  lexical: {
    transcribed: string;
    accepted_answers: string[];
    correct: boolean;
  };
  pronunciation: ReadAloudScore;
}

async function callService<T>(serviceUrl: string, path: string, payload: unknown): Promise<T> {
  const res = await fetch(`${serviceUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`servico fonetico local respondeu ${res.status} em ${path}`);
  }
  return res.json();
}

export function scoreReadAloud(serviceUrl: string, sentence: string, audioBase64: string): Promise<ReadAloudScore> {
  return callService(serviceUrl, "/score-readaloud", { sentence, audio_base64: audioBase64 });
}

export function scoreSpokenGapFill(
  serviceUrl: string,
  sentenceFull: string,
  acceptedAnswers: string[],
  audioBase64: string
): Promise<SpokenGapFillScore> {
  return callService(serviceUrl, "/score-spokengapfill", {
    sentence_full: sentenceFull,
    accepted_answers: acceptedAnswers,
    audio_base64: audioBase64,
  });
}

// Fase 11 -- loop de voz do Grupo D (docs/08: grava -> STT local -> LLM ->
// Piper -> toca). Diferente das duas funcoes acima (que corrigem uma
// tentativa fixa), estas duas sao STT/TTS avulsos -- transcribeAudio vira
// a "fala digitada" do usuario pro mecanismo de roleplay ja existente
// (_lib/roleplay.ts postMessage), synthesizeSpeech sintetiza qualquer
// texto de resposta em tempo real (nao persiste, e' so' pro turno atual).
export function transcribeAudio(serviceUrl: string, audioBase64: string): Promise<{ text: string }> {
  return callService(serviceUrl, "/transcribe", { audio_base64: audioBase64 });
}

export function synthesizeSpeech(serviceUrl: string, text: string): Promise<{ audio_base64: string }> {
  return callService(serviceUrl, "/synthesize", { text });
}
