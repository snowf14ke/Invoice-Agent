import type { Chapter } from "@/data/story";
import type { ReplaySet, Snapshot } from "@/lib/types";
import { metricLabel, scoreColor } from "./MetricBadge";

const STATUS_STYLE: Record<
  Chapter["status"],
  { label: string; chip: string; edge: string }
> = {
  shipped: {
    label: "shipped",
    chip: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
    edge: "before:bg-emerald-400/60",
  },
  lesson: {
    label: "lesson learned",
    chip: "border-amber-500/40 bg-amber-500/10 text-amber-400",
    edge: "before:bg-amber-400/60",
  },
  planned: {
    label: "planned",
    chip: "border-ink-600 bg-ink-800/60 text-mist-400",
    edge: "before:bg-ink-600",
  },
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
    <div
      className={`panel relative overflow-hidden p-5 pl-6 before:absolute before:inset-y-0 before:left-0 before:w-[3px] ${status.edge}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${status.chip}`}>
          {status.label}
        </span>
        {chapter.tag && snap && (
          <span className="rounded-full border border-ink-600 px-2.5 py-0.5 font-mono text-[11px] text-mist-400">
            {chapter.tag} · {snap.date}
          </span>
        )}
      </div>

      <h3 className="mt-3 font-display text-lg font-semibold text-mist-100">{chapter.title}</h3>

      <p className="mt-3 text-sm leading-relaxed text-mist-300">{chapter.problem}</p>

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
                className="rounded-md border border-ink-600 bg-ink-900 px-2.5 py-1 font-mono text-xs"
              >
                <span className="text-mist-400">{h.label}: </span>
                <span className={scoreColor(v)}>{v.toFixed(3)}</span>
              </span>
            );
          })}
        </div>
      )}

      {replay && (
        <div className="mt-4 rounded-lg border border-ink-700 bg-ink-900 p-3 font-mono text-xs leading-relaxed">
          <div className="text-[11px] text-mist-500">
            recorded at {replay.version} — actual agent output, not a mock
          </div>
          <div className="mt-2 text-mist-200">
            <span className="select-none text-emerald-400">❯ </span>
            {replay.question}
          </div>
          <div className="mt-1.5 border-l-2 border-emerald-400/50 pl-2.5 text-mist-300">
            {replay.answer}
          </div>
        </div>
      )}

      {(chapter.diagnosis || chapter.fix) && (
        <details className="group mt-4">
          <summary className="cursor-pointer font-mono text-xs font-medium tracking-wide text-mist-500 uppercase transition-colors select-none hover:text-mist-200">
            How it was measured &amp; fixed
            <span className="ml-1 inline-block transition-transform group-open:rotate-90">›</span>
          </summary>
          <dl className="mt-3 space-y-2.5 text-sm leading-relaxed">
            {chapter.diagnosis && (
              <div>
                <dt className="font-mono text-xs font-medium tracking-wide text-amber-400/90 uppercase">
                  Diagnosis
                </dt>
                <dd className="text-mist-300">{chapter.diagnosis}</dd>
              </div>
            )}
            {chapter.fix && (
              <div>
                <dt className="font-mono text-xs font-medium tracking-wide text-emerald-400/90 uppercase">
                  {chapter.status === "planned" ? "Planned fix" : "Fix"}
                </dt>
                <dd className="text-mist-300">{chapter.fix}</dd>
              </div>
            )}
            {snap && (
              <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-5">
                {Object.entries(snap.headline).map(([k, v]) => (
                  <div key={k} className="rounded-md border border-ink-700 bg-ink-900 px-2 py-1.5 text-center">
                    <div className={`font-mono text-sm ${scoreColor(v)}`}>{v.toFixed(3)}</div>
                    <div className="text-[10px] text-mist-500">{metricLabel(k)}</div>
                  </div>
                ))}
              </div>
            )}
          </dl>
        </details>
      )}
    </div>
  );
}
