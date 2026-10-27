// Re-grades saved runs with eval/errata.json applied. Usage: node eval/regrade.mjs <runDir> [...]
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { grade } from "./grade.js";

const errata = JSON.parse(readFileSync(new URL("./errata.json", import.meta.url), "utf8"));
const sets = {
  T1: JSON.parse(readFileSync(new URL("./test-set-T1.json", import.meta.url), "utf8")),
  T2: JSON.parse(readFileSync(new URL("./test-set-T2.json", import.meta.url), "utf8"))
};

function corrected(setName, c) {
  const e = errata[setName]?.[c.id];
  if (!e) return c;
  const out = { ...c };
  if (e.add_gold_pdf_pages) out.gold_pdf_pages = [...new Set([...(c.gold_pdf_pages || []), ...e.add_gold_pdf_pages])];
  if (e.add_any_of) {
    out.any_of = [...(c.all_of || []), ...e.add_any_of];
    delete out.all_of;
  }
  return out;
}

for (const dir of process.argv.slice(2)) {
  const info = JSON.parse(readFileSync(join(dir, "run_info.json"), "utf8"));
  const set = sets[info.set];
  const byId = new Map(set.cases.map(c => [c.id, corrected(info.set, c)]));
  const rows = readFileSync(join(dir, "results.jsonl"), "utf8").trim().split("\n").map(l => JSON.parse(l));
  const g = rows.map(r => ({ ...r, grade: grade(byId.get(r.id), r.result) }));
  const ans = g.filter(r => r.expect === "answer");
  const abs = g.filter(r => r.expect === "abstain");
  const summary = {
    errata_applied: Object.keys(errata[info.set] || {}),
    strict_pass: g.filter(r => r.grade.pass).length, n: g.length,
    answer_strict_pass: ans.filter(r => r.grade.pass).length, answer_lenient_pass: ans.filter(r => r.grade.lenient).length, answer_n: ans.length,
    abstain_pass: abs.filter(r => r.grade.pass).length, abstain_n: abs.length,
    unsafe_supported: g.filter(r => r.grade.unsafe).length,
    outcomes: g.reduce((o, r) => { o[r.grade.outcome] = (o[r.grade.outcome] || 0) + 1; return o; }, {})
  };
  writeFileSync(join(dir, "summary_errata.json"), JSON.stringify(summary, null, 2));
  console.log(dir.split("/").pop(), JSON.stringify(summary));
}
