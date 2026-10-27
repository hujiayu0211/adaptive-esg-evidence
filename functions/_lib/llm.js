// OpenAI-compatible chat completions client. Provider, model and endpoint come from environment variables.

export function providerConfig(env) {
  const provider = env.LLM_PROVIDER_NAME || "OpenAI";
  return {
    provider,
    model: env.LLM_MODEL || "gpt-6-luna",
    baseUrl: (env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, ""),
    apiKey: env.LLM_API_KEY || env.OPENAI_API_KEY || "",
    reasoningEffort: env.LLM_REASONING_EFFORT || "",
    timeoutMs: Number(env.LLM_TIMEOUT_MS || 120000),
    dataNote: env.LLM_DATA_NOTE || ""
  };
}

export class ProviderError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function callModel(messages, env) {
  const cfg = providerConfig(env);
  if (!cfg.apiKey) throw new ProviderError("The answer service is not configured.", 500);
  const body = { model: cfg.model, messages, response_format: { type: "json_object" } };
  if (cfg.reasoningEffort) body.reasoning_effort = cfg.reasoningEffort;

  let lastStatus = 0;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
    let res;
    try {
      res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify(body),
        signal: ctrl.signal
      });
    } catch (err) {
      clearTimeout(timer);
      lastStatus = err.name === "AbortError" ? 504 : 502;
      continue;
    }
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      return { content: data.choices?.[0]?.message?.content ?? "", usage: data.usage || null, model: data.model || cfg.model };
    }
    lastStatus = res.status;
    // Read and discard the body; it may echo request content, so it is never logged.
    await res.text().catch(() => "");
    if (res.status !== 429 && res.status < 500) break;
    await new Promise(r => setTimeout(r, 1500));
  }
  if (lastStatus === 429) throw new ProviderError("The model provider's rate limit was reached. Please try again in a minute.", 429);
  if (lastStatus === 503 || lastStatus === 504) throw new ProviderError("The model provider is busy or timed out. Please try again shortly.", 503);
  throw new ProviderError(`The model provider returned an error (HTTP ${lastStatus}).`, 502);
}

export function parseModelJson(content) {
  const text = String(content || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(text.slice(start, end + 1)); } catch { /* fall through */ }
    }
    return null;
  }
}
