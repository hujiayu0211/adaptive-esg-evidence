// One question, end to end: deterministic checks, retrieval (or full text), model call via the proxy, validation.
import { precheck, retrievalTooWeak } from "./checks.js";
import { validateAnswer } from "./validate.js";

export const DEFAULT_K = 10;

export function toPassage(chunk) {
  return { id: chunk.id, page: chunk.page_label || String(chunk.pdf_index), text: chunk.text };
}

// report: { filename, pageCount, textLower, pages, chunks, retriever }
// embedQuery(question) -> normalised vector or null; callProxy(payload) -> { result, meta }
export async function answerQuestion({ question, report, mode = "retrieval", embedQuery = null, callProxy, k = DEFAULT_K }) {
  const started = Date.now();
  const base = { question, mode };

  const pre = precheck(question, report.textLower);
  if (pre.block) {
    return { ...base, stage: "precheck", status: "insufficient_evidence", answer: "", claims: [], warnings: [], reasons: pre.reasons.map(r => r.text), ms: Date.now() - started };
  }

  let passages;
  let retrieval = null;
  if (mode === "full") {
    passages = report.chunks;
  } else {
    const qVec = embedQuery ? await embedQuery(question) : null;
    const res = report.retriever.search(question, qVec, k);
    retrieval = {
      method: res.method,
      k,
      signals: res.signals,
      hits: res.hits.map(h => ({ id: h.chunk.id, pdf_index: h.chunk.pdf_index, bm25: round(h.bm25), cosine: h.cosine == null ? null : round(h.cosine), coverage: round(h.coverage) }))
    };
    if (retrievalTooWeak(res.signals)) {
      return { ...base, stage: "retrieval", status: "insufficient_evidence", answer: "", claims: [], warnings: [], retrieval,
        reasons: ["No passage in the report is close enough to the question to answer it."], ms: Date.now() - started };
    }
    passages = res.hits.map(h => h.chunk);
  }

  const payload = {
    question,
    mode,
    report: { filename: report.filename, pages: report.pageCount },
    passages: passages.map(toPassage)
  };
  let response;
  try {
    response = await callProxy(payload);
  } catch (err) {
    return { ...base, stage: "model", status: "error", answer: "", claims: [], warnings: [], retrieval, reasons: [err.message || "The answer service failed."], ms: Date.now() - started };
  }
  const validated = validateAnswer({
    question,
    llm: response.result,
    passages,
    pageText: report.pages ? i => report.pages[i - 1]?.text || "" : null,
    reportTextLower: report.textLower
  });
  return { ...base, stage: "answered", ...validated, retrieval, meta: response.meta, ms: Date.now() - started };
}

function round(x) {
  return Math.round(x * 1000) / 1000;
}
