# Invoice RAG pipeline — how it works

OCR document images → extract structured fields → store in Postgres/pgvector (Supabase)
→ answer questions with a tool-using agent → measure quality with Ragas.

```
              ┌── PaddleOCR-VL (RunPod serverless GPU) ──┐
 image  ──▶  upload to Supabase Storage ──▶ public URL ──▶ OCR text
                                                              │
                                                   instructor + GPT (Pydantic)
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

This doc explains the parts that were added on top of your original `prepare_db` pipeline.

---

## 1. File upload to Supabase Storage (`pipeline.upload`)

**Why it's needed.** The deployed OCR endpoint (`ocr/handler.py`) only knows how to
**download an image from a URL** (`download_image_from_s3` → `requests.get(url)`). It can't
accept raw image bytes. So an image has to live at a public URL first.
Supabase Storage gives us that.

**The mental model.** Supabase Storage = S3-like object storage attached to your project.
- A **bucket** is a top-level folder (we use `invoices`). A *public* bucket means anyone with
  the URL can read the file — which is exactly what the OCR worker needs.
- The **service_role key** is an admin key that bypasses Row-Level-Security. Backend scripts use
  it; never ship it to a browser, never commit it. Get it from
  *Supabase dashboard → Project Settings → API → service_role*, then put it in `.env` as
  `SUPABASE_SERVICE_KEY`.
- `create_client(project_url, service_key)` opens the Storage API. `.upload(key, bytes)` puts a
  file; `.get_public_url(key)` returns its URL.

```python
sb = create_client(project_url, SUPABASE_SERVICE_KEY)
sb.storage.from_("invoices").upload("images/5.jpg", data, {"upsert": "true"})
url = sb.storage.from_("invoices").get_public_url("images/5.jpg")   # -> https://<ref>.supabase.co/...
```

`upsert: true` makes re-running safe (overwrite instead of "already exists" error).

---

## 2. Calling the OCR endpoint (`pipeline.ocr`)

RunPod **serverless** = your Docker container runs only when called, billed per second, scales
to zero when idle (`workers_min=0`). Two consequences:
- The endpoint **id** isn't fixed, so we look it up by name (`ocr`) via the RunPod REST
  API.
- The first call after idle is a **cold start**: it loads the ~multi-GB model onto a GPU, so it
  can take minutes. Later calls are fast.

`runsync` = "run and wait for the result" (vs `run` = async + webhook). The handler's return
value comes back wrapped under `"output"`:

```python
payload = {"input": {"image": url, "task": "ocr", "max_new_tokens": 1024}}
r = requests.post(f"https://api.runpod.ai/v2/{id}/runsync", headers=HEADERS, json=payload)
text = r.json()["output"]["result"]
```

Two gotchas `pipeline.ocr` handles for you: on a cold start `runsync` can return **before** the
job finishes (status `IN_QUEUE`/`IN_PROGRESS`), so it polls `/status/{id}` until completion; and
it **raises** on an empty result instead of returning None — a silent empty OCR would otherwise
flow into extraction and produce a garbage DB row.

---

## 3. Embeddings & pgvector (`db.py`, `schema.sql`)

An **embedding** turns text into a fixed-length vector so "closeness" = "similar meaning".
- We use OpenAI `text-embedding-3-small` → **1536 numbers**. The DB column is `vector(1536)`;
  these MUST match or pgvector errors. **The same model must embed both stored docs and the
  query** — mismatched models = garbage retrieval. (Your old code embedded docs with one model
  and queries with another — that was the main bug.)
- OpenAI embeddings are **symmetric**: queries and documents are embedded the same way. (Some
  models like e5/bge want an `"Instruct:"` prefix on queries only — that's why the old `db.py`
  had it; it's wrong for OpenAI, so it's gone.)
- `register_vector(conn)` teaches psycopg to send a Python list straight into a `vector` column.
- `embedding <=> query_vec` is pgvector's **cosine distance** (smaller = more similar). The
  `hnsw` index makes that search fast.

We store **one chunk per invoice**: a short natural-language summary of the whole invoice. That's
enough for invoice-level Q&A; if you later want line-item-level retrieval, store more chunks.

---

## 4. The agent (`agent_core.py`, `tools.py`)

A **ReAct agent** loops: the LLM looks at the conversation and either calls a tool or answers.
LangGraph wires that as a tiny graph: `agent → (tool? ) → tools → agent → … → done`.

The three tools are the **seam** between the model and your data — same names/signatures as the
old stubs, but the bodies now hit Supabase:
- `query_fields(vendor, min_total)` → exact SQL over `documents` (precise/aggregate questions).
- `search_text(query, k)` → vector search over `chunks` (fuzzy/content questions).
- `check_consistency(invoice_number)` → deterministic check: do line items sum to the total?

The model only *requests* a tool call (e.g. "call query_fields with vendor='Acme'"); your code
runs it and feeds the result back. The model never touches the DB directly.

---

## 5. Evaluation with Ragas (`evaluate_ragas.py`)

Ragas scores a RAG system on four columns: **question, contexts (retrieved), answer (generated),
ground_truth**. Metrics we use:
- **faithfulness** — is the answer supported by the retrieved context (not hallucinated)?
- **answer_correctness** — does the answer match ground_truth?
- **context_recall** — did retrieval surface the info needed to answer?

**The key design choice:** the stored/retrieved content is **OCR-noisy**, but the ground-truth
**answers come from the clean `parsed_data`** the dataset ships — never from the OCR text. If you
took answers from the OCR, an OCR error like `212.09 → 2I2.09` would become the "correct" answer
and your scores would be meaningless. By grounding answers in clean data you measure the real
question: *can the system recover the right value despite OCR noise?*

- `eval_set.json` is built by `build_eval_set.py` (the notebook's eval cell calls it) from the
  seeded documents' clean `parsed_data` (only documents that actually made it into the DB generate
  questions). Each row carries a `type` (gross-worth / seller / category-spend / item-lookup /
  line-item) and `target_invoices` — the invoice whose chunk retrieval must surface.
- `python evaluate_ragas.py` → runs each question through real retrieval + answer, scores, and
  **fails CI** if faithfulness drops below 0.8 (that's the gate `.github/workflows` can call).
  `--limit 8` runs a cheap smoke subset; `--save evals/vN-name.json` freezes a versioned snapshot.
- **The judge must be independent.** Our first run scored answer_correctness 0.848 — with
  gpt-5.4-mini judging its own answers. Re-judged by deepseek-v4-pro, the same system scored
  ~0.74: LLM judges systematically favor their own outputs (self-preference bias). The judge is
  now pinned to deepseek-v4-pro and must stay fixed across versions or deltas are meaningless.
- **Retrieval is also measured judge-free**: hit@5 / MRR computed deterministically from
  `target_invoices` — no LLM in the loop, so they are the cleanest before/after signal for
  retrieval changes.
- **Retrieval is hybrid, and the eval is why.** Pure vector search scored **0/15** top-5 hits on
  "invoice 53737787"-style questions: every chunk has the same shape ("Invoice N dated ... from X")
  so the only discriminating signal is the digit string, and embeddings are nearly blind to digits.
  `retrieve()` therefore does an exact `invoice_number` match first and fills the rest with vector
  search → 15/15. That measure→diagnose→fix loop is the whole point of having an eval.
- **v0-baseline (2026-06-10, 77 questions, deepseek-v4-pro judge):** faithfulness **0.844**,
  answer_correctness **0.741**, context_recall **0.779**, hit@5 **0.935**, MRR **0.935**. The
  per-type breakdown IS the roadmap: item-lookup hit@5 = **0.167** (pure vector search can't find
  an invoice from an item description → v1 hybrid full-text search), category-spend correctness =
  **0.08** (top-k retrieval can't aggregate over 14–27 invoices → category column + sum tool).
- `python evaluate_extraction.py --n 60 --models gpt-5.4-nano gpt-5.4-mini` → grades extraction
  field-by-field against `parsed_data` and attributes each error to OCR (value absent from the
  OCR text) vs the extractor (value present but mis-extracted).

---

## 6. Run order (end to end)

```bash
# 0. one-time
pip install -r requirements.txt
#    add SUPABASE_SERVICE_KEY=<service_role key> to .env

# 1. clean slate: wipe Storage images + recreate tables from schema.sql
python pipeline.py reset
# 2. (notebook) seeding cell: pipeline.ingest_document(ds[i].image, source_id=f"ds_{i}")
#    -> upload -> OCR -> extract -> documents/line_items/chunks, aligned by construction
# 3. (notebook) eval cell: build eval_set.json from the seeded docs' clean parsed_data
# 4. agent
python agent_core.py
# 5. eval
python evaluate_ragas.py
python evaluate_extraction.py --n 60
# 6. API (what the frontend calls; /demo/ingest runs the same pipeline)
uvicorn main:app --reload --port 8000
```

---

## 7. Is this portfolio-grade? What's left

**Strong already:** the *breadth* is well above a typical RAG demo — a deployed OCR microservice,
schema-validated extraction, a vector DB with a hybrid-ready schema, an agent with real tools, and
an eval harness with a CI gate. That range is the selling point.

**To make it reviewer-ready, finish these:**
1. **It must run end-to-end and reproducibly** — pinned deps, the schema applied, a populated DB.
   A portfolio project that doesn't run is worse than a smaller one that does.
2. **Show eval numbers.** Put the Ragas faithfulness/correctness/recall results (and ideally a
   retrieval metric like NDCG@k) in the README. Numbers are what make the claims credible.
3. **Move logic out of the notebook.** The notebook is a great *walkthrough*; the reusable logic
   should live in the `.py` modules (it now does). Keep the notebook as the narrated demo.
4. **A README with the diagram above + "why each choice".** Reviewers read the README, not the code.
5. **Roadmap items you already noted** (hybrid BM25 + reranker, answer caching) are great *stretch*
   bullets — they signal you know what "better" looks like even before you build it.

You don't need to learn more *before* it's portfolio-worthy — you need to (a) understand every
piece you ship (this doc is for that) and (b) get it running with numbers attached. The concepts
here (object storage, serverless GPU, embeddings, ReAct agents, RAG eval) are exactly the things
worth being able to explain in an interview, so learning them *is* the portfolio.
