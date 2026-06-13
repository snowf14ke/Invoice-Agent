// Server-side proxy for the live Mongolian TTS demo. The RunPod Bearer token
// grants account-wide access (including the OCR endpoint), so it must never reach
// the browser — the key is read from process.env here and the client only ever
// talks to this route.
//
// We submit async (/run) and poll /status/{id} rather than /runsync: /runsync
// HOLDS the HTTP connection through the entire cold start (~140s when the
// endpoint has scaled to zero), which a server-side deadline can't interrupt. With
// /run, every fetch is quick and DEADLINE_MS genuinely bounds total wall-time, so
// a still-cold job returns a clean 504 (and the worker keeps warming for the
// retry, which lands warm in ~4s).

export const runtime = "nodejs";
export const maxDuration = 60; // a cold GPU worker (~19s) exceeds the 10s default

const ENDPOINT_ID = process.env.RUNPOD_TTS_ENDPOINT_ID ?? "ti109u5lkovxsv";
const DEADLINE_MS = 45_000; // stay under maxDuration; a cold worker exceeds this → retry lands warm
const POLL_MS = 1_000;
const MAX_CHARS = 250;
const CYRILLIC = /[Ѐ-ӿ]/;

// In-memory per-IP limiter. Instance-local on serverless (resets on cold start,
// not shared across instances) — fine at portfolio scale; the MAX_CHARS cap is
// the real cost guard.
const RATE_LIMIT = 5;
const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  // Bound memory: drop fully-expired buckets if the map ever grows large (an IP
  // that hit us once and never returned would otherwise linger forever).
  if (hits.size > 5_000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
  }
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

type RunPodBody = {
  id?: string;
  status?: string;
  output?: { audio_base64?: string; audio?: string; duration?: number; sample_rate?: number };
  executionTime?: number;
  delayTime?: number;
  error?: string;
};

export async function POST(request: Request) {
  const key = process.env.RUNPOD_API_KEY;
  if (!key) return Response.json({ error: "TTS is not configured." }, { status: 503 });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(ip)) {
    return Response.json(
      { error: "Too many requests — give the GPU a moment (5/min)." },
      { status: 429 },
    );
  }

  const payload = await request.json().catch(() => null);
  const raw = payload?.text;
  if (typeof raw !== "string" || !raw.trim()) {
    return Response.json({ error: "Enter some text to synthesize." }, { status: 400 });
  }
  const text = raw.trim();
  if (text.length > MAX_CHARS) {
    return Response.json({ error: `Keep it under ${MAX_CHARS} characters.` }, { status: 400 });
  }
  if (!CYRILLIC.test(text)) {
    return Response.json(
      { error: "This voice speaks Mongolian — use Cyrillic text." },
      { status: 400 },
    );
  }

  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const base = `https://api.runpod.ai/v2/${ENDPOINT_ID}`;

  try {
    let res = await fetch(`${base}/run`, {
      method: "POST",
      headers,
      body: JSON.stringify({ input: { text } }),
    });
    if (!res.ok) throw new Error(`RunPod ${res.status}`);
    let body: RunPodBody = await res.json();
    const jobId = body.id;

    const deadline = Date.now() + DEADLINE_MS;
    while (body.status === "IN_QUEUE" || body.status === "IN_PROGRESS") {
      if (Date.now() > deadline) {
        return Response.json(
          { error: "GPU worker is warming up — try again in a moment." },
          { status: 504 },
        );
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
      res = await fetch(`${base}/status/${jobId}`, { headers });
      if (!res.ok) throw new Error(`RunPod status ${res.status}`);
      body = await res.json();
    }

    if (body.status && body.status !== "COMPLETED") {
      throw new Error(body.error || `RunPod job ${body.status}`);
    }

    const out = body.output ?? {};
    const audio = out.audio_base64 ?? out.audio;
    if (!audio) throw new Error("No audio returned");

    return Response.json({
      audio_base64: audio,
      duration: out.duration ?? null,
      sample_rate: out.sample_rate ?? null,
      execution_ms: body.executionTime ?? null,
      delay_ms: body.delayTime ?? null,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Synthesis failed." },
      { status: 502 },
    );
  }
}
