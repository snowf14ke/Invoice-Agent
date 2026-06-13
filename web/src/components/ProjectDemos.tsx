"use client";

// Bespoke looping "how it works" demos for the project rows. Same visual
// language as AgentDemo (panel, mono, azure/emerald palette), driven by plain
// timers. Server render and prefers-reduced-motion both show the finished
// frame, so no-JS visitors see complete content.

import { useEffect, useState } from "react";

// Steps from 0..count and loops; starts at `count` so SSR shows the final frame.
function useLoopStep(count: number, stepMs: number, holdMs: number, startMs = 500) {
  const [step, setStep] = useState(count);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cancelled = false;
    let timer = 0;
    const schedule = (fn: () => void, ms: number) => {
      timer = window.setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
    };
    const run = (i: number) => {
      setStep(i);
      if (i < count) schedule(() => run(i + 1), i === 0 ? startMs + stepMs : stepMs);
      else schedule(() => run(0), holdMs);
    };
    run(0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [count, stepMs, holdMs, startMs]);
  return step;
}

export function DemoFrame({
  title,
  children,
  bodyClassName = "flex h-60 flex-col gap-2.5 overflow-hidden p-5",
}: {
  title: string;
  children: React.ReactNode;
  bodyClassName?: string;
}) {
  return (
    <div className="panel overflow-hidden font-mono text-sm leading-relaxed">
      <div className="flex items-center gap-1.5 border-b border-ink-700 bg-ink-900/90 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-ink-600" />
        <span className="h-2.5 w-2.5 rounded-full bg-ink-600" />
        <span className="h-2.5 w-2.5 rounded-full bg-ink-600" />
        <span className="ml-2 truncate text-[11px] tracking-wider text-mist-500 uppercase">
          {title}
        </span>
      </div>
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}

type LineKind = "in" | "tool" | "ok";

export function DemoLine({ kind, text }: { kind: LineKind; text: string }) {
  if (kind === "in") {
    return (
      <div className="fade-up text-mist-200">
        <span className="select-none text-emerald-400">❯ </span>
        {text}
      </div>
    );
  }
  if (kind === "tool") {
    return (
      <div className="fade-up truncate pl-4">
        <span className="text-azure-400">› </span>
        <span className="text-mist-500">{text}</span>
      </div>
    );
  }
  return <div className="fade-up text-emerald-400">✓ {text}</div>;
}

const INVOICE_LINES: { kind: LineKind; text: string }[] = [
  { kind: "in", text: "doc_7.png received" },
  { kind: "tool", text: "ocr → 14 line items" },
  { kind: "tool", text: "extract → typed JSON" },
  { kind: "tool", text: "embed → pgvector" },
  { kind: "ok", text: "searchable in 9.8s — ask anything" },
];

export function InvoiceDemo() {
  const shown = useLoopStep(INVOICE_LINES.length, 700, 3000);
  return (
    <DemoFrame title="invoice-agent · ingest pipeline">
      {INVOICE_LINES.slice(0, shown).map((l, i) => (
        <DemoLine key={i} kind={l.kind} text={l.text} />
      ))}
    </DemoFrame>
  );
}

const BICHIG_SOURCE = "ᠮᠣᠩᠭᠣᠯ ᠪᠢᠴᠢᠭ";
const BICHIG_TARGET = "Монгол бичиг";

export function BichigDemo() {
  // one step per typed character + a final step for the ✓
  const step = useLoopStep(BICHIG_TARGET.length + 1, 110, 3000, 900);
  const typed = Math.min(step, BICHIG_TARGET.length);
  const done = step > BICHIG_TARGET.length;
  return (
    <DemoFrame title="bichig ocr · transliteration">
      <div className="m-auto w-full space-y-4 text-center">
        <div className="text-3xl leading-snug text-mist-100">{BICHIG_SOURCE}</div>
        <div className="text-xs text-mist-500">↓ TrOCR → mT5 · 600M → 43M params</div>
        <div className="h-7 text-lg text-emerald-400">
          {BICHIG_TARGET.slice(0, typed)}
          {step > 0 && typed < BICHIG_TARGET.length && <span className="caret" />}
          {done && " ✓"}
        </div>
      </div>
    </DemoFrame>
  );
}

// TtsDemo moved to ./TtsDemo.tsx — it is the only live, networked demo now
// (it calls /api/tts), so it lives on its own and reuses DemoFrame/DemoLine.
