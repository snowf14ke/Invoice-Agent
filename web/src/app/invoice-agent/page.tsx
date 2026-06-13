import Link from "next/link";

import ArchDiagram from "@/components/ArchDiagram";
import ChapterCard from "@/components/ChapterCard";
import MetricBadge, { metricLabel, scoreColor } from "@/components/MetricBadge";
import { Reveal } from "@/components/Motion";
import SectionHeader from "@/components/SectionHeader";
import { chapters, roadmap } from "@/data/story";
import {
  latestSnapshot,
  loadExtractionComparison,
  loadReplaySets,
  loadSnapshots,
} from "@/lib/data";

export const metadata = {
  title: "Invoice-Agent case study — Munkhtsetseg Davaadorj",
  description:
    "A document-intelligence agent measured honestly: OCR → typed extraction → Postgres/pgvector → tool-calling agent, every improvement a chapter with before/after numbers.",
};

export default function CaseStudyPage() {
  const snapshots = loadSnapshots();
  const replays = loadReplaySets();
  const latest = latestSnapshot();
  const extraction = loadExtractionComparison();

  return (
    <div className="space-y-16">
      {/* hero */}
      <section className="space-y-5 pt-4">
        <div className="fade-up flex items-center gap-3">
          <Link href="/" className="text-sm text-mist-500 transition-colors hover:text-mist-300">
            ← Portfolio
          </Link>
          <span className="kicker">Case study</span>
        </div>
        <h1 className="fade-up max-w-3xl font-display text-3xl leading-tight font-bold tracking-tight text-mist-100 sm:text-4xl">
          Invoice-Agent: a document-intelligence agent,{" "}
          <span className="bg-gradient-to-r from-azure-300 to-emerald-400 bg-clip-text text-transparent">
            measured honestly
          </span>
        </h1>
        <p className="fade-up max-w-2xl text-mist-400" style={{ animationDelay: "120ms" }}>
          Invoices are OCR&apos;d on serverless GPU, extracted into typed fields, stored in
          Postgres + pgvector, and answered by a tool-calling agent. Every improvement below is a
          chapter with before/after numbers read from a frozen eval snapshot.
        </p>
        {latest && (
          <div
            className="fade-up grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-ink-700 bg-ink-700 sm:grid-cols-5"
            style={{ animationDelay: "240ms" }}
          >
            {Object.entries(latest.headline).map(([k, v]) => (
              <MetricBadge key={k} label={metricLabel(k)} value={v} sublabel={latest.version} />
            ))}
          </div>
        )}
        <div className="fade-up flex flex-wrap gap-3" style={{ animationDelay: "360ms" }}>
          <Link
            href="/evals"
            className="rounded-lg bg-azure-500 px-4 py-2 text-sm font-semibold text-ink-950 transition-all hover:bg-azure-400 hover:shadow-[0_0_24px_rgb(92_165_247/0.35)]"
          >
            See the eval receipts
          </Link>
          <a
            href="https://github.com/snowf14ke/Invoice-Agent"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-ink-600 px-4 py-2 text-sm text-mist-300 transition-colors hover:border-azure-400/60 hover:text-mist-100"
          >
            Source on GitHub
          </a>
        </div>
      </section>

      {/* architecture */}
      <Reveal>
        <section className="space-y-6">
          <SectionHeader index="01" kicker="Architecture" title="How it works" />
          <ArchDiagram />
        </section>
      </Reveal>

      {/* storyboard */}
      <section className="space-y-6">
        <Reveal>
          <SectionHeader index="02" kicker="Versioned improvements" title="The storyboard" />
          <p className="mt-3 max-w-2xl text-sm text-mist-400">
            Each shipped chapter is frozen as a git tag plus an eval snapshot in{" "}
            <span className="font-mono text-mist-300">evals/</span> — the prose cannot drift from
            the measurements.
          </p>
        </Reveal>
        <div className="space-y-5">
          {chapters.map((c) => (
            <Reveal key={c.id}>
              <ChapterCard chapter={c} snapshots={snapshots} replays={replays} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* extraction model comparison + costs */}
      {extraction && (
        <Reveal>
          <section className="space-y-6">
            <SectionHeader
              index="03"
              kicker="Cost vs accuracy"
              title="Which extraction model is worth paying for?"
            />
            <p className="max-w-2xl text-sm text-mist-400">
              Same OCR text, same {extraction.n_docs} documents, graded field-by-field against
              clean ground truth — each error attributed to OCR (value absent from the OCR text)
              or to the extractor. Extraction runs once per document, so cost scales with
              ingestion, not corpus size.
            </p>
            <div className="panel overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-ink-700 bg-ink-900/70 text-left font-mono text-xs tracking-wide text-mist-500 uppercase">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">model</th>
                    <th className="px-4 py-2.5 font-medium">field accuracy</th>
                    <th className="px-4 py-2.5 font-medium">errors: OCR / extractor</th>
                    <th className="px-4 py-2.5 font-medium">$ per 1k docs</th>
                  </tr>
                </thead>
                <tbody>
                  {extraction.models.map((m) => (
                    <tr key={m.model} className="border-t border-ink-700/60 first:border-t-0">
                      <td className="px-4 py-2.5 font-mono text-mist-300">{m.model}</td>
                      <td className={`px-4 py-2.5 font-mono ${scoreColor(m.overall_accuracy)}`}>
                        {m.overall_accuracy.toFixed(3)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-mist-400">
                        {m.ocr_miss} / {m.ext_miss}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-mist-300">
                        {m.usd_per_1k_docs === null ? "—" : `$${m.usd_per_1k_docs.toFixed(2)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-mist-500">
              {extraction.pricing_note} · measured {extraction.date}
            </p>
          </section>
        </Reveal>
      )}

      {/* roadmap */}
      <Reveal>
        <section className="space-y-6">
          <SectionHeader index="04" kicker="What ships next" title="Next on the roadmap" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {roadmap.map((r, i) => (
              <div
                key={r.title}
                className="panel p-4 transition-colors duration-300 hover:border-azure-400/40"
              >
                <div className="font-mono text-[11px] text-mist-500">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="mt-1 text-sm font-semibold text-mist-200">{r.title}</div>
                <p className="mt-1.5 text-xs leading-relaxed text-mist-400">{r.note}</p>
              </div>
            ))}
          </div>
        </section>
      </Reveal>
    </div>
  );
}
