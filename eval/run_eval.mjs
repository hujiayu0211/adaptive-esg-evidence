// Runs a test set through the real pipeline and the real /api/answer handler.
// Usage: node eval/run_eval.mjs --reports <dir> [--mode retrieval|full] [--set eval/test-set-T1.json]
//          [--env .dev.vars] [--model gpt-6-luna] [--cases A01,W02] [--k 10] [--concurrency 2] [--label name]
//          [--retries 3] [--backoff 15]   (seconds; the wait grows linearly with each retry)
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { loadReport, embedQuery } from "./node-report.mjs";
import { grade } from "./grade.js";
import { answerQuestion, DEFAULT_K } from "../src/pipeline.js";
import { onRequestPost as answer } from "../functions/api/answer.js";
import { PROMPT_VERSION } from "../functions/_lib/prompt.js";
import { providerConfig } from "../functions/_lib/llm.js";
import { PARSER_VERSION } from "../src/extract.js";
import { CHUNKING_VERSION } from "../src/chunk.js";
import { RETRIEVAL_VERSION, EMBEDDING_MODEL } from "../src/retrieve.js";
import { VALIDATOR_VERSION } from "../src/validate.js";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "true"]);
  return acc;
}, []));

function loadVars(file) {
  const env = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = { ...process.env, ...(args.env ? loadVars(args.env) : {}) };
if (args.model) env.LLM_MODEL = args.model;
const mode = args.mode || "retrieval";
const k = Number(args.k || DEFAULT_K);
const setPath = args.set || new URL("./test-set-T1.json", import.meta.url).pathname;
const set = JSON.parse(readFileSync(setPath, "utf8"));
const wanted = args.cases ? new Set(args.cases.split(",")) : null;
const cases = set.cases.filter(c => !wanted || wanted.has(c.id));
const cfg = providerConfig(env);

const stamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
const outDir = join(new URL("./runs/", import.meta.url).pathname, `${stamp}_${set.name}_${mode}_${cfg.model}${args.label ? `_${args.label}` : ""}`);
mkdirSync(outDir, { recursive: true });
const log = (...m) => console.log(new Date().toISOString().slice(11, 19), ...m);

const retries = Number(args.retries || 3);
const backoffMs = Number(args.backoff || 15) * 1000;

async function callProxy(payload) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const request = new Request("http://localhost/api/answer", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost" }, body: JSON.stringify(payload) });
    const res = await answer({ request, env });
    const body = await res.json();
    if (res.ok) return body;
    // The runner retries rate limits and provider overload so a busy provider does not count as a system failure.
    if ([429, 502, 503, 504].includes(res.status) && attempt < retries) { await new Promise(r => setTimeout(r, backoffMs * (attempt + 1))); continue; }
    throw new Error(body.error || `HTTP ${res.status}`);
  }
}

const reports = {};
for (const r of set.reports) {
  if (!cases.some(c => c.report === r.id)) continue;
  const rep = await loadReport(join(args.reports, r.file), { log });
  if (rep.sha256 !== r.sha256) log(`WARNING: ${r.file} hash differs from the test set`);
  reports[r.id] = { ...rep, filename: r.file };
  log(`${r.id}: ${rep.pageCount} pages, ${rep.chunks.length} chunks, labels ${rep.labelsAvailable ? "yes" : "no"}`);
}

writeFileSync(join(outDir, "run_info.json"), JSON.stringify({
  set: set.name, set_file_sha256: createHash("sha256").update(readFileSync(setPath)).digest("hex"),
  mode, k: mode === "retrieval" ? k : null, provider: cfg.provider, model: cfg.model, reasoning_effort: cfg.reasoningEffort || null,
  versions: { parser: PARSER_VERSION, chunking: CHUNKING_VERSION, retrieval: RETRIEVAL_VERSION, embedding: EMBEDDING_MODEL, prompt: PROMPT_VERSION, validator: VALIDATOR_VERSION },
  cases: cases.map(c => c.id), started_at: new Date().toISOString()
}, null, 2));

const results = [];
const queue = [...cases];
async function worker() {
  while (queue.length) {
    const c = queue.shift();
    const rep = reports[c.report];
    const r = await answerQuestion({ question: c.question, report: rep, mode, embedQuery, callProxy, k });
    const g = grade(c, r);
    const row = { id: c.id, report: c.report, type: c.type, expect: c.expect, question: c.question, grade: g, result: r };
    results.push(row);
    appendFileSync(join(outDir, "results.jsonl"), `${JSON.stringify(row)}\n`);
    log(`${c.id} ${r.status.padEnd(21)} ${g.outcome}${r.meta?.usage ? ` in=${r.meta.usage.prompt_tokens}` : ""}`);
  }
}
await Promise.all(Array.from({ length: Number(args.concurrency || 2) }, worker));
results.sort((a, b) => a.id.localeCompare(b.id));

const answerRows = results.filter(r => r.expect === "answer");
const abstainRows = results.filter(r => r.expect === "abstain");
const count = (rows, f) => rows.filter(f).length;
const byType = {};
for (const r of results) {
  byType[r.type] ??= { n: 0, pass: 0 };
  byType[r.type].n += 1;
  byType[r.type].pass += r.grade.pass ? 1 : 0;
}
const usage = results.reduce((u, r) => {
  const x = r.result.meta?.usage;
  if (x) { u.prompt += x.prompt_tokens || 0; u.completion += x.completion_tokens || 0; u.calls += 1; }
  return u;
}, { prompt: 0, completion: 0, calls: 0 });
const abstained = results.filter(r => r.result.status === "insufficient_evidence");
const summary = {
  set: set.name, mode, model: cfg.model, n: results.length,
  strict_pass: count(results, r => r.grade.pass),
  answer_strict_pass: count(answerRows, r => r.grade.pass), answer_n: answerRows.length,
  answer_lenient_pass: count(answerRows, r => r.grade.lenient),
  abstain_pass: count(abstainRows, r => r.grade.pass), abstain_n: abstainRows.length,
  unsafe_supported: count(results, r => r.grade.unsafe),
  provider_errors: count(results, r => r.result.status === "error"),
  abstention_precision: abstained.length ? count(abstained, r => r.expect === "abstain") / abstained.length : null,
  abstention_recall: abstainRows.length ? count(abstainRows, r => r.result.status === "insufficient_evidence") / abstainRows.length : null,
  retrieval_recall_at_k: mode === "retrieval" ? count(answerRows, r => r.grade.retrievedGold) / answerRows.length : null,
  outcomes: results.reduce((o, r) => { o[r.grade.outcome] = (o[r.grade.outcome] || 0) + 1; return o; }, {}),
  by_type: byType,
  model_calls: usage.calls, prompt_tokens: usage.prompt, completion_tokens: usage.completion,
  median_ms: results.map(r => r.result.ms).sort((a, b) => a - b)[Math.floor(results.length / 2)]
};
writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
const lines = [
  `# ${set.name} · ${mode} · ${cfg.model}`, "",
  `Strict pass ${summary.strict_pass}/${summary.n}. Answer cases ${summary.answer_strict_pass}/${summary.answer_n} strict, ${summary.answer_lenient_pass}/${summary.answer_n} lenient. Abstain cases ${summary.abstain_pass}/${summary.abstain_n}. Unsafe supported: ${summary.unsafe_supported}.`, "",
  "| Case | Type | Status | Outcome | Cited PDF pages | Answer |", "|---|---|---|---|---|---|",
  ...results.map(r => `| ${r.id} | ${r.type} | ${r.result.status} | ${r.grade.outcome} | ${(r.grade.citedPages || []).join(", ")} | ${(r.result.answer || r.result.reasons?.join(" ") || "").replace(/\|/g, "/").replace(/\s+/g, " ").slice(0, 160)} |`)
];
writeFileSync(join(outDir, "summary.md"), `${lines.join("\n")}\n`);
log(`done -> ${outDir}`);
log(JSON.stringify({ strict: summary.strict_pass, n: summary.n, unsafe: summary.unsafe_supported, tokens: summary.prompt_tokens }));
