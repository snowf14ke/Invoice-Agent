# Invoice-Agent — a document-intelligence agent, measured honestly

A production-style document-intelligence pipeline: invoices/receipts are OCR'd on serverless GPU,
validated and extracted into typed fields, stored in Postgres + pgvector, and queried by a
tool-calling agent — with a Ragas eval harness gating quality in CI.

This repo is also a **storyboard**: every improvement is checkpointed with a git tag and an eval
snapshot in [`evals/`](evals/), so you can see exactly what each change bought — *"it was like
this, then after the fix it measured like that."*

```
              ┌── PaddleOCR-VL (RunPod serverless GPU) ──┐
 image  ──▶  upload to Supabase Storage ──▶ public URL ──▶ OCR text
                                                              │
                                                   instructor + LLM (Pydantic)
                                                              │
                                              ┌───────────────┴───────────────┐
                                        structured fields                 summary text
                                              │                               │
                                   documents + line_items            chunks.embedding (1536)
                                              └───────────────┬───────────────┘
                                                        Supabase Postgres
                                                              │
                                       LangGraph agent  ──▶  3 tools (SQL + vector + check)
                                                              │
                                                     Ragas eval (CI gate)
```

## Evaluation

Scores come from a fixed eval set built from the dataset's **clean ground truth** (never from OCR
text, so OCR noise can't pollute the answer key) and are judged by an **independent model**
(deepseek-v4-pro) — we caught our first eval inflating answer-correctness by letting the answering
model judge itself. Retrieval quality is additionally measured **judge-free** (hit@5 / MRR against
known target invoices).

| Version | faithfulness | answer-correctness | context-recall | hit@5 | MRR |
|---|---|---|---|---|---|
| v0-baseline | 0.844 | 0.741 | 0.779 | 0.935 | 0.935 |

The per-type breakdown is the roadmap. At v0: **item-lookup hit@5 = 0.167** (pure vector search
almost never finds an invoice from an item description — embeddings drown the item signal in 77
near-identical chunks) and **category-spend correctness = 0.08** ("how much did we spend on
carpets?" needs aggregation over ~27 invoices; top-5 retrieval structurally cannot answer it).
Other known weaknesses: no similarity floor (top-k always returns k chunks however irrelevant),
no reranker.

## Roadmap

1. **v1 — hybrid retrieval**: Postgres full-text + vector with reciprocal-rank fusion and a
   similarity floor, shared by the agent tool and the eval.
2. **v2 — reranker**: retrieve wide, cross-encoder rerank, threshold.
3. **v3 — category aggregation**: classified line items + a `sum_spending` tool (the real fix for
   spending-by-category questions).
4. **Web**: Next.js storyboard site (`web/`) with a live playground.

## Run it

```bash
pip install -r requirements.txt          # python 3.12 env
# .env: SUPABASE_URI, SUPABASE_SERVICE_KEY, OPEN_AI_API, DEEPSEEK_API_KEY, RUNPOD_API_KEY

python pipeline.py reset                 # apply schema.sql, wipe storage
# seed the DB: prepare_db.ipynb (calls pipeline.ingest_document per dataset image)
python agent_core.py                     # demo the ReAct loop
python evaluate_ragas.py --limit 8       # smoke eval; drop --limit for the full set
uvicorn main:app --reload --port 8000    # the API the web frontend calls
```

See [WALKTHROUGH.md](WALKTHROUGH.md) for how each piece works and
[project-brief.md](project-brief.md) for the goals and locked design decisions.
