import Link from "next/link";

import ArchDiagram from "@/components/ArchDiagram";
import ChapterCard from "@/components/ChapterCard";
import MetricBadge, { metricLabel } from "@/components/MetricBadge";
import { chapters } from "@/data/story";
import { latestSnapshot, loadReplaySets, loadSnapshots } from "@/lib/data";

export default function StoryPage() {
  const snapshots = loadSnapshots();
  const replays = loadReplaySets();
  const latest = latestSnapshot();

  return (
    <div className="space-y-14">
      {/* hero */}
      <section className="space-y-5 pt-4">
        <h1 className="max-w-3xl text-3xl font-bold leading-tight tracking-tight text-zinc-100 sm:text-4xl">
          A document-intelligence agent,{" "}
          <span className="text-emerald-400">measured honestly</span> — every improvement is a
          chapter with before/after numbers.
        </h1>
        <p className="max-w-2xl text-zinc-400">
          Invoices are OCR&apos;d on serverless GPU, extracted into typed fields, stored in
          Postgres + pgvector, and queried by a tool-calling agent. Quality is gated by a Ragas
          eval with an independent judge and judge-free retrieval metrics. This page is the
          storyboard: what was broken, how we knew, what the fix bought.
        </p>
        {latest && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {Object.entries(latest.headline).map(([k, v]) => (
              <MetricBadge key={k} label={metricLabel(k)} value={v} sublabel={latest.version} />
            ))}
          </div>
        )}
        <div className="flex gap-3">
          <Link
            href="/demo"
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 transition-colors hover:bg-emerald-400"
          >
            Try it live
          </Link>
          <Link
            href="/evals"
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-500"
          >
            See the eval receipts
          </Link>
        </div>
      </section>

      {/* architecture */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-zinc-100">How it works</h2>
        <ArchDiagram />
      </section>

      {/* storyboard */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-zinc-100">The storyboard</h2>
        <p className="max-w-2xl text-sm text-zinc-400">
          Each shipped chapter is frozen as a git tag plus an eval snapshot in{" "}
          <span className="font-mono text-zinc-300">evals/</span>. The numbers on the cards are
          read from those snapshots — the prose cannot drift from the measurements.
        </p>
        <div className="space-y-5">
          {chapters.map((c) => (
            <ChapterCard key={c.id} chapter={c} snapshots={snapshots} replays={replays} />
          ))}
        </div>
      </section>
    </div>
  );
}
