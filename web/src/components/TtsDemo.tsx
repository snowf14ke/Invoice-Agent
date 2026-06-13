"use client";

// The one live, networked project demo: pick a Mongolian phrase or type your own,
// and the real RunPod TTS worker synthesizes it. The /api/tts route proxies the
// call so the RunPod key stays server-side. Same DemoFrame visual language as the
// other project demos; SSR / no-JS / reduced-motion all show the idle frame
// (wave-bar animation is disabled by the reduced-motion media query in globals.css).

import { useEffect, useRef, useState } from "react";

import { DemoFrame, DemoLine } from "@/components/ProjectDemos";

const PRESETS = [
  "Сайн байна уу ? .",
  "Өнөөдөр цаг агаар маш сайхан байна.",
  "Энэ бол монгол хэлний хиймэл дуу хоолой.",
];

const WAVE_HEIGHTS = [55, 80, 40, 95, 65, 75, 35, 90, 50, 70, 45, 85, 60, 78, 42, 88];
const MAX_CHARS = 250;
const CYRILLIC = /[Ѐ-ӿ]/;

type Status = "idle" | "loading" | "playing" | "error";
type Result = { duration: number | null; ms: number };

export function TtsDemo() {
  const [text, setText] = useState(PRESETS[0]);
  const [status, setStatus] = useState<Status>("idle");
  const [coldStart, setColdStart] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const coldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Autoplay a fresh clip once it's mounted. synthesize() is always click-triggered,
  // so this counts as a user gesture and the browser allows playback. audioSrc is
  // set before status flips to "playing", so the element already has its src here.
  useEffect(() => {
    if (status === "playing") audioRef.current?.play().catch(() => {});
  }, [status]);

  // If we unmount mid-synthesis (user navigates away), abort the request and clear
  // the cold-start timer so neither fires into a gone component.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (coldTimerRef.current) clearTimeout(coldTimerRef.current);
    },
    [],
  );

  async function synthesize(input?: string) {
    if (status === "loading") return;
    const trimmed = (input ?? text).trim();
    if (!trimmed || !CYRILLIC.test(trimmed)) {
      setStatus("error");
      setError("This voice speaks Mongolian — use Cyrillic text.");
      return;
    }
    setStatus("loading");
    setError("");
    setResult(null);
    setColdStart(false);
    setIsPlaying(false);
    const ac = new AbortController();
    abortRef.current = ac;
    coldTimerRef.current = setTimeout(() => setColdStart(true), 4000);
    const started = performance.now();
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
        signal: ac.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Synthesis failed.");
      const b64: string = data.audio_base64;
      const src = b64.startsWith("data:") ? b64 : `data:audio/wav;base64,${b64}`;
      const roundTripMs = Math.round(performance.now() - started);
      setAudioSrc(src);
      setResult({ duration: data.duration ?? null, ms: data.execution_ms ?? roundTripMs });
      setStatus("playing");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setStatus("error");
      setError(err instanceof Error ? err.message : "Synthesis failed.");
    } finally {
      if (coldTimerRef.current) clearTimeout(coldTimerRef.current);
    }
  }

  const overLimit = text.length > MAX_CHARS;
  const canSubmit = status !== "loading" && text.trim().length > 0 && !overLimit;

  return (
    <DemoFrame title="tts · mongolian speech · live" bodyClassName="flex min-h-60 flex-col gap-3 p-5">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => {
              setText(p);
              synthesize(p);
            }}
            disabled={status === "loading"}
            className="rounded-full border border-ink-600 bg-ink-900 px-2.5 py-1 text-[11px] text-mist-300 transition-colors hover:border-azure-400/60 hover:text-mist-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {p}
          </button>
        ))}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={MAX_CHARS}
        rows={2}
        spellCheck={false}
        placeholder="Монгол текст бичих…"
        className="w-full resize-none rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-mist-200 placeholder:text-mist-500 focus:border-azure-400/60 focus:outline-none"
      />

      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] text-mist-500">
          {text.length}/{MAX_CHARS}
        </span>
        <button
          type="button"
          onClick={() => synthesize()}
          disabled={!canSubmit}
          className="rounded-lg bg-azure-500 px-3.5 py-1.5 text-xs font-semibold text-ink-950 transition-all hover:bg-azure-400 hover:shadow-[0_0_20px_rgb(92_165_247/0.3)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "loading" ? "Synthesizing…" : "Synthesize"}
        </button>
      </div>

      {/* live area: status while loading, waveform + audio + numbers when playing */}
      <div className="flex flex-1 flex-col justify-end gap-2">
        {status === "loading" && (
          <div className="space-y-1">
            <DemoLine kind="tool" text="runpod → synthesizing speech" />
            {coldStart && (
              <div className="fade-up pl-4 text-xs text-mist-500">
                cold start — GPU worker waking up…
              </div>
            )}
          </div>
        )}

        {status === "playing" && (
          <>
            <div className="flex h-14 items-end gap-1">
              {WAVE_HEIGHTS.map((h, i) => (
                <span
                  key={i}
                  className={`flex-1 rounded-sm ${isPlaying ? "wave-bar" : "bg-azure-500/30"}`}
                  style={{ height: `${h}%`, animationDelay: `${(i % 5) * 0.12}s` }}
                />
              ))}
            </div>
            <audio
              ref={audioRef}
              src={audioSrc ?? undefined}
              controls
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              className="h-9 w-full"
            />
            {result && (
              <DemoLine
                kind="ok"
                text={`${result.duration ? result.duration.toFixed(1) + "s audio · " : ""}synthesized in ${(result.ms / 1000).toFixed(1)}s`}
              />
            )}
          </>
        )}

        {status === "error" && <div className="text-sm text-rose-400">{error}</div>}

        {status === "idle" && (
          <div className="text-xs text-mist-500">
            Pick a phrase or type your own, then synthesize — real GPU, real audio.
          </div>
        )}
      </div>
    </DemoFrame>
  );
}
