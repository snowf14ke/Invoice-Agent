"use client";

import { useState } from "react";

import type { TraceStep } from "@/lib/types";

function Step({ step, index }: { step: TraceStep; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/50">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
      >
        <span className="text-zinc-500">{index + 1}.</span>
        <span className="font-mono text-sky-400">{step.tool}</span>
        <span className="truncate font-mono text-xs text-zinc-500">
          {JSON.stringify(step.args)}
        </span>
        <span className="ml-auto text-zinc-600">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <pre className="overflow-x-auto border-t border-zinc-800 px-3 py-2 text-xs leading-relaxed text-zinc-400 whitespace-pre-wrap">
          {step.result || "(no result)"}
        </pre>
      )}
    </div>
  );
}

export default function TraceView({ trace }: { trace: TraceStep[] }) {
  if (!trace.length)
    return <div className="text-xs text-zinc-500">No tool calls — the model answered directly.</div>;
  return (
    <div className="space-y-1.5">
      <div className="text-xs uppercase tracking-wide text-zinc-500">
        ReAct trace — {trace.length} tool call{trace.length > 1 ? "s" : ""}
      </div>
      {trace.map((s, i) => (
        <Step key={i} step={s} index={i} />
      ))}
    </div>
  );
}
