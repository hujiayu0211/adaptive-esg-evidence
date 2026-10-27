import test from "node:test";
import assert from "node:assert/strict";
import { cleanExtracted } from "../src/text.js";
import { extractNumbers, significantNumbers, valueMatches } from "../src/numbers.js";
import { namesInQuestion, periodsInQuestion, precheck } from "../src/checks.js";
import { validateAnswer } from "../src/validate.js";
import { chunkPages } from "../src/chunk.js";
import { Retriever } from "../src/retrieve.js";
import { pageFromItems } from "../src/extract.js";

test("cleanExtracted rejoins digit groups split by the PDF layer", () => {
  assert.equal(cleanExtracted("Scope 2 1, 169,000 and 1,417 ,000"), "Scope 2 1,169,000 and 1,417,000");
});

test("numbers: labels and years are not figures", () => {
  const n = significantNumbers("Scope 1 emissions were 430,000 tCO2e in FY25 and 2025, Category 12 was 692.7");
  assert.deepEqual(n.map(x => x.value), [430000, 692.7]);
  assert.equal(extractNumbers("30% by 2033").find(x => x.value === 30).isPercent, true);
});

test("numbers: rounding to the claim's precision", () => {
  const ev = significantNumbers("10,253.8 and 6,616 kt");
  assert.ok(valueMatches({ value: 10254, decimals: 0 }, ev));
  assert.ok(valueMatches({ value: 6616, decimals: 0 }, ev));
  assert.ok(!valueMatches({ value: 6.6, decimals: 1 }, ev));
});

test("checks: names and periods in questions", () => {
  assert.deepEqual(namesInQuestion("What were Beach Energy's Scope 1 emissions in 2025?"), ["Beach Energy", "Scope"]);
  assert.deepEqual(namesInQuestion("What were MS&AD's Scope 1 emissions?"), ["MS&AD", "Scope"]);
  assert.deepEqual(periodsInQuestion("in FY24/25 and FY2015 and 2023-24"), [2015, 2023, 2024, 2025]);
});

test("precheck blocks absent names and periods only", () => {
  const report = "amcor reported scope 1 emissions of 430,000 in fy25 against an fy22 baseline (2022).";
  assert.equal(precheck("What were Amcor's Scope 1 emissions in FY25?", report).block, false);
  assert.equal(precheck("What were Visy's Scope 1 emissions in FY25?", report).block, true);
  assert.equal(precheck("What were Amcor's Scope 1 emissions in FY2015?", report).block, true);
});

const passages = [
  { id: "p102-0", pdf_index: 102, page_label: "100", heading: "Data", text: "GHG emissions FY22 FY23 FY24 FY25\nScope 1\nMetric tons CO2e 505,000 464,000 430,000 430,000\nScope 2 – market based\nMetric tons CO2e 1,417,000 1,334,000 1,156,000 913,000" }
];

test("validate: verified claim is supported", () => {
  const llm = { status: "answered", answer: "Amcor's FY25 Scope 1 emissions were 430,000 metric tons CO2e.", claims: [{ text: "Scope 1 emissions were 430,000 metric tons CO2e in FY25.", kind: "actual", passage_ids: ["p102-0"], quote: "Metric tons CO2e 505,000 464,000 430,000 430,000" }] };
  const r = validateAnswer({ question: "What were Amcor's Scope 1 emissions in FY25?", llm, passages });
  assert.equal(r.status, "supported");
});

test("validate: invented figure, unknown id or misquote is not supported", () => {
  const q = "What were Amcor's Scope 1 emissions in FY25?";
  const bad = (claim, answer = "x") => validateAnswer({ question: q, llm: { status: "answered", answer, claims: [claim] }, passages }).status;
  assert.equal(bad({ text: "Scope 1 was 431,000 in FY25.", passage_ids: ["p102-0"], quote: "Metric tons CO2e 505,000" }), "insufficient_evidence");
  assert.equal(bad({ text: "Scope 1 was 430,000 in FY25.", passage_ids: ["p7-0"], quote: "Metric tons CO2e 505,000" }), "insufficient_evidence");
  assert.equal(bad({ text: "Scope 1 was 430,000 in FY25.", passage_ids: ["p102-0"], quote: "Scope 1 emissions totalled 430,000" }), "insufficient_evidence");
});

test("validate: qualifier mismatch downgrades to partial", () => {
  const llm = { status: "answered", answer: "913,000 metric tons.", claims: [{ text: "Scope 2 emissions were 913,000 metric tons CO2e in FY25.", kind: "actual", passage_ids: ["p102-0"], quote: "Scope 2 – market based" }] };
  assert.equal(validateAnswer({ question: "What were Amcor's location-based Scope 2 emissions in FY25?", llm, passages }).status, "partial");
});

test("chunks stay within a page and retrieval finds the table", () => {
  const pages = [
    { index: 1, label: "A", text: "Cover page with a long introduction about the company and its values.", heading: null, hasText: true },
    { index: 2, label: "1", text: passages[0].text, heading: "Data", hasText: true }
  ];
  const chunks = chunkPages(pages);
  assert.ok(chunks.every(c => c.id.startsWith(`p${c.pdf_index}-`)));
  const res = new Retriever(chunks).search("Scope 1 emissions metric tons", null, 1);
  assert.equal(res.hits[0].chunk.pdf_index, 2);
});

test("extract: heading is the largest-font line", () => {
  const items = [
    { str: "Climate change", height: 24, hasEOL: true },
    { str: "Body text that runs for a while", height: 9, hasEOL: true },
    { str: "More body text", height: 9, hasEOL: true },
    { str: "Footer", height: 7, hasEOL: false }
  ];
  assert.equal(pageFromItems(items).heading, "Climate change");
});

test("numbers: days in dates are not figures", () => {
  assert.deepEqual(significantNumbers("As at 31 December 2025, stored 1.57 million tonnes; on June 30 it was 2.1").map(x => x.value), [1.57, 2.1]);
});

test("retrieval keeps compounds like location-based and scope 2", async () => {
  const { tokens } = await import("../src/retrieve.js");
  const t = tokens("0.26 MtCO2e Scope 2 (location-based)");
  assert.ok(t.includes("location_based") && t.includes("scope_2"));
});

test("v2: FY ranges count as the year, split hyphens count as the basis", async () => {
  const { yearVariants, containsPhrase } = await import("../src/checks.js");
  assert.ok(yearVariants(2025).some(v => containsPhrase("emissions fy24/25 fy23/24", v)));
  const llm = { status: "answered", answer: "1,169,000 metric tons.", claims: [{ text: "Scope 2 location-based emissions were 1,169,000 metric tons.", kind: "actual", passage_ids: ["q1"], quote: "Scope 2 location- based emissions were 1,169,000" }] };
  const ps = [{ id: "q1", pdf_index: 44, page_label: "42", heading: null, text: "Scope 2 location- based emissions were 1,169,000 metric tons of CO2e in FY25." }];
  assert.equal(validateAnswer({ question: "What were the location-based Scope 2 emissions in FY25?", llm, passages: ps }).status, "supported");
});

test("v2: qualifiers can come from the cited page's table header", () => {
  const llm = { status: "answered", answer: "692,700.", claims: [{ text: "Category 12 emissions were 692,700 in FY25.", kind: "actual", passage_ids: ["r1"], quote: "Category 12: End-of-life treatment of sold products 778,000 773,400 706,900 692,700" }] };
  const ps = [{ id: "r1", pdf_index: 102, page_label: "100", heading: null, text: "Category 12: End-of-life treatment of sold products 778,000 773,400 706,900 692,700" }];
  const page = "GHG emissions FY22 FY23 FY24 FY25 Scope 3 Metric tons ... Category 12: End-of-life treatment of sold products 778,000 773,400 706,900 692,700";
  const q = "What were the FY25 Scope 3 emissions from Category 12?";
  assert.equal(validateAnswer({ question: q, llm, passages: ps }).status, "partial");
  assert.equal(validateAnswer({ question: q, llm, passages: ps, pageText: () => page }).status, "supported");
});

test("v2: an answer about the report company does not answer a question about a named partner", () => {
  const report = `${"challenger ".repeat(200)} ms&ad is a strategic partner. total scope 1 2.7`;
  const llm = { status: "answered", answer: "Challenger's total Scope 1 emissions were 2.7 tCO2-e.", claims: [{ text: "Total Scope 1 emissions were 2.7 tCO2-e.", kind: "actual", passage_ids: ["s1"], quote: "Total Scope 1 2.7" }] };
  const ps = [{ id: "s1", pdf_index: 58, page_label: "56", heading: null, text: "Total Scope 1 2.7 2.9" }];
  assert.equal(validateAnswer({ question: "What were MS&AD's Scope 1 emissions in FY25?", llm, passages: ps, reportTextLower: report }).status, "insufficient_evidence");
  assert.equal(validateAnswer({ question: "What were Challenger's Scope 1 emissions?", llm, passages: ps, reportTextLower: report }).status, "supported");
});
