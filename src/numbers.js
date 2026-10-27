// Number extraction and matching for the numeric gate and for grading.
import { normalise } from "./text.js";

// Words after which a small number is a label, not a figure ("Scope 1", "Category 12").
const LABEL_WORDS = new Set(["scope", "category", "tier", "phase", "level", "stage", "note", "notes", "page", "pages", "figure", "table", "section", "principle", "goal", "sdg", "step", "part", "item"]);

const MONTHS = new Set(["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec"]);

const NUM_RE = /(?<![A-Za-z0-9_.,])-?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(?![\d])(?!\.\d)/g;

export function extractNumbers(text) {
  const s = normalise(text);
  const out = [];
  for (const m of s.matchAll(NUM_RE)) {
    const raw = m[0];
    const intPart = m[1].replace(/,/g, "");
    const dec = m[2] || "";
    const value = Number(`${raw.startsWith("-") ? "-" : ""}${intPart}${dec}`);
    if (!Number.isFinite(value)) continue;
    const before = s.slice(Math.max(0, m.index - 12), m.index).toLowerCase();
    const prevWord = (before.match(/([a-z]+)\s*$/) || [])[1];
    const after = s.slice(m.index + raw.length, m.index + raw.length + 2);
    const afterWord = (s.slice(m.index + raw.length, m.index + raw.length + 12).toLowerCase().match(/^\s*([a-z]+)/) || [])[1];
    const isDay = !dec && value >= 1 && value <= 31 && (MONTHS.has(prevWord) || MONTHS.has(afterWord));
    out.push({
      raw,
      value,
      decimals: dec ? dec.length - 1 : 0,
      isYear: !dec && !m[1].includes(",") && value >= 1900 && value <= 2100,
      isPercent: /^\s?%/.test(after),
      isLabel: (!!prevWord && LABEL_WORDS.has(prevWord) && value < 100 && !dec) || isDay
    });
  }
  return out;
}

// Figures that the numeric gate checks: not labels, not years.
export function significantNumbers(text) {
  return extractNumbers(text).filter(n => !n.isLabel && !n.isYear);
}

export function years(text) {
  return extractNumbers(text).filter(n => n.isYear).map(n => n.value);
}

// A claimed figure matches evidence when the evidence number, rounded to the claim's precision, equals it.
export function valueMatches(claim, evidenceNumbers) {
  const tol = 0.5 * 10 ** -claim.decimals + 1e-9;
  return evidenceNumbers.some(e => Math.abs(e.value - claim.value) <= tol);
}

export function decimalsOf(v) {
  const s = String(v);
  const i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
}
