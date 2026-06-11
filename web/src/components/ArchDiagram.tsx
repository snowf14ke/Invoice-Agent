function Box({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-center">
      <div className="text-sm font-medium text-zinc-100">{title}</div>
      <div className="mt-0.5 text-xs text-zinc-400">{sub}</div>
    </div>
  );
}

function Arrow() {
  return <div className="select-none text-zinc-600">→</div>;
}

export default function ArchDiagram() {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Box title="Document image" sub="invoices / receipts" />
        <Arrow />
        <Box title="PaddleOCR-VL" sub="RunPod serverless GPU" />
        <Arrow />
        <Box title="Typed extraction" sub="instructor + Pydantic" />
        <Arrow />
        <Box title="Supabase Postgres" sub="fields + line items + pgvector chunks" />
      </div>
      <div className="my-3 text-center text-zinc-600">↓</div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Box title="LangGraph agent" sub="ReAct loop" />
        <Arrow />
        <Box title="3 tools" sub="SQL · vector search · consistency check" />
        <Arrow />
        <Box title="Answer + sources" sub="served by FastAPI" />
      </div>
      <div className="mt-4 border-t border-dashed border-zinc-800 pt-3 text-center text-xs text-zinc-500">
        Cross-cutting: Ragas eval + judge-free retrieval metrics, frozen per version in{" "}
        <span className="font-mono">evals/</span> and gated in CI
      </div>
    </div>
  );
}
