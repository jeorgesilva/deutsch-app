// Fase 9 -- frontend minimo, vanilla JS de proposito (nenhum framework
// pra manter "minimo" literal). Um exercicio por vez, feedback imediato,
// avanca sozinho apos alguns segundos de leitura do feedback.

const main = document.getElementById("main");
const progressEl = document.getElementById("progress");
const bannerEl = document.getElementById("banner");
const navToggle = document.getElementById("nav-toggle");

let session = [];
let index = 0;
let currentView = "session";

async function loadSession() {
  const res = await fetch("/api/session?limit=10");
  const data = await res.json();
  session = data.exercises ?? [];
  index = 0;
  if (session.length === 0) {
    main.innerHTML = `<p class="empty">Nenhum exercício disponível agora. Volte mais tarde.</p>`;
    progressEl.textContent = "";
    return;
  }
  renderCurrent();
}

// ---------- Fase 10 -- Grupo B: motor semanal (session_plans) ----------

async function loadBanner() {
  const res = await fetch("/api/session-plans");
  const data = await res.json();
  const todayStr = new Date().toISOString().slice(0, 10);
  // so entra no banner quem tem quando/onde de verdade preenchido -- um
  // plano vazio (placeholder sentinel, id=0) nunca vira lembrete.
  const due = (data.plans ?? []).find(
    (p) =>
      p.scheduled_for &&
      p.scheduled_for.slice(0, 10) <= todayStr &&
      !p.completed_at &&
      (p.when_text || p.where_text)
  );
  if (!due) {
    bannerEl.classList.add("banner-hidden");
    bannerEl.innerHTML = "";
    return;
  }
  const detail = [due.when_text, due.where_text].filter(Boolean).join(" — ");
  bannerEl.innerHTML = `Hoje: <strong>${escapeHtml(due.label)}</strong>${detail ? " — " + escapeHtml(detail) : ""}`;
  bannerEl.classList.remove("banner-hidden");
}

async function renderPlanner() {
  currentView = "planner";
  navToggle.textContent = "Sessão";
  progressEl.textContent = "";
  main.innerHTML = `<p class="loading">Carregando planejador…</p>`;

  const res = await fetch("/api/session-plans");
  const data = await res.json();

  main.innerHTML = `<div class="planner" id="planner"></div>`;
  const plannerEl = document.getElementById("planner");

  (data.plans ?? []).forEach((plan) => {
    const hasActivePlan = plan.id !== 0;
    const isEssay = plan.scope === "opinion_essay";
    const isAudio = plan.scope === "opinion_audio";
    const isSpeech = plan.scope === "structured_speech";
    const card = document.createElement("div");
    card.className = "plan-card";
    card.innerHTML = `
      <span class="template-label">${escapeHtml(plan.label)}</span>
      ${
        isEssay
          ? `
      <label>Tema da semana
        <input type="text" class="text-input" data-field="theme_text" placeholder="ex.: Sollte Homeoffice zur Regel werden?" value="${escapeHtml(plan.theme_text ?? "")}" />
      </label>
      <label>Vocabulário-alvo (separado por vírgula)
        <input type="text" class="text-input" data-field="target_vocabulary" placeholder="ex.: einerseits, in Bezug auf, sich durchsetzen" value="${escapeHtml(plan.target_vocabulary ?? "")}" />
      </label>`
          : ""
      }
      ${
        isAudio
          ? `
      <label>Roteiro (opcional — deixe em branco para reflexão livre)
        <textarea class="text-input" data-field="theme_text" rows="3" placeholder="ex.: - o que mudou esta semana&#10;- um desafio&#10;- um plano">${escapeHtml(plan.theme_text ?? "")}</textarea>
      </label>`
          : ""
      }
      ${
        isSpeech
          ? `
      <label>Tema do debate (opcional — o moderador escolhe um se deixar em branco)
        <input type="text" class="text-input" data-field="theme_text" placeholder="ex.: Sollte man ein Auslandsjahr machen?" value="${escapeHtml(plan.theme_text ?? "")}" />
      </label>`
          : ""
      }
      <label>Quando
        <input type="text" class="text-input" data-field="when_text" placeholder="ex.: depois do jantar" value="${escapeHtml(plan.when_text ?? "")}" />
      </label>
      <label>Onde
        <input type="text" class="text-input" data-field="where_text" placeholder="ex.: mesa da cozinha" value="${escapeHtml(plan.where_text ?? "")}" />
      </label>
      <label>Data
        <input type="date" class="text-input" data-field="scheduled_for" value="${plan.scheduled_for ? plan.scheduled_for.slice(0, 10) : ""}" />
      </label>
      <div class="recorder-actions">
        <button class="primary" data-action="save" type="button">Salvar</button>
        ${hasActivePlan ? `<button class="link" data-action="complete" type="button">Concluído esta semana</button>` : ""}
        ${isEssay && hasActivePlan && plan.theme_text ? `<button class="link" data-action="write" type="button">Escrever agora →</button>` : ""}
        ${isAudio && hasActivePlan ? `<button class="link" data-action="record" type="button">Gravar agora →</button>` : ""}
        ${plan.scope === "video_mining" && hasActivePlan ? `<button class="link" data-action="mine" type="button">Iniciar mineração →</button>` : ""}
        ${isSpeech && hasActivePlan ? `<button class="link" data-action="speech" type="button">Iniciar conversa →</button>` : ""}
      </div>
    `;

    card.querySelector('[data-action="save"]').addEventListener("click", async () => {
      const body = {
        scope: plan.scope,
        when_text: card.querySelector('[data-field="when_text"]').value,
        where_text: card.querySelector('[data-field="where_text"]').value,
        scheduled_for: card.querySelector('[data-field="scheduled_for"]').value || null,
      };
      if (isEssay) {
        body.theme_text = card.querySelector('[data-field="theme_text"]').value;
        body.target_vocabulary = card.querySelector('[data-field="target_vocabulary"]').value;
      }
      if (isAudio || isSpeech) {
        body.theme_text = card.querySelector('[data-field="theme_text"]').value;
      }
      await fetch("/api/session-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      renderPlanner();
      loadBanner();
    });

    const completeBtn = card.querySelector('[data-action="complete"]');
    if (completeBtn) {
      completeBtn.addEventListener("click", async () => {
        await fetch("/api/session-plans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope: plan.scope, complete: true }),
        });
        renderPlanner();
        loadBanner();
      });
    }

    const writeBtn = card.querySelector('[data-action="write"]');
    if (writeBtn) {
      writeBtn.addEventListener("click", renderEssay);
    }

    const recordBtn = card.querySelector('[data-action="record"]');
    if (recordBtn) {
      recordBtn.addEventListener("click", renderRecordedOpinion);
    }

    const mineBtn = card.querySelector('[data-action="mine"]');
    if (mineBtn) {
      mineBtn.addEventListener("click", renderVideoMining);
    }

    const speechBtn = card.querySelector('[data-action="speech"]');
    if (speechBtn) {
      speechBtn.addEventListener("click", renderStructuredSpeech);
    }

    plannerEl.appendChild(card);
  });
}

// ---------- OpinionEssayEngine (docs/05 item 4) -- LLM com rubrica ----------
// Fora da sessao intercalada de proposito (nao e' multiplicado por topico,
// e' um unico texto por tema semanal) -- so acessivel via "Escrever agora"
// no planejador.

const STRUCTURE_LABELS = { tese: "Tese", argumentos: "Argumentos", contra_argumento: "Contra-argumento", conclusao: "Conclusão" };

async function renderEssay() {
  currentView = "essay";
  navToggle.textContent = "Planejador";
  progressEl.textContent = "";
  main.innerHTML = `<p class="loading">Carregando…</p>`;

  const res = await fetch("/api/opinion-essay");
  const data = await res.json();

  if (!data.has_theme) {
    main.innerHTML = `
      <div class="card">
        <p class="empty">Defina o tema da semana no planejador antes de escrever.</p>
        <button class="link" id="back-to-planner" type="button">← Planejador</button>
      </div>
    `;
    document.getElementById("back-to-planner").addEventListener("click", renderPlanner);
    return;
  }

  const vocabChips = data.target_vocabulary.length
    ? `<div class="chips">${data.target_vocabulary.map((v) => `<span class="chip">${escapeHtml(v)}</span>`).join("")}</div>`
    : "";

  main.innerHTML = `
    <div class="card">
      <span class="template-label">Parágrafo de opinião</span>
      <p class="prompt">${escapeHtml(data.theme)}</p>
      ${vocabChips}
      <textarea id="essay-text" class="text-input essay-textarea" rows="10" placeholder="Tese → argumentos → contra-argumento → conclusão">${escapeHtml(data.previous?.user_response ?? "")}</textarea>
      <span class="word-count" id="word-count">0 / ${data.word_target} palavras</span>
      <button class="primary" id="essay-submit" type="button">Enviar para correção</button>
      <button class="link" id="back-to-planner" type="button">← Planejador</button>
      <div id="essay-feedback"></div>
    </div>
  `;

  document.getElementById("back-to-planner").addEventListener("click", renderPlanner);

  const textarea = document.getElementById("essay-text");
  const wordCountEl = document.getElementById("word-count");
  function updateWordCount() {
    const words = textarea.value.trim().split(/\s+/).filter(Boolean).length;
    wordCountEl.textContent = `${words} / ${data.word_target} palavras`;
  }
  textarea.addEventListener("input", updateWordCount);
  updateWordCount();

  document.getElementById("essay-submit").addEventListener("click", async () => {
    const submitBtn = document.getElementById("essay-submit");
    submitBtn.disabled = true;
    submitBtn.textContent = "Corrigindo…";
    const res = await fetch("/api/opinion-essay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: textarea.value }),
    });
    const result = await res.json();
    submitBtn.disabled = false;
    submitBtn.textContent = "Enviar para correção";
    if (result.error) {
      document.getElementById("essay-feedback").innerHTML = `<p class="error">${escapeHtml(result.error)}</p>`;
      return;
    }
    showEssayFeedback(result.correction);
  });

  if (data.previous?.correction) {
    showEssayFeedback(data.previous.correction);
  }
}

function showEssayFeedback(correction) {
  const feedbackEl = document.getElementById("essay-feedback");

  const structureHtml = Object.entries(STRUCTURE_LABELS)
    .map(([key, label]) => {
      const present = !!correction.structure?.[key];
      return `<span class="structure-badge ${present ? "ok" : "missing"}">${present ? "✓" : "○"} ${label}</span>`;
    })
    .join("");

  const vocabUsedHtml = (correction.vocabulary_used ?? [])
    .map((v) => `<span class="chip chosen">${escapeHtml(v)}</span>`)
    .join("");
  const vocabMissingHtml = (correction.vocabulary_missing ?? [])
    .map((v) => `<span class="chip">${escapeHtml(v)}</span>`)
    .join("");

  const errorsHtml = (correction.errors ?? [])
    .map(
      (e) => `
      <li>
        <span class="essay-error-trecho">"${escapeHtml(e.trecho)}"</span>
        <span class="essay-error-problema">${escapeHtml(e.problema)}</span>
        <span class="essay-error-sugestao">→ ${escapeHtml(e.sugestao)}</span>
      </li>`
    )
    .join("");

  const strengthsHtml = (correction.strengths ?? []).map((s) => `<li>${escapeHtml(s)}</li>`).join("");

  feedbackEl.innerHTML = `
    <div class="essay-structure">${structureHtml}</div>
    ${vocabUsedHtml || vocabMissingHtml ? `<div class="chips">${vocabUsedHtml}${vocabMissingHtml}</div>` : ""}
    ${strengthsHtml ? `<div class="feedback correct"><strong>Pontos fortes</strong><ul>${strengthsHtml}</ul></div>` : ""}
    ${errorsHtml ? `<div class="feedback incorrect"><strong>A revisar</strong><ul class="essay-errors">${errorsHtml}</ul></div>` : ""}
    <span class="cefr-estimate">Nível estimado: ${escapeHtml(correction.cefr_estimate ?? "—")} · ${correction.word_count ?? "?"} palavras</span>
  `;
}

// ---------- RecordedOpinionEngine (docs/05 itens 5/25) -- grava, sobe pro
// Google Drive direto do navegador (Google Identity Services), sem
// correcao de idioma nesta fatia -- so' valida exposicao, mesmo mecanismo
// do ShadowingEngine (canal separado, CLAUDE.md). Fora da sessao
// intercalada pelo mesmo motivo do OpinionEssayEngine: nao e' multiplicado
// por topico, e' um unico registro por tema semanal, so' acessivel via
// "Gravar agora" no planejador.

const DRIVE_CLIENT_ID = "620541701801-jgarv3jtf2jp0hs28ttfqbg8hut2qaod.apps.googleusercontent.com";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
let driveTokenClient = null;
let driveAccessToken = null;

// escopo drive.file (nao o Drive inteiro) -- o app so enxerga os arquivos
// que ele mesmo cria, nunca o resto do Drive do usuario (menor privilegio
// possivel pro que este exercicio precisa).
function requestDriveAccessToken() {
  return new Promise((resolve, reject) => {
    if (typeof google === "undefined" || !google.accounts?.oauth2) {
      reject(new Error("Google Identity Services não carregou -- verifique sua conexão e recarregue a página"));
      return;
    }
    if (!driveTokenClient) {
      driveTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: DRIVE_CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: () => {}, // sobrescrito a cada chamada abaixo
      });
    }
    // se o usuario fechar o popup de consentimento sem decidir, o
    // "callback" normal as vezes nunca dispara (limitacao conhecida do
    // GIS) -- sem error_callback o botao "Enviar" ficaria travado
    // "Enviando..." pra sempre, sem nunca reabilitar.
    driveTokenClient.error_callback = (err) => {
      reject(new Error(err.type === "popup_closed" ? "janela de consentimento fechada" : err.type || "erro desconhecido"));
    };
    driveTokenClient.callback = (resp) => {
      if (resp.error) {
        reject(new Error(resp.error));
        return;
      }
      driveAccessToken = resp.access_token;
      resolve(driveAccessToken);
    };
    // token ja obtido nesta sessao -> reusa sem novo popup de consentimento;
    // primeira vez (ou token expirado/revogado) -> pede consentimento.
    driveTokenClient.requestAccessToken({ prompt: driveAccessToken ? "" : "consent" });
  });
}

// multipart/related manual -- a API do Drive nao aceita FormData comum pra
// upload (precisa desse content-type especifico com metadata + midia).
async function uploadToDrive(blob, filename) {
  const token = await requestDriveAccessToken();
  const metadata = { name: filename, mimeType: blob.type || "audio/webm" };
  const boundary = "deutsch-app-boundary-314159265358979";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelim = `\r\n--${boundary}--`;

  const metadataPart = delimiter + "Content-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata);
  const mediaPartHeader = delimiter + `Content-Type: ${metadata.mimeType}\r\n\r\n`;
  const arrayBuffer = await blob.arrayBuffer();
  const body = new Blob([metadataPart, mediaPartHeader, arrayBuffer, closeDelim]);

  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) {
    throw new Error(`upload pro Drive falhou (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  return data.id;
}

async function renderRecordedOpinion() {
  currentView = "recorded-opinion";
  navToggle.textContent = "Planejador";
  progressEl.textContent = "";
  main.innerHTML = `<p class="loading">Carregando…</p>`;

  const res = await fetch("/api/recorded-opinion");
  const data = await res.json();

  if (!data.has_plan) {
    main.innerHTML = `
      <div class="card">
        <p class="empty">Defina quando/onde no planejador antes de gravar.</p>
        <button class="link" id="back-to-planner" type="button">← Planejador</button>
      </div>
    `;
    document.getElementById("back-to-planner").addEventListener("click", renderPlanner);
    return;
  }

  // roteiro e' opcional (item 25 "Audio journal") -- sem ele, reflexao livre.
  const roteiroItems = (data.roteiro ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const roteiroHtml = roteiroItems.length
    ? `<ul class="roteiro-list">${roteiroItems.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>`
    : `<p class="prompt-hint">Reflexão livre — sem roteiro fixo hoje.</p>`;

  main.innerHTML = `
    <div class="card">
      <span class="template-label">Áudio de opinião</span>
      ${roteiroHtml}
      <div class="recorder">
        <button class="primary" id="record-btn" type="button">● Gravar</button>
        <audio id="preview" controls style="display:none"></audio>
        <div class="recorder-actions" id="recorder-actions" style="display:none">
          <button class="link" id="rerecord-btn" type="button">Regravar</button>
          <button class="primary" id="submit-btn" type="button">Enviar para o Google Drive</button>
        </div>
      </div>
      <button class="link" id="back-to-planner" type="button">← Planejador</button>
      <div id="recorded-feedback"></div>
    </div>
  `;
  document.getElementById("back-to-planner").addEventListener("click", renderPlanner);

  let recordedBlob = null;
  setupRecorder((blob) => {
    recordedBlob = blob;
  });

  document.getElementById("submit-btn").addEventListener("click", async () => {
    const submitBtn = document.getElementById("submit-btn");
    const feedbackEl = document.getElementById("recorded-feedback");
    submitBtn.disabled = true;
    document.getElementById("rerecord-btn").disabled = true;
    submitBtn.textContent = "Enviando…";
    try {
      const filename = `deutsch-app-opiniao-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.webm`;
      const driveFileId = await uploadToDrive(recordedBlob, filename);
      await fetch("/api/recorded-opinion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drive_file_id: driveFileId }),
      });
      feedbackEl.innerHTML = `
        <div class="feedback correct">Gravado e salvo no seu Google Drive — isso já conta.</div>
        <button class="link" id="back-after" type="button">← Planejador</button>
      `;
      document.getElementById("back-after").addEventListener("click", renderPlanner);
    } catch (err) {
      feedbackEl.innerHTML = `<p class="error">Falha ao enviar: ${escapeHtml(err.message)}</p>`;
      submitBtn.disabled = false;
      document.getElementById("rerecord-btn").disabled = false;
      submitBtn.textContent = "Enviar para o Google Drive";
    }
  });
}

// ---------- VideoMiningEngine (docs/05 item 3) -- assiste, anota com
// timestamp, marca candidatos a card. Sem correcao (docs/05: "N/A"), fora
// de exercises/attempts/progress -- as notas SAO o artefato. Video e'
// escolhido pelo proprio usuario (temptation bundling), nao vem de
// playlist curada como o VideoTaskEngine (Fase 6).

let ytApiReadyPromise = null;
function loadYouTubeApi() {
  if (ytApiReadyPromise) return ytApiReadyPromise;
  ytApiReadyPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve();
      return;
    }
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (previous) previous();
      resolve();
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });
  return ytApiReadyPromise;
}

function extractYouTubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1) || null;
    if (u.searchParams.get("v")) return u.searchParams.get("v");
    const embedMatch = /\/embed\/([^/?]+)/.exec(u.pathname);
    if (embedMatch) return embedMatch[1];
  } catch {
    // URL invalida -- tratado pelo chamador (retorna null)
  }
  return null;
}

function formatTimestamp(seconds) {
  const s = Math.floor(seconds ?? 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

async function renderVideoMining() {
  currentView = "video-mining";
  navToggle.textContent = "Planejador";
  progressEl.textContent = "";
  main.innerHTML = `<p class="loading">Carregando…</p>`;

  const res = await fetch("/api/video-mining");
  const data = await res.json();

  if (!data.has_plan) {
    main.innerHTML = `
      <div class="card">
        <p class="empty">Defina quando/onde no planejador antes de minerar um vídeo.</p>
        <button class="link" id="back-to-planner" type="button">← Planejador</button>
      </div>
    `;
    document.getElementById("back-to-planner").addEventListener("click", renderPlanner);
    return;
  }

  main.innerHTML = `
    <div class="card">
      <span class="template-label">Mineração de vídeo</span>
      <label>Cole a URL de um vídeo do YouTube (escolhido por você)
        <input type="text" class="text-input" id="video-url-input" placeholder="https://www.youtube.com/watch?v=..." autofocus />
      </label>
      <button class="primary" id="load-video-btn" type="button">Carregar vídeo</button>
      <p class="error" id="video-url-error" style="display:none"></p>
      <div id="mining-body"></div>
      <button class="link" id="back-to-planner" type="button">← Planejador</button>
    </div>
  `;
  document.getElementById("back-to-planner").addEventListener("click", renderPlanner);

  document.getElementById("load-video-btn").addEventListener("click", () => {
    const url = document.getElementById("video-url-input").value.trim();
    const videoId = extractYouTubeId(url);
    const errorEl = document.getElementById("video-url-error");
    if (!videoId) {
      errorEl.textContent = "URL do YouTube não reconhecida -- cole o link completo do vídeo.";
      errorEl.style.display = "block";
      return;
    }
    errorEl.style.display = "none";
    startMiningSession(url, videoId);
  });
}

async function startMiningSession(videoUrl, videoId) {
  const bodyEl = document.getElementById("mining-body");
  bodyEl.innerHTML = `
    <div class="video-wrap"><div id="yt-player"></div></div>
    <div class="mining-notes">
      <label>Nota
        <input type="text" class="text-input" id="note-input" placeholder="ex.: auf den Punkt bringen -- gostei dessa expressão" />
      </label>
      <button class="primary" id="add-note-btn" type="button">+ Nota (no tempo atual)</button>
      <ul class="notes-list" id="notes-list"></ul>
      <button class="primary" id="save-session-btn" type="button" disabled>Salvar sessão</button>
    </div>
    <div id="mining-feedback"></div>
  `;

  await loadYouTubeApi();
  const player = new YT.Player("yt-player", { videoId });

  const notes = [];
  const notesListEl = document.getElementById("notes-list");
  const saveBtn = document.getElementById("save-session-btn");

  function renderNotes() {
    notesListEl.innerHTML = notes
      .map(
        (n, i) => `
        <li>
          <span class="note-time">${formatTimestamp(n.timestamp_seconds)}</span>
          <span class="note-text">${escapeHtml(n.note_text)}</span>
          <label class="note-candidate"><input type="checkbox" data-idx="${i}" ${n.is_candidate ? "checked" : ""} /> vale virar card</label>
          <button class="link" data-remove="${i}" type="button">remover</button>
        </li>`
      )
      .join("");
    notesListEl.querySelectorAll("[data-idx]").forEach((cb) => {
      cb.addEventListener("change", (e) => {
        notes[Number(e.target.dataset.idx)].is_candidate = e.target.checked;
      });
    });
    notesListEl.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        notes.splice(Number(e.target.dataset.remove), 1);
        renderNotes();
      });
    });
    saveBtn.disabled = notes.length === 0;
  }

  document.getElementById("add-note-btn").addEventListener("click", () => {
    const input = document.getElementById("note-input");
    const text = input.value.trim();
    if (!text) return;
    const t = typeof player.getCurrentTime === "function" ? player.getCurrentTime() : 0;
    notes.push({ timestamp_seconds: t, note_text: text, is_candidate: false });
    input.value = "";
    input.focus();
    renderNotes();
  });

  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = "Salvando…";
    const res = await fetch("/api/video-mining", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_url: videoUrl, notes }),
    });
    const result = await res.json();
    saveBtn.textContent = "Salvar sessão";
    if (result.error) {
      saveBtn.disabled = false;
      document.getElementById("mining-feedback").innerHTML = `<p class="error">${escapeHtml(result.error)}</p>`;
      return;
    }
    showMiningFeedback(result);
  });
}

function showMiningFeedback(result) {
  const el = document.getElementById("mining-feedback");
  const candidatesHtml = (result.candidates ?? [])
    .map((c) => {
      if (!c.lexicon) return `<li>${escapeHtml(c.note_text)} — sem correspondência no Wiktionary (nota salva mesmo assim)</li>`;
      const details = [c.lexicon.gender, c.lexicon.plural ? `Plural: ${c.lexicon.plural}` : null].filter(Boolean).join(", ");
      return `<li>${escapeHtml(c.note_text)} — adicionado ao léxico${details ? ` (${escapeHtml(details)})` : ""}</li>`;
    })
    .join("");
  el.innerHTML = `
    <div class="feedback correct">${result.notes_saved} nota(s) salva(s).</div>
    ${candidatesHtml ? `<ul class="essay-errors">${candidatesHtml}</ul>` : ""}
    <button class="link" id="back-after-mining" type="button">← Planejador</button>
  `;
  document.getElementById("back-after-mining").addEventListener("click", renderPlanner);
}

// ---------- StructuredSpeechEngine (docs/05 item 7) -- chat multi-turno
// com o "Moderator" (persona nao hostil). Correcao so' no fechamento
// ("Encerrar e avaliar"), nunca durante a conversa -- imersao primeiro.

async function renderStructuredSpeech() {
  currentView = "structured-speech";
  navToggle.textContent = "Planejador";
  progressEl.textContent = "";
  main.innerHTML = `<p class="loading">Carregando…</p>`;

  const res = await fetch("/api/structured-speech");
  const data = await res.json();

  if (!data.has_plan) {
    main.innerHTML = `
      <div class="card">
        <p class="empty">Defina quando/onde no planejador antes de começar.</p>
        <button class="link" id="back-to-planner" type="button">← Planejador</button>
      </div>
    `;
    document.getElementById("back-to-planner").addEventListener("click", renderPlanner);
    return;
  }

  main.innerHTML = `
    <div class="card">
      <span class="template-label">Speech / debate estruturado</span>
      <p class="prompt-hint">${data.topic ? escapeHtml(data.topic) : "Tema livre -- o moderador escolhe."}</p>
      <button class="primary" id="start-speech-btn" type="button">Iniciar conversa</button>
      <button class="link" id="back-to-planner" type="button">← Planejador</button>
      <div id="speech-body"></div>
    </div>
  `;
  document.getElementById("back-to-planner").addEventListener("click", renderPlanner);

  document.getElementById("start-speech-btn").addEventListener("click", async () => {
    const startBtn = document.getElementById("start-speech-btn");
    startBtn.disabled = true;
    startBtn.textContent = "Iniciando…";
    const res = await fetch("/api/structured-speech/start", { method: "POST" });
    const result = await res.json();
    if (result.error) {
      document.getElementById("speech-body").innerHTML = `<p class="error">${escapeHtml(result.error)}</p>`;
      startBtn.disabled = false;
      startBtn.textContent = "Iniciar conversa";
      return;
    }
    startBtn.style.display = "none";
    startChatSession(result.session_id, result.message);
  });
}

function chatBubbleHtml(role, text) {
  return `<div class="chat-bubble ${role}">${escapeHtml(text)}</div>`;
}

function startChatSession(sessionId, openingMessage) {
  const bodyEl = document.getElementById("speech-body");
  bodyEl.innerHTML = `
    <div class="chat-log" id="chat-log">${chatBubbleHtml("assistant", openingMessage)}</div>
    <label>Sua resposta (em alemão)
      <input type="text" class="text-input" id="chat-input" autocomplete="off" autofocus />
    </label>
    <div class="recorder-actions">
      <button class="primary" id="chat-send-btn" type="button">Enviar</button>
      <button class="link" id="chat-close-btn" type="button">Encerrar e avaliar</button>
    </div>
    <div id="chat-evaluation"></div>
  `;

  const logEl = document.getElementById("chat-log");
  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("chat-send-btn");
  const closeBtn = document.getElementById("chat-close-btn");
  input.focus();

  function scrollToBottom() {
    logEl.scrollTop = logEl.scrollHeight;
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    input.disabled = true;
    sendBtn.disabled = true;
    logEl.insertAdjacentHTML("beforeend", chatBubbleHtml("user", text));
    scrollToBottom();

    const res = await fetch("/api/structured-speech/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, text }),
    });
    const result = await res.json();
    input.disabled = false;
    sendBtn.disabled = false;
    if (result.error) {
      logEl.insertAdjacentHTML("beforeend", `<p class="error">${escapeHtml(result.error)}</p>`);
    } else {
      logEl.insertAdjacentHTML("beforeend", chatBubbleHtml("assistant", result.message));
    }
    scrollToBottom();
    input.focus();
  }

  sendBtn.addEventListener("click", sendMessage);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });

  closeBtn.addEventListener("click", async () => {
    input.disabled = true;
    sendBtn.disabled = true;
    closeBtn.disabled = true;
    closeBtn.textContent = "Avaliando…";
    const res = await fetch("/api/structured-speech/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    });
    const result = await res.json();
    closeBtn.style.display = "none";
    if (result.error) {
      document.getElementById("chat-evaluation").innerHTML = `<p class="error">${escapeHtml(result.error)}</p>`;
      return;
    }
    showSpeechEvaluation(result.evaluation);
  });
}

function showSpeechEvaluation(evaluation) {
  const el = document.getElementById("chat-evaluation");
  const errorsHtml = (evaluation.erros ?? [])
    .map(
      (e) => `
      <li>
        <span class="essay-error-trecho">"${escapeHtml(e.trecho)}"</span>
        <span class="essay-error-problema">${escapeHtml(e.problema)}</span>
        <span class="essay-error-sugestao">→ ${escapeHtml(e.sugestao)}</span>
      </li>`
    )
    .join("");
  const strengthsHtml = (evaluation.pontos_fortes ?? []).map((s) => `<li>${escapeHtml(s)}</li>`).join("");

  el.innerHTML = `
    <div class="structure-badge ${evaluation.clareza_estrutural ? "ok" : "missing"}">
      ${evaluation.clareza_estrutural ? "✓" : "○"} Estrutura de debate completa (tese → justificativa → contraponto → conclusão)
    </div>
    <p class="prompt-hint">${escapeHtml(evaluation.argumentacao ?? "")}</p>
    <p class="prompt-hint">${escapeHtml(evaluation.fluencia_e_naturalidade ?? "")}</p>
    ${strengthsHtml ? `<div class="feedback correct"><strong>Pontos fortes</strong><ul>${strengthsHtml}</ul></div>` : ""}
    ${errorsHtml ? `<div class="feedback incorrect"><strong>A revisar</strong><ul class="essay-errors">${errorsHtml}</ul></div>` : ""}
    <span class="cefr-estimate">Nível estimado: ${escapeHtml(evaluation.cefr_estimate ?? "—")}</span>
    <button class="link" id="back-after-speech" type="button">← Planejador</button>
  `;
  document.getElementById("back-after-speech").addEventListener("click", renderPlanner);
}

navToggle.addEventListener("click", () => {
  if (currentView === "planner") {
    currentView = "session";
    navToggle.textContent = "Planejador";
    loadSession();
  } else {
    renderPlanner();
  }
});

const TEXT_INPUT_TEMPLATES = new Set([
  "GapFillGovernanceEngine",
  "FillBlankEngine",
  "StructuralTransformEngine",
  "RegisterReformulationEngine",
  "ComprehensionQAEngine",
  "VowelInsertEngine",
  "PunctuationCapsEngine",
  "CompoundSegmentationEngine",
]);
const CHIP_CHOICE_TEMPLATES = new Set(["WordBankGuessEngine", "BinaryChoiceEngine"]);
const ASSEMBLY_TEMPLATES = new Set(["UnscrambleEngine", "ParagraphOrderEngine", "LetterAnagramEngine"]);

function renderCurrent() {
  const ex = session[index];
  progressEl.textContent = `${index + 1} / ${session.length}`;

  if (TEXT_INPUT_TEMPLATES.has(ex.template)) {
    renderTextInput(ex);
  } else if (CHIP_CHOICE_TEMPLATES.has(ex.template)) {
    renderChipChoice(ex);
  } else if (ASSEMBLY_TEMPLATES.has(ex.template)) {
    renderAssembly(ex);
  } else if (ex.template === "DictationEngine") {
    renderDictation(ex);
  } else if (ex.template === "TrueFalseEngine") {
    renderTrueFalse(ex);
  } else if (ex.template === "PredictThenVerifyEngine") {
    renderPredictVerify(ex);
  } else if (ex.template === "MatchingEngine") {
    renderMatching(ex);
  } else if (ex.template === "VideoTaskEngine") {
    renderVideo(ex);
  } else if (ex.template === "ReadAloudEngine" || ex.template === "SpokenGapFillEngine") {
    renderPhonetic(ex);
  } else if (ex.template === "ShadowingEngine") {
    renderShadowing(ex);
  } else {
    // nao deveria acontecer -- session.ts so serve templates suportados
    advance();
  }
}

function templateLabel(template) {
  const labels = {
    GapFillGovernanceEngine: "Completar lacuna",
    FillBlankEngine: "Completar lacuna",
    WordBankGuessEngine: "Escolher a opção certa",
    UnscrambleEngine: "Reordenar",
    StructuralTransformEngine: "Reescrever",
    RegisterReformulationEngine: "Reescrever em registro formal",
    DictationEngine: "Ditado",
    LetterAnagramEngine: "Reordenar as letras",
    ParagraphOrderEngine: "Reordenar as frases",
    BinaryChoiceEngine: "Escolher a opção certa",
    TrueFalseEngine: "Verdadeiro ou falso",
    ComprehensionQAEngine: "Pergunta sobre o texto",
    VowelInsertEngine: "Completar as vogais",
    PunctuationCapsEngine: "Pontuação e maiúsculas",
    CompoundSegmentationEngine: "Separar a palavra composta",
    PredictThenVerifyEngine: "Prever e conferir",
    MatchingEngine: "Ligar os pares",
    VideoTaskEngine: "Vídeo",
    ReadAloudEngine: "Ler em voz alta",
    SpokenGapFillEngine: "Completar a lacuna falando",
    ShadowingEngine: "Shadowing",
  };
  return labels[template] ?? template;
}

// ---------- input de texto (gap-fill, reescrita, pergunta, etc.) ----------

function textInputPlaceholder(template) {
  const placeholders = {
    CompoundSegmentationEngine: "ex.: Auto/bahn/kreuz",
    PunctuationCapsEngine: "digite com pontuação e maiúsculas",
  };
  return placeholders[template] ?? "";
}

function renderTextInput(ex) {
  const placeholder = textInputPlaceholder(ex.template);
  main.innerHTML = `
    <div class="card">
      <span class="template-label">${templateLabel(ex.template)}</span>
      <p class="prompt">${escapeHtml(ex.prompt)}</p>
      <input type="text" class="text-input" id="answer" autocomplete="off"
             ${placeholder ? `placeholder="${escapeHtml(placeholder)}"` : ""} autofocus />
      <button class="primary" id="submit">Verificar</button>
      <div id="feedback"></div>
    </div>
  `;
  const input = document.getElementById("answer");
  const submit = document.getElementById("submit");
  input.focus();
  const doSubmit = () => submitAttempt(ex.id, input.value);
  submit.addEventListener("click", doSubmit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSubmit();
  });
}

// ---------- escolha por chip (banco de palavras, par binario, previsao) ----------

function renderChipChoice(ex) {
  const data = JSON.parse(ex.prompt);
  const context = data.prompt_gapped ?? data.trecho_gapped ?? data.trecho_inicial;
  const options = data.word_bank ?? data.opcoes;
  main.innerHTML = `
    <div class="card">
      <span class="template-label">${templateLabel(ex.template)}</span>
      <p class="prompt">${escapeHtml(context)}</p>
      <div class="chips" id="options"></div>
      <div id="feedback"></div>
    </div>
  `;
  const optionsEl = document.getElementById("options");
  options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.type = "button";
    btn.textContent = opt;
    btn.addEventListener("click", () => submitAttempt(ex.id, opt));
    optionsEl.appendChild(btn);
  });
}

// ---------- montagem em ordem (palavras, letras, frases) ----------

function renderAssembly(ex) {
  const isLetters = ex.template === "LetterAnagramEngine";
  const parsed = JSON.parse(ex.prompt);
  const items = isLetters ? parsed.letras : parsed; // array direto, exceto LetterAnagram = {letras, frase_contexto}
  const context = isLetters ? parsed.frase_contexto : null;
  const joiner = isLetters ? "" : " ";
  const chosen = [];
  main.innerHTML = `
    <div class="card">
      <span class="template-label">${templateLabel(ex.template)}</span>
      ${context ? `<p class="prompt">${escapeHtml(context)}</p>` : ""}
      <div class="assembly" id="assembly"></div>
      <div class="chips" id="bank"></div>
      <button class="primary" id="submit" disabled>Verificar</button>
      <div id="feedback"></div>
    </div>
  `;
  const bankEl = document.getElementById("bank");
  const assemblyEl = document.getElementById("assembly");
  const submitBtn = document.getElementById("submit");

  function renderBank() {
    bankEl.innerHTML = "";
    items.forEach((tok, i) => {
      if (chosen.includes(i)) return;
      const btn = document.createElement("button");
      btn.className = "chip";
      btn.type = "button";
      btn.textContent = tok;
      btn.addEventListener("click", () => {
        chosen.push(i);
        renderAssemblyArea();
        renderBank();
      });
      bankEl.appendChild(btn);
    });
  }

  function renderAssemblyArea() {
    assemblyEl.innerHTML = "";
    chosen.forEach((i) => {
      const btn = document.createElement("button");
      btn.className = "chip chosen";
      btn.type = "button";
      btn.textContent = items[i];
      btn.title = "clique para remover";
      btn.addEventListener("click", () => {
        chosen.splice(chosen.indexOf(i), 1);
        renderAssemblyArea();
        renderBank();
      });
      assemblyEl.appendChild(btn);
    });
    submitBtn.disabled = chosen.length !== items.length;
  }

  submitBtn.addEventListener("click", () => {
    const answer = chosen.map((i) => items[i]).join(joiner);
    submitAttempt(ex.id, answer);
  });

  renderBank();
  renderAssemblyArea();
}

// ---------- verdadeiro/falso ----------

function renderTrueFalse(ex) {
  main.innerHTML = `
    <div class="card">
      <span class="template-label">${templateLabel(ex.template)}</span>
      <p class="prompt">${escapeHtml(ex.prompt)}</p>
      <div class="chips">
        <button class="chip" id="true-btn" type="button">Verdadeiro</button>
        <button class="chip" id="false-btn" type="button">Falso</button>
      </div>
      <div id="feedback"></div>
    </div>
  `;
  document.getElementById("true-btn").addEventListener("click", () => submitAttempt(ex.id, "true"));
  document.getElementById("false-btn").addEventListener("click", () => submitAttempt(ex.id, "false"));
}

// ---------- previsao em duas fases ----------

function renderPredictVerify(ex) {
  renderChipChoice(ex); // mesmo layout -- contexto + opcoes clicaveis
}

// ---------- matching (duas colunas) ----------

function renderMatching(ex) {
  const data = JSON.parse(ex.prompt); // {termos, definicoes}
  const termos = data.termos;
  const definicoes = shuffleArray(data.definicoes);
  const pairs = []; // {termo, definicao}
  let selectedTermo = null;
  let selectedDefinicao = null;

  main.innerHTML = `
    <div class="card">
      <span class="template-label">${templateLabel(ex.template)}</span>
      <div class="chips" id="termos-col"></div>
      <div class="chips" id="def-col"></div>
      <div class="assembly" id="pairs"></div>
      <button class="primary" id="submit" disabled>Verificar</button>
      <div id="feedback"></div>
    </div>
  `;
  const termosCol = document.getElementById("termos-col");
  const defCol = document.getElementById("def-col");
  const pairsEl = document.getElementById("pairs");
  const submitBtn = document.getElementById("submit");

  function matched(termo) {
    return pairs.some((p) => p.termo === termo);
  }
  function matchedDef(def) {
    return pairs.some((p) => p.definicao === def);
  }

  function tryFormPair() {
    if (selectedTermo && selectedDefinicao) {
      pairs.push({ termo: selectedTermo, definicao: selectedDefinicao });
      selectedTermo = null;
      selectedDefinicao = null;
      renderAll();
    }
  }

  function renderAll() {
    termosCol.innerHTML = "";
    termos.forEach((t) => {
      if (matched(t)) return;
      const btn = document.createElement("button");
      btn.className = "chip" + (selectedTermo === t ? " chosen" : "");
      btn.type = "button";
      btn.textContent = t;
      btn.addEventListener("click", () => {
        selectedTermo = t;
        tryFormPair();
        renderAll();
      });
      termosCol.appendChild(btn);
    });

    defCol.innerHTML = "";
    definicoes.forEach((d) => {
      if (matchedDef(d)) return;
      const btn = document.createElement("button");
      btn.className = "chip" + (selectedDefinicao === d ? " chosen" : "");
      btn.type = "button";
      btn.textContent = d;
      btn.addEventListener("click", () => {
        selectedDefinicao = d;
        tryFormPair();
        renderAll();
      });
      defCol.appendChild(btn);
    });

    pairsEl.innerHTML = "";
    pairs.forEach((p) => {
      const span = document.createElement("span");
      span.className = "chip chosen";
      span.textContent = `${p.termo} → ${p.definicao}`;
      pairsEl.appendChild(span);
    });

    submitBtn.disabled = pairs.length !== termos.length;
  }

  submitBtn.addEventListener("click", () => {
    submitAttempt(ex.id, JSON.stringify(pairs));
  });

  renderAll();
}

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ---------- ditado (audio) ----------

function renderDictation(ex) {
  // audio-primeiro: prompt chega null da API de proposito (regra do
  // projeto -- nunca mostrar a frase-fonte antes da tentativa). Replay
  // ilimitado (docs/08/docs/03: nunca "so uma chance", ansiedade social).
  main.innerHTML = `
    <div class="card">
      <span class="template-label">${templateLabel(ex.template)}</span>
      <audio id="player" src="${ex.audio_url}" controls preload="auto"></audio>
      <input type="text" class="text-input" id="answer" autocomplete="off"
             placeholder="Digite o que você ouviu" autofocus />
      <button class="primary" id="submit">Verificar</button>
      <div id="feedback"></div>
    </div>
  `;
  const input = document.getElementById("answer");
  const submit = document.getElementById("submit");
  document.getElementById("player").play().catch(() => {}); // autoplay pode falhar, sem problema
  input.focus();
  const doSubmit = () => submitAttempt(ex.id, input.value);
  submit.addEventListener("click", doSubmit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSubmit();
  });
}

// ---------- video (YouTube, legendar/citar/ditado autentico) ----------

function youtubeEmbedUrl(ex) {
  const match = /[?&]v=([^&]+)/.exec(ex.video_url ?? "");
  const videoId = match ? match[1] : "";
  const params = new URLSearchParams({ rel: "0" });
  if (ex.video_start_seconds != null) params.set("start", String(ex.video_start_seconds));
  if (ex.video_end_seconds != null) params.set("end", String(ex.video_end_seconds));
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

function renderVideo(ex) {
  // audio-primeiro (AUDIO_FIRST_TEMPLATES): transcricao nunca aparece como
  // texto pra ler antes da tentativa, so como gabarito pos-tentativa --
  // mesma regra do DictationEngine, so que a fonte e' o video em si.
  main.innerHTML = `
    <div class="card">
      <span class="template-label">${templateLabel(ex.template)}</span>
      <div class="video-wrap">
        <iframe src="${youtubeEmbedUrl(ex)}" title="vídeo"
                frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>
      </div>
      <input type="text" class="text-input" id="answer" autocomplete="off"
             placeholder="Digite o que você ouviu" autofocus />
      <button class="primary" id="submit">Verificar</button>
      <div id="feedback"></div>
    </div>
  `;
  const input = document.getElementById("answer");
  const submit = document.getElementById("submit");
  input.focus();
  const doSubmit = () => submitAttempt(ex.id, input.value);
  submit.addEventListener("click", doSubmit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSubmit();
  });
}

// ---------- fonetica (grava, corrige via servico local wav2vec2) ----------

function renderPhonetic(ex) {
  // texto sempre visivel (ReadAloudEngine le um texto DADO; SpokenGapFillEngine
  // mostra a lacuna igual ao gap-fill de texto) -- so o audio-alvo (TTS) fica
  // escondido ate a tentativa (TARGET_AUDIO_HIDDEN_TEMPLATES, types.ts).
  main.innerHTML = `
    <div class="card">
      <span class="template-label">${templateLabel(ex.template)}</span>
      <p class="prompt">${escapeHtml(ex.prompt)}</p>
      <div class="recorder">
        <button class="primary" id="record-btn" type="button">● Gravar</button>
        <audio id="preview" controls style="display:none"></audio>
        <div class="recorder-actions" id="recorder-actions" style="display:none">
          <button class="link" id="rerecord-btn" type="button">Regravar</button>
          <button class="primary" id="submit-btn" type="button">Enviar</button>
        </div>
      </div>
      <div id="feedback"></div>
    </div>
  `;
  const submitBtn = document.getElementById("submit-btn");
  let recordedBlob = null;
  setupRecorder((blob) => {
    recordedBlob = blob;
  });
  submitBtn.addEventListener("click", async () => {
    submitBtn.disabled = true;
    document.getElementById("rerecord-btn").disabled = true;
    const audioBase64 = await blobToBase64(recordedBlob);
    submitPhoneticAttempt(ex, audioBase64);
  });
}

// estado de gravar/parar/regravar, compartilhado entre ReadAloudEngine/
// SpokenGapFillEngine (grava -> envia pro servico fonetico) e
// ShadowingEngine (grava -> so' toca de volta, nunca envia -- docs/05 item
// 2). onStopped(blob) roda quando a gravacao termina; o que fazer com o
// blob (enviar, ou so' guardar pra playback local) fica a cargo de quem
// chamou, nao desta funcao.
function setupRecorder(onStopped) {
  const recordBtn = document.getElementById("record-btn");
  const preview = document.getElementById("preview");
  const actions = document.getElementById("recorder-actions");
  const rerecordBtn = document.getElementById("rerecord-btn");

  let mediaRecorder = null;
  let chunks = [];

  function resetToRecording() {
    preview.style.display = "none";
    actions.style.display = "none";
    recordBtn.style.display = "inline-block";
    recordBtn.textContent = "● Gravar";
    recordBtn.disabled = false;
  }

  recordBtn.addEventListener("click", async () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      recordBtn.disabled = true;
      recordBtn.textContent = "Microfone indisponível";
      return;
    }
    chunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: mediaRecorder.mimeType });
      preview.src = URL.createObjectURL(blob);
      preview.style.display = "block";
      actions.style.display = "flex";
      recordBtn.style.display = "none";
      stream.getTracks().forEach((t) => t.stop());
      onStopped(blob);
    };
    mediaRecorder.start();
    recordBtn.textContent = "■ Parar";
  });

  rerecordBtn.addEventListener("click", resetToRecording);
}

// ---------- shadowing (grava, ouve so a propria gravacao -- sem correcao) ----------

function renderShadowing(ex) {
  // audio-alvo SEMPRE visivel de imediato (ShadowingEngine esta em
  // AUDIO_FIRST_TEMPLATES so pra esconder "prompt", nunca o audio -- ouvir
  // o trecho-alvo antes de tentar e' o proprio exercicio). Sem correcao
  // por design (docs/05 item 2): a gravacao do usuario nunca sai do
  // navegador, so' toca de volta pra auto-comparacao -- por isso
  // "Continuar" nao depende de gravar nada, so' registra que a pessoa
  // apareceu.
  main.innerHTML = `
    <div class="card">
      <span class="template-label">${templateLabel(ex.template)}</span>
      <audio id="target-player" src="${ex.audio_url}" controls preload="auto"></audio>
      <div class="recorder">
        <button class="primary" id="record-btn" type="button">● Gravar</button>
        <audio id="preview" controls style="display:none"></audio>
        <div class="recorder-actions" id="recorder-actions" style="display:none">
          <button class="link" id="rerecord-btn" type="button">Regravar</button>
        </div>
      </div>
      <button class="primary" id="continue-btn" type="button">Continuar →</button>
    </div>
  `;
  document.getElementById("target-player").play().catch(() => {});
  setupRecorder(() => {});

  document.getElementById("continue-btn").addEventListener("click", async () => {
    document.getElementById("continue-btn").disabled = true;
    await fetch("/api/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exercise_id: ex.id }),
    });
    advance();
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function submitPhoneticAttempt(ex, audioBase64) {
  const res = await fetch("/api/attempts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ exercise_id: ex.id, audio_base64: audioBase64 }),
  });
  const result = await res.json();
  showPhoneticFeedback(result);
}

function phoneDiffHtml(alignment) {
  return alignment
    .map((block) => {
      if (block.op === "equal") return `<span class="phone ok">${escapeHtml(block.target.join(" "))}</span>`;
      if (block.op === "delete") return `<span class="phone miss">${escapeHtml(block.target.join(" "))}</span>`;
      if (block.op === "insert") return `<span class="phone extra">+${escapeHtml(block.recognized.join(" "))}</span>`;
      return `<span class="phone diff">${escapeHtml(block.target.join(" "))}→${escapeHtml(block.recognized.join(" "))}</span>`;
    })
    .join(" ");
}

function showPhoneticFeedback(result) {
  const feedbackEl = document.getElementById("feedback");
  const pron = result.pronunciation;

  // dois blocos SEPARADOS, nunca misturados num score so (CLAUDE.md) --
  // lexical (a palavra certa foi dita?) so existe pro SpokenGapFillEngine.
  const lexicalHtml = result.lexical
    ? `<div class="feedback ${result.lexical.correct ? "correct" : "incorrect"}">
         ${result.lexical.correct ? "Palavra certa!" : `Você disse: "${escapeHtml(result.lexical.transcribed)}"`}
       </div>`
    : "";

  // mesmo limiar provisorio do Worker (PRONUNCIATION_OK_THRESHOLD,
  // attempts.ts) -- so pra colorir o feedback, nao decide o FSRS aqui.
  const pronunciationOk = pron.similarity >= 0.5;

  feedbackEl.innerHTML = `
    ${lexicalHtml}
    <div class="feedback ${pronunciationOk ? "correct" : "incorrect"}">
      Pronúncia — similaridade: ${Math.round(pron.similarity * 100)}%
      <div class="phone-diff">${phoneDiffHtml(pron.alignment)}</div>
    </div>
    ${result.target_audio_url ? `<audio src="${result.target_audio_url}" controls></audio>` : ""}
    <button class="link" id="next">Continuar →</button>
  `;
  document.getElementById("next").addEventListener("click", advance);
}

// ---------- submissao e feedback ----------

async function submitAttempt(exerciseId, userResponse) {
  disableInputs();
  const res = await fetch("/api/attempts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ exercise_id: exerciseId, user_response: userResponse }),
  });
  const result = await res.json();
  showFeedback(result);
}

function disableInputs() {
  main.querySelectorAll("button, input").forEach((el) => (el.disabled = true));
}

function formatAnswerForDisplay(result) {
  if (result.source_sentence) return result.source_sentence;
  const a = result.accepted_answers;
  if (Array.isArray(a)) {
    if (a.length && typeof a[0] === "object") {
      // MatchingEngine: array de {termo, definicao}
      return a.map((p) => `${p.termo} → ${p.definicao}`).join(", ");
    }
    return String(a[0]);
  }
  return String(a);
}

function showFeedback(result) {
  const feedbackEl = document.getElementById("feedback");
  const correctText = formatAnswerForDisplay(result);
  feedbackEl.innerHTML = `
    <div class="feedback ${result.correct ? "correct" : "incorrect"}">
      ${result.correct ? "Certo!" : "Quase — a resposta certa era:"}
      ${result.correct ? "" : `<span class="answer">${escapeHtml(correctText)}</span>`}
    </div>
    <button class="link" id="next">Continuar →</button>
  `;
  document.getElementById("next").addEventListener("click", advance);
}

function advance() {
  index += 1;
  if (index >= session.length) {
    main.innerHTML = `<p class="empty">Sessão concluída — ${session.length} exercícios. Volte quando quiser.</p>`;
    progressEl.textContent = "";
    return;
  }
  renderCurrent();
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

loadSession();
loadBanner();
