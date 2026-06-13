const LABELS: Record<string, string> = {
  faithfulness: "faithfulness",
  answer_correctness: "answer correctness",
  context_recall: "context recall",
  "hit@5": "hit@5",
  rr: "MRR",
};

export function metricLabel(key: string) {
  return LABELS[key] ?? key;
}

export function scoreColor(v: number) {
  if (v >= 0.85) return "text-emerald-400";
  if (v >= 0.6) return "text-amber-400";
  return "text-rose-400";
}

/** A cell in a metric strip — the parent grid supplies hairline separators
 *  (grid gap-px bg-ink-700, same pattern as the homepage proof bar). */
export default function MetricBadge({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: number;
  sublabel?: string;
}) {
  return (
    <div className="bg-ink-850 px-4 py-3">
      <div className={`font-mono text-2xl font-semibold ${scoreColor(value)}`}>
        {value.toFixed(3)}
      </div>
      <div className="mt-1 text-xs uppercase tracking-wide text-mist-400">{label}</div>
      {sublabel && <div className="font-mono text-[11px] text-mist-500">{sublabel}</div>}
    </div>
  );
}
