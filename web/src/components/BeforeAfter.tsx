"use client";

import { useState } from "react";

import { ask } from "@/lib/api";
import type { AskResponse, ReplaySet } from "@/lib/types";
import TraceView from "./TraceView";

export default function BeforeAfter({ replaySet }: { replaySet: ReplaySet }) {
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const item = replaySet.items[idx];

  async function runLive() {
    setBusy(true);
    setError(null);
    setLive(null);
    try {
      setLive(await ask(item.question));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <select
        value={idx}
        onChange={(e) => {
          setIdx(Number(e.target.value));
          setLive(null);
          setError(null);
        }}
        className="w-full rounded-lg border border-ink-600 bg-ink-900 px-3 py-2.5 text-sm text-mist-200 focus:border-azure-400 focus:outline-none"
      >
        {replaySet.items.map((it, i) => (
          <option key={i} value={i}>
            {it.question}
          </option>
        ))}
      </select>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* recorded */}
        <div className="panel space-y-3 p-4">
          <div className="font-mono text-xs font-medium tracking-wide text-amber-400 uppercase">
            Recorded at {replaySet.version} ({replaySet.date}) — frozen
          </div>
          <div className="text-sm leading-relaxed whitespace-pre-wrap text-mist-300">
            {item.answer}
          </div>
          <TraceView trace={item.trace} />
        </div>

        {/* live */}
        <div className="panel space-y-3 p-4">
          <div className="flex items-center justify-between">
            <div className="font-mono text-xs font-medium tracking-wide text-emerald-400 uppercase">
              Current system — live
            </div>
            <button
              onClick={runLive}
              disabled={busy}
              className="rounded-md bg-azure-500 px-3 py-1.5 text-xs font-semibold text-ink-950 transition-colors hover:bg-azure-400 disabled:opacity-50"
            >
              {busy ? "Running…" : "Run live"}
            </button>
          </div>
          {error && <div className="text-sm text-rose-300">{error}</div>}
          {live ? (
            <>
              <div className="text-sm leading-relaxed whitespace-pre-wrap text-mist-200">
                {live.answer}
              </div>
              <TraceView trace={live.trace} />
            </>
          ) : (
            !busy &&
            !error && (
              <div className="text-sm text-mist-500">
                Run the same question against the system as deployed right now and compare.
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
