import AskBox from "@/components/AskBox";
import BeforeAfter from "@/components/BeforeAfter";
import DocsGallery from "@/components/DocsGallery";
import { loadReplaySets } from "@/lib/data";

export const metadata = { title: "Live demo — Invoice-Agent" };

export default function DemoPage() {
  const replaySets = loadReplaySets();
  const baseline = replaySets[0];
  const suggestions = baseline?.items.map((it) => it.question).slice(0, 5) ?? [];

  return (
    <div className="space-y-12">
      <section className="space-y-3 pt-4">
        <div className="fade-up kicker">Live system</div>
        <h1 className="fade-up font-display text-3xl font-bold text-mist-100">Live playground</h1>
        <p className="fade-up max-w-2xl text-sm text-mist-400" style={{ animationDelay: "120ms" }}>
          Questions go to the real system: a LangGraph ReAct agent that picks between SQL lookups,
          vector search, and a consistency check over the ingested corpus. Expand the trace to see
          every tool call it made — the UI shows answers with sources, never a mock.
        </p>
        <AskBox suggestions={suggestions} />
      </section>

      {baseline && (
        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold text-mist-100">Before / after</h2>
          <p className="max-w-2xl text-sm text-mist-400">
            Left: the agent&apos;s answer recorded at <span className="font-mono">{baseline.version}</span>{" "}
            — frozen JSON, warts and all. Right: the same question against the current system.
            As improvement chapters ship, the gap is the product.
          </p>
          <BeforeAfter replaySet={baseline} />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold text-mist-100">The corpus</h2>
        <DocsGallery />
      </section>
    </div>
  );
}
