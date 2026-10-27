# Frozen test set T1

| Item | Value |
|---|---|
| File | `eval/test-set-T1.json` |
| Frozen at (UTC) | 2026-10-26T22:06:00Z |
| Cases | 45 (32 answer, 13 abstain) across 3 reports |
| SHA-256 of `cases` (sort_keys, separators `(",", ":")`) | `0a35ccf7bd10e102f4fc4d66244b2caa2ea069fdd0e6aa9edf7486f2131322f2` |
| SHA-256 of the file | `c4daf1d6cb26d384fac3b1b275d2f7684bf079fab4782b4f6b5e53838b3b9b89` |

Written by Claude (developer-authored, not independent) before any answering, retrieval or validation code existed. Questions, expected outcomes and values were read from the PDFs by hand; gold pages come from `build_test_set.py`.

Rules:

- Expected outcomes are never edited after a run. A suspected gold error is logged in `eval/errata.json` with evidence, and both the original and the corrected score are reported.
- T1 is used to measure versions, not to tune them. Tuning uses the separate development set `eval/dev-set.json`.
- When T1 has been used for several releases, freeze a new set and keep T1 as a regression set.

# Frozen test set T2

| Item | Value |
|---|---|
| File | `eval/test-set-T2.json` |
| Frozen at (UTC) | 2026-10-27T00:01:08Z |
| Cases | 12 (9 answer, 3 abstain), Evolution Mining Sustainability Report 2025 |
| SHA-256 of `cases` | `71299164d3975633e5d0bbfc184d199338653b22621742a96fff8b18ead13b14` |
| SHA-256 of the file | `8a896c627078368df08e650e895dd7ccf07e6a6881f3a0040c6ff53c5a26335b` |

Written by Claude after the v0.1.0 run on T1 and **before** any v0.1.1 change. It targets the error types T1 exposed, on a report no development step had used. v0.1.1 is measured on T2. Its T1 score is a regression check only, because the fixes were motivated by T1 errors.
