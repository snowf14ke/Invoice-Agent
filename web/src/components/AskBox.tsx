"use client";

import { useState } from "react";

import { ask } from "@/lib/api";
import type { AskResponse } from "@/lib/types";
import TraceView from "./TraceView";

export default function AskBox({ suggestions }: { suggestions: string[] }) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(q: string) {
    if (!q.trim() || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await ask(q));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(question);
        }}
        className="flex gap-2"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about the ingested invoices…"
          className="flex-1 rounded-lg border border-ink-600 bg-ink-900 px-3.5 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 focus:border-azure-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-azure-500 px-4 py-2 text-sm font-semibold text-ink-950 transition-colors hover:bg-azure-400 disabled:opacity-50"
        >
          {busy ? "Thinking…" : "Ask"}
        </button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => {
              setQuestion(s);
              run(s);
            }}
            className="rounded-full border border-ink-600 px-3 py-1 text-xs text-mist-400 transition-colors hover:border-azure-400/50 hover:text-mist-200"
          >
            {s.length > 70 ? s.slice(0, 67) + "…" : s}
          </button>
        ))}
      </div>

      {busy && (
        <div className="panel px-4 py-3 text-sm text-mist-400">
          The agent is choosing tools and querying the database…
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error.includes("fetch")
            ? `Can't reach the API — is uvicorn running? (${error})`
            : error}
        </div>
      )}
      {result && (
        <div className="panel space-y-3 p-4">
          <div className="text-sm leading-relaxed whitespace-pre-wrap text-mist-200">
            {result.answer || "(empty answer)"}
          </div>
          <TraceView trace={result.trace} />
        </div>
      )}
    </div>
  );
}
