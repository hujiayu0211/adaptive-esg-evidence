# Report Evidence Assistant

Ask questions about **one** corporate or sustainability report and get answers you can check. Every statement cites passages from the uploaded PDF, quotes and figures are verified against those passages before an answer is shown as supported, and each citation opens the original page.

Status: v0.1.2, Phase 1 MVP. Evidence matching only. It is not legal, investment or compliance advice.

## What it does

- **Upload-first.** The page starts empty. Nothing about any report exists until you upload a PDF.
- **Local processing.** The PDF stays in your browser. Text extraction (PDF.js), chunking and search (BM25 plus MiniLM embeddings) all run locally.
- **Grounded answers.** For each question, only the retrieved passages go through a small server proxy to an LLM. The model must cite passage IDs and quote them verbatim.
- **Validation.** The browser checks every claim:
  - cited IDs must be among the passages that were sent;
  - the quote must appear in the passage;
  - every figure must match the passage;
  - the question's Scope, market- or location-based basis and year must appear in the evidence.
- **Deterministic abstention.** A question about a company or period that appears nowhere in the report is stopped before any model call.
- **Original report.** It is viewable and downloadable unchanged. Citations show the printed page and the PDF page, for example "p. 41 (PDF 43)".

Evidence statuses: **Supported**, **Partly supported**, **Not enough evidence in the report**, **Could not answer**. See [docs/DESIGN.md](docs/DESIGN.md) for the exact rules.

## Privacy

- The PDF file is never uploaded.
- Each question sends the question and its retrieved passages, about 10 short passages, to the provider named on the page. The optional "Full report text" mode sends all extracted text, never the file, and the page shows a token estimate first.
- The proxy keeps the API key server-side and does not log passage text.
- Nothing is stored after you clear the report or close the tab. Local saving is planned for Phase 2.

## Run locally

Requirements: Node 20 or later.

1. Install the dev dependencies. They are needed only for the evaluation scripts.
2. Create your local settings file.
3. Edit `.dev.vars` and set `LLM_API_KEY`. Optional variables are listed in `.dev.vars.example`.
4. Start the server and open <http://127.0.0.1:8788>.

```bash
npm install
cp .dev.vars.example .dev.vars
node scripts/dev-server.mjs
```

The front end has no build step. It is plain ES modules plus CDN imports (PDF.js 4.10.38, Transformers.js 3.8.1), so any static host works for the page. The answer endpoint needs the functions in `functions/`.

## Deploy (Cloudflare Pages)

1. Create a new Pages project from this repository. Set no build command and use `/` as the output directory.
2. Add the environment variables:
   - `SKIP_DEPENDENCY_INSTALL=1`, because the dev dependencies are only for evaluation;
   - `LLM_API_KEY`, with type **Secret**;
   - `LLM_PROVIDER_NAME`, `LLM_MODEL` and `LLM_BASE_URL`. Any OpenAI-compatible endpoint works; `.dev.vars.example` has OpenAI and Gemini settings.
   - Optionally `LLM_DATA_NOTE` and `ALLOW_FULL_CONTEXT`.
3. Add a rate-limiting rule for `/api/answer` in the Cloudflare dashboard.
4. Optionally attach a subdomain, such as `qa.example.com`.

This must be its own Pages project. Copying it into a subfolder of another Pages site would serve the page but not `functions/api/*`.

### Keeping the API key safe

- **Where the key lives.** It exists only as a Cloudflare secret and in your local `.dev.vars`, which is gitignored. The GitHub web uploader ignores `.gitignore`, so never upload a working folder that contains `.dev.vars`.
- **Who can call the proxy.** `/api/answer` rejects requests whose `Origin` is missing or is not this site. Other web pages cannot use it, and a script has to forge the header on purpose.
- **How fast.** The rate-limiting rule from step 3 caps how fast anyone can use the key. `ALLOW_FULL_CONTEXT=false` blocks whole-report requests, which are the most expensive.

## Evaluation

All evaluation material is in `eval/`:

- **`test-set-T1.json`** is the frozen test set: 45 questions over three public Australian reports (Amcor Sustainability Report 2025, Woodside Annual Report 2025 and Challenger Annual Report 2025), with 32 answerable and 13 that should be refused. It was frozen before any answering code existed; see [eval/FROZEN.md](eval/FROZEN.md).
- **`dev-set.json`** is the development set (Santos Annual Report 2025), used for tuning.
- **`run_eval.mjs`** runs a set through the same pipeline and the real `/api/answer` handler.

To run it:

1. Download the three PDFs from the URLs in the test set into a folder. The hashes are checked.
2. Run the command below.

```bash
node eval/run_eval.mjs --reports <pdf folder> --env .dev.vars --mode retrieval
```

Add `--mode full` for the full-report baseline.

Results so far use `gemini-3.5-flash-lite`, because the default provider had no credit on the test day, with one run per configuration. Error analysis and the exact gold errata are in [docs/EVALUATION.md](docs/EVALUATION.md).

| Run | Strict pass (frozen gold) | Unsafe "supported" |
|---|---|---|
| v0.1.0 on T1, retrieval: the independent measurement | 37/45 | 1 |
| v0.1.1 on T2, retrieval: the independent measurement of the fixes | 8/12 (11/12 with errata) | 1 (0 with errata) |
| v0.1.1 on T1, retrieval: regression only | 42/45 | 0 |
| Full-report baseline, Amcor and Challenger only (30 cases) | 26/30, against 27/30 for retrieval on the same cases | 0 |

The full-report mode used 42 times the tokens of retrieval and was about 40 times slower, without answering anything retrieval missed.

## Project layout

```text
index.html, styles.css      interface
src/                        browser + Node modules: extract, chunk, retrieve, checks, validate, pipeline, app
functions/api/              Cloudflare Pages Functions: answer (proxy), config
functions/_lib/             prompt and OpenAI-compatible client
scripts/dev-server.mjs      local server for the page and functions
eval/                       test sets, builders, runner, grader, run summaries
test/                       unit tests (node --test)
docs/                       design and evaluation notes
```

## Versions

Every answer and every evaluation run records these versions:

| Component | Version |
|---|---|
| Parser | `x1` |
| Chunking | `c1-1100-180` |
| Retrieval | `r2-bm25-compounds-minilm-rrf-keep4x3` |
| Embedding | `Xenova/all-MiniLM-L6-v2` (q8) |
| Prompt | `p1` |
| Validator | `v2` |

## License

The code is released under the MIT License; see [LICENSE](LICENSE). The reports and the excerpts quoted in `eval/` belong to their publishers.
