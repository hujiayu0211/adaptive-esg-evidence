// Page-level text extraction from a PDF.js document. Works in the browser and in Node.
import { cleanExtracted } from "./text.js";

export const PARSER_VERSION = "x1";

const MIN_TEXT_CHARS = 20;

function itemHeight(item) {
  return Math.abs(item.height || (item.transform ? item.transform[3] : 0) || 0);
}

// Builds lines from text items and picks the largest-font line as the page heading.
export function pageFromItems(items) {
  const lines = [];
  let buf = "";
  let maxH = 0;
  const heights = [];
  for (const item of items) {
    const str = item.str ?? "";
    if (str.trim()) heights.push(itemHeight(item));
    buf += str;
    if (str.trim()) maxH = Math.max(maxH, itemHeight(item));
    if (item.hasEOL) {
      lines.push({ text: buf, height: maxH });
      buf = "";
      maxH = 0;
    } else if (str && !str.endsWith(" ")) {
      buf += " ";
    }
  }
  if (buf.trim()) lines.push({ text: buf, height: maxH });

  heights.sort((a, b) => a - b);
  const median = heights.length ? heights[Math.floor(heights.length / 2)] : 0;
  let heading = null;
  for (const line of lines) {
    const t = line.text.replace(/\s+/g, " ").trim();
    if (t.length < 3 || t.length > 90 || !/[A-Za-z]{3}/.test(t)) continue;
    if (median && line.height >= median * 1.35 && (!heading || line.height > heading.height)) heading = { text: t, height: line.height };
  }
  const text = cleanExtracted(lines.map(l => l.text).join("\n"));
  return { text, heading: heading ? heading.text : null };
}

export async function extractPdf(pdf, { onPage, shouldStop } = {}) {
  let labels = null;
  try { labels = await pdf.getPageLabels(); } catch { labels = null; }
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    if (shouldStop?.()) throw new Error("cancelled");
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const { text, heading } = pageFromItems(content.items);
    page.cleanup?.();
    pages.push({
      index: i,
      label: labels?.[i - 1] || null,
      text,
      heading,
      hasText: text.replace(/\s/g, "").length >= MIN_TEXT_CHARS
    });
    await onPage?.(i, pdf.numPages);
  }
  return { pages, pageCount: pdf.numPages, labelsAvailable: Array.isArray(labels) };
}

// Display label for a page: printed label when the PDF provides one.
export function pageLabel(page) {
  return page.label && page.label !== String(page.index) ? `p. ${page.label} (PDF ${page.index})` : `PDF p. ${page.index}`;
}
