"use client";

import { useState } from "react";

import type { TraceStep } from "@/lib/types";

function Step({ step, index }: { step: TraceStep; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-ink-700 bg-ink-900/70">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
      >
        <span className="text-mist-500">{index + 1}.</span>
        <span className="font-mono text-azure-400">{step.tool}</span>
        <span className="truncate font-mono text-xs text-mist-500">
          {JSON.stringify(step.args)}
        </span>
        <span className="ml-auto text-mist-500">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <pre className="overflow-x-auto border-t border-ink-700 px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap text-mist-400">
          {step.result || "(no result)"}
        </pre>
      )}
    </div>
  );
}

export default function TraceView({ trace }: { trace: TraceStep[] }) {
  if (!trace.length)
    return <div className="text-xs text-mist-500">No tool calls — the model answered directly.</div>;
  return (
    <div className="space-y-1.5">
      <div className="font-mono text-xs tracking-wide text-mist-500 uppercase">
        ReAct trace — {trace.length} tool call{trace.length > 1 ? "s" : ""}
      </div>
      {trace.map((s, i) => (
        <Step key={i} step={s} index={i} />
      ))}
    </div>
  );
}
