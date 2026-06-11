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
    title: "The baseline: end-to-end works — and the eval shows exactly where it's weak",
    problem:
      'Asking "how much did we spend on food?" attached five invoices with no food on them. ' +
      "The pipeline ran end to end (OCR → extraction → Postgres/pgvector → agent), but retrieval " +
      "had no notion of relevance: top-k vector search always returns k chunks, however unrelated.",
    diagnosis:
      "We extended the eval set with the question types that fail (category spending, item lookups) " +
      "and froze the measurement. Pure vector search finds an invoice from an item description " +
      "1 time in 6 — embeddings drown the item text in 150 near-identical invoice summaries — and " +
      "category totals are structurally unanswerable by top-k retrieval (the answer spans 14–27 invoices).",
    fix:
      "No fix yet — that is the point of a baseline. Tag v0-baseline freezes the code, the eval set, " +
      "and these numbers; every improvement below is measured against them.",
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
    title: "We caught our own eval lying: the self-judging bias",
    problem:
      "Our first scores looked great — answer-correctness 0.848. But the model grading the answers " +
      "(gpt-5.4-mini) was the same model writing them.",
    diagnosis:
      "Re-judged by an independent model (deepseek-v4-pro), the same answers scored ~0.74. " +
      "LLM judges systematically favor their own outputs — self-preference bias.",
    fix:
      "The judge is now pinned to deepseek-v4-pro, recorded in every snapshot, and never changes " +
      "between versions. Retrieval is additionally scored with judge-free metrics (hit@5 / MRR " +
      "against known target invoices) so the cleanest numbers involve no LLM at all.",
  },
  {
    id: "v1",
    status: "shipped",
    version: "v1-hybrid",
    tag: "v1-hybrid",
    title: "v1 — hybrid retrieval: full-text + vector, fused, with a similarity floor",
    problem:
      "Vector search is nearly blind to exact tokens: item names, invoice numbers, model codes. " +
      "Worse: the eval and the agent had drifted apart. The eval's retrieve() carried an " +
      "invoice-number fast-path the shipped agent tool never had — so the eval said hit@5 0.935 " +
      "while the agent's actual pure-vector retrieval measured 0.286.",
    diagnosis:
      "We benchmarked four retrievers on judge-free metrics before shipping any: pure vector " +
      "(hit@5 0.286 / MRR 0.227), hybrid RRF (0.974 / 0.618), hybrid + exact-id pin " +
      "(0.974 / 0.940), and full-text alone (1.000 / 0.987). FTS-only 'won' — and was rejected: " +
      "eval questions quote invoice tokens verbatim, so lexical search overfits this eval set; " +
      "paraphrased real queries still need the semantic side. We also calibrated the similarity " +
      "floor on the eval set and learned cosine scores barely separate relevance here " +
      "(target median 0.552 vs non-target 0.517) — chunks are too homogeneous. The floor only " +
      "trims the junk tail; honest separation needs a cross-encoder (v2).",
    fix:
      "ONE shared retrieve() in retrieval.py, used by both the agent tool and the eval so they " +
      "can no longer drift: Postgres full-text search (a generated tsvector column + GIN index) " +
      "and vector search fused with reciprocal-rank fusion, a calibrated similarity floor so " +
      "irrelevant chunks are dropped instead of always padding to k, and a deterministic pin for " +
      "exact invoice-number matches — a key match is evidence no fuzzy score should outrank.",
    replayQuestion:
      'Which vendor sold the item "Dell Core 2 Duo Desktop Computer I Windows XP Pro I 4GB I 500GB"?',
    highlights: [
      { label: "item-lookup hit@5", type: "item-lookup", metric: "hit@5" },
      { label: "overall MRR", type: null, metric: "rr" },
      { label: "overall faithfulness", type: null, metric: "faithfulness" },
    ],
  },
  {
    id: "v2",
    status: "planned",
    title: "v2 — reranker: retrieve wide, keep only what a cross-encoder trusts",
    problem:
      "Bi-encoder (embedding) scores are not calibrated — there is no honest threshold for " +
      "'relevant'. Measured during v1's floor calibration: target chunks score median 0.552 " +
      "cosine, non-targets 0.517 — the distributions overlap almost completely.",
    fix:
      "Retrieve top-30, rerank with a cross-encoder that reads query + chunk together, keep the " +
      "above-threshold top-5. Cross-encoder scores are calibrated enough to cut on.",
  },
  {
    id: "v3",
    status: "planned",
    title: "v3 — category aggregation: the real fix for spending questions",
    problem:
      '"How much did we spend on carpets?" has an answer spread over ~27 invoices. No retriever ' +
      "fixes that — top-k truncates the evidence before the model ever sees it.",
    fix:
      "Classify line items into categories at extraction time, then answer with SQL aggregation " +
      "via a sum_spending tool. Retrieval questions get retrieval; analytics questions get SQL.",
  },
];
