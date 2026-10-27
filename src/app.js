// Upload-first interface: EMPTY -> FILE_SELECTED -> PROCESSING -> READY <-> ANSWERING; CLEARING -> EMPTY.
import { getDocument, GlobalWorkerOptions } from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
import { extractPdf, pageLabel } from "./extract.js";
import { chunkPages } from "./chunk.js";
import { Retriever, EMBEDDING_MODEL, passageForEmbedding } from "./retrieve.js";
import { answerQuestion } from "./pipeline.js";
import { escapeHtml, lower } from "./text.js";

GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

const MAX_BYTES = 100 * 1024 * 1024;
const $ = id => document.getElementById(id);
const els = {
  body: document.body, modelTag: $("modelTag"), providerName: $("providerName"), dataNote: $("dataNote"),
  dropzone: $("dropzone"), fileInput: $("fileInput"), chooseBtn: $("chooseBtn"), cancelBtn: $("cancelBtn"), retryBtn: $("retryBtn"),
  procName: $("procName"), procBar: $("procBar"), procText: $("procText"), errorText: $("errorText"),
  workspace: $("workspace"), tabChat: $("tabChat"), tabReport: $("tabReport"),
  reportName: $("reportName"), reportMeta: $("reportMeta"), reportNotes: $("reportNotes"), downloadBtn: $("downloadBtn"), clearBtn: $("clearBtn"),
  askForm: $("askForm"), question: $("question"), askBtn: $("askBtn"), modeNote: $("modeNote"), answers: $("answers"),
  viewer: $("viewer"), viewerLabel: $("viewerLabel")
};

const state = { phase: "EMPTY", session: 0, file: null, url: null, report: null, config: null, cards: 0 };
let extractorPromise = null;

function setPhase(phase) {
  state.phase = phase;
  els.body.dataset.phase = phase;
  els.question.disabled = !["READY", "ANSWERING"].includes(phase);
  els.askBtn.disabled = phase !== "READY" || !state.config?.configured;
}

// ---------- config ----------
async function loadConfig() {
  try {
    const res = await fetch("/api/config", { cache: "no-store" });
    if (!res.ok) throw new Error();
    state.config = await res.json();
    els.providerName.textContent = `${state.config.provider} (${state.config.model})`;
    els.dataNote.textContent = state.config.data_note || "";
    els.modelTag.textContent = state.config.configured ? `Answers by ${state.config.provider} · ${state.config.model}` : "Answer service not configured";
    els.modelTag.classList.toggle("off", !state.config.configured);
    if (!state.config.full_context_allowed) document.querySelector('input[value="full"]').closest("label").remove();
  } catch {
    state.config = { configured: false };
    els.modelTag.textContent = "Answer service unavailable";
    els.modelTag.classList.add("off");
    els.dataNote.textContent = "The answer service could not be reached, so questions are disabled.";
  }
  setPhase(state.phase);
}

// ---------- embeddings (browser) ----------
async function getExtractor(onProgress) {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { pipeline, env } = await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1");
      env.allowLocalModels = false;
      return pipeline("feature-extraction", EMBEDDING_MODEL, {
        dtype: "q8",
        progress_callback: info => { if (info.status === "progress" && Number.isFinite(info.progress)) onProgress?.(info.progress); }
      });
    })();
    extractorPromise.catch(() => { extractorPromise = null; });
  }
  return extractorPromise;
}

async function embedTexts(texts, onBatch) {
  const extractor = await getExtractor();
  const out = [];
  for (let i = 0; i < texts.length; i += 16) {
    const t = await extractor(texts.slice(i, i + 16), { pooling: "mean", normalize: true });
    out.push(...t.tolist());
    await onBatch?.(Math.min(texts.length, i + 16), texts.length);
  }
  return out;
}

// ---------- processing ----------
function progress(frac, text) {
  els.procBar.style.width = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`;
  els.procText.textContent = text;
}

// setTimeout, not requestAnimationFrame: indexing must keep going when the tab is in the background.
const yieldToUi = () => new Promise(r => setTimeout(r, 0));

async function sha256Hex(buf) {
  const d = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function handleFile(file) {
  if (!file) return;
  if (state.phase !== "EMPTY" && state.phase !== "PROCESSING_ERROR") clearReport();
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!isPdf) return fail("Only PDF files are supported.");
  if (file.size > MAX_BYTES) return fail(`The file is ${(file.size / 1048576).toFixed(0)} MB; the limit is 100 MB.`);

  const session = ++state.session;
  const live = () => session === state.session;
  state.file = file;
  els.procName.textContent = file.name;
  setPhase("FILE_SELECTED");
  progress(0, "Opening the PDF…");
  try {
    const buf = await file.arrayBuffer();
    const sha256 = await sha256Hex(buf);
    if (!live()) return;
    const pdf = await getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
    setPhase("PROCESSING");
    let extracted;
    try {
      extracted = await extractPdf(pdf, {
        shouldStop: () => !live(),
        onPage: async (i, n) => { progress(0.55 * i / n, `Reading page ${i} of ${n}`); if (i % 8 === 0) await yieldToUi(); }
      });
    } finally {
      pdf.destroy();
    }
    if (!live()) return;
    const textPages = extracted.pages.filter(p => p.hasText);
    if (!textPages.length) throw new Error("No page has a text layer. The PDF may be scanned images only.");
    const chunks = chunkPages(extracted.pages);

    let embeddings = null;
    let method = "keyword and meaning search";
    try {
      progress(0.56, "Loading the search model…");
      await getExtractor(p => progress(0.56 + 0.04 * p / 100, `Loading the search model · ${Math.round(p)}%`));
      embeddings = await embedTexts(chunks.map(passageForEmbedding), async (done, n) => {
        if (!live()) throw new Error("cancelled");
        progress(0.6 + 0.4 * done / n, `Indexing passages ${done.toLocaleString()} of ${n.toLocaleString()}`);
        await yieldToUi();
      });
    } catch (err) {
      if (err.message === "cancelled") throw err;
      embeddings = null;
      method = "keyword search only (the meaning-search model could not load)";
    }
    if (!live()) return;

    state.url = URL.createObjectURL(file);
    state.report = {
      filename: file.name, size: file.size, sha256, pageCount: extracted.pageCount, labelsAvailable: extracted.labelsAvailable,
      pages: extracted.pages, chunks, embeddings, method,
      textLower: lower(extracted.pages.map(p => p.text).join("\n")),
      retriever: new Retriever(chunks, { embeddings }),
      tokensEstimate: Math.round(chunks.reduce((s, c) => s + c.text.length, 0) / 4)
    };
    showReady();
  } catch (err) {
    if (!live() || err.message === "cancelled") return;
    fail(err.message || "The PDF could not be read.");
  }
}

function fail(message) {
  state.session += 1;
  state.file = null;
  els.errorText.textContent = message;
  setPhase("PROCESSING_ERROR");
}

function showReady() {
  const r = state.report;
  els.reportName.textContent = r.filename;
  els.reportMeta.textContent = `${r.pageCount} pages · ${(r.size / 1048576).toFixed(1)} MB · ${r.chunks.length.toLocaleString()} passages`;
  const skipped = r.pages.filter(p => !p.hasText).map(p => p.index);
  const notes = [
    r.labelsAvailable ? "Citations show the printed page number and the PDF page." : "This PDF has no printed page labels, so citations use PDF page numbers.",
    skipped.length ? `Skipped ${skipped.length} page${skipped.length > 1 ? "s" : ""} without a text layer: ${compactList(skipped)}.` : "Every page has a text layer.",
    `Search: ${r.method}.`,
    `SHA-256 of the original: ${r.sha256.slice(0, 16)}…`
  ];
  els.reportNotes.innerHTML = notes.map(n => `<li>${escapeHtml(n)}</li>`).join("");
  els.downloadBtn.href = state.url;
  els.downloadBtn.download = r.filename;
  openPage(1);
  setTab("chat");
  setPhase("READY");
  els.question.focus();
}

function compactList(nums) {
  const parts = [];
  for (let i = 0; i < nums.length; i += 1) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j += 1;
    parts.push(i === j ? `${nums[i]}` : `${nums[i]}–${nums[j]}`);
    i = j;
  }
  return parts.join(", ");
}

// ---------- clearing ----------
function clearReport() {
  state.session += 1;
  if (state.url) URL.revokeObjectURL(state.url);
  state.url = null;
  state.file = null;
  state.report = null;
  els.viewer.src = "about:blank";
  els.answers.innerHTML = "";
  els.reportNotes.innerHTML = "";
  els.question.value = "";
  els.fileInput.value = "";
  els.downloadBtn.removeAttribute("href");
  document.querySelector('input[value="retrieval"]').checked = true;
  updateModeNote();
  progress(0, "");
  setPhase("EMPTY");
}

// ---------- viewer ----------
function openPage(index) {
  if (!state.url) return;
  const page = state.report?.pages[index - 1];
  els.viewerLabel.textContent = page ? `Original report · ${pageLabel(page)}` : "Original report";
  els.viewer.src = "about:blank";
  setTimeout(() => { if (state.url) els.viewer.src = `${state.url}#page=${index}`; }, 30);
}

function setTab(tab) {
  els.workspace.dataset.tab = tab;
  els.tabChat.setAttribute("aria-selected", String(tab === "chat"));
  els.tabReport.setAttribute("aria-selected", String(tab === "report"));
}

// ---------- asking ----------
function currentMode() {
  return document.querySelector('input[name="mode"]:checked')?.value || "retrieval";
}

function updateModeNote() {
  const full = currentMode() === "full";
  els.modeNote.classList.toggle("show", full);
  if (full && state.report) {
    els.modeNote.textContent = `Full report text sends all extracted text (about ${state.report.tokensEstimate.toLocaleString()} tokens) to ${state.config?.provider || "the provider"} for each question. The PDF file itself is not sent.`;
  }
}

async function callProxy(payload) {
  const res = await fetch("/api/answer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  if (!res.ok) throw new Error(body?.error || `The answer service returned HTTP ${res.status}.`);
  return body;
}

async function embedQuery(q) {
  if (!state.report?.embeddings) return null;
  try { return (await embedTexts([q]))[0]; } catch { return null; }
}

async function ask(question) {
  const session = state.session;
  const report = state.report;
  const id = `a${++state.cards}`;
  els.answers.insertAdjacentHTML("afterbegin", `<article class="card" id="${id}"><div class="q">${escapeHtml(question)}</div><span class="chip pending">Checking the report…</span></article>`);
  setPhase("ANSWERING");
  let result;
  try {
    result = await answerQuestion({ question, report, mode: currentMode(), embedQuery, callProxy });
  } catch (err) {
    result = { question, mode: currentMode(), stage: "client", status: "error", answer: "", claims: [], warnings: [], reasons: [err.message || "Something went wrong."], ms: 0 };
  }
  if (session !== state.session) return; // report was cleared or replaced while waiting
  const card = $(id);
  if (card) card.outerHTML = renderCard(id, result);
  setPhase("READY");
}

const STATUS_LABEL = {
  supported: "Supported by the report",
  partial: "Partly supported",
  insufficient_evidence: "Not enough evidence in the report",
  error: "Could not answer"
};

function citeButton(ch) {
  const page = state.report.pages[ch.pdf_index - 1];
  const label = pageLabel(page || { index: ch.pdf_index, label: ch.page_label });
  const heading = ch.heading && ch.heading.length > 40 ? `${ch.heading.slice(0, 39).trimEnd()}…` : ch.heading;
  return `<button type="button" class="cite" data-page="${ch.pdf_index}">${escapeHtml(label)}${heading ? ` · ${escapeHtml(heading)}` : ""}</button>`;
}

function renderCard(id, r) {
  const claims = (r.claims || []).filter(c => c.valid || r.status !== "insufficient_evidence");
  const claimHtml = claims.map(c => {
    const seen = new Set();
    const cites = c.chunks.filter(ch => !seen.has(ch.pdf_index) && seen.add(ch.pdf_index)).map(citeButton).join("");
    const failed = [!c.checks.ids && "citation ID", !c.checks.quote && "quote", !c.checks.numbers && `figures ${c.missingNumbers.join(", ")}`].filter(Boolean);
    return `<li class="claim${c.valid ? "" : " bad"}">
      <div class="kind">${escapeHtml(c.kind)}${c.valid ? "" : " · not verified, excluded"}</div>
      <div>${escapeHtml(c.text)}</div>
      ${c.quote ? `<blockquote>“${escapeHtml(c.quote)}”</blockquote>` : ""}
      <div class="cites">${cites}</div>
      <div class="checks">${c.valid ? "Quote and figures found in the cited passage." : `Failed check: ${escapeHtml(failed.join(", "))}.`}</div>
    </li>`;
  }).join("");
  const showAnswer = r.answer && !r.unverified;
  const meta = [
    r.mode === "full" ? "full report text" : r.retrieval ? `${r.retrieval.k} retrieved passages (${r.retrieval.method})` : null,
    r.stage === "precheck" ? "stopped before any model call" : null,
    r.meta ? `${r.meta.model} · prompt ${r.meta.prompt_version}` : null,
    r.meta?.usage ? `${(r.meta.usage.prompt_tokens || 0).toLocaleString()} tokens in` : null,
    `${(r.ms / 1000).toFixed(1)} s`
  ].filter(Boolean).join(" · ");
  return `<article class="card" id="${id}">
    <div class="q">${escapeHtml(r.question)}</div>
    <span class="chip ${r.status}">${STATUS_LABEL[r.status] || r.status}</span>
    ${showAnswer ? `<p class="a">${escapeHtml(r.answer)}</p>` : ""}
    ${(r.reasons || []).map(x => `<p class="reason">${escapeHtml(x)}</p>`).join("")}
    ${r.unverified && r.answer ? `<details class="unverified"><summary>Show the unverified model text</summary><p>${escapeHtml(r.answer)}</p></details>` : ""}
    ${claimHtml ? `<ul class="claims">${claimHtml}</ul>` : ""}
    ${r.warnings?.length ? `<ul class="warn-list">${r.warnings.map(w => `<li>${escapeHtml(w)}</li>`).join("")}</ul>` : ""}
    ${r.missing ? `<p class="reason">Not covered: ${escapeHtml(r.missing)}</p>` : ""}
    <div class="meta">${escapeHtml(meta)}</div>
  </article>`;
}

// ---------- events ----------
els.chooseBtn.addEventListener("click", () => els.fileInput.click());
els.retryBtn.addEventListener("click", () => { setPhase("EMPTY"); els.fileInput.click(); });
els.fileInput.addEventListener("change", () => handleFile(els.fileInput.files[0]));
els.cancelBtn.addEventListener("click", clearReport);
els.clearBtn.addEventListener("click", clearReport);
["dragenter", "dragover"].forEach(t => els.dropzone.addEventListener(t, e => { e.preventDefault(); els.dropzone.classList.add("over"); }));
["dragleave", "drop"].forEach(t => els.dropzone.addEventListener(t, e => { e.preventDefault(); els.dropzone.classList.remove("over"); }));
els.dropzone.addEventListener("drop", e => {
  if (["EMPTY", "PROCESSING_ERROR"].includes(state.phase)) handleFile(e.dataTransfer.files[0]);
});
window.addEventListener("dragover", e => e.preventDefault());
window.addEventListener("drop", e => e.preventDefault());
els.tabChat.addEventListener("click", () => setTab("chat"));
els.tabReport.addEventListener("click", () => setTab("report"));
document.querySelectorAll('input[name="mode"]').forEach(r => r.addEventListener("change", updateModeNote));
els.askForm.addEventListener("submit", e => {
  e.preventDefault();
  const q = els.question.value.trim();
  if (!q || state.phase !== "READY" || !state.config?.configured) return;
  els.question.value = "";
  ask(q);
});
els.question.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); els.askForm.requestSubmit(); }
});
els.answers.addEventListener("click", e => {
  const btn = e.target.closest(".cite");
  if (!btn) return;
  openPage(Number(btn.dataset.page));
  if (window.matchMedia("(max-width: 900px)").matches) setTab("report");
});
window.addEventListener("beforeunload", () => { if (state.url) URL.revokeObjectURL(state.url); });

setPhase("EMPTY");
loadConfig();
