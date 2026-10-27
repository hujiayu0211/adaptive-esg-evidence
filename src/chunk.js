// Splits page text into overlapping chunks. Chunks never cross pages, so each citation maps to one page.
export const CHUNKING_VERSION = "c1-1100-180";

export function chunkPages(pages, { size = 1100, overlap = 180, min = 40 } = {}) {
  const chunks = [];
  for (const page of pages) {
    if (!page.hasText) continue;
    const text = page.text;
    let start = 0;
    let n = 0;
    while (start < text.length) {
      let end = Math.min(text.length, start + size);
      if (end < text.length) {
        const cut = Math.max(text.lastIndexOf("\n", end), text.lastIndexOf(" ", end));
        if (cut > start + size / 2) end = cut;
      }
      const slice = text.slice(start, end).trim();
      if (slice.length >= min) {
        chunks.push({ id: `p${page.index}-${n}`, pdf_index: page.index, page_label: page.label, heading: page.heading, text: slice });
        n += 1;
      }
      if (end >= text.length) break;
      let next = end - overlap;
      const space = text.indexOf(" ", next);
      next = space > -1 && space < end ? space + 1 : next;
      start = Math.max(next, start + 1);
    }
  }
  return chunks;
}
