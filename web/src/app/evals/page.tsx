import EvalChart from "@/components/EvalChart";
import { metricLabel, scoreColor } from "@/components/MetricBadge";
import { Reveal } from "@/components/Motion";
import SectionHeader from "@/components/SectionHeader";
import { loadSnapshots } from "@/lib/data";

export const metadata = { title: "Eval receipts — Invoice-Agent" };

const METRICS = ["faithfulness", "answer_correctness", "context_recall", "hit@5", "rr"];

export default function EvalsPage() {
  const snapshots = loadSnapshots();

  return (
    <div className="space-y-14">
      <section className="space-y-3 pt-4">
        <div className="fade-up kicker">Receipts, not adjectives</div>
        <h1 className="fade-up font-display text-3xl font-bold text-mist-100">
          The eval receipts
        </h1>
        <p className="fade-up max-w-2xl text-sm text-mist-400" style={{ animationDelay: "120ms" }}>
          Every version is measured on the same frozen 77-question set with the same independent
          judge. Nothing on this page is self-reported by the answering model.
        </p>
      </section>

      <section className="space-y-6">
        <Reveal>
          <SectionHeader index="01" kicker="By version" title="Headline metrics" />
        </Reveal>
        {/* the Reveal also triggers the bars' grow animation (.chart-bar) */}
        <Reveal>
          <EvalChart snapshots={snapshots} />
        </Reveal>
      </section>

      {snapshots.map((snap) => (
        <Reveal key={snap.version}>
          <section className="space-y-4">
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="font-mono text-lg font-semibold text-azure-300">{snap.version}</h2>
              <span className="font-mono text-xs text-mist-500">
                {snap.date} · {snap.n_questions} questions · answerer {snap.answer_model} · judge{" "}
                {snap.judge_model} · git {snap.git}
              </span>
            </div>
            <div className="panel overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-700 bg-ink-900/70 text-left font-mono text-xs tracking-wide text-mist-500 uppercase">
                    <th className="px-3 py-2 font-medium">question type</th>
                    {METRICS.map((m) => (
                      <th key={m} className="px-3 py-2 text-right font-medium">
                        {metricLabel(m)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {Object.entries(snap.per_type).map(([t, ms]) => (
                    <tr key={t} className="border-b border-ink-700/50 last:border-0">
                      <td className="px-3 py-2 font-sans text-mist-300">{t}</td>
                      {METRICS.map((m) => (
                        <td key={m} className={`px-3 py-2 text-right ${scoreColor(ms[m] ?? 0)}`}>
                          {(ms[m] ?? 0).toFixed(3)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="bg-ink-900/60">
                    <td className="px-3 py-2 font-sans font-medium text-mist-100">overall</td>
                    {METRICS.map((m) => (
                      <td
                        key={m}
                        className={`px-3 py-2 text-right font-semibold ${scoreColor(snap.headline[m] ?? 0)}`}
                      >
                        {(snap.headline[m] ?? 0).toFixed(3)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </Reveal>
      ))}

      <Reveal>
        <section className="space-y-6">
          <SectionHeader
            index="02"
            kicker="Methodology"
            title="Why these numbers can be trusted"
          />
          <ul className="max-w-3xl list-disc space-y-2 pl-5 text-sm leading-relaxed text-mist-400">
            <li>
              <span className="text-mist-200">Clean answer key.</span> Ground truths come from the
              dataset&apos;s clean labels, never from OCR text — so the eval measures whether the
              system recovers the right value <em>despite</em> OCR noise, instead of grading OCR
              errors as &quot;correct&quot;.
            </li>
            <li>
              <span className="text-mist-200">Independent judge.</span> Answer quality is graded by
              deepseek-v4-pro, never by the model that wrote the answer. Our first eval let
              gpt-5.4-mini judge itself and scored 0.848 — the independent judge scored the same
              system 0.741. The judge stays fixed across versions, or deltas would be meaningless.
            </li>
            <li>
              <span className="text-mist-200">Judge-free retrieval metrics.</span> Each question
              knows which invoice&apos;s chunk must be retrieved (<span className="font-mono">target_invoices</span>).
              hit@5 and MRR are computed deterministically from that — no LLM in the loop.
            </li>
            <li>
              <span className="text-mist-200">Frozen set, versioned snapshots.</span> The 77
              questions never change between versions; each run is saved to{" "}
              <span className="font-mono">evals/</span> and tagged in git. CI fails if faithfulness
              drops below 0.8.
            </li>
          </ul>
          <p className="text-sm text-mist-500">
            The eval set and snapshots are in the repo:{" "}
            <a
              className="text-azure-400 hover:underline"
              href="https://github.com/snowf14ke/Invoice-Agent/blob/main/eval_set.json"
              target="_blank"
              rel="noreferrer"
            >
              eval_set.json
            </a>{" "}
            ·{" "}
            <a
              className="text-azure-400 hover:underline"
              href="https://github.com/snowf14ke/Invoice-Agent/tree/main/evals"
              target="_blank"
              rel="noreferrer"
            >
              evals/
            </a>
          </p>
        </section>
      </Reveal>
    </div>
  );
}
