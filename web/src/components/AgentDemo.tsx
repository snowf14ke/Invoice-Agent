"use client";

// Looping "terminal" replay of REAL recorded agent runs — the scenes are built
// server-side from the frozen replay JSON (src/data/evals/replays), so this
// animation can never show an answer the agent didn't actually give.

import { useEffect, useState } from "react";

export type DemoStep = { tool: string; args: string; result: string };
export type DemoScene = { question: string; steps: DemoStep[]; answer: string };

const TYPE_MS = 26; // per character
const STEP_MS = 620; // per tool-call line
const HOLD_MS = 4800; // pause on the finished answer

export default function AgentDemo({ scenes, version }: { scenes: DemoScene[]; version: string }) {
  const [scene, setScene] = useState(0);
  // Server-render the first scene fully visible: no-JS visitors and search
  // engines see real content; the effect below restarts the loop on mount.
  const [typed, setTyped] = useState(scenes[0]?.question.length ?? 0);
  const [stepsShown, setStepsShown] = useState(scenes[0]?.steps.length ?? 0);
  const [answered, setAnswered] = useState(true);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const current = scenes[scene];
    if (!current) return;
    setAnimating(true);
    setTyped(0);
    setStepsShown(0);
    setAnswered(false);

    const timers: number[] = [];
    const q = current.question;
    for (let i = 1; i <= q.length; i++) {
      timers.push(window.setTimeout(() => setTyped(i), 400 + i * TYPE_MS));
    }
    const afterTyping = 400 + q.length * TYPE_MS + 450;
    current.steps.forEach((_, si) => {
      timers.push(window.setTimeout(() => setStepsShown(si + 1), afterTyping + si * STEP_MS));
    });
    const afterSteps = afterTyping + current.steps.length * STEP_MS + 300;
    timers.push(window.setTimeout(() => setAnswered(true), afterSteps));
    timers.push(
      window.setTimeout(() => setScene((s) => (s + 1) % scenes.length), afterSteps + HOLD_MS),
    );
    return () => timers.forEach(clearTimeout);
  }, [scene, scenes]);

  const current = scenes[scene];
  if (!current) return null;
  const typing = animating && typed < current.question.length;

  return (
    <div className="panel overflow-hidden font-mono text-sm leading-relaxed">
      {/* title bar */}
      <div className="flex items-center gap-1.5 border-b border-ink-700 bg-ink-900/90 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-ink-600" />
        <span className="h-2.5 w-2.5 rounded-full bg-ink-600" />
        <span className="h-2.5 w-2.5 rounded-full bg-ink-600" />
        <span className="ml-2 truncate text-[11px] text-mist-500">
          agent replay · {version} · recorded run — not a mock
        </span>
        <span className="relative ml-auto h-2 w-2 shrink-0 rounded-full bg-emerald-400 text-emerald-400 status-ping" />
      </div>

      <div className="flex h-[26rem] flex-col gap-2 overflow-hidden p-4 sm:h-[24rem]">
        {/* question being typed */}
        <div className="text-mist-200">
          <span className="select-none text-emerald-400">❯ </span>
          {current.question.slice(0, typed)}
          {typing && <span className="caret" />}
        </div>

        {/* tool calls from the recorded trace */}
        {current.steps.slice(0, stepsShown).map((s, i) => (
          <div key={`${scene}-${i}`} className="fade-up pl-4">
            <div className="truncate">
              <span className="text-azure-400">› {s.tool}</span>{" "}
              <span className="text-mist-500">{s.args}</span>
            </div>
            <div className="truncate text-mist-500/80">↳ {s.result}</div>
          </div>
        ))}

        {/* final answer */}
        {answered && (
          <div className="fade-up mt-1 border-l-2 border-emerald-400/60 pl-3 text-[15px] text-mist-100">
            <span className="mr-1.5 font-semibold text-emerald-400">answer</span>
            {current.answer}
          </div>
        )}
      </div>
    </div>
  );
}
