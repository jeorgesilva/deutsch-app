// Fase 9 -- frontend minimo, vanilla JS de proposito (nenhum framework
// pra manter "minimo" literal). Um exercicio por vez, feedback imediato.
// Fase 12 (docs/09, Secao 11 "Gestao de atencao"): avanco e' sempre por
// clique manual em "Continuar", nunca automatico por timeout -- ritmo
// iniciado pelo usuario, nao pressao de tempo (mesmo principio ja usado
// pra rejeitar cronometro regressivo em qualquer exercicio de exposicao).

const main = document.getElementById("main");
const progressEl = document.getElementById("progress");
const bannerEl = document.getElementById("banner");
const crumbEl = document.getElementById("crumb");
const blockContextEl = document.getElementById("block-context");
const changePasswordBtn = document.getElementById("change-password-btn");
const logoutBtn = document.getElementById("logout-btn");
const dashboardBtn = document.getElementById("dashboard-btn");

let session = [];
let index = 0;
let currentView = "session";
let currentUser = null;
// para onde "sessão concluída"/"nenhum exercício" deve voltar -- null
// (default) volta pra Home; sessões escopadas (categoria, bloco de
// leitura/vídeo) sobrescrevem antes de chamar showEmptyState.
let sessionEmptyState = null;
// chamado a cada advance() (inclusive no render inicial da sessao) --
// usado pelo bloco de leitura/video pra atualizar os dots de progresso
// sequencial sem duplicar logica dentro do advance() generico.
let sessionProgressHook = null;

// #block-context (fora de #main, igual ao crumb) guarda o texto/video +
// dots de progresso de um bloco aberto -- persiste durante os varios
// renderCurrent()/advance() da sequencia, que cada um substitui #main
// inteiro sozinho. Toda tela que NAO e' um bloco chama isso pra garantir
// que sobras de uma visita anterior a Leitura/Video nao fiquem penduradas.
function clearBlockContext() {
  blockContextEl.innerHTML = "";
  sessionProgressHook = null;
}

// ---------- Fase 13 -- autenticacao (login obrigatorio, CLAUDE.md) ----------
// Login/logout tradicional (nao perfis compartilhados) -- "trocar de
// usuario" e' sair e entrar com a outra conta. logout-btn/change-password-btn
// comecam `hidden` no HTML e so aparecem depois de autenticado.

async function boot() {
  const res = await fetch("/api/auth/me");
  if (res.status === 401) {
    renderAuthScreen("login");
    return;
  }
  const data = await res.json();
  currentUser = data.user;
  changePasswordBtn.hidden = false;
  logoutBtn.hidden = false;
  dashboardBtn.hidden = false;
  renderHome();
  loadBanner();
}

function renderAuthScreen(mode) {
  currentView = "auth";
  logoutBtn.hidden = true;
  dashboardBtn.hidden = true;
  progressEl.textContent = "";
  bannerEl.classList.add("banner-hidden");

  const isRegister = mode === "register";
  main.innerHTML = `
    <div class="auth-card">
      <h1>Deutsch</h1>
      <form id="auth-form">
        ${isRegister ? `<label>Nome<input class="text-input" id="auth-name" type="text" autocomplete="name" required /></label>` : ""}
        <label>Email<input class="text-input" id="auth-email" type="email" autocomplete="email" required /></label>
        <label>Senha<input class="text-input" id="auth-password" type="password" autocomplete="${isRegister ? "new-password" : "current-password"}" minlength="8" required /></label>
        <p class="error" id="auth-error" hidden></p>
        <button class="primary" type="submit">${isRegister ? "Criar conta" : "Entrar"}</button>
      </form>
      <button class="link" id="auth-toggle-mode" type="button">
        ${isRegister ? "Já tem conta? Entrar" : "Não tem conta? Registre-se"}
      </button>
    </div>
  `;

  document.getElementById("auth-toggle-mode").addEventListener("click", () => {
    renderAuthScreen(isRegister ? "login" : "register");
  });

  document.getElementById("auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("auth-error");
    errorEl.hidden = true;

    const body = {
      email: document.getElementById("auth-email").value,
      password: document.getElementById("auth-password").value,
    };
    if (isRegister) body.display_name = document.getElementById("auth-name").value;

    const res = await fetch(isRegister ? "/api/auth/register" : "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      errorEl.textContent = data.error ?? "algo deu errado";
      errorEl.hidden = false;
      return;
    }
    currentUser = data;
    changePasswordBtn.hidden = false;
    logoutBtn.hidden = false;
    dashboardBtn.hidden = false;
    renderHome();
    loadBanner();
  });
}

function renderChangePassword() {
  const previousView = currentView;
  currentView = "change-password";
  progressEl.textContent = "";
  main.innerHTML = `
    <div class="auth-card">
      <h1>Trocar senha</h1>
      <form id="change-password-form">
        <label>Senha atual<input class="text-input" id="cp-current" type="password" autocomplete="current-password" required /></label>
        <label>Senha nova<input class="text-input" id="cp-new" type="password" autocomplete="new-password" minlength="8" required /></label>
        <p class="error" id="cp-error" hidden></p>
        <button class="primary" type="submit">Salvar</button>
      </form>
      <button class="link" id="cp-cancel" type="button">Cancelar</button>
    </div>
  `;

  const back = () => {
    currentView = previousView;
    if (previousView === "planner") renderPlanner();
    else if (previousView === "session") loadSession();
    else if (previousView === "dashboard") renderDashboard();
    else renderHome();
  };

  document.getElementById("cp-cancel").addEventListener("click", back);

  document.getElementById("change-password-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("cp-error");
    errorEl.hidden = true;

    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        current_password: document.getElementById("cp-current").value,
        new_password: document.getElementById("cp-new").value,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      errorEl.textContent = data.error ?? "algo deu errado";
      errorEl.hidden = false;
      return;
    }
    back();
  });
}

changePasswordBtn.addEventListener("click", renderChangePassword);
dashboardBtn.addEventListener("click", renderDashboard);

logoutBtn.addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  currentUser = null;
  renderAuthScreen("login");
});

// ---------- "Home por categoria" (docs/12) ----------
// Substitui a fila FSRS como ponto de entrada -- home e' um grid de cards
// de grupo, "Revisao de hoje" vira uma opcao a mais (banner condicional),
// nao o unico fluxo. Ver docs/12-mudanca-direcao-home-por-categoria.md.

// crumb e' um elemento PERSISTENTE (index.html, fora de #main) em vez de
// html embutido em cada tela -- assim nao precisa tocar nos ~20 renderX()
// de exercicio (cada um substitui #main.innerHTML inteiro sozinho) so' pra
// mostrar "voltar pra categoria/bloco" durante uma sessao escopada.
function setCrumb(label, onBack) {
  crumbEl.innerHTML = `<button class="link" id="crumb-back">← ${escapeHtml(label)}</button>`;
  crumbEl.hidden = false;
  document.getElementById("crumb-back").addEventListener("click", onBack);
}

function clearCrumb() {
  crumbEl.hidden = true;
  crumbEl.innerHTML = "";
}

async function renderHome() {
  currentView = "home";
  progressEl.textContent = "";
  clearCrumb();
  clearBlockContext();
  main.innerHTML = `<p class="loading">Carregando…</p>`;

  const res = await fetch("/api/home");
  const overview = await res.json();

  const reviewBanner =
    overview.fsrs_due_count > 0
      ? `<div class="review-banner">
           <span>${overview.fsrs_due_count} ${overview.fsrs_due_count === 1 ? "item pronto" : "itens prontos"} pra revisão espaçada</span>
           <button class="link" id="review-btn">Revisão de hoje →</button>
         </div>`
      : "";

  const readingSub =
    overview.reading.in_progress_count > 0
      ? `${overview.reading.in_progress_count} em andamento`
      : overview.reading.new_count > 0
        ? `${overview.reading.new_count} novo${overview.reading.new_count === 1 ? "" : "s"}`
        : "em dia";

  main.innerHTML = `
    <p class="greeting">O que você quer praticar hoje?</p>
    ${reviewBanner}
    <div class="group-grid">
      <button class="group-card" id="group-grammar">
        <span class="group-title">Gramática &amp; vocabulário</span>
        <span class="group-sub">18 categorias · 100 tópicos</span>
        <span class="group-meta${overview.grammar.due_count > 0 ? " due" : " neutral"}">${overview.grammar.due_count > 0 ? overview.grammar.due_count + " pendentes" : "em dia"}</span>
      </button>
      <button class="group-card" id="group-phonetics">
        <span class="group-title">Fonética</span>
        <span class="group-sub">8 categorias · 26 pontos</span>
        <span class="group-meta${overview.phonetics.due_count > 0 ? " due" : " neutral"}">${overview.phonetics.due_count > 0 ? overview.phonetics.due_count + " pendentes" : "em dia"}</span>
      </button>
      <button class="group-card" id="group-reading">
        <span class="group-title">Leitura</span>
        <span class="group-sub">Textos com exercícios ligados</span>
        <span class="group-meta neutral">${escapeHtml(readingSub)}</span>
      </button>
      <button class="group-card" id="group-video">
        <span class="group-title">Vídeo</span>
        <span class="group-sub">Clipes reais da DW</span>
        <span class="group-meta neutral">${overview.video.available_count} disponíve${overview.video.available_count === 1 ? "l" : "is"}</span>
      </button>
      <button class="group-card" id="group-weekly">
        <span class="group-title">Prática semanal</span>
        <span class="group-sub">Shadowing, opinião, mineração de vídeo</span>
        <span class="group-meta neutral">Planejador →</span>
      </button>
      <button class="group-card" id="group-conversations">
        <span class="group-title">Conversas</span>
        <span class="group-sub">Contestação hostil, speech rápido</span>
        <span class="group-meta neutral">5 cenários</span>
      </button>
    </div>
  `;

  const reviewBtn = document.getElementById("review-btn");
  if (reviewBtn) reviewBtn.addEventListener("click", loadSession);

  document.getElementById("group-grammar").addEventListener("click", () => renderCategoryGrid("grammar"));
  document.getElementById("group-phonetics").addEventListener("click", () => renderCategoryGrid("phonetics"));
  document.getElementById("group-reading").addEventListener("click", renderReadingHub);
  document.getElementById("group-video").addEventListener("click", renderVideoHub);
  document.getElementById("group-weekly").addEventListener("click", renderPlanner);
  document.getElementById("group-conversations").addEventListener("click", renderHostileLadder);
}

// ---------- Dashboard de progresso (docs/14) ----------
// "Perfil & Motivo" que o docs/09 previa como pendencia P1 e nunca chegou a
// desenhar -- alcancado a partir do topbar (nao um card do grid da home,
// que ja tem os 6 grupos fechados do docs/12). Barra de acerto/erro,
// calendario de uso, vocabulario contatado, palavra do dia -- os 4
// elementos do docs/14, cada um vindo de um endpoint proprio em
// /api/dashboard/*. Cores seguem a mesma regra ja fechada na Fase 12:
// nunca vermelho puro pra "errado" (--caution ambar quando preciso, aqui
// nem isso -- so o verde cresce, o resto fica no track neutro), calendario
// na rampa do --accent (nao verde, que ja significa "resposta certa" em
// outro lugar do app).
let dashboardMasteryGroup = "grammar";

async function renderDashboard() {
  currentView = "dashboard";
  progressEl.textContent = "";
  setCrumb("Início", renderHome);
  clearBlockContext();
  main.innerHTML = `<p class="loading">Carregando progresso…</p>`;

  const [wordRes, vocabRes, calendarRes, masteryRes] = await Promise.all([
    fetch("/api/dashboard/word-of-the-day"),
    fetch("/api/dashboard/vocabulary"),
    fetch("/api/dashboard/calendar"),
    fetch(`/api/dashboard/mastery?group=${dashboardMasteryGroup}`),
  ]);
  const wordData = await wordRes.json();
  const vocabData = await vocabRes.json();
  const calendarData = await calendarRes.json();
  const masteryData = await masteryRes.json();

  main.innerHTML = `
    <p class="screen-title">Progresso</p>
    <div class="dashboard">
      ${wordOfDayHtml(wordData.word)}
      <div class="dashboard-section">
        <p class="screen-sub" style="margin:0 0 0.1rem">Vocabulário com contato</p>
        ${vocabularyHtml(vocabData)}
      </div>
      <div class="dashboard-section">
        <p class="screen-sub" style="margin:0 0 0.1rem">Uso ao longo do tempo</p>
        ${calendarHtml(calendarData.days)}
      </div>
      <div class="dashboard-section">
        <p class="screen-sub" style="margin:0 0 0.1rem">Domínio por tópico</p>
        <div class="filter-row" id="mastery-group-filter">
          <button class="filter-chip${dashboardMasteryGroup === "grammar" ? " on" : ""}" data-group="grammar">Gramática</button>
          <button class="filter-chip${dashboardMasteryGroup === "phonetics" ? " on" : ""}" data-group="phonetics">Fonética</button>
        </div>
        <div id="mastery-list">${masteryListHtml(masteryData.topics)}</div>
      </div>
    </div>
  `;

  document.getElementById("mastery-group-filter").addEventListener("click", async (e) => {
    const chip = e.target.closest(".filter-chip");
    if (!chip || chip.classList.contains("on")) return;
    dashboardMasteryGroup = chip.dataset.group;
    document.querySelectorAll("#mastery-group-filter .filter-chip").forEach((c) => c.classList.remove("on"));
    chip.classList.add("on");
    await reloadMasteryList();
  });

  setupVocabularyInteraction();
  setupRegenerationInteraction();
}

async function reloadMasteryList() {
  const listEl = document.getElementById("mastery-list");
  listEl.innerHTML = `<p class="loading">Carregando…</p>`;
  const res = await fetch(`/api/dashboard/mastery?group=${dashboardMasteryGroup}`);
  const data = await res.json();
  listEl.innerHTML = masteryListHtml(data.topics);
}

// "Definição" não existe como dado real em lugar nenhum do projeto (nem
// lexicon, nem lookupWiktionary) -- nunca fabricar isso via LLM sem gate
// (CLAUDE.md: geração é sempre constrained pela KB). Mostra só o que é de
// fato sourced: classe gramatical + a frase real onde a palavra apareceu.
// Origem (tentativa errada) fica só na lógica de seleção do backend -- aqui
// não há nenhum rótulo de erro, mesmo princípio do DictationEngine.
function wordOfDayHtml(word) {
  if (!word) return "";
  return `
    <div class="word-of-day">
      <span class="word-of-day-pos">${escapeHtml(word.pos)}</span>
      <span class="word-of-day-lemma">${escapeHtml(word.lemma)}</span>
      ${word.exemplo ? `<span class="word-of-day-example">${escapeHtml(word.exemplo)}</span>` : ""}
    </div>
  `;
}

function vocabularyHtml(vocabData) {
  const posChips = Object.entries(vocabData.by_pos)
    .map(([pos, count]) => `<button class="filter-chip" data-pos="${escapeHtml(pos)}">${escapeHtml(pos)} · ${count}</button>`)
    .join("");
  return `
    <div class="vocab-count">
      <span class="vocab-count-number">${vocabData.total}</span>
      <span class="vocab-count-label">palavra${vocabData.total === 1 ? "" : "s"} com pelo menos 1 acerto</span>
    </div>
    ${posChips ? `<div class="filter-row" id="vocab-pos-filter">${posChips}</div>` : ""}
    <div class="vocab-words" id="vocab-words" hidden></div>
  `;
}

function setupVocabularyInteraction() {
  const filterEl = document.getElementById("vocab-pos-filter");
  const wordsEl = document.getElementById("vocab-words");
  if (!filterEl) return;

  filterEl.addEventListener("click", async (e) => {
    const chip = e.target.closest(".filter-chip");
    if (!chip) return;
    const alreadyOn = chip.classList.contains("on");
    filterEl.querySelectorAll(".filter-chip").forEach((c) => c.classList.remove("on"));
    if (alreadyOn) {
      wordsEl.hidden = true;
      wordsEl.innerHTML = "";
      return;
    }
    chip.classList.add("on");
    wordsEl.hidden = false;
    wordsEl.innerHTML = `<p class="loading">Carregando…</p>`;
    const res = await fetch(`/api/dashboard/vocabulary?pos=${encodeURIComponent(chip.dataset.pos)}`);
    const data = await res.json();
    wordsEl.innerHTML =
      (data.words ?? [])
        .map((w) => {
          const meta = [w.gender, w.plural, w.ipa].filter(Boolean).join(" · ");
          return `<div class="vocab-word-row"><span class="vocab-word-lemma">${escapeHtml(w.lemma)}</span>${meta ? `<span class="vocab-word-meta">${escapeHtml(meta)}</span>` : ""}</div>`;
        })
        .join("") || `<p class="empty">Nenhuma palavra ainda.</p>`;
  });
}

// Faixa de dias terminando hoje, coluna = semana (grid-auto-flow: column no
// CSS) -- densidade de uso, não alinhamento estrito a dia-da-semana (sem
// ganho real pra uma janela de ~4 meses).
const CALENDAR_DAYS = 119;

function calendarHtml(days) {
  const counts = new Map((days ?? []).map((d) => [d.date, d.count]));
  const today = new Date();
  const cells = [];
  for (let i = CALENDAR_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const count = counts.get(key) ?? 0;
    const level = count === 0 ? 0 : count <= 2 ? 1 : count <= 5 ? 2 : count <= 10 ? 3 : 4;
    cells.push(`<span class="calendar-cell" data-level="${level}" title="${key}: ${count}"></span>`);
  }
  return `<div class="calendar-grid">${cells.join("")}</div>`;
}

function masteryListHtml(topics) {
  if (!topics || topics.length === 0) return `<p class="empty">Nenhum tópico com conteúdo disponível ainda.</p>`;
  let html = "";
  let lastCategoria = null;
  for (const t of topics) {
    if (t.categoria !== lastCategoria) {
      html += `<p class="mastery-categoria">${escapeHtml(t.categoria)}</p>`;
      lastCategoria = t.categoria;
    }
    const pct = Math.round(t.fraction * 100);
    html += `
      <div class="mastery-topic" data-topic-id="${t.content_topic_id}">
        <div class="mastery-topic-head">
          <span class="topic-name">${escapeHtml(t.topico)}</span>
          <span class="topic-count${t.dominated ? " dominated" : ""}">${t.mastered}/${t.total}${t.dominated ? " · dominado" : ""}</span>
        </div>
        <span class="topic-bar-track"><span class="topic-bar-fill" style="width:${pct}%"></span></span>
        ${
          t.dominated
            ? `<button class="link regen-trigger" data-topic-id="${t.content_topic_id}">Gerar mais exercícios</button>
               <div class="regen-panel" data-topic-id="${t.content_topic_id}" hidden></div>`
            : ""
        }
      </div>
    `;
  }
  return html;
}

// Geração sob demanda (docs/14) -- só aparece quando o tópico já está
// "dominado" (mastered === total), nunca dispara sozinho: clique revela uma
// confirmação inline com estimativa de chamadas de LLM antes de qualquer
// requisição de verdade. Delegação de evento em #mastery-list (elemento
// estável entre trocas de Gramática/Fonética, só o innerHTML muda) em vez
// de um listener por linha -- sobrevive a reloadMasteryList() sem
// re-registrar nada.
function setupRegenerationInteraction() {
  const listEl = document.getElementById("mastery-list");
  listEl.addEventListener("click", async (e) => {
    const trigger = e.target.closest(".regen-trigger");
    const cancel = e.target.closest(".regen-cancel");
    const confirmBtn = e.target.closest(".regen-confirm");

    if (trigger) {
      const topicId = trigger.dataset.topicId;
      const panel = listEl.querySelector(`.regen-panel[data-topic-id="${topicId}"]`);
      panel.hidden = false;
      panel.innerHTML = `<p class="loading">Calculando…</p>`;
      const res = await fetch(`/api/topic-regeneration/estimate?content_topic_id=${topicId}`);
      const data = await res.json();
      if (!res.ok) {
        panel.innerHTML = `<p class="error">${escapeHtml(data.error ?? "não foi possível estimar")}</p>`;
        return;
      }
      const engineLabels = data.engines.map(templateLabel).join(", ");
      panel.innerHTML = `
        <p class="screen-sub" style="margin:0.4rem 0">
          Isso gera mais ~5 exercícios por formato (${data.engines.length} formato${data.engines.length === 1 ? "" : "s"}: ${escapeHtml(engineLabels)})
          -- ${data.calls_estimate} chamada${data.calls_estimate === 1 ? "" : "s"} de LLM. O lote antigo continua servível, nada é substituído.
        </p>
        <div class="filter-row">
          <button class="primary regen-confirm" data-topic-id="${topicId}">Confirmar</button>
          <button class="link regen-cancel" data-topic-id="${topicId}">Cancelar</button>
        </div>
      `;
      return;
    }

    if (cancel) {
      const panel = listEl.querySelector(`.regen-panel[data-topic-id="${cancel.dataset.topicId}"]`);
      panel.hidden = true;
      panel.innerHTML = "";
      return;
    }

    if (confirmBtn) {
      const topicId = confirmBtn.dataset.topicId;
      const panel = listEl.querySelector(`.regen-panel[data-topic-id="${topicId}"]`);
      panel.innerHTML = `<p class="loading">Gerando… isso pode levar alguns minutos.</p>`;
      const res = await fetch("/api/topic-regeneration/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content_topic_id: Number(topicId) }),
      });
      const data = await res.json();
      if (!res.ok) {
        panel.innerHTML = `<p class="error">${escapeHtml(data.error ?? "não foi possível iniciar")}</p>`;
        return;
      }
      pollRegenerationJob(panel, data.job_id);
    }
  });
}

async function pollRegenerationJob(panel, jobId) {
  const res = await fetch(`/api/topic-regeneration/status?job_id=${jobId}`);
  const data = await res.json();
  const job = data.job;

  if (!job || job.status === "pending" || job.status === "running") {
    setTimeout(() => pollRegenerationJob(panel, jobId), 4000);
    return;
  }

  if (job.status === "done") {
    panel.innerHTML = `<p class="feedback correct">Pronto -- lote novo adicionado.</p>`;
    // deixa a confirmação visível um instante antes de recarregar a lista
    // (mastered/total mudam -- o lote novo entra "não tentado ainda").
    setTimeout(reloadMasteryList, 1500);
    return;
  }

  // job.status === "failed" -- cota estourada, provedor indisponível etc.
  // Erro técnico real, não "resposta errada" -- fica no tom neutro de
  // .error, não no --caution que feedback de idioma usa.
  panel.innerHTML = `<p class="error">Geração falhou: ${escapeHtml(job.error ?? "erro desconhecido")}</p>`;
}

// placeholder temporario pros grupos cuja fatia ainda nao chegou --
// removido conforme cada fatia (Leitura, Video) troca a chamada acima por
// uma tela de verdade.
function renderPlaceholder(title, message) {
  currentView = "placeholder";
  progressEl.textContent = "";
  setCrumb("Início", renderHome);
  clearBlockContext();
  main.innerHTML = `
    <p class="screen-title">${escapeHtml(title)}</p>
    <p class="empty">${escapeHtml(message)}</p>
  `;
}

// ---------- Gramática & Fonética: grid de categorias + sessão escopada ----------

const GROUP_LABELS = { grammar: "Gramática & vocabulário", phonetics: "Fonética" };
const GROUP_TEMPLATES = {
  grammar: [
    "GapFillGovernanceEngine",
    "FillBlankEngine",
    "WordBankGuessEngine",
    "StructuralTransformEngine",
    "RegisterReformulationEngine",
    "UnscrambleEngine",
    "ReadAloudEngine",
    "SpokenGapFillEngine",
  ],
  phonetics: ["DictationEngine"],
};

async function renderCategoryGrid(group) {
  currentView = "category-grid";
  progressEl.textContent = "";
  setCrumb("Início", renderHome);
  clearBlockContext();
  main.innerHTML = `<p class="loading">Carregando categorias…</p>`;

  const res = await fetch(`/api/categories?group=${group}`);
  const data = await res.json();
  const categories = data.categories ?? [];

  let selectedTemplate = null;

  const filterChipsHtml = [`<button class="filter-chip on" data-template="">Todos os formatos</button>`]
    .concat(
      GROUP_TEMPLATES[group].map(
        (t) => `<button class="filter-chip" data-template="${escapeHtml(t)}">${escapeHtml(templateLabel(t))}</button>`
      )
    )
    .join("");

  const gridHtml = categories.length
    ? categories
        .map(
          (c) => `
      <button class="topic-card" data-categoria="${escapeHtml(c.categoria)}">
        <span class="topic-name">${escapeHtml(c.categoria)}</span>
        <span class="topic-bar-track"><span class="topic-bar-fill" style="width:${c.mastery_pct}%"></span></span>
        <span class="topic-count">${c.topic_count} tópico${c.topic_count === 1 ? "" : "s"} · ${c.mastery_pct}% dominado${c.due_count > 0 ? ` · ${c.due_count} pendente${c.due_count === 1 ? "" : "s"}` : ""}</span>
      </button>`
        )
        .join("")
    : `<p class="empty">Nenhuma categoria com conteúdo disponível ainda.</p>`;

  main.innerHTML = `
    <p class="screen-title">${escapeHtml(GROUP_LABELS[group])}</p>
    <p class="screen-sub">Escolha uma categoria. Dentro dela os formatos se intercalam — ou filtre por um formato específico.</p>
    <div class="filter-row" id="format-filter">${filterChipsHtml}</div>
    <div class="topic-grid">${gridHtml}</div>
  `;

  document.getElementById("format-filter").addEventListener("click", (e) => {
    const chip = e.target.closest(".filter-chip");
    if (!chip) return;
    document.querySelectorAll("#format-filter .filter-chip").forEach((c) => c.classList.remove("on"));
    chip.classList.add("on");
    selectedTemplate = chip.dataset.template || null;
  });

  main.querySelectorAll(".topic-card").forEach((card) => {
    card.addEventListener("click", () => loadScopedSession(group, card.dataset.categoria, selectedTemplate));
  });
}

async function loadScopedSession(group, categoria, template) {
  currentView = "category-session";
  setCrumb(categoria, () => renderCategoryGrid(group));
  main.innerHTML = `<p class="loading">Carregando exercícios…</p>`;

  const params = new URLSearchParams({ scope: group, categoria, limit: "10" });
  if (template) params.set("template", template);

  const res = await fetch(`/api/session?${params.toString()}`);
  const data = await res.json();
  session = data.exercises ?? [];
  index = 0;
  sessionEmptyState = {
    backLabel: categoria,
    onBack: () => renderCategoryGrid(group),
  };
  if (session.length === 0) {
    showEmptyState(`Nenhum exercício disponível agora nessa categoria${template ? " com esse formato" : ""}.`);
    return;
  }
  renderCurrent();
}

// ---------- Leitura: hub de blocos + bloco sequencial (docs/12) ----------
// Sem interleave, sem FSRS -- e' a sequencia INTEIRA de exercicios do bloco,
// em ordem, mostrada junto do texto que os originou. session/index (globais
// ja existentes) + renderCurrent()/advance() sao 100% reaproveitados; a
// unica coisa nova e' o texto+dots persistentes acima de #main
// (blockContextEl) e o destino de saida (Leitura, nao Inicio).

const BLOCK_STATUS_LABEL = { new: "Novo", in_progress: "Em andamento", done: "Concluído" };

async function renderReadingHub() {
  currentView = "reading-hub";
  progressEl.textContent = "";
  setCrumb("Início", renderHome);
  clearBlockContext();
  main.innerHTML = `<p class="loading">Carregando blocos de leitura…</p>`;

  const res = await fetch("/api/reading-blocks");
  const data = await res.json();
  const blocks = data.blocks ?? [];

  main.innerHTML = `
    <p class="screen-title">Leitura</p>
    <p class="screen-sub">Cada card é um texto — abrir mostra o texto e a sequência inteira de exercícios ligados a ele.</p>
    <div class="block-grid">
      ${
        blocks.length
          ? blocks
              .map(
                (b) => `
        <button class="block-card" data-id="${b.id}">
          <span class="block-info">
            <span class="block-title">${escapeHtml(b.titulo)}</span>
            <span class="block-teaser">${b.done} de ${b.total} exercícios concluídos</span>
          </span>
          <span class="block-status ${b.status}">${BLOCK_STATUS_LABEL[b.status]}</span>
        </button>`
              )
              .join("")
          : `<p class="empty">Nenhum bloco de leitura disponível ainda.</p>`
      }
    </div>
  `;

  main.querySelectorAll(".block-card").forEach((card) => {
    card.addEventListener("click", () => renderReadingBlock(Number(card.dataset.id)));
  });
}

function renderBlockProgressDots() {
  const row = document.getElementById("block-progress-row");
  if (!row) return;
  const dots = session
    .map((_, i) => {
      const cls = i < index ? "done" : i === index ? "current" : "";
      return `<span class="block-dot ${cls}"></span>`;
    })
    .join("");
  row.innerHTML = `${dots}<span class="block-progress-label">exercício ${Math.min(index + 1, session.length)} de ${session.length}</span>`;
}

async function renderReadingBlock(id) {
  currentView = "reading-block";
  setCrumb("Leitura", renderReadingHub);
  main.innerHTML = `<p class="loading">Carregando texto…</p>`;
  blockContextEl.innerHTML = "";

  const res = await fetch(`/api/reading-blocks/${id}`);
  if (!res.ok) {
    main.innerHTML = `<p class="error">Não foi possível carregar esse bloco.</p>`;
    return;
  }
  const block = await res.json();

  blockContextEl.innerHTML = `
    <div class="reading-text">
      <p class="title">${escapeHtml(block.titulo)}</p>
      ${escapeHtml(block.texto_base)}
    </div>
    <div class="block-progress-row" id="block-progress-row"></div>
  `;

  session = block.items.map((item) => item.exercise);
  index = 0;
  sessionEmptyState = { backLabel: "Leitura", onBack: renderReadingHub };
  sessionProgressHook = renderBlockProgressDots;

  if (session.length === 0) {
    blockContextEl.innerHTML = "";
    showEmptyState("Esse bloco ainda não tem exercícios disponíveis.");
    return;
  }
  renderBlockProgressDots();
  renderCurrent();
}

// ---------- Vídeo: hub de clipes + grupo sequencial (docs/12) ----------
// Mesmo padrao do bloco de Leitura, agrupando por video_clips.url em vez
// de reading_block_id. O widget de video/audio em si (renderVideo/
// renderDictation, ja existentes desde as Fases 6/9) ja se auto-contem
// por exercicio -- cada tarefa pode ter uma janela start/end diferente do
// mesmo video, entao nao ha um "video-wrap" persistente fora de #main
// como o texto da Leitura; so os dots de progresso.

async function renderVideoHub() {
  currentView = "video-hub";
  progressEl.textContent = "";
  setCrumb("Início", renderHome);
  clearBlockContext();
  main.innerHTML = `<p class="loading">Carregando vídeos…</p>`;

  const res = await fetch("/api/video-groups");
  const data = await res.json();
  const groups = data.groups ?? [];

  const taskSummary = (labels) => {
    const counts = new Map();
    for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1);
    return [...counts.entries()].map(([label, n]) => (n > 1 ? `${n}× ${label}` : label)).join(", ");
  };

  main.innerHTML = `
    <p class="screen-title">Vídeo</p>
    <p class="screen-sub">Cada card é um clipe real da DW — abrir mostra o vídeo e as tarefas ligadas a ele, em sequência.</p>
    <div class="block-grid">
      ${
        groups.length
          ? groups
              .map(
                (g) => `
        <button class="block-card" data-url="${escapeHtml(g.url)}">
          <span class="block-info">
            <span class="block-title">${g.total} tarefa${g.total === 1 ? "" : "s"}: ${escapeHtml(taskSummary(g.task_labels))}</span>
            <span class="block-teaser">${g.done} de ${g.total} concluídas</span>
          </span>
          <span class="block-status ${g.status}">${BLOCK_STATUS_LABEL[g.status]}</span>
        </button>`
              )
              .join("")
          : `<p class="empty">Nenhum vídeo disponível ainda.</p>`
      }
    </div>
  `;

  main.querySelectorAll(".block-card").forEach((card) => {
    card.addEventListener("click", () => renderVideoBlock(card.dataset.url));
  });
}

async function renderVideoBlock(url) {
  currentView = "video-block";
  setCrumb("Vídeo", renderVideoHub);
  clearBlockContext();
  main.innerHTML = `<p class="loading">Carregando vídeo…</p>`;

  const res = await fetch(`/api/video-groups?url=${encodeURIComponent(url)}`);
  if (!res.ok) {
    main.innerHTML = `<p class="error">Não foi possível carregar esse vídeo.</p>`;
    return;
  }
  const group = await res.json();

  blockContextEl.innerHTML = `<div class="block-progress-row" id="block-progress-row"></div>`;

  session = group.items.map((item) => item.exercise);
  index = 0;
  sessionEmptyState = { backLabel: "Vídeo", onBack: renderVideoHub };
  sessionProgressHook = renderBlockProgressDots;

  if (session.length === 0) {
    blockContextEl.innerHTML = "";
    showEmptyState("Esse vídeo ainda não tem tarefas disponíveis.");
    return;
  }
  renderBlockProgressDots();
  renderCurrent();
}

async function loadSession() {
  currentView = "session";
  clearCrumb();
  clearBlockContext();
  sessionEmptyState = null; // fila FSRS sem escopo -- fim volta pra Home
  const res = await fetch("/api/session?limit=10");
  const data = await res.json();
  session = data.exercises ?? [];
  index = 0;
  if (session.length === 0) {
    showEmptyState("Nenhum exercício disponível agora. Volte mais tarde.");
    return;
  }
  renderCurrent();
}

// mensagem de fim/vazio com sempre um jeito de voltar -- por padrao pra
// Home, mas sessionEmptyState (setado por loadScopedSession e futuramente
// pelos blocos de leitura/video) troca o destino pra "voltar pra
// categoria/bloco" em vez de largar o usuario direto na home de novo.
function showEmptyState(message) {
  const backLabel = sessionEmptyState?.backLabel ?? "Início";
  const onBack = sessionEmptyState?.onBack ?? renderHome;
  main.innerHTML = `
    <p class="empty">${escapeHtml(message)}</p>
    <button class="link" id="back-empty" style="align-self:center">← ${escapeHtml(backLabel)}</button>
  `;
  progressEl.textContent = "";
  document.getElementById("back-empty").addEventListener("click", onBack);
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
  setCrumb("Início", renderHome);
  clearBlockContext();
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

  // Grupo D (contestação hostil) não usa session_plans -- entrada fixa,
  // separada dos cartões dinâmicos do Grupo B acima (CLAUDE.md: Grupo D é
  // grupo à parte do motor semanal).
  const hostileCard = document.createElement("div");
  hostileCard.className = "plan-card";
  hostileCard.innerHTML = `
    <span class="template-label">Contestação hostil</span>
    <p class="prompt-hint">Roleplay adversarial — jornalista, tribunal, concorrente, interrogatório técnico. Sem plano necessário.</p>
    <div class="recorder-actions">
      <button class="link" data-action="hostile" type="button">Ver cenários →</button>
    </div>
  `;
  hostileCard.querySelector('[data-action="hostile"]').addEventListener("click", renderHostileLadder);
  plannerEl.appendChild(hostileCard);

  const quickCard = document.createElement("div");
  quickCard.className = "plan-card";
  quickCard.innerHTML = `
    <span class="template-label">Speech rápido</span>
    <p class="prompt-hint">"Einerseits... andererseits..." -- um tópico, resposta curta e imediata, sem plano necessário.</p>
    <div class="recorder-actions">
      <button class="link" data-action="quick" type="button">Novo tópico →</button>
    </div>
  `;
  quickCard.querySelector('[data-action="quick"]').addEventListener("click", renderQuickOpinion);
  plannerEl.appendChild(quickCard);
}

// ---------- OpinionEssayEngine (docs/05 item 4) -- LLM com rubrica ----------
// Fora da sessao intercalada de proposito (nao e' multiplicado por topico,
// e' um unico texto por tema semanal) -- so acessivel via "Escrever agora"
// no planejador.

const STRUCTURE_LABELS = { tese: "Tese", argumentos: "Argumentos", contra_argumento: "Contra-argumento", conclusao: "Conclusão" };

async function renderEssay() {
  currentView = "essay";
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
    ${showedUpBadgeHtml("Você escreveu e enviou — isso já conta.")}
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
      ${modeToggleHtml("speech")}
      <button class="primary" id="start-speech-btn" type="button">Iniciar conversa</button>
      <button class="link" id="back-to-planner" type="button">← Planejador</button>
      <div id="speech-body"></div>
    </div>
  `;
  document.getElementById("back-to-planner").addEventListener("click", renderPlanner);

  document.getElementById("start-speech-btn").addEventListener("click", async () => {
    const startBtn = document.getElementById("start-speech-btn");
    const mode = getSelectedMode("speech");
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
    document.getElementById("speech-mode-toggle").style.display = "none";
    const start = mode === "voice" ? startVoiceChatSession : startChatSession;
    start(result.session_id, result.message, {
      container: document.getElementById("speech-body"),
      messageUrl: "/api/structured-speech/message",
      voiceMessageUrl: "/api/roleplay-voice/message",
      closeUrl: "/api/structured-speech/close",
      onExit: renderPlanner,
    });
  });
}

function chatBubbleHtml(role, text) {
  return `<div class="chat-bubble ${role}">${escapeHtml(text)}</div>`;
}

// Escolha texto/voz -- SEMPRE explicita antes de comecar, nunca forcada
// (docs/05 item 95: "escolha explícita no início"; CLAUDE.md, Grupo D:
// "voz é upgrade opcional por sessão"). idPrefix evita colisao de name/id
// quando mais de um seletor existe na mesma tela (ex. varios cartoes da
// escada).
function modeToggleHtml(idPrefix) {
  return `
    <div class="mode-toggle" id="${idPrefix}-mode-toggle">
      <label><input type="radio" name="${idPrefix}-mode" value="text" checked /> Texto</label>
      <label><input type="radio" name="${idPrefix}-mode" value="voice" /> Falar</label>
    </div>
  `;
}

function getSelectedMode(idPrefix) {
  const checked = document.querySelector(`input[name="${idPrefix}-mode"]:checked`);
  return checked ? checked.value : "text";
}

// Mecanismo de chat generico, compartilhado por StructuredSpeechEngine
// (persona "moderador") e HostileRoleplayEngine (Grupo D, docs/05 itens
// 95-98). `opts.onExit` fica sempre visivel dentro da propria conversa
// (nao so' acima da tela) e SAI SEM avaliar -- distinto de "Encerrar e
// avaliar" (docs/09 achado #13: saida de baixo atrito precisa estar
// sempre presente, nunca com framing de desistencia, especialmente
// relevante pras personas hostis de maior carga emocional).
function startChatSession(sessionId, openingMessage, opts) {
  const bodyEl = opts.container;
  bodyEl.innerHTML = `
    <div class="chat-log" id="chat-log">${chatBubbleHtml("assistant", openingMessage)}</div>
    <label>Sua resposta (em alemão)
      <input type="text" class="text-input" id="chat-input" autocomplete="off" autofocus />
    </label>
    <div class="recorder-actions">
      <button class="primary" id="chat-send-btn" type="button">Enviar</button>
      <button class="link" id="chat-close-btn" type="button">Encerrar e avaliar</button>
      <button class="link" id="chat-exit-btn" type="button">← Sair da conversa</button>
    </div>
    <div id="chat-evaluation"></div>
  `;

  const logEl = document.getElementById("chat-log");
  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("chat-send-btn");
  const closeBtn = document.getElementById("chat-close-btn");
  const exitBtn = document.getElementById("chat-exit-btn");
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

    const res = await fetch(opts.messageUrl, {
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

  exitBtn.addEventListener("click", opts.onExit);

  closeBtn.addEventListener("click", async () => {
    input.disabled = true;
    sendBtn.disabled = true;
    closeBtn.disabled = true;
    closeBtn.textContent = "Avaliando…";
    const res = await fetch(opts.closeUrl, {
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
    showRoleplayEvaluation(result.evaluation, opts.onExit);
  });
}

function showRoleplayEvaluation(evaluation, onBack) {
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
    ${showedUpBadgeHtml("Você participou da conversa até o fim — isso já conta.")}
    <div class="structure-badge ${evaluation.clareza_estrutural ? "ok" : "missing"}">
      ${evaluation.clareza_estrutural ? "✓" : "○"} Estrutura de debate completa (tese → justificativa → contraponto → conclusão)
    </div>
    <p class="prompt-hint">${escapeHtml(evaluation.argumentacao ?? "")}</p>
    <p class="prompt-hint">${escapeHtml(evaluation.fluencia_e_naturalidade ?? "")}</p>
    ${strengthsHtml ? `<div class="feedback correct"><strong>Pontos fortes</strong><ul>${strengthsHtml}</ul></div>` : ""}
    ${errorsHtml ? `<div class="feedback incorrect"><strong>A revisar</strong><ul class="essay-errors">${errorsHtml}</ul></div>` : ""}
    <span class="cefr-estimate">Nível estimado: ${escapeHtml(evaluation.cefr_estimate ?? "—")}</span>
    <button class="link" id="back-after-speech" type="button">← Voltar</button>
  `;
  document.getElementById("back-after-speech").addEventListener("click", onBack);
}

// Modo voz do roleplay (Fase 11, docs/08: grava -> STT local -> LLM ->
// Piper -> toca). Reaproveita setupRecorder/blobToBase64 (ja usados por
// ReadAloud/SpokenGapFill/Shadowing) -- diferente do modo texto (input
// persistente), aqui cada turno RE-RENDERIZA o gravador (grava -> envia ->
// aparece o proximo gravador), porque cada turno e' grava-e-envia, nao
// digita-e-envia. "← Sair da conversa" continua sempre visivel, igual ao
// modo texto (docs/09 achado #13).
function startVoiceChatSession(sessionId, openingMessage, opts) {
  const bodyEl = opts.container;
  bodyEl.innerHTML = `
    <div class="chat-log" id="chat-log">${chatBubbleHtml("assistant", openingMessage)}</div>
    <audio id="reply-audio" style="display:none"></audio>
    <div class="recorder" id="voice-turn"></div>
    <div class="recorder-actions">
      <button class="link" id="chat-close-btn" type="button">Encerrar e avaliar</button>
      <button class="link" id="chat-exit-btn" type="button">← Sair da conversa</button>
    </div>
    <div id="chat-evaluation"></div>
  `;

  const logEl = document.getElementById("chat-log");
  const replyAudio = document.getElementById("reply-audio");
  const closeBtn = document.getElementById("chat-close-btn");
  const exitBtn = document.getElementById("chat-exit-btn");

  function scrollToBottom() {
    logEl.scrollTop = logEl.scrollHeight;
  }

  function playAudioBase64(base64) {
    if (!base64) return;
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    replyAudio.src = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
    replyAudio.play().catch(() => {});
  }

  // fala a mensagem de abertura tambem -- sem isso so' o texto apareceria,
  // e o usuario escolheu modo voz justamente pra ouvir, nao ler.
  fetch("/api/roleplay-voice/synthesize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: openingMessage }),
  })
    .then((res) => (res.ok ? res.blob() : null))
    .then((blob) => {
      if (!blob) return;
      replyAudio.src = URL.createObjectURL(blob);
      replyAudio.play().catch(() => {});
    })
    .catch(() => {});

  function renderTurnRecorder() {
    const turnEl = document.getElementById("voice-turn");
    turnEl.innerHTML = `
      <button class="primary" id="record-btn" type="button">● Gravar resposta</button>
      <audio id="preview" controls style="display:none"></audio>
      <div class="recorder-actions" id="recorder-actions" style="display:none">
        <button class="link" id="rerecord-btn" type="button">Regravar</button>
        <button class="primary" id="submit-btn" type="button">Enviar</button>
      </div>
    `;
    let recordedBlob = null;
    setupRecorder((blob) => {
      recordedBlob = blob;
    });

    document.getElementById("submit-btn").addEventListener("click", async () => {
      const submitBtn = document.getElementById("submit-btn");
      submitBtn.disabled = true;
      submitBtn.textContent = "Enviando…";
      const audioBase64 = await blobToBase64(recordedBlob);
      turnEl.innerHTML = `<p class="loading">Transcrevendo e respondendo…</p>`;

      const res = await fetch(opts.voiceMessageUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, audio_base64: audioBase64 }),
      });
      const result = await res.json();
      if (result.error) {
        turnEl.innerHTML = `<p class="error">${escapeHtml(result.error)}</p>`;
        renderTurnRecorder();
        return;
      }
      logEl.insertAdjacentHTML("beforeend", chatBubbleHtml("user", result.user_text));
      logEl.insertAdjacentHTML("beforeend", chatBubbleHtml("assistant", result.message));
      scrollToBottom();
      playAudioBase64(result.audio_base64);
      renderTurnRecorder();
    });
  }
  renderTurnRecorder();

  exitBtn.addEventListener("click", opts.onExit);

  closeBtn.addEventListener("click", async () => {
    closeBtn.disabled = true;
    exitBtn.disabled = true;
    closeBtn.textContent = "Avaliando…";
    document.getElementById("voice-turn").innerHTML = "";
    const res = await fetch(opts.closeUrl, {
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
    showRoleplayEvaluation(result.evaluation, opts.onExit);
  });
}

// ---------- HostileRoleplayEngine (docs/05 itens 95-98, Grupo D) --------
// Escada de exposicao: ordem sugerida por intensidade crescente, nunca
// bloqueada -- usuario pode escolher qualquer cenario a qualquer momento
// (docs/09 achado #8). Nao depende de session_plans/planejador -- Grupo D
// e' separado do motor semanal de Grupo B (CLAUDE.md).

async function renderHostileLadder() {
  currentView = "hostile-ladder";
  setCrumb("Início", renderHome);
  clearBlockContext();
  progressEl.textContent = "";
  main.innerHTML = `<p class="loading">Carregando…</p>`;

  const res = await fetch("/api/hostile-roleplay/scenarios");
  const data = await res.json();

  main.innerHTML = `
    <div class="card">
      <span class="template-label">Contestação hostil</span>
      <p class="prompt-hint">Escolha um cenário — ordem sugerida por intensidade, nunca travada. Sempre em texto; voz é upgrade opcional (em breve).</p>
      <div class="ladder" id="ladder"></div>
      <button class="link" id="back-to-planner" type="button">← Planejador</button>
    </div>
  `;
  document.getElementById("back-to-planner").addEventListener("click", renderPlanner);

  const ladderEl = document.getElementById("ladder");
  (data.scenarios ?? []).forEach((scenario) => {
    const item = document.createElement("div");
    item.className = "ladder-item";
    const indicatorHtml =
      scenario.intensity != null
        ? `<span class="intensity-dots" aria-label="intensidade ${scenario.intensity} de 4">${Array.from(
            { length: 4 },
            (_, i) => `<span class="intensity-dot ${i < scenario.intensity ? "filled" : ""}"></span>`
          ).join("")}</span>`
        : `<span class="not-hostile-badge">não hostil</span>`;
    const modePrefix = `ladder-${scenario.key}`;
    item.innerHTML = `
      <div class="ladder-item-header">
        <span class="ladder-item-label">${escapeHtml(scenario.label)}</span>
        ${indicatorHtml}
      </div>
      <p class="prompt-hint">${escapeHtml(scenario.description)}</p>
      ${scenario.times_completed > 0 ? `<span class="ladder-completed">Praticado ${scenario.times_completed}×</span>` : ""}
      ${modeToggleHtml(modePrefix)}
      <button class="primary" type="button">Iniciar</button>
    `;
    const startBtn = item.querySelector("button");
    startBtn.addEventListener("click", async () => {
      const mode = getSelectedMode(modePrefix);
      startBtn.disabled = true;
      startBtn.textContent = "Iniciando…";
      const res = await fetch("/api/hostile-roleplay/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona: scenario.key }),
      });
      const result = await res.json();
      if (result.error) {
        item.insertAdjacentHTML("beforeend", `<p class="error">${escapeHtml(result.error)}</p>`);
        startBtn.disabled = false;
        startBtn.textContent = "Iniciar";
        return;
      }
      renderHostileChat(scenario, result.session_id, result.message, mode);
    });
    ladderEl.appendChild(item);
  });
}

function renderHostileChat(scenario, sessionId, openingMessage, mode) {
  currentView = "hostile-chat";
  const title = scenario.group === "hostile" ? `Contestação hostil — ${escapeHtml(scenario.label)}` : escapeHtml(scenario.label);
  main.innerHTML = `
    <div class="card">
      <span class="template-label">${title}</span>
      <div id="hostile-chat-body"></div>
    </div>
  `;
  const start = mode === "voice" ? startVoiceChatSession : startChatSession;
  start(sessionId, openingMessage, {
    container: document.getElementById("hostile-chat-body"),
    messageUrl: "/api/hostile-roleplay/message",
    voiceMessageUrl: "/api/roleplay-voice/message",
    closeUrl: "/api/hostile-roleplay/close",
    onExit: renderHostileLadder,
  });
}

// ---------- QuickOpinionSpeechEngine (docs/05 item 103) -- flash prompt,
// resposta unica (nao e' chat), rubrica leve. Sem plano necessario, mesmo
// espirito on-demand do Grupo D.

async function renderQuickOpinion() {
  currentView = "quick-opinion";
  progressEl.textContent = "";
  main.innerHTML = `<p class="loading">Gerando tópico…</p>`;

  const res = await fetch("/api/quick-opinion");
  const data = await res.json();
  if (data.error) {
    main.innerHTML = `
      <div class="card">
        <p class="error">${escapeHtml(data.error)}</p>
        <button class="link" id="back-to-planner" type="button">← Planejador</button>
      </div>
    `;
    document.getElementById("back-to-planner").addEventListener("click", renderPlanner);
    return;
  }

  main.innerHTML = `
    <div class="card">
      <span class="template-label">Speech rápido — Einerseits... andererseits...</span>
      <p class="prompt">${escapeHtml(data.topic)}</p>
      <label>Sua resposta (em alemão, curta e espontânea)
        <textarea class="text-input" id="quick-input" rows="4" autofocus></textarea>
      </label>
      <div class="recorder-actions">
        <button class="primary" id="quick-submit-btn" type="button">Enviar</button>
        <button class="link" id="back-to-planner" type="button">← Planejador</button>
      </div>
      <div id="quick-result"></div>
    </div>
  `;
  document.getElementById("back-to-planner").addEventListener("click", renderPlanner);

  document.getElementById("quick-submit-btn").addEventListener("click", async () => {
    const input = document.getElementById("quick-input");
    const text = input.value.trim();
    if (!text) return;
    const btn = document.getElementById("quick-submit-btn");
    btn.disabled = true;
    btn.textContent = "Avaliando…";
    input.disabled = true;

    const res = await fetch("/api/quick-opinion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: data.topic, text }),
    });
    const result = await res.json();
    btn.style.display = "none";
    if (result.error) {
      document.getElementById("quick-result").innerHTML = `<p class="error">${escapeHtml(result.error)}</p>`;
      input.disabled = false;
      btn.style.display = "";
      btn.disabled = false;
      btn.textContent = "Enviar";
      return;
    }
    showQuickOpinionResult(result.correction);
  });
}

function showQuickOpinionResult(rubric) {
  const el = document.getElementById("quick-result");
  const errorsHtml = (rubric.errors ?? [])
    .map(
      (e) => `
      <li>
        <span class="essay-error-trecho">"${escapeHtml(e.trecho)}"</span>
        <span class="essay-error-problema">${escapeHtml(e.problema)}</span>
        <span class="essay-error-sugestao">→ ${escapeHtml(e.sugestao)}</span>
      </li>`
    )
    .join("");
  const strengthsHtml = (rubric.strengths ?? []).map((s) => `<li>${escapeHtml(s)}</li>`).join("");

  el.innerHTML = `
    ${showedUpBadgeHtml("Você respondeu — isso já conta.")}
    <div class="structure-badge ${rubric.used_contrast_structure ? "ok" : "missing"}">
      ${rubric.used_contrast_structure ? "✓" : "○"} Contrastou dois lados (einerseits/andererseits)
    </div>
    ${strengthsHtml ? `<div class="feedback correct"><strong>Pontos fortes</strong><ul>${strengthsHtml}</ul></div>` : ""}
    ${errorsHtml ? `<div class="feedback incorrect"><strong>A revisar</strong><ul class="essay-errors">${errorsHtml}</ul></div>` : ""}
    <span class="cefr-estimate">Nível estimado: ${escapeHtml(rubric.cefr_estimate ?? "—")}</span>
    <div class="recorder-actions">
      <button class="link" id="quick-again-btn" type="button">Outro tópico →</button>
      <button class="link" id="back-after-quick" type="button">← Planejador</button>
    </div>
  `;
  document.getElementById("quick-again-btn").addEventListener("click", renderQuickOpinion);
  document.getElementById("back-after-quick").addEventListener("click", renderPlanner);
}

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
  // Fatia A (redesenho de Video) -- "citar" (VideoTaskEngine, reconhecimento
  // por parafrase) reaproveita este mesmo componente, so' com um video em
  // cima do prompt. ex.video_url so vem preenchido nesse caso -- os outros
  // chamadores (WordBankGuessEngine/PredictThenVerifyEngine) nunca tem
  // video_url, entao ficam sem mudanca nenhuma.
  const videoHtml = ex.video_url
    ? `<div class="video-wrap"><iframe src="${youtubeEmbedUrl(ex)}" title="vídeo"
          frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe></div>`
    : "";
  main.innerHTML = `
    <div class="card">
      <span class="template-label">${templateLabel(ex.template)}</span>
      ${videoHtml}
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
  // Fase 12 -- achado: a variante autentica (source_type='authentic_video',
  // Fase 6) tem audio_ref NULL de proposito (a fonte e' o video, tocado via
  // iframe do YouTube, mesmo mecanismo do VideoTaskEngine) -- nunca tinha
  // sido ligada aqui, ficava sem tocar nada. Escolhe o player pela presenca
  // de audio_url vs. video_url, mesmo dado que a sessao ja entrega pra
  // TODOS os templates (session.ts).
  const playerHtml = ex.audio_url
    ? `<audio id="player" src="${ex.audio_url}" controls preload="auto"></audio>`
    : `<div class="video-wrap"><iframe id="player" src="${youtubeEmbedUrl(ex)}" title="vídeo" frameborder="0" allow="autoplay" allowfullscreen></iframe></div>`;
  main.innerHTML = `
    <div class="card">
      <span class="template-label">${templateLabel(ex.template)}</span>
      ${playerHtml}
      <input type="text" class="text-input" id="answer" autocomplete="off"
             placeholder="Digite o que você ouviu" autofocus />
      <button class="primary" id="submit">Verificar</button>
      <div id="feedback"></div>
    </div>
  `;
  const input = document.getElementById("answer");
  const submit = document.getElementById("submit");
  if (ex.audio_url) {
    document.getElementById("player").play().catch(() => {}); // autoplay pode falhar, sem problema
  }
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
  // Fatia A (redesenho de Video) -- VideoTaskEngine hoje cobre 2 subtipos
  // sob o mesmo template: "legendar" (producao de texto, ex.prompt chega
  // null da sessao -- audio-primeiro, transcricao so como gabarito pos-
  // tentativa) e "citar" (reconhecimento por parafrase, ex.prompt chega
  // preenchido com {trecho_gapped, opcoes} -- a parafrase E' o proprio
  // exercicio, tem que aparecer antes). Delega pro mesmo componente de
  // chips ja usado por WordBankGuessEngine/PredictThenVerifyEngine, sem
  // duplicar logica de UI.
  if (ex.prompt) {
    renderChipChoice(ex);
    return;
  }
  // legendar -- audio-primeiro (AUDIO_FIRST_TEMPLATES): transcricao nunca
  // aparece como texto pra ler antes da tentativa, so como gabarito pos-
  // tentativa -- mesma regra do DictationEngine, so que a fonte e' o video
  // em si.
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

// Generico o bastante pra qualquer diff de token (op/target/recognized) --
// usado tanto pelo diff fonetico (fonemas) quanto pelo diff de texto da
// Fatia C (palavras, DictationEngine/VideoTaskEngine). Nome/classes CSS
// ("phone.*") sao historicos do uso fonetico original, mas a semantica
// (ok/diff/miss/extra) e' generica -- nao vale o churn de renomear o CSS.
function wordDiffHtml(alignment) {
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
      <div class="phone-diff">${wordDiffHtml(pron.alignment)}</div>
    </div>
    ${result.target_audio_url ? `<audio src="${result.target_audio_url}" controls></audio>` : ""}
    <button class="link" id="next">Continuar →</button>
  `;
  document.getElementById("next").addEventListener("click", advance);
}

// ---------- submissao e feedback ----------

async function submitAttempt(exerciseId, userResponse) {
  disableInputs();
  const feedbackEl = document.getElementById("feedback");
  if (feedbackEl) feedbackEl.innerHTML = `<p class="loading">Avaliando…</p>`;
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
  // Fatia C -- diff palavra-a-palavra, so quando a correcao anexou um
  // (resposta longa errada, ex. Dictation/VideoTask); aditivo ao texto
  // padrao "a resposta certa era X", nao substitui.
  const diffHtml =
    !result.correct && Array.isArray(result.diff) && result.diff.length
      ? `<div class="phone-diff">${wordDiffHtml(result.diff)}</div>`
      : "";
  feedbackEl.innerHTML = `
    <div class="feedback ${result.correct ? "correct" : "incorrect"}">
      ${result.correct ? "Certo!" : "Quase — a resposta certa era:"}
      ${result.correct ? "" : `<span class="answer">${escapeHtml(correctText)}</span>`}
    </div>
    ${diffHtml}
    ${result.explanation ? `<p class="explanation">${escapeHtml(result.explanation)}</p>` : ""}
    <button class="link" id="next">Continuar →</button>
  `;
  document.getElementById("next").addEventListener("click", advance);
}

function advance() {
  index += 1;
  if (sessionProgressHook) sessionProgressHook();
  if (index >= session.length) {
    showEmptyState(`Sessão concluída — ${session.length} exercícios. Volte quando quiser.`);
    return;
  }
  renderCurrent();
}

// Fase 12 (docs/09, achado de UX -- "ShowedUpBadge"): nos engines com
// rubrica LLM (OpinionEssay, roleplay, QuickOpinion), showed_up e' sempre
// true no schema, mas nunca tinha um reconhecimento VISUAL separado antes
// da critica -- separacao so' no JSON nao basta, se os dois aparecem na
// mesma area visual o efeito pratico de "misturar validacao de exposicao
// com feedback de idioma" (que o CLAUDE.md proibe) acontece por
// proximidade mesmo assim. Pill isolado, sempre o PRIMEIRO elemento,
// visualmente distinto do bloco de correcao (`.feedback`) que vem depois.
function showedUpBadgeHtml(text) {
  return `<div class="showed-up-badge">✓ ${escapeHtml(text)}</div>`;
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

boot();
