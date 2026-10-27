// Local server: static files plus the two Pages Functions. Reads secrets from .dev.vars or the environment.
// Usage: node scripts/dev-server.mjs [port]
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { onRequestPost as answer } from "../functions/api/answer.js";
import { onRequestGet as config } from "../functions/api/config.js";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const PORT = Number(process.argv[2] || process.env.PORT || 8788);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

export function loadVars(file) {
  const env = {};
  if (!existsSync(file)) return env;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = { ...process.env, ...loadVars(resolve(ROOT, process.env.DEV_VARS || ".dev.vars")) };

async function toWebRequest(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  return new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body });
}

async function send(res, webRes) {
  res.writeHead(webRes.status, Object.fromEntries(webRes.headers));
  res.end(Buffer.from(await webRes.arrayBuffer()));
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api/answer" && req.method === "POST") return send(res, await answer({ request: await toWebRequest(req), env }));
    if (url.pathname === "/api/config" && req.method === "GET") return send(res, await config({ request: await toWebRequest(req), env }));
    // Local test PDFs for browser testing only: FIXTURES_DIR=<dir> serves <dir>/<name>.pdf at /__fixtures/<name>.pdf
    if (env.FIXTURES_DIR && url.pathname.startsWith("/__fixtures/")) {
      const name = decodeURIComponent(url.pathname.slice(12));
      if (!/^[\w.-]+\.pdf$/.test(name)) throw Object.assign(new Error(), { code: "ENOENT" });
      res.writeHead(200, { "Content-Type": "application/pdf", "Cache-Control": "no-store" });
      return res.end(await readFile(join(env.FIXTURES_DIR, name)));
    }
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    if (path.endsWith("/")) path += "index.html";
    const file = join(ROOT, path);
    if (!file.startsWith(ROOT) || /[/\\](\.|node_modules|eval[/\\](cache|runs|reports))/.test(file.slice(ROOT.length))) throw Object.assign(new Error(), { code: "ENOENT" });
    if (!(await stat(file)).isFile()) throw Object.assign(new Error(), { code: "ENOENT" });
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(await readFile(file));
  } catch (err) {
    res.writeHead(err.code === "ENOENT" ? 404 : 500, { "Content-Type": "text/plain" });
    res.end(err.code === "ENOENT" ? "Not found" : "Server error");
  }
}).listen(PORT, "127.0.0.1", () => console.log(`http://127.0.0.1:${PORT}`));
