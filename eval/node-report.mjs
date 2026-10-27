// Builds the same report index in Node that the browser builds: PDF.js extraction, chunks, MiniLM embeddings.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { pipeline } from "@huggingface/transformers";
import { extractPdf, PARSER_VERSION } from "../src/extract.js";
import { chunkPages, CHUNKING_VERSION } from "../src/chunk.js";
import { Retriever, EMBEDDING_MODEL, passageForEmbedding } from "../src/retrieve.js";
import { lower } from "../src/text.js";

const CACHE = new URL("./cache/", import.meta.url).pathname;
let extractorPromise = null;

export function getExtractor() {
  extractorPromise ??= pipeline("feature-extraction", EMBEDDING_MODEL, { dtype: "q8" });
  return extractorPromise;
}

export async function embed(texts) {
  const extractor = await getExtractor();
  const out = [];
  for (let i = 0; i < texts.length; i += 32) {
    const t = await extractor(texts.slice(i, i + 32), { pooling: "mean", normalize: true });
    out.push(...t.tolist());
  }
  return out;
}

export async function embedQuery(q) {
  return (await embed([q]))[0];
}

export async function loadReport(path, { log = () => {} } = {}) {
  const data = readFileSync(path);
  const sha256 = createHash("sha256").update(data).digest("hex");
  const key = `${sha256.slice(0, 16)}-${PARSER_VERSION}-${CHUNKING_VERSION}-${EMBEDDING_MODEL.replace(/\W/g, "_")}`;
  const cacheFile = join(CACHE, `${key}.json`);
  let built;
  if (existsSync(cacheFile)) {
    built = JSON.parse(readFileSync(cacheFile, "utf8"));
  } else {
    log(`extracting ${path}`);
    const pdf = await getDocument({ data: new Uint8Array(data), verbosity: 0 }).promise;
    const { pages, pageCount, labelsAvailable } = await extractPdf(pdf);
    await pdf.destroy();
    const chunks = chunkPages(pages);
    log(`embedding ${chunks.length} chunks`);
    const embeddings = (await embed(chunks.map(passageForEmbedding))).map(v => v.map(x => Math.round(x * 1e5) / 1e5));
    built = { sha256, pageCount, labelsAvailable, pages, chunks, embeddings };
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(cacheFile, JSON.stringify(built));
  }
  return {
    ...built,
    textLower: lower(built.pages.map(p => p.text).join("\n")),
    retriever: new Retriever(built.chunks, { embeddings: built.embeddings })
  };
}
