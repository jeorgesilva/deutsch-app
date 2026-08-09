// Fase 10 -- VideoMiningEngine (docs/05 item 3). Diferente dos outros
// engines de hoje, aqui NAO ha exercises/attempts -- as notas sao o
// artefato em si (sem correcao, sem FSRS). Mesmo gate de implementation
// intention dos outros escopos do Grupo B: precisa de um session_plans
// ativo (quando/onde) antes de liberar a mineracao, mas sem roteiro/tema
// (o video e' escolhido na hora, dentro da propria sessao de mineracao).
import { lookupWiktionary } from "./wiktionary";

export async function hasActiveVideoMiningPlan(db: D1Database, userId: number): Promise<boolean> {
  const plan = await db
    .prepare(`SELECT id FROM session_plans WHERE scope = 'video_mining' AND user_id = ? AND completed_at IS NULL LIMIT 1`)
    .bind(userId)
    .first<{ id: number }>();
  return !!plan;
}

export interface NoteInput {
  timestamp_seconds: number | null;
  note_text: string;
  is_candidate: boolean;
}

export interface CandidateResult {
  note_text: string;
  lexicon: { gender: string | null; plural: string | null; ipa: string | null } | null;
}

export async function saveMiningSession(
  db: D1Database,
  userId: number,
  videoUrl: string,
  notes: NoteInput[]
): Promise<{ notesSaved: number; candidates: CandidateResult[] }> {
  const candidates: CandidateResult[] = [];

  for (const note of notes) {
    const text = note.note_text.trim();
    if (!text) continue;

    let lexiconId: number | null = null;
    let lexiconResult: CandidateResult["lexicon"] = null;

    if (note.is_candidate) {
      // lookup best-effort -- se falhar (sem rede, palavra sem verbete,
      // expressao de multiplas palavras sem pagina propria), a nota ainda
      // e' salva normalmente, so' sem enriquecimento.
      const lookup = await lookupWiktionary(text);
      if (lookup) {
        const insert = await db
          .prepare(
            `INSERT INTO lexicon (lemma, pos, gender, plural, ipa, source) VALUES (?, ?, ?, ?, ?, 'video_mining')`
          )
          .bind(text, lookup.pos, lookup.gender, lookup.plural, lookup.ipa)
          .run();
        lexiconId = insert.meta.last_row_id as number;
        lexiconResult = { gender: lookup.gender, plural: lookup.plural, ipa: lookup.ipa };
      }
      candidates.push({ note_text: text, lexicon: lexiconResult });
    }

    await db
      .prepare(
        `INSERT INTO video_mining_notes (video_url, timestamp_seconds, note_text, is_candidate, lexicon_id, user_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(videoUrl, note.timestamp_seconds, text, note.is_candidate ? 1 : 0, lexiconId, userId)
      .run();
  }

  return { notesSaved: notes.filter((n) => n.note_text.trim()).length, candidates };
}
