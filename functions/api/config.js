// GET /api/config — what the interface needs to tell users where passages go. No secrets.
import { providerConfig } from "../_lib/llm.js";
import { PROMPT_VERSION } from "../_lib/prompt.js";

export async function onRequestGet({ env }) {
  const cfg = providerConfig(env);
  return new Response(JSON.stringify({
    provider: cfg.provider,
    model: cfg.model,
    data_note: cfg.dataNote,
    prompt_version: PROMPT_VERSION,
    configured: Boolean(cfg.apiKey),
    full_context_allowed: env.ALLOW_FULL_CONTEXT !== "false"
  }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
