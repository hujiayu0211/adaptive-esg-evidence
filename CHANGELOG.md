# Changelog

## 0.1.2 — 2026-10-27

- **API key protection.** `/api/answer` now rejects requests without an `Origin` header. Before, any script could call it. Browsers always send `Origin` on POST, so the page is unaffected.
- **Data note.** The privacy box shows a provider data note only when `LLM_DATA_NOTE` is set. There is no built-in default.
- **Local keys.** The dev server accepts an absolute `DEV_VARS` path, so key files can live outside the project folder.
- **Deploy docs.** The docs now cover `SKIP_DEPENDENCY_INSTALL=1`, the key as a Cloudflare secret, a Gemini example in `.dev.vars.example`, and a warning about the GitHub web uploader.
- **License.** MIT.

Answering, retrieval and validation are unchanged, so the 0.1.1 evaluation results still apply.

## 0.1.1 — 2026-10-27

These fixes come from the v0.1.0 run on T1. Before any of them was written, a new test set T2 (12 cases, a fourth report) was frozen to measure them.

- **Entity check (validator v2).** A name in the question that the report mentions only in passing must appear in the cited pages or in the answer. If it does not, the answer is `insufficient_evidence`. This fixes T1 C15, where a question about MS&AD received Challenger's own Scope 1 figure as `supported`.
- **Qualifier check across the whole cited page.** Scope, market- or location-based basis and the year are now checked against all of the cited page, so a table row inherits its header. Before, correct table answers were downgraded to `partial`.
- **Split basis words.** "location- based", split across a line break, now counts as location-based.
- **Financial-year ranges.** "FY24/25", "2024/25" and "2024-25" now count as 2025.
- **Interface.** Clearer rate-limit and overload messages; provider-specific data notes; an extra guard so a client-side failure cannot leave the page stuck in ANSWERING; the PDF is released after extraction even on cancel.
- **Evaluation.** `eval/errata.json` and `eval/regrade.mjs` report scores both as frozen and with documented gold corrections. The runner gained `--retries` and `--backoff` options.

## 0.1.0 — 2026-10-27

First version: Phase 1 of the single-report evidence assistant.

### Interface and pipeline

- Upload-first interface with an explicit state machine. Nothing about any report exists until a PDF is uploaded, and Clear returns to a truly empty state.
- In-browser PDF.js extraction that keeps printed page labels, finds a heading per page and flags pages without a text layer.
- Page-bounded chunks; BM25 plus MiniLM hybrid retrieval in the browser.
- Cloudflare Pages Function proxy for an OpenAI-compatible model. The prompt is fixed on the server, the key lives in the environment, and passage text is never logged. Provider, model and data terms are shown on the page.
- Citation validator covering passage IDs, verbatim quotes, figures, Scope and market- or location-based qualifiers, years, and target-versus-result.
- Deterministic prechecks for companies and periods that appear nowhere in the report.
- Full-report mode, offered as an option and used as the evaluation baseline.

### Evaluation

- Frozen test set T1 (45 cases, three reports), frozen before any answering code existed.
- Development set D1 (Santos) for tuning.
- Runner and grader that call the real proxy handler.

### Tuning on D1 only

These changes were made after looking at D1 results, never T1:

- Retrieval: compound tokens (`location_based`, `scope_2`), and the top four BM25 hits and top three cosine hits are always kept.
- Numbers: days in dates are not treated as figures.
- Runner: retries on provider overload (429/502/503/504).
