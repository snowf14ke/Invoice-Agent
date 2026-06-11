import type { Chapter } from "@/data/story";
import type { ReplaySet, Snapshot } from "@/lib/types";
import { metricLabel, scoreColor } from "./MetricBadge";

const STATUS_STYLE: Record<Chapter["status"], { label: string; cls: string }> = {
  shipped: { label: "shipped", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" },
  lesson: { label: "lesson learned", cls: "border-sky-500/40 bg-sky-500/10 text-sky-400" },
  planned: { label: "planned", cls: "border-zinc-600 bg-zinc-800/40 text-zinc-400" },
};

export default function ChapterCard({
  chapter,
  snapshots,
  replays,
}: {
  chapter: Chapter;
  snapshots: Snapshot[];
  replays: ReplaySet[];
}) {
  const snap = chapter.version
    ? snapshots.find((s) => s.version === chapter.version)
    : undefined;
  const replay = chapter.replayQuestion
    ? replays
        .flatMap((r) => r.items.map((it) => ({ ...it, version: r.version })))
        .find((it) => it.question === chapter.replayQuestion)
    : undefined;
  const status = STATUS_STYLE[chapter.status];

  return (
    <div className="relative rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${status.cls}`}>
          {status.label}
        </span>
        {chapter.tag && snap && (
          <span className="rounded-full border border-zinc-700 px-2.5 py-0.5 font-mono text-[11px] text-zinc-400">
            {chapter.tag} · {snap.date}
          </span>
        )}
      </div>

      <h3 className="mt-3 text-lg font-semibold text-zinc-100">{chapter.title}</h3>

      <dl className="mt-3 space-y-2.5 text-sm leading-relaxed">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-rose-400/80">Problem</dt>
          <dd className="text-zinc-300">{chapter.problem}</dd>
        </div>
        {chapter.diagnosis && (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-amber-400/80">Diagnosis</dt>
            <dd className="text-zinc-300">{chapter.diagnosis}</dd>
          </div>
        )}
        {chapter.fix && (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-emerald-400/80">
              {chapter.status === "planned" ? "Planned fix" : "Fix"}
            </dt>
            <dd className="text-zinc-300">{chapter.fix}</dd>
          </div>
        )}
      </dl>

      {snap && chapter.highlights && (
        <div className="mt-4 flex flex-wrap gap-2">
          {chapter.highlights.map((h) => {
            const v = h.type
              ? snap.per_type[h.type]?.[h.metric]
              : snap.headline[h.metric];
            if (v === undefined) return null;
            return (
              <span
                key={h.label}
                className="rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1 font-mono text-xs"
              >
                <span className="text-zinc-400">{h.label}: </span>
                <span className={scoreColor(v)}>{v.toFixed(3)}</span>
              </span>
            );
          })}
        </div>
      )}

      {replay && (
        <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm">
          <div className="text-xs text-zinc-500">
            Recorded at {replay.version} — actual agent output, not a mock:
          </div>
          <div className="mt-1.5 text-zinc-300">
            <span className="text-zinc-500">Q:</span> {replay.question}
          </div>
          <div className="mt-1 text-zinc-400">
            <span className="text-zinc-500">A:</span> {replay.answer}
          </div>
        </div>
      )}

      {snap && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {Object.entries(snap.headline).map(([k, v]) => (
            <div key={k} className="rounded-md bg-zinc-950 px-2 py-1.5 text-center">
              <div className={`font-mono text-sm ${scoreColor(v)}`}>{v.toFixed(3)}</div>
              <div className="text-[10px] text-zinc-500">{metricLabel(k)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
