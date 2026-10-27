# Design

This records the decisions behind v0.1. They come from three review rounds held on 2026-10-27 between the author, Codex and Claude.

## Product boundary

A private assistant for **one customer-uploaded corporate report**. It gives answers with verifiable page citations and keeps the original PDF unchanged beside them.

It is **not**:

- a general "chat with any PDF" tool;
- a cross-company database;
- an ESG scoring or ranking system;
- a compliance checker;
- a model-training project.

A missing answer means the evidence was not found. It does not mean the company did not disclose.

The difference from generic PDF chat:

- every statement is checked against the cited passage before it can be shown as supported;
- figures, units, years, company names and Scope qualifiers are checked deterministically;
- targets, actual results, policies and intentions are kept apart;
- the system abstains instead of guessing.

## Architecture

```text
Browser (the PDF never leaves it)
  File -> SHA-256, object URL (viewer + download)
       -> PDF.js page text + printed page labels + heading per page
       -> chunks (never cross pages) -> BM25 + MiniLM index (in browser)
  Question -> deterministic prechecks (absent company / absent period)
           -> top-k passages (or all passages in full-report mode)
           -> POST /api/answer {question, passage IDs + text}
                Cloudflare Pages Function: fixed system prompt, key in env, no passage logging
                -> OpenAI-compatible chat completions (JSON output)
           <- {status, answer, claims[{text, kind, passage_ids, quote}]}
  Validator (in browser) -> final status -> answer card with page citations
```

Keeping the PDF in the browser removes server-side storage, signed URLs, expiry jobs and cross-customer file isolation. "Return the exact original" holds by construction.

## States

`EMPTY -> FILE_SELECTED -> PROCESSING -> READY <-> ANSWERING`. Any state goes to `CLEARING -> EMPTY`. A processing failure goes to `PROCESSING_ERROR`.

- **First load** contains no report, no sample, no suggested questions and no results.
- **The question box** is disabled until processing succeeds.
- **Clearing** revokes the object URL and drops the file, text, chunks, embeddings and answers.
- **Session counter.** Every upload and clear increments a counter. An answer that returns for an older session is discarded, so a reply for report A never lands on report B.

## Citations and pages

- **Two page numbers.** Each chunk stores `pdf_index` (for navigation) and `page_label` (the printed number, from PDF.js `getPageLabels()`). Citations show both, for example "p. 41 (PDF 43)", and the viewer jumps by `pdf_index`.
- **Chunk IDs only.** The model cites passage IDs (`p43-0`), never page numbers. Pages are resolved by the system.

## Validation rules (validator v2)

A claim is **valid** only when all of these hold:

1. Every cited ID was among the passages sent.
2. The quote appears verbatim in a cited passage after NFKC normalisation, with quotes and dashes unified and whitespace collapsed. `...` may separate ordered fragments.
3. Every significant number in the claim matches a number in the cited passages at the claim's precision.

These are excluded from the number check:

- labels such as "Scope 1" and "Category 12";
- years;
- days in dates.

Final status:

| Status | When |
|---|---|
| `supported` | All claims are valid and no warning applies. |
| `partial` | At least one claim is valid but something is off: an invalid claim was excluded; a figure in the answer is not in the verified evidence; the question's Scope, market- or location-based qualifier or year (including FY ranges such as FY24/25) is not on the cited pages; or the question asks for results but every verified claim is a target. |
| `insufficient_evidence` | The model abstained; no claim is valid; a precheck or retrieval gate stopped the question; or the question names an entity the report mentions only in passing (30 or fewer times) and neither the cited pages nor the answer mention it. The last rule is the v2 entity check, which catches an answer about the report's own company given to a question about a partner. |
| `error` | Provider or network failure. |

Deterministic prechecks run before any model call:

- **Company names.** A Title-case name (or a token containing "&") in the question that appears nowhere in the report stops the question.
- **Periods.** A year or FY period in the question that appears nowhere in the report stops the question.
- **Retrieval gate.** It abstains when no passage covers at least 20% of the question terms and the best cosine is below 0.25. In practice it rarely fires.

The model may not calculate, convert or round figures. A computed figure fails the number check.

## Full-report baseline

The full-report mode sends every extracted passage (not the PDF) to the provider. It is a user-visible option with an explicit token estimate, and an evaluation baseline. Retrieval is the default because it sends less text and costs less. The evaluation compares the two on the same frozen set.

## Privacy boundary

- **The PDF.** It is never uploaded.
- **Passages.** Only the passages for each question are sent to the named provider. The interface states the provider and the model, plus an optional note on data terms (`LLM_DATA_NOTE`).
- **The proxy.** It rejects requests whose `Origin` is missing or foreign, caps request size and passage count, and never logs request or provider bodies. Rate limiting is left to a Cloudflare rate-limiting rule.
- **Prompt injection.** Report text is wrapped as data, and the system prompt tells the model to ignore instructions inside passages.

## Data groups (for later phases)

Three groups are kept separate:

1. **Private history** stays on the device.
2. **The improvement set** contains only cases a user explicitly chose to share and a reviewer checked.
3. **Frozen test sets** are used to measure versions and never to tune them.

When a test set has been used for several releases, a new one is frozen and the old one is kept for regression.

## Roadmap

- **Phase 2:**
  - IndexedDB persistence, opt-in. It calls `navigator.storage.persist()` and tells the user that local saving is not a backup, because browsers, Safari in particular, may evict it.
  - A saved-report list.
  - Feedback controls: correct, partial, wrong, citation wrong, figure wrong.
  - "Export this case as JSON" instead of a sharing backend.
  - Delete-all.
- **Phase 3:**
  - Table structure extraction.
  - A calibrated abstention threshold on a separate development set.
  - A reviewer workflow, if real users share cases.
- **Out of scope:** model training, automatic learning from feedback, server-side PDF storage, accounts.
