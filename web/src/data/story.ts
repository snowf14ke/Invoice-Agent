// The storyboard narrative. Editorial content lives here; all NUMBERS are pulled
// from the eval snapshots (src/data/evals/*.json) by version key, so the prose
// can never disagree with the measurements.

export type Highlight = {
  label: string;
  /** per_type key in the snapshot, or null to read from headline */
  type: string | null;
  /** metric key: faithfulness | answer_correctness | context_recall | hit@5 | rr */
  metric: string;
};

export type Chapter = {
  id: string;
  status: "shipped" | "lesson" | "planned";
  /** snapshot version this chapter's numbers come from (shipped only) */
  version?: string;
  tag?: string;
  title: string;
  problem: string;
  diagnosis?: string;
  fix?: string;
  /** a question from the replay set to feature as evidence */
  replayQuestion?: string;
  highlights?: Highlight[];
};

export const chapters: Chapter[] = [
  {
    id: "v0",
    status: "shipped",
    version: "v0-baseline",
    tag: "v0-baseline",
    title: "v0 — the baseline works end to end, and the eval shows exactly where it's weak",
    problem:
      '"How much did we spend on food?" came back citing five invoices with no food on them. ' +
      "The pipeline ran end to end, but top-k vector search always returns k chunks — relevant or not.",
    diagnosis:
      "Froze a 77-question eval and measured: item-lookup questions find the right invoice 1 time " +
      "in 6, and category totals — answers spread over 14–27 invoices — are structurally " +
      "unanswerable by top-k retrieval.",
    fix:
      "None — that is the point of a baseline. Tag v0-baseline freezes the code, the eval set and " +
      "these numbers; every improvement below is measured against them.",
    replayQuestion: "How much did we spend on food and drinks in total?",
    highlights: [
      { label: "item-lookup hit@5", type: "item-lookup", metric: "hit@5" },
      { label: "category-spend correctness", type: "category-spend", metric: "answer_correctness" },
      { label: "overall faithfulness", type: null, metric: "faithfulness" },
    ],
  },
  {
    id: "judge-bias",
    status: "lesson",
    title: "Caught our own eval lying: self-judging bias",
    problem:
      "First scores looked great — answer-correctness 0.848. But the model grading the answers " +
      "(gpt-5.4-mini) was the same model writing them.",
    diagnosis:
      "Re-judged by an independent model (deepseek-v4-pro), the same answers scored ~0.74: " +
      "LLM judges systematically favor their own outputs.",
    fix:
      "Judge pinned to deepseek-v4-pro across every version, plus judge-free retrieval metrics " +
      "(hit@5 / MRR against known target invoices) — the cleanest numbers involve no LLM at all.",
  },
  {
    id: "v1",
    status: "shipped",
    version: "v1-hybrid",
    tag: "v1-hybrid",
    title: "v1 — hybrid retrieval: full-text + vector, fused, with a similarity floor",
    problem:
      "Embeddings are nearly blind to exact tokens — invoice numbers, item names, model codes. " +
      "The agent's real retrieval measured hit@5 0.286 (an eval-only fast-path had been hiding " +
      "that at 0.935 — the eval and the shipped code had drifted apart).",
    diagnosis:
      "Benchmarked four retrievers judge-free (hit@5 / MRR): pure vector 0.286 / 0.227 · " +
      "hybrid RRF 0.974 / 0.618 · hybrid + exact-id pin 0.974 / 0.940 · FTS-only 1.000 / 0.987 " +
      "— rejected, because eval questions quote invoice tokens verbatim; paraphrased real " +
      "queries still need the semantic side.",
    fix:
      "ONE shared retrieve() used by both the agent tool and the eval so they can never drift " +
      "again: Postgres full-text + vector search fused with reciprocal-rank fusion, a calibrated " +
      "similarity floor (drop junk instead of padding to k), and a deterministic pin for exact " +
      "invoice-number matches.",
    replayQuestion:
      'Which vendor sold the item "Dell Core 2 Duo Desktop Computer I Windows XP Pro I 4GB I 500GB"?',
    highlights: [
      { label: "item-lookup hit@5", type: "item-lookup", metric: "hit@5" },
      { label: "overall MRR", type: null, metric: "rr" },
      { label: "overall faithfulness", type: null, metric: "faithfulness" },
    ],
  },
];

/** The senior layers still ahead (project-brief phases 2–4) — rendered as a
 *  compact strip, not full chapters, until each ships with its own snapshot. */
export const roadmap: { title: string; note: string }[] = [
  {
    title: "v2 — cross-encoder reranker",
    note: "Cosine scores barely separate relevance here (target median 0.552 vs 0.517). Retrieve wide, rerank with a cross-encoder, keep only what it trusts.",
  },
  {
    title: "v3 — category aggregation",
    note: "Spending questions span ~27 invoices — no retriever fixes that. Classify line items at extraction time, answer with SQL aggregation.",
  },
  {
    title: "Provider fallback",
    note: "A second LLM provider behind the same Pydantic contracts, so an outage or quota hit degrades gracefully instead of stopping ingestion.",
  },
  {
    title: "Observability (Langfuse)",
    note: "Per-request traces, latency and cost for every extraction and agent answer.",
  },
  {
    title: "MCP server",
    note: "Lift the agent's three tools into a FastMCP server so any MCP client can query the corpus.",
  },
];
