// Local Copilot — Groq proxy (Cloudflare Worker)
// Tine API key-ul pe server; aplicatiile (desktop + mobil) apeleaza acest
// endpoint fara niciun secret la bord.

const ALLOWED_MODELS = new Set([
  "llama-3.3-70b-versatile",
  "llama3-8b-8192",
  "mixtral-8x7b-32768",
  "gemma2-9b-it"
]);

const MAX_TOKENS_CAP = 2000;
const MAX_MESSAGES = 24;
const MAX_BODY_BYTES = 64 * 1024;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const url = new URL(request.url);
    if (url.pathname !== "/chat") {
      return json({ error: "Not found" }, 404);
    }

    let body;
    try {
      const raw = await request.text();
      if (raw.length > MAX_BODY_BYTES) return json({ error: "Payload too large" }, 413);
      body = JSON.parse(raw);
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const model = ALLOWED_MODELS.has(body.model) ? body.model : "llama-3.3-70b-versatile";
    const messages = Array.isArray(body.messages) ? body.messages.slice(-MAX_MESSAGES) : null;
    if (!messages || !messages.length) {
      return json({ error: "messages required" }, 400);
    }

    const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model,
        stream: Boolean(body.stream),
        max_tokens: Math.min(Number(body.max_tokens) || 1200, MAX_TOKENS_CAP),
        temperature: clamp(Number(body.temperature), 0, 1, 0.35),
        messages: messages.map((m) => ({
          role: m.role === "system" || m.role === "assistant" ? m.role : "user",
          content: String(m.content || "").slice(0, 8000)
        }))
      })
    });

    // Streaming SSE sau JSON — trecem raspunsul mai departe ca atare
    const headers = new Headers(CORS_HEADERS);
    headers.set("Content-Type", upstream.headers.get("Content-Type") || "application/json");
    return new Response(upstream.body, { status: upstream.status, headers });
  }
};

function clamp(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS }
  });
}
