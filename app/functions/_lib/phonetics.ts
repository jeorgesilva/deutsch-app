// Fase 9 -- cliente HTTP da correcao fonetica (pipeline/src/deutsch_pipeline/
// phonetics/service.py). O Worker nao pode rodar wav2vec2/PyTorch (mesmo
// limite de CPU que ja bloqueia LLM em tempo real dentro de um Worker,
// CLAUDE.md) -- esse servico roda a parte e o Worker chama via fetch.
// Fase 14: o servico saiu da maquina local pra um Worker de Cloudflare
// Containers publico (services/phonetic-container/) -- PHONETIC_SERVICE_URL
// agora aponta pra essa URL remota, protegida por segredo compartilhado
// (sharedSecret aqui = env.PHONETIC_SHARED_SECRET, checado do lado de la
// em services/phonetic-container/src/index.ts antes de repassar pro
// container). Contrato HTTP em si (rotas/JSON) nao mudou nada.
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

async function callService<T>(
  serviceUrl: string,
  sharedSecret: string | undefined,
  path: string,
  payload: unknown
): Promise<T> {
  const res = await fetch(`${serviceUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sharedSecret ? { Authorization: `Bearer ${sharedSecret}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`servico fonetico respondeu ${res.status} em ${path}`);
  }
  return res.json();
}

export function scoreReadAloud(
  serviceUrl: string,
  sharedSecret: string | undefined,
  sentence: string,
  audioBase64: string
): Promise<ReadAloudScore> {
  return callService(serviceUrl, sharedSecret, "/score-readaloud", { sentence, audio_base64: audioBase64 });
}

export function scoreSpokenGapFill(
  serviceUrl: string,
  sharedSecret: string | undefined,
  sentenceFull: string,
  acceptedAnswers: string[],
  audioBase64: string
): Promise<SpokenGapFillScore> {
  return callService(serviceUrl, sharedSecret, "/score-spokengapfill", {
    sentence_full: sentenceFull,
    accepted_answers: acceptedAnswers,
    audio_base64: audioBase64,
  });
}

// Fase 11 -- loop de voz do Grupo D (docs/08: grava -> STT -> LLM -> Piper
// -> toca). Diferente das duas funcoes acima (que corrigem uma tentativa
// fixa), estas duas sao STT/TTS avulsos -- transcribeAudio vira a "fala
// digitada" do usuario pro mecanismo de roleplay ja existente
// (_lib/roleplay.ts postMessage), synthesizeSpeech sintetiza qualquer
// texto de resposta em tempo real (nao persiste, e' so' pro turno atual).
export function transcribeAudio(
  serviceUrl: string,
  sharedSecret: string | undefined,
  audioBase64: string
): Promise<{ text: string }> {
  return callService(serviceUrl, sharedSecret, "/transcribe", { audio_base64: audioBase64 });
}

export function synthesizeSpeech(
  serviceUrl: string,
  sharedSecret: string | undefined,
  text: string
): Promise<{ audio_base64: string }> {
  return callService(serviceUrl, sharedSecret, "/synthesize", { text });
}
