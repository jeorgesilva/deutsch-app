// Fase 9 (CLAUDE.md) -- tipos compartilhados entre os endpoints da API.
// SUPPORTED_TEMPLATES filtra quais engines o frontend sabe renderizar.
// ReadAloudEngine/SpokenGapFillEngine usam correcao fonetica via servico
// Python local (PHONETIC_SERVICE_URL, pipeline/.../phonetics/service.py) --
// o Worker nao roda PyTorch, entao chama esse servico via fetch (decisao do
// usuario: endpoint HTTP local, nao Google Drive como fila nem self-listen
// sem correcao).
export const SUPPORTED_TEMPLATES = [
  "GapFillGovernanceEngine",
  "FillBlankEngine",
  "WordBankGuessEngine",
  "UnscrambleEngine",
  "StructuralTransformEngine",
  "RegisterReformulationEngine",
  "DictationEngine",
  "LetterAnagramEngine",
  "ParagraphOrderEngine",
  "BinaryChoiceEngine",
  "TrueFalseEngine",
  "ComprehensionQAEngine",
  "VowelInsertEngine",
  "PunctuationCapsEngine",
  "CompoundSegmentationEngine",
  "PredictThenVerifyEngine",
  "MatchingEngine",
  "VideoTaskEngine",
  "ReadAloudEngine",
  "SpokenGapFillEngine",
  "ShadowingEngine",
] as const;

// DictationEngine nunca pode mostrar "prompt" (a frase-fonte) antes da
// tentativa -- regra do projeto (mesma do bloco de leitura/video): audio
// primeiro, texto so como gabarito pos-tentativa. VideoTaskEngine e' a
// mesma regra, so que com video em vez de audio -- prompt ja vem "" do
// pipeline (nunca teve texto pra esconder), mas entra aqui por clareza e
// pra futuros exercicios usarem a regra certa sem precisar redescobrir.
// ReadAloudEngine NAO entra aqui -- o texto e' o proprio ponto de partida
// do exercicio (le em voz alta um texto DADO, nunca escondido); so
// SpokenGapFillEngine tem uma lacuna que precisa ficar escondida ate a
// tentativa, igual ao GapFillGovernanceEngine, so que em voz.
// ShadowingEngine tambem entra aqui -- prompt nunca e' mostrado (o
// exercicio inteiro e' ouvir e repetir, texto atrapalharia), mas o audio-
// alvo (audio_ref) SEMPRE aparece de imediato na sessao (diferente de
// ReadAloudEngine/SpokenGapFillEngine abaixo) -- ouvir o alvo ANTES de
// tentar e' o proprio ponto do exercicio, nao uma revelacao pos-tentativa.
export const AUDIO_FIRST_TEMPLATES = new Set(["DictationEngine", "VideoTaskEngine", "ShadowingEngine"]);

// O audio-ALVO (TTS/Piper, exercises.audio_ref) desses dois so aparece
// DEPOIS da tentativa -- docs/08: "grava lendo, ouve/regrava a vontade
// antes de submeter, feedback com fonemas errados destacados, so entao
// ouve o audio-gabarito" (ReadAloudEngine); pro SpokenGapFillEngine e'
// ainda mais estrutural -- o audio-alvo e' a frase INTEIRA com a lacuna ja
// preenchida, ouvir antes revelaria a resposta na hora.
export const TARGET_AUDIO_HIDDEN_TEMPLATES = new Set(["ReadAloudEngine", "SpokenGapFillEngine"]);

export type SupportedTemplate = (typeof SUPPORTED_TEMPLATES)[number];

// Fase "home por categoria" (docs/12) -- subconjuntos de SUPPORTED_TEMPLATES
// usados pra escopar a sessao por grupo de navegacao (content_topics vs
// phonetic_points). ShadowingEngine tem phonetic_point_id igual ao
// DictationEngine (e' um clone do audio dele, Fase 10) mas fica de fora do
// grupo Fonetica -- pertence a "Pratica semanal" por decisao do docs/12,
// entao o filtro e' pelo nome do template, nao so' "tem phonetic_point_id".
export const GRAMMAR_TEMPLATES = [
  "GapFillGovernanceEngine",
  "FillBlankEngine",
  "WordBankGuessEngine",
  "StructuralTransformEngine",
  "RegisterReformulationEngine",
  "UnscrambleEngine",
  "ReadAloudEngine",
  "SpokenGapFillEngine",
] as const;

export const PHONETICS_TEMPLATES = ["DictationEngine"] as const;

export interface ExerciseRow {
  id: number;
  exercise_template_id: number;
  template_nome: string;
  content_topic_id: number | null;
  prompt: string;
  accepted_answers: string; // JSON string, formato varia por template
  source_rule: string | null;
  audio_ref: string | null;
  video_url: string | null;
  video_start_seconds: number | null;
  video_end_seconds: number | null;
}

// Fase 10 -- Grupo B (motor semanal, docs/02). SpacedReviewEngine (item 1)
// ja e' a propria composicao de sessao via FSRS, nao precisa de plano.
// StructuredSpeechEngine (item 7) migrou pra LLM-roleplay (persona
// "moderador", nao hostil) -- usuario confirmou a adaptacao que docs/05
// deixava condicional. tutor_session (item 6) continua sem engine --
// correcao e' humana por definicao, sem substituto de app.
export const GRUPO_B_SCOPES = [
  { scope: "shadowing", label: "Shadowing" },
  { scope: "video_mining", label: "Mineração de vídeo" },
  { scope: "opinion_essay", label: "Parágrafo de opinião" },
  { scope: "opinion_audio", label: "Áudio de opinião" },
  { scope: "tutor_session", label: "Sessão com tutor/parceiro" },
  { scope: "structured_speech", label: "Speech / debate estruturado" },
] as const;

export interface SessionPlanRow {
  id: number;
  scope: string;
  when_text: string | null;
  where_text: string | null;
  scheduled_for: string | null;
  completed_at: string | null;
  // so preenchidos pelo escopo opinion_essay por ora (OpinionEssayEngine,
  // docs/05 item 4) -- tema da semana + vocabulario-alvo digitados livremente
  // no planejador (decisao do usuario: sem depender de mineracao de video,
  // que ainda nao existe). exercise_id liga o plano ao exercicio dinamico
  // ja criado pra ele, pra reaproveitar em vez de criar um novo a cada
  // tentativa/reabertura do planejador.
  theme_text: string | null;
  target_vocabulary: string | null;
  exercise_id: number | null;
}

// Fase 10 -- StructuredSpeechEngine (docs/05 item 7), schema pensado pra
// reaproveitar no Grupo D depois (mesmo mecanismo, personas diferentes).
export interface RoleplaySessionRow {
  id: number;
  engine: string;
  persona: string;
  topic: string | null;
  status: string; // 'active' | 'closed'
  evaluation_json: string | null;
  created_at: string;
  closed_at: string | null;
}

export interface RoleplayMessageRow {
  id: number;
  session_id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface ProgressRow {
  id: number;
  exercise_id: number;
  stability: number | null;
  difficulty: number | null;
  last_review_at: string | null;
  next_review_at: string | null;
  reps: number;
  lapses: number;
}

export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  // Fase 14: URL publica do Worker de Cloudflare Containers que serve a
  // correcao fonetica (services/phonetic-container/) -- nao depende mais
  // da maquina do usuario estar ligada. PHONETIC_SHARED_SECRET autentica
  // o Worker do Pages contra esse servico (ver services/phonetic-container/
  // src/index.ts) -- sem isso, qualquer um que ache a URL consumiria
  // inferencia (paga) a toa.
  PHONETIC_SERVICE_URL?: string;
  PHONETIC_SHARED_SECRET?: string;
  // Fase 10 -- OpinionEssayEngine (docs/05 item 4): primeiro uso do
  // terceiro mecanismo de correcao do projeto (LLM com rubrica
  // estruturada). Chamado direto via fetch (Hugging Face Inference
  // Providers, https://router.huggingface.co) -- diferente do servico
  // fonetico local, essa e' so uma API HTTPS externa, o Worker alcanca
  // sem precisar de processo local (decisao do usuario). Mesma chave que
  // o pipeline usa (hugging_face_api_key em app-root/.env), copiada pra
  // .dev.vars (gitignored) sob outro nome pra seguir a convencao de env
  // var do Worker.
  HUGGINGFACE_API_KEY?: string;
  // docs/14 -- geração sob demanda: cliente HTTP do Worker de Cloudflare
  // Containers em services/generation-container/ (mesmo padrão de
  // PHONETIC_SERVICE_URL/PHONETIC_SHARED_SECRET, serviço próprio -- gerar
  // exercício precisa de spaCy/LanguageTool/Java, que o container fonético
  // nunca teve).
  GENERATION_SERVICE_URL?: string;
  GENERATION_SHARED_SECRET?: string;
}
