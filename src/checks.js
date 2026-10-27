// Deterministic checks that run before any model call.
import { lower } from "./text.js";

const LEAD_WORDS = new Set(("what how did does do which who when where why is are was were by in for the a an list describe explain give show has have can " +
  "could should would according under from of and to its their please compare summarise summarize tell me if").split(" "));

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function containsPhrase(haystackLower, phrase) {
  const p = lower(phrase);
  if (!p) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRe(p)}($|[^a-z0-9])`).test(haystackLower);
}

// Title-case names (and tokens with "&") in the question, e.g. "Beach Energy", "MS&AD".
export function namesInQuestion(question) {
  const words = question.replace(/[?!,;:()"]/g, " ").split(/\s+/).filter(Boolean);
  const names = [];
  let cur = [];
  const flush = () => { if (cur.length) names.push(cur.join(" ")); cur = []; };
  words.forEach((raw, i) => {
    const w = raw.replace(/['’]s$/i, "").replace(/['’.]+$/, "");
    const isName = /^[A-Z][a-z][\w&.'’-]*$/.test(w) || /^[A-Z][\w]*&[\w]+$/.test(w);
    if (isName && !(i === 0 && LEAD_WORDS.has(w.toLowerCase())) && !(cur.length === 0 && LEAD_WORDS.has(w.toLowerCase()))) {
      cur.push(w);
      if (w !== raw.replace(/['’.]+$/, "")) flush(); // possessive ends a name
    } else {
      flush();
    }
  });
  flush();
  return [...new Set(names)];
}

// Years asked about: 2025, FY25, FY2015, FY24/25, 2024-25.
export function periodsInQuestion(question) {
  const found = new Set();
  const add = y => { if (y >= 1900 && y <= 2100) found.add(y); };
  const two = d => 2000 + Number(d);
  for (const m of question.matchAll(/\bFY\s?'?(\d{4}|\d{2})(?:\s?[/-]\s?(\d{4}|\d{2}))?\b/gi)) {
    add(m[1].length === 4 ? Number(m[1]) : two(m[1]));
    if (m[2]) add(m[2].length === 4 ? Number(m[2]) : two(m[2]));
  }
  for (const m of question.matchAll(/\b(19\d{2}|20\d{2})(?:\s?[/-]\s?(\d{2}))?\b/g)) {
    add(Number(m[1]));
    if (m[2]) add(Number(m[1].slice(0, 2) + m[2]));
  }
  return [...found].sort();
}

export function yearVariants(y) {
  const yy = String(y % 100).padStart(2, "0");
  const py = String((y - 1) % 100).padStart(2, "0");
  // Financial-year ranges ending in y: FY24/25, 2024/25, 2024-25, FY2024/25.
  const ranges = [`fy${py}/${yy}`, `fy${py}-${yy}`, `${y - 1}/${yy}`, `${y - 1}-${yy}`, `fy${y - 1}/${yy}`, `${y - 1}/${y}`, `${y - 1}-${y}`];
  return [String(y), `fy${yy}`, `fy${y}`, `fy ${yy}`, `fy ${y}`, ...ranges];
}

// Names the question asks about that the report mentions only in passing (a partner, shareholder or peer), not its own company.
const COMMON_ACRONYMS = new Set(("GHG ESG CO2 CO2E TRIF TRIR LTIFR RCFR TROIF HCI PCAF SASB GRI TCFD TNFD ISSB AASB ASRS NGER PPA LGC LGCS ACCU ACCUS ASX FY CEO CFO KPI LNG CCS CCUS " +
  "PCR EID RMF US UK EU AUD USD NZ SBTI SBT IEA NGFS MSCI EBITDA NPAT ROE ROIC").split(" "));
const RARE_MAX_OCCURRENCES = 30;

function countPhrase(haystackLower, phrase) {
  const re = new RegExp(`(^|[^a-z0-9])${escapeRe(lower(phrase))}(?=$|[^a-z0-9])`, "g");
  return (haystackLower.match(re) || []).length;
}

export function rareEntitiesInQuestion(question, reportTextLower) {
  const acronyms = [...question.matchAll(/\b[A-Z][A-Z0-9]{1,5}\b/g)].map(m => m[0]).filter(a => !COMMON_ACRONYMS.has(a) && !/^FY\d*$/.test(a));
  return [...new Set([...namesInQuestion(question), ...acronyms])].filter(n => {
    const c = countPhrase(reportTextLower, n);
    return c > 0 && c <= RARE_MAX_OCCURRENCES;
  });
}

export function precheck(question, reportTextLower) {
  const reasons = [];
  for (const name of namesInQuestion(question)) {
    if (containsPhrase(reportTextLower, name)) continue;
    const first = name.split(" ")[0];
    if (name.includes(" ") && containsPhrase(reportTextLower, first)) continue;
    reasons.push({ code: "name_not_in_report", text: `"${name}" does not appear anywhere in this report, so the report cannot answer questions about it.` });
  }
  for (const y of periodsInQuestion(question)) {
    if (!yearVariants(y).some(v => containsPhrase(reportTextLower, v))) {
      reasons.push({ code: "period_not_in_report", text: `${y} is not mentioned anywhere in this report.` });
    }
  }
  return { block: reasons.length > 0, reasons };
}

// Retrieval abstains when no passage shares enough of the question's terms and meaning.
export const RETRIEVAL_MIN_COVERAGE = 0.2;
export const RETRIEVAL_MIN_COSINE = 0.25;

export function retrievalTooWeak(signals) {
  const lexWeak = signals.maxCoverage < RETRIEVAL_MIN_COVERAGE;
  const semWeak = signals.maxCosine == null || signals.maxCosine < RETRIEVAL_MIN_COSINE;
  return lexWeak && semWeak;
}
