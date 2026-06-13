// Shapes of the JSON artifacts the Python side produces.

/** evals/extraction-models.json — written by evaluate_extraction.py --save */
export type ExtractionComparison = {
  kind: "extraction-models";
  date: string;
  n_docs: number;
  pricing_note: string;
  models: {
    model: string;
    overall_accuracy: number;
    per_field: Record<string, number>;
    ocr_miss: number;
    ext_miss: number;
    extract_failures: number;
    prompt_tokens: number;
    completion_tokens: number;
    usd_per_1k_docs: number | null;
  }[];
};

/** evals/vN-*.json — written by evaluate_ragas.py --save */
export type Snapshot = {
  version: string;
  git: string;
  date: string;
  answer_model: string;
  judge_model: string;
  n_questions: number;
  /** faithfulness, answer_correctness, context_recall, "hit@5", rr */
  headline: Record<string, number>;
  per_type: Record<string, Record<string, number>>;
  per_question: {
    question: string;
    type: string;
    ground_truth: string;
    answer: string;
    rank: number | null;
    faithfulness: number | null;
    answer_correctness: number | null;
    context_recall: number | null;
  }[];
};

export type TraceStep = {
  tool: string;
  args: Record<string, unknown>;
  result: string;
};

/** evals/replays/vN-*.json — written by record_replays.py */
export type ReplaySet = {
  version: string;
  date: string;
  agent_model: string;
  items: {
    question: string;
    answer: string;
    trace: TraceStep[];
    sources: string[];
  }[];
};

/** POST /ask response (agent_core.answer) */
export type AskResponse = {
  answer: string;
  trace: TraceStep[];
  sources: string[];
};

/** GET /documents rows */
export type DocumentRow = {
  id: number;
  invoice_number: string | null;
  vendor: string | null;
  total_gross_worth: number | null;
  doc_date: string | null;
  image_url: string | null;
  source_id: string | null;
};
