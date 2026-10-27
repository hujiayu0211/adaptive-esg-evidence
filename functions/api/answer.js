// POST /api/answer — forwards one question and its passages to the model. Passage text is never logged.
import { buildMessages, PROMPT_VERSION } from "../_lib/prompt.js";
import { callModel, parseModelJson, providerConfig, ProviderError } from "../_lib/llm.js";

const MAX_QUESTION = 1000;
const MAX_PASSAGE = 4000;
const MAX_PASSAGES = 4000;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
});

function sameOrigin(request, env) {
  // Browsers always send Origin on POST; a request without it is a script, not this page.
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (allowed.includes(origin)) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

function checkPayload(p) {
  if (!p || typeof p !== "object") return "Invalid request.";
  if (typeof p.question !== "string" || !p.question.trim() || p.question.length > MAX_QUESTION) return "The question is missing or too long.";
  if (!["retrieval", "full"].includes(p.mode)) return "Unknown mode.";
  if (!p.report || typeof p.report.filename !== "string") return "Report details are missing.";
  if (!Array.isArray(p.passages) || !p.passages.length || p.passages.length > MAX_PASSAGES) return "Passages are missing or too many.";
  if (p.mode === "retrieval" && p.passages.length > 40) return "Too many passages for retrieval mode.";
  for (const x of p.passages) {
    if (!x || typeof x.id !== "string" || x.id.length > 40 || typeof x.text !== "string" || x.text.length > MAX_PASSAGE) return "A passage is malformed.";
  }
  return null;
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request, env)) return json({ error: "Origin not allowed." }, 403);
  const maxChars = Number(env.MAX_REQUEST_CHARS || 3_000_000);
  const raw = await request.text();
  if (raw.length > maxChars) return json({ error: "The request is too large." }, 413);
  let payload;
  try { payload = JSON.parse(raw); } catch { return json({ error: "Invalid JSON." }, 400); }
  const problem = checkPayload(payload);
  if (problem) return json({ error: problem }, 400);
  if (payload.mode === "full" && env.ALLOW_FULL_CONTEXT === "false") return json({ error: "Full-report mode is disabled on this server." }, 403);

  const cfg = providerConfig(env);
  const started = Date.now();
  try {
    const out = await callModel(buildMessages(payload), env);
    const result = parseModelJson(out.content);
    if (!result) return json({ error: "The model returned output that is not valid JSON." }, 502);
    return json({
      result,
      meta: { provider: cfg.provider, model: out.model, prompt_version: PROMPT_VERSION, usage: out.usage, latency_ms: Date.now() - started }
    });
  } catch (err) {
    const status = err instanceof ProviderError ? err.status : 500;
    console.error(`answer failed: status=${status}`);
    return json({ error: err instanceof ProviderError ? err.message : "The answer service failed." }, status);
  }
}
