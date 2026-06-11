import type { Snapshot } from "@/lib/types";
import { metricLabel } from "./MetricBadge";

const METRICS = ["faithfulness", "answer_correctness", "context_recall", "hit@5", "rr"];
const SERIES_COLORS = ["#71717a", "#38bdf8", "#34d399", "#fbbf24", "#f472b6"];

/** Grouped bar chart: metrics on the x-axis, one bar per version. Hand-rolled SVG —
 *  one chart is not worth a charting dependency. */
export default function EvalChart({ snapshots }: { snapshots: Snapshot[] }) {
  const W = 760;
  const H = 240;
  const PAD = { left: 36, right: 8, top: 12, bottom: 28 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const groupW = plotW / METRICS.length;
  const barW = Math.min(26, (groupW * 0.7) / Math.max(snapshots.length, 1));

  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Eval metrics by version">
        {/* gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((g) => {
          const y = PAD.top + plotH * (1 - g);
          return (
            <g key={g}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="#27272a" strokeWidth={1} />
              <text x={PAD.left - 6} y={y + 3} textAnchor="end" fontSize={9} fill="#71717a">
                {g.toFixed(2)}
              </text>
            </g>
          );
        })}
        {/* bars */}
        {METRICS.map((m, mi) => {
          const groupX = PAD.left + mi * groupW + groupW / 2;
          const total = snapshots.length * barW + (snapshots.length - 1) * 4;
          return (
            <g key={m}>
              {snapshots.map((s, si) => {
                const v = s.headline[m] ?? 0;
                const h = plotH * v;
                const x = groupX - total / 2 + si * (barW + 4);
                return (
                  <g key={s.version}>
                    <rect
                      x={x}
                      y={PAD.top + plotH - h}
                      width={barW}
                      height={h}
                      rx={3}
                      fill={SERIES_COLORS[si % SERIES_COLORS.length]}
                    />
                    <text
                      x={x + barW / 2}
                      y={PAD.top + plotH - h - 4}
                      textAnchor="middle"
                      fontSize={9}
                      fill="#a1a1aa"
                    >
                      {v.toFixed(2)}
                    </text>
                  </g>
                );
              })}
              <text
                x={groupX}
                y={H - 10}
                textAnchor="middle"
                fontSize={10}
                fill="#a1a1aa"
              >
                {metricLabel(m)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-4">
        {snapshots.map((s, si) => (
          <div key={s.version} className="flex items-center gap-1.5 text-xs text-zinc-400">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: SERIES_COLORS[si % SERIES_COLORS.length] }}
            />
            <span className="font-mono">{s.version}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
