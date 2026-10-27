// Checks the model's answer against the passages it was given and sets the final evidence status.
import { lower, normalise } from "./text.js";
import { significantNumbers, valueMatches, years } from "./numbers.js";
import { periodsInQuestion, yearVariants, containsPhrase, rareEntitiesInQuestion } from "./checks.js";

export const VALIDATOR_VERSION = "v2";

const KINDS = new Set(["actual", "target", "policy", "intention", "other"]);

function quoteFound(quote, chunks) {
  const parts = lower(quote).split(/\s*(?:\.\.\.|…)\s*/).map(p => p.trim()).filter(p => p.length >= 4);
  if (!parts.length || lower(quote).length < 8) return false;
  return chunks.some(c => {
    const hay = lower(c.text);
    let from = 0;
    for (const p of parts) {
      const at = hay.indexOf(p, from);
      if (at < 0) return false;
      from = at + p.length;
    }
    return true;
  });
}

function scopesMentioned(textLower) {
  const out = new Set();
  for (const m of textLower.matchAll(/scope\s*([123])((?:\s*(?:,|and|&|\+|-|\/)\s*[123])*)/g)) {
    out.add(m[1]);
    (m[2].match(/[123]/g) || []).forEach(d => out.add(d));
  }
  return out;
}

function qualifierWarnings(question, evidenceLower) {
  const q = lower(question);
  const warnings = [];
  const asked = scopesMentioned(q);
  const shown = scopesMentioned(evidenceLower);
  asked.forEach(s => { if (!shown.has(s)) warnings.push(`The cited passages do not mention Scope ${s}.`); });
  for (const basis of ["market", "location"]) {
    // [\s-]* also accepts words split across a line break ("location- based").
    if (new RegExp(`${basis}[\\s-]*based`).test(q) && !new RegExp(`${basis}[\\s-]*based`).test(evidenceLower)) {
      warnings.push(`The question asks for the ${basis}-based figure, but the cited passages do not say ${basis}-based.`);
    }
  }
  for (const y of periodsInQuestion(question)) {
    if (!yearVariants(y).some(v => containsPhrase(evidenceLower, v))) warnings.push(`The cited passages do not mention ${y}.`);
  }
  return warnings;
}

// pageText(pdfIndex) -> full page text, used so a table row's qualifiers can come from its header on the same page.
// reportTextLower -> whole report, used to tell the report's own company from names it mentions only in passing.
export function validateAnswer({ question, llm, passages, pageText = null, reportTextLower = null }) {
  const byId = new Map(passages.map(p => [p.id, p]));
  if (!llm || typeof llm !== "object") {
    return { status: "error", answer: "", claims: [], warnings: [], reasons: ["The model returned no usable answer."] };
  }
  const answer = normalise(llm.answer || "");
  if (llm.status === "insufficient_evidence") {
    return { status: "insufficient_evidence", answer, claims: [], warnings: [], reasons: ["The model found no adequate evidence in the passages it was given."], missing: llm.missing || "" };
  }

  const claims = (Array.isArray(llm.claims) ? llm.claims : []).map(raw => {
    const ids = (Array.isArray(raw.passage_ids) ? raw.passage_ids : []).map(String);
    const known = ids.filter(id => byId.has(id));
    const chunks = known.map(id => byId.get(id));
    const text = normalise(raw.text || "");
    const quote = normalise(raw.quote || "");
    const evidenceNums = significantNumbers(chunks.map(c => c.text).join("\n"));
    const missingNumbers = significantNumbers(text).filter(n => !valueMatches(n, evidenceNums)).map(n => n.raw);
    const evidenceYears = new Set(years(chunks.map(c => c.text).join("\n")));
    const missingYears = years(text).filter(y => !evidenceYears.has(y));
    const checks = {
      ids: known.length > 0 && known.length === ids.length,
      quote: quoteFound(quote, chunks),
      numbers: missingNumbers.length === 0
    };
    return {
      text,
      quote,
      kind: KINDS.has(raw.kind) ? raw.kind : "other",
      passage_ids: ids,
      chunks: chunks.map(c => ({ id: c.id, pdf_index: c.pdf_index, page_label: c.page_label, heading: c.heading })),
      checks,
      missingNumbers,
      missingYears,
      valid: checks.ids && checks.quote && checks.numbers
    };
  });

  const valid = claims.filter(c => c.valid);
  if (!claims.length) {
    return { status: "insufficient_evidence", answer, claims, warnings: [], reasons: ["The answer cited no passages, so it cannot be shown as evidence-based."], unverified: !!answer };
  }
  if (!valid.length) {
    return { status: "insufficient_evidence", answer, claims, warnings: [], reasons: ["None of the cited statements could be verified against the report text."], unverified: true };
  }

  const warnings = [];
  const invalidCount = claims.length - valid.length;
  if (invalidCount) warnings.push(`${invalidCount} statement${invalidCount > 1 ? "s" : ""} could not be verified and ${invalidCount > 1 ? "were" : "was"} excluded.`);
  const validChunks = valid.flatMap(c => c.chunks.map(ch => byId.get(ch.id)));
  const evidenceText = validChunks.map(c => c.text).join("\n");
  const evidenceNums = significantNumbers(evidenceText);
  const unsupportedInAnswer = significantNumbers(answer).filter(n => !valueMatches(n, evidenceNums)).map(n => n.raw);
  if (unsupportedInAnswer.length) warnings.push(`Figures in the answer not found in the verified evidence: ${unsupportedInAnswer.join(", ")}.`);
  valid.filter(c => c.missingYears.length).forEach(c => warnings.push(`Year ${c.missingYears.join(", ")} in "${c.text.slice(0, 60)}…" is not in its cited passage.`));
  const citedPages = [...new Set(validChunks.map(c => c.pdf_index))];
  const contextLower = lower(pageText ? citedPages.map(p => pageText(p) || "").join("\n") : evidenceText);
  warnings.push(...qualifierWarnings(question, contextLower));

  // A name in the question that the report mentions only in passing must be what the evidence or the answer is about.
  if (reportTextLower) {
    const answerLower = lower([answer, ...valid.map(c => c.text)].join(" "));
    const ignored = rareEntitiesInQuestion(question, reportTextLower).filter(n => !containsPhrase(contextLower, n) && !containsPhrase(answerLower, n));
    if (ignored.length) {
      return { status: "insufficient_evidence", answer, claims, warnings, unverified: true,
        reasons: [`The question is about ${ignored.join(", ")}, but neither the cited evidence nor the answer is about ${ignored.length > 1 ? "them" : "it"}.`] };
    }
  }
  const q = lower(question);
  if (/\b(actual(ly)?|achieved|so far|to date|progress)\b/.test(q) && valid.every(c => c.kind === "target")) {
    warnings.push("The question asks for results, but every verified statement is labelled as a target.");
  }

  return { status: warnings.length ? "partial" : "supported", answer, claims, warnings, reasons: [], missing: llm.missing || "" };
}
