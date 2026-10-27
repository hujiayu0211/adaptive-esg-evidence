// Grades one pipeline result against one test case. Rules are stated in the test set's "scoring" field.
import { extractNumbers, decimalsOf } from "../src/numbers.js";

function hasValue(nums, v) {
  const tol = 0.5 * 10 ** -decimalsOf(v) + 1e-9;
  return nums.some(n => Math.abs(n.value - v) <= tol);
}

export function grade(c, r) {
  const valid = (r.claims || []).filter(x => x.valid);
  const text = [r.answer || "", ...valid.map(x => x.text)].join(" ");
  const nums = extractNumbers(text);
  const citedPages = [...new Set(valid.flatMap(x => x.chunks.map(ch => ch.pdf_index)))];
  const retrievedPages = r.retrieval ? [...new Set(r.retrieval.hits.map(h => h.pdf_index))] : null;

  if (c.expect === "abstain") {
    const pass = r.status === "insufficient_evidence";
    return {
      pass, lenient: pass, unsafe: r.status === "supported",
      outcome: pass ? "abstained" : r.status === "supported" ? "unsafe_supported" : r.status === "partial" ? "partial_on_abstain" : r.status,
      citedPages, retrievedPages
    };
  }

  const allOk = (c.all_of || []).every(v => hasValue(nums, v));
  const anyOk = !c.any_of || c.any_of.some(v => hasValue(nums, v));
  const patOk = (c.patterns || []).every(p => new RegExp(p, "i").test(text));
  const valuesOk = allOk && anyOk && patOk;
  const gold = new Set(c.gold_pdf_pages || []);
  const citedGold = citedPages.some(p => gold.has(p));
  const retrievedGold = retrievedPages ? retrievedPages.some(p => gold.has(p)) : null;
  const pass = r.status === "supported" && valuesOk && citedGold;
  const lenient = ["supported", "partial"].includes(r.status) && valuesOk;
  const unsafe = r.status === "supported" && !valuesOk;
  const wrongFigure = (c.forbidden || []).some(v => hasValue(nums, v)) && !valuesOk;
  let outcome = "pass";
  if (!pass) {
    if (unsafe) outcome = wrongFigure ? "unsafe_wrong_figure" : "unsafe_supported";
    else if (r.status === "insufficient_evidence") outcome = r.stage === "precheck" ? "missed_precheck" : r.stage === "retrieval" ? "missed_retrieval" : "missed";
    else if (r.status === "partial") outcome = valuesOk ? "partial_correct" : "partial_wrong";
    else if (r.status === "supported" && !citedGold) outcome = "correct_off_gold_page";
    else outcome = r.status;
  }
  return { pass, lenient, unsafe, outcome, valuesOk, citedGold, retrievedGold, citedPages, retrievedPages };
}
