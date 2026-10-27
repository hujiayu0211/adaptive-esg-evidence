// Side-by-side comparison of evaluation runs. Usage: node eval/compare.mjs <runDirA> <runDirB> [...]
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";

const dirs = process.argv.slice(2);
const runs = dirs.map(d => ({
  name: basename(d),
  summary: JSON.parse(readFileSync(join(d, "summary.json"), "utf8")),
  rows: new Map(readFileSync(join(d, "results.jsonl"), "utf8").trim().split("\n").map(l => JSON.parse(l)).map(r => [r.id, r]))
}));

const pct = (a, b) => (b ? `${a}/${b} (${Math.round((100 * a) / b)}%)` : "–");
const metric = [
  ["Strict pass, all cases", s => pct(s.strict_pass, s.n)],
  ["Answer cases, strict", s => pct(s.answer_strict_pass, s.answer_n)],
  ["Answer cases, lenient", s => pct(s.answer_lenient_pass, s.answer_n)],
  ["Abstain cases", s => pct(s.abstain_pass, s.abstain_n)],
  ["Unsafe supported", s => String(s.unsafe_supported)],
  ["Abstention precision", s => (s.abstention_precision == null ? "–" : s.abstention_precision.toFixed(2))],
  ["Retrieval recall@k (gold page)", s => (s.retrieval_recall_at_k == null ? "n/a" : s.retrieval_recall_at_k.toFixed(2))],
  ["Model calls", s => String(s.model_calls)],
  ["Prompt tokens", s => s.prompt_tokens.toLocaleString("en-AU")],
  ["Median time per question (s)", s => (s.median_ms / 1000).toFixed(1)]
];
const out = [];
const label = r => r.name.split("_").slice(2).join(" ");
out.push(`| Metric | ${runs.map(label).join(" | ")} |`);
out.push(`|---|${runs.map(() => "---").join("|")}|`);
for (const [label, f] of metric) out.push(`| ${label} | ${runs.map(r => f(r.summary)).join(" | ")} |`);
out.push("");
out.push(`| Case | Type | ${runs.map(label).join(" | ")} |`);
out.push(`|---|---|${runs.map(() => "---").join("|")}|`);
for (const id of [...runs[0].rows.keys()].sort()) {
  const first = runs[0].rows.get(id);
  out.push(`| ${id} | ${first.type} | ${runs.map(r => { const x = r.rows.get(id); return x ? `${x.result.status} · ${x.grade.outcome}` : "–"; }).join(" | ")} |`);
}
console.log(out.join("\n"));
