# Evaluation

## Test set T1 (frozen)

- **Reports.** Three public Australian reports of different kinds:
  - Amcor Sustainability Report 2025 (142 pages; the printed page numbers start after two cover pages).
  - Woodside Annual Report 2025 (304 pages; pages A and B come before page 1).
  - Challenger Annual Report 2025 (172 pages; a financial company with small operational emissions tables).
- **Cases.** There are 45. 32 should be answered:
  - numeric questions, mostly from tables, including FY23 against FY25 columns;
  - market-based against location-based Scope 2;
  - target against actual;
  - text questions.

  13 should be refused:
  - 5 unanswerable questions, where the information is not in the report;
  - 3 questions on periods the report does not cover;
  - 3 questions about a company that does not appear in the report;
  - 2 questions about a company that is mentioned but whose emissions are not reported.
- **Freezing.** The set was written by the developer (Claude), not independently, before any answering, retrieval or validation code existed. It was frozen with SHA-256 `0a35ccf7…` at 2026-10-26 22:06 UTC; see [eval/FROZEN.md](../eval/FROZEN.md). Gold pages come from evidence regexes run over the PDFs (`eval/build_test_set.py`).
- **Scoring.** The rules are in the set's `scoring` field:
  - An answer case passes **strictly** when the status is `supported`, the gold figures appear in the answer, and at least one verified citation is on a gold page.
  - It passes **leniently** when the status is `supported` or `partial` and the figures are right.
  - An abstain case passes only with `insufficient_evidence`.
  - **Unsafe supported** means a `supported` status on a wrong answer or on a case that should have been refused.

## Development set D1

10 cases on the Santos Annual Report 2025. All tuning used D1 only. Changes made after D1 runs:

| Problem seen on D1 | Change |
|---|---|
| D02: the passage with "0.26 MtCO2e Scope 2 (location-based)" ranked 3rd by BM25 but 60th by MiniLM, and was fused out of the top 10. | Compound tokens (`location_based`, `scope_2`), and the top four BM25 hits and top three cosine hits are always kept. |
| D05: "31" in "31 December 2025" was treated as an unverified figure. | Days next to month names are not figures. |
| Provider overload (503/504) counted as system errors. | The runner retries 429/502/503/504 with backoff. Product behaviour is unchanged apart from friendlier messages. |

The D1 score after these changes was 9/10 strict with 0 unsafe. The remaining case is a correct answer cited on a page outside D1's deliberately narrow gold list.

Before the first model run on T1, a retrieval-only dry run on T1 checked that the pipeline worked: 31/32 answer cases had a gold page in the top 10. No setting was changed after that check.

## Model used for these runs

The intended default provider is OpenAI (`gpt-6-luna`). On 2026-10-27 the OpenAI, DeepSeek and DashScope accounts available to the author had no credit or no model access, and `gemini-3.8-flash` was overloaded (503s, and over 100 s per call). D1 tuning used **`gemini-3.5-flash`**. Its free daily quota (20 requests) ran out partway through the first T1 attempt, so all T1 and T2 results below use **`gemini-3.5-flash-lite`** through Google's OpenAI-compatible endpoint, with `reasoning_effort=low`. To rerun with OpenAI, change only `.dev.vars`.

## Results

All runs used `gemini-3.5-flash-lite`, `reasoning_effort=low`, k = 10, a single run per configuration. Raw outputs are in `eval/runs/` (one folder per run, with `results.jsonl`, `summary.json` and, where errata apply, `summary_errata.json`).

### Main result: v0.1.0 on the frozen T1 (retrieval mode)

This is the only independent T1 measurement. The questions were frozen before any code existed and nothing was tuned on them.

| Metric | Frozen gold | With errata |
|---|---|---|
| Strict pass, all 45 | 37 (82%) | 39 (87%) |
| Answer cases, strict (32) | 25 | 27 |
| Answer cases, lenient (32) | 31 | 31 |
| Abstain cases (13) | 12 | 12 |
| **Unsafe supported** | **1** (C15) | **1** |
| Retrieval recall@10 (gold page retrieved) | 31/32 | 31/32 |
| Median time per question | 1.7 s | |
| Prompt tokens, 41 model calls | 135,386 | |

Errors:

| Case | What happened |
|---|---|
| C15 (unsafe) | Asked about MS&AD's Scope 1, a partner the report mentions. The model answered with Challenger's own Scope 1, and the validator accepted it because the figure was real. |
| A03, A05, C02, C04 (`partial`, correct value) | Over-strict qualifier checks. "location- based" was split by a line break; table rows did not repeat "Scope 3" or "market-based"; "FY24/25" was not read as 2025. |
| A06, W06 (correct, off the gold page) | Gold page lists were incomplete; recorded in `eval/errata.json`. |
| C09 (missed) | "What distance did staff fly?" did not reach the row "Flights ('000) km". The vocabulary gap affects retrieval and also the full-report baseline. |

### v0.1.1 measured on the frozen T2

T2 was frozen after the T1 run and before any v0.1.1 change.

| Metric | v0.1.0, frozen | v0.1.0, errata | v0.1.1, frozen | v0.1.1, errata |
|---|---|---|---|---|
| Strict pass, all 12 | 9 | 10 | 8 | 11 |
| Answer cases, lenient (9) | 8 | 9 | 8 | 9 |
| Abstain cases (3) | 3 | 3 | 3 | 3 |
| Unsafe supported | 0 | 0 | 1 | 0 |

**Reading.** T2 does not show a clear improvement. Most differences between the two runs are model run-to-run variation: the same question got different wording and different quotes.

The frozen "unsafe" for v0.1.1 is E05. The answer "TRIF 4.98" was cited to p.41, which does say 4.98; the gold accepted only 4.984 from p.5. With the errata (E05 accepts 4.98; E07 and E12 add pages that state the same figure) both versions are within one case of each other, with no unsafe answers.

The new entity check was not triggered on T2. The model abstained on E09 (AGL) by itself.

### v0.1.1 on T1 (regression only, not independent)

| Metric | Frozen gold | With errata |
|---|---|---|
| Strict pass, all 45 | 42 (93%) | 43 (96%) |
| Answer cases, strict / lenient (32) | 29 / 30 | 30 / 30 |
| Abstain cases (13) | 13 | 13 |
| Unsafe supported | 0 | 0 |

C15 was correct in this run, but because the model abstained on its own, not because of the new check. The entity check is covered by a unit test, not yet by an evaluation case that triggers it.

The remaining misses are:

- **A03.** The answer was right, but the quote failed verbatim matching because of the "location- based" line-break split. Known issue.
- **C09.** The vocabulary gap described above.

### Full-report baseline (v0.1.1)

Woodside's full text is about 330k tokens, more than the free tier's tokens-per-minute limit, so every Woodside request was refused. The baseline therefore covers the 30 Amcor and Challenger cases, compared with retrieval on the same 30 cases from the v0.1.1 T1 run.

| Metric | Full report | Retrieval (k = 10) |
|---|---|---|
| Strict pass (30), frozen / errata | 26 / 27 | 27 / 28 |
| Answer cases, lenient (21) | 19 | 19 |
| Abstain cases (9) | 9 | 9 |
| Unsafe supported | 0 | 0 |
| Prompt tokens | 3,816,992 | 91,774 |
| Median time per model call | 73.8 s | 1.7 s |

**Reading.** On these 30 cases, sending the whole report did not answer anything that retrieval missed. Both missed A03 and C09, and the only difference is C08, which full-report mode answered as `partial`. It used about 42 times the tokens and was about 40 times slower. Retrieval stays the default; full-report mode stays an explicit option.

## Limits of this evaluation

- **Authorship.** The developer wrote all test sets. They are not independent annotations.
- **Size.** 57 frozen cases over 4 reports is small. One model and a single run per configuration were used, and run-to-run variation alone moved T2 by a case or two.
- **Model.** The model is a small free-tier one, not the intended default, `gpt-6-luna`.
- **Missing baseline.** There is no full-report baseline for Woodside.
- **Untested check.** The entity check has no evaluation case that actually triggers it.

## Known issues (next version, to be measured on a new frozen set)

1. **Split words in quotes.** Quote matching should ignore line-break hyphen splits ("location- based") in both the quote and the passage.
2. **Vocabulary gaps.** The gap between question and table wording (fly ↔ flights, distance ↔ km) needs query expansion or table-aware retrieval.
3. **Run variation.** Repeated runs per case (`--repeat`) would separate code changes from model variation.
4. **Default provider.** T1 and T2 should be rerun on the default provider (`gpt-6-luna`) once credit is available.

## Run log

| Run folder | Purpose |
|---|---|
| `…T2217_D1_retrieval_gpt-6-luna_dev` | First D1 attempt. Every call failed with HTTP 429: the OpenAI account had no credit. |
| `…T2232_D1_retrieval_gemini-3.8-flash_dev` | D1 on gemini-3.8-flash: 9 of 10 calls failed with 503/504 overload. |
| `…T2244_D1_…3.5-flash_dev` | D1 before the D1-driven fixes. |
| `…T2247_D1_…3.5-flash_dev` | D1 after the D1-driven fixes (9/10). |
| `…T2354_D1_…flash-lite_sanity` | Two D1 cases to check flash-lite. |
| `…T2354_T1_retrieval_…_v0.1.0` | **Main T1 result.** |
| `…T0001_T2_…_v0.1.0` and `…T0002_T2_…_v0.1.1` | T2, before and after. |
| `…T0003_T1_retrieval_…_v0.1.1` | T1 regression. |
| `…T0009_T1_full_…_v0.1.1-AMC-CGF` | Full-report baseline. |

Three attempts were stopped and are not reported as results:

- T1 on gemini-3.5-flash, after its free daily quota of 20 requests ran out at case 24;
- full-report mode on v0.1.0, which hit tokens-per-minute limits while a retrieval run shared the quota;
- full-report mode on all reports, where Woodside was refused.
