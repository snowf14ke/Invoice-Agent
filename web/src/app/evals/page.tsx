import EvalChart from "@/components/EvalChart";
import { metricLabel, scoreColor } from "@/components/MetricBadge";
import { loadSnapshots } from "@/lib/data";

export const metadata = { title: "Eval receipts — Invoice-Agent" };

const METRICS = ["faithfulness", "answer_correctness", "context_recall", "hit@5", "rr"];

export default function EvalsPage() {
  const snapshots = loadSnapshots();

  return (
    <div className="space-y-12">
      <section className="space-y-3">
        <h1 className="text-2xl font-bold text-zinc-100">The eval receipts</h1>
        <p className="max-w-2xl text-sm text-zinc-400">
          Every version is measured on the same frozen 77-question set with the same independent
          judge. Nothing on this page is self-reported by the answering model.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-100">Headline metrics by version</h2>
        <EvalChart snapshots={snapshots} />
      </section>

      {snapshots.map((snap) => (
        <section key={snap.version} className="space-y-4">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="font-mono text-lg font-semibold text-zinc-100">{snap.version}</h2>
            <span className="text-xs text-zinc-500">
              {snap.date} · {snap.n_questions} questions · answerer {snap.answer_model} · judge{" "}
              {snap.judge_model} · git {snap.git}
            </span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-400">
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
                  <tr key={t} className="border-b border-zinc-800/60 last:border-0">
                    <td className="px-3 py-2 font-sans text-zinc-300">{t}</td>
                    {METRICS.map((m) => (
                      <td key={m} className={`px-3 py-2 text-right ${scoreColor(ms[m] ?? 0)}`}>
                        {(ms[m] ?? 0).toFixed(3)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="bg-zinc-900/40">
                  <td className="px-3 py-2 font-sans font-medium text-zinc-100">overall</td>
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
      ))}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-100">Methodology — why these numbers can be trusted</h2>
        <ul className="max-w-3xl list-disc space-y-2 pl-5 text-sm leading-relaxed text-zinc-400">
          <li>
            <span className="text-zinc-200">Clean answer key.</span> Ground truths come from the
            dataset&apos;s clean labels, never from OCR text — so the eval measures whether the
            system recovers the right value <em>despite</em> OCR noise, instead of grading OCR
            errors as &quot;correct&quot;.
          </li>
          <li>
            <span className="text-zinc-200">Independent judge.</span> Answer quality is graded by
            deepseek-v4-pro, never by the model that wrote the answer. Our first eval let
            gpt-5.4-mini judge itself and scored 0.848 — the independent judge scored the same
            system 0.741. The judge stays fixed across versions, or deltas would be meaningless.
          </li>
          <li>
            <span className="text-zinc-200">Judge-free retrieval metrics.</span> Each question
            knows which invoice&apos;s chunk must be retrieved (<span className="font-mono">target_invoices</span>).
            hit@5 and MRR are computed deterministically from that — no LLM in the loop.
          </li>
          <li>
            <span className="text-zinc-200">Frozen set, versioned snapshots.</span> The 77
            questions never change between versions; each run is saved to{" "}
            <span className="font-mono">evals/</span> and tagged in git. CI fails if faithfulness
            drops below 0.8.
          </li>
        </ul>
        <p className="text-sm text-zinc-500">
          The eval set and snapshots are in the repo:{" "}
          <a
            className="text-sky-400 hover:underline"
            href="https://github.com/snowf14ke/Invoice-Agent/blob/main/eval_set.json"
            target="_blank"
            rel="noreferrer"
          >
            eval_set.json
          </a>{" "}
          ·{" "}
          <a
            className="text-sky-400 hover:underline"
            href="https://github.com/snowf14ke/Invoice-Agent/tree/main/evals"
            target="_blank"
            rel="noreferrer"
          >
            evals/
          </a>
        </p>
      </section>
    </div>
  );
}
