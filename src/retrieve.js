// Hybrid retrieval over one report: BM25 plus optional MiniLM cosine, fused by reciprocal rank.
import { lower } from "./text.js";

export const RETRIEVAL_VERSION = "r2-bm25-compounds-minilm-rrf-keep4x3";
export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";

const STOP = new Set(("a an and are as at be by did do does for from had has have how in is it its of on or so that the their there these this to was were what when where which who why will with than into about over under " +
  "company company's report reported reporting much many").split(" "));

function stem(t) {
  if (t.length > 4 && t.endsWith("ies")) return `${t.slice(0, -3)}y`;
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

export function tokens(text) {
  const s = lower(text).replace(/(\d),(?=\d{3}\b)/g, "$1");
  const words = s
    .split(/[^a-z0-9.%]+/)
    .map(t => t.replace(/^\.+|\.+$/g, ""))
    .filter(t => t && (t.length > 1 || /\d/.test(t)) && !STOP.has(t))
    .map(stem);
  // Compound tokens keep distinctions that single words lose: "location-based", "scope 2".
  const compounds = [
    ...[...s.matchAll(/\b([a-z]{3,})-([a-z]{3,})\b/g)].map(m => `${m[1]}_${m[2]}`),
    ...[...s.matchAll(/\bscope\s*([123])\b/g)].map(m => `scope_${m[1]}`)
  ];
  return words.concat(compounds);
}

export function passageForEmbedding(chunk) {
  return `${chunk.heading ? `${chunk.heading}. ` : ""}${chunk.text}`;
}

export class Retriever {
  constructor(chunks, { embeddings = null, k1 = 1.2, b = 0.75 } = {}) {
    this.chunks = chunks;
    this.embeddings = embeddings;
    this.k1 = k1;
    this.b = b;
    this.docTokens = chunks.map(c => tokens(`${c.heading || ""} ${c.text}`));
    this.df = new Map();
    this.docTokens.forEach(toks => new Set(toks).forEach(t => this.df.set(t, (this.df.get(t) || 0) + 1)));
    this.avgLen = this.docTokens.reduce((s, t) => s + t.length, 0) / Math.max(1, chunks.length);
    this.tf = this.docTokens.map(toks => {
      const m = new Map();
      toks.forEach(t => m.set(t, (m.get(t) || 0) + 1));
      return m;
    });
  }

  bm25(queryTokens) {
    const N = this.chunks.length;
    return this.tf.map((tf, i) => {
      let score = 0;
      const len = this.docTokens[i].length;
      for (const q of new Set(queryTokens)) {
        const f = tf.get(q);
        if (!f) continue;
        const df = this.df.get(q) || 0;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        score += idf * (f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + this.b * len / this.avgLen));
      }
      return score;
    });
  }

  // queryEmbedding: normalised vector or null. Returns top-k hits with scores and the signals used for abstention.
  search(query, queryEmbedding = null, k = 10) {
    const q = tokens(query);
    const lex = this.bm25(q);
    const sem = queryEmbedding && this.embeddings ? this.embeddings.map(v => dot(v, queryEmbedding)) : null;
    const rankOf = scores => {
      const order = scores.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]);
      const r = new Array(scores.length);
      order.forEach(([, i], rank) => { r[i] = rank; });
      return r;
    };
    const lexRank = rankOf(lex);
    const semRank = sem ? rankOf(sem) : null;
    const fused = this.chunks.map((_, i) => 1 / (60 + lexRank[i]) + (semRank ? 1 / (60 + semRank[i]) : 0));
    // Each method's strongest hits are always kept, so a passage that only one method ranks highly is not fused away.
    const keep = new Set(this.chunks.map((_, i) => i).filter(i => lexRank[i] < Math.min(4, k) || (semRank && semRank[i] < Math.min(3, k))));
    const byFused = fused.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]);
    for (const [, i] of byFused) { if (keep.size >= k) break; keep.add(i); }
    const top = byFused.filter(([, i]) => keep.has(i));
    const qSet = new Set(q);
    const hits = top.map(([score, i]) => ({
      chunk: this.chunks[i],
      fused: score,
      bm25: lex[i],
      cosine: sem ? sem[i] : null,
      coverage: qSet.size ? [...qSet].filter(t => this.tf[i].has(t)).length / qSet.size : 0
    }));
    return {
      hits,
      method: sem ? "hybrid" : "bm25",
      signals: {
        maxCosine: sem ? Math.max(...sem) : null,
        maxCoverage: hits.length ? Math.max(...hits.map(h => h.coverage)) : 0,
        maxBm25: Math.max(0, ...lex)
      }
    };
  }
}

export function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += a[i] * b[i];
  return s;
}
