// Text normalisation shared by extraction, retrieval and validation.

// For comparisons: Unicode-compatible forms (CO₂ -> CO2, ligatures), one quote/dash style, single spaces.
export function normalise(s) {
  return String(s ?? "")
    .normalize("NFKC")
    .replace(/[­​-‍⁠﻿]/g, "")
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export const lower = s => normalise(s).toLowerCase();

// For extracted page text: keep line breaks (table rows), tidy spaces, rejoin digit groups split by the PDF layer.
export function cleanExtracted(s) {
  let out = String(s ?? "")
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{2,}/g, "\n");
  let prev;
  do {
    prev = out;
    out = out
      .replace(/(\d),[ ]+(\d{3})(?!\d)/g, "$1,$2") // "1, 169,000"
      .replace(/(\d)[ ]+,(\d{3})(?!\d)/g, "$1,$2"); // "1,417 ,000"
  } while (out !== prev);
  return out.trim();
}

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
