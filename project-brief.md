# Document-Intelligence Agent — Project Brief & Build Plan

> Development reference. Drop this into the repo root (e.g. as `CLAUDE.md`) or paste as context.
> It records the goal, architecture, locked-in decisions, and known gotchas so choices stay
> consistent across the build. When in doubt, prefer the decision recorded here.

---

## 1. Goal

A **flagship portfolio project** to land remote / freelance AI-engineering work at a senior rate.
The code working is the *baseline*; the actual point is to **broadcast senior production signals** —
rigorous evaluation, observability, cost-awareness, reliability — and to differentiate via production
rigor plus the builder's edge (document/OCR depth, model compression).

Targets in-demand 2026 keywords: **RAG, agentic tool-calling, evals, LLMOps, MCP**.
Optimize for **deployed + evaluated + documented**, not feature count. **Restraint beats complexity.**

## 2. What it does

Upload documents (invoices and receipts — scanned PDFs or images). The system OCRs them, validates,
extracts structured fields, and stores them. An **agent** then answers questions over the whole corpus
— precise lookups, semantic search, aggregates, and consistency checks (e.g. "do the line items sum to
the stated total?") — and flags inconsistencies. Quality is measured by an eval harness gated in CI.

## 3. Architecture & data flow

**Ingestion (per document, one-time):**
image/PDF → OCR (PaddleOCR-VL) → validation (deterministic functions) → field extraction
(`instructor` + LLM) → store structured fields in Postgres + chunk & embed text into pgvector.

**Query (per user question):**
question → LangGraph agent → picks tool(s) → answers with sources.
- `query_fields` → raw SQL on the structured table (precise / aggregate questions)
- `search_text` → pgvector cosine similarity (fuzzy / content questions)
- `check_consistency` → SQL aggregate (line-item sum vs stated total)

**Cross-cutting:** eval harness (offline + CI), observability (tracing / latency / cost), provider fallback.

**Where things run:**
- GPU inference (OCR; optionally embeddings) → **RunPod serverless** (stateless, scale-to-zero)
- Orchestrator + agent + API → **Python / FastAPI** on a cheap always-on host (Fly.io / Render)
- Data → **Supabase** (managed Postgres + pgvector)
- Frontend → **Gradio** first, then **Next.js on Vercel**
- Do NOT put the agent / API on GPU serverless — it mostly waits on LLM calls (GPU wasted) and serverless is ephemeral.

## 4. Tech stack (with rationale / guardrails)

- **Back end:** Python + FastAPI. The agent is Python (LangGraph), so the back end is Python — non-negotiable.
- **Agent framework:** LangGraph. Build the ReAct loop explicitly (agent node + `ToolNode` + `tools_condition`), not a black-box helper. **One agent + a few tools — no multi-agent sprawl.**
- **Extraction:** `instructor` + Pydantic — the LLM reads OCR text and returns a typed `Document` object. Generalizes across layouts. **Do NOT do regex-only extraction** (brittle across vendors). A regex/template fast-path is allowed only as a *documented cost optimization* with the LLM as fallback.
- **LLM:** Gemini 2.5 Flash (cheap). **Disable "thinking" for extraction** — it's mechanical; thinking tokens are wasted cost/latency. Add provider fallback later.
- **OCR:** PaddleOCR-VL (vision-language). Resize images to ~1024–1280px long edge (model caps ~1 MP for OCR anyway). LLM/VLM fallback for low-confidence docs.
- **Data:** Supabase = managed Postgres + pgvector. Connect from Python with **psycopg + the session-pooler connection string**. **Do NOT use the supabase-py client** (HTTP/PostgREST, can't do vector search cleanly). **Do NOT add RLS** — the back end is trusted server-side code; the security boundary is the API.
- **Embeddings:** `intfloat/multilingual-e5-large-instruct`, run locally (free, multilingual). **1024-dim.** Mind the query/document prefix asymmetry (queries get the instruct prefix; documents are plain). Normalize → cosine.
- **Eval:** RAGAS / DeepEval golden set (~100 stratified, diverse docs; reuse the dataset's ground truth). Metrics: extraction field precision/recall, RAG faithfulness/relevance; LLM-as-judge for open answers; gate in GitHub Actions. **Offline / CI only — NOT shown live on the product UI.**
- **Observability:** Langfuse (open-source) — traces, latency, cost.
- **MCP (later):** lift the agent's tools into a **FastMCP** server, connect via `langchain-mcp-adapters`. Differentiator; do it AFTER inline tools work.
- **Frontend:** Gradio (MVP, fast) → Next.js on Vercel (polished). The frontend calls the Python API; it does not run the agent.

## 5. Key decisions (locked in)

- **Domain:** invoices + receipts. Chosen for **crisp ground truth → clean, objective eval** (the eval is the main selling point; fuzzy domains like news/legal were rejected for this reason).
- **Data model:** ONE unified `documents` table with a `doc_type` (`"invoice"` | `"receipt"`) discriminator and type-specific fields optional; `line_items` as a separate one-to-many table; `chunks` for embeddings. One Pydantic `Document` model — **not two pipelines.** Vector column `vector(1024)`, HNSW index, cosine ops.
- **Dataset:** `mychen76/invoices-and-receipts_ocr_v1`. ~100–200 stratified for the corpus; ~100 labeled for eval (use built-in ground truth if present). **Don't process the whole set** — wasted GPU time; curate for diversity (vendors, layouts, both types, hard cases).
- **Cost model:** extraction is **one-time per document** (scales with ingestion volume, NOT DB size; queries are free SQL). Cheap model + batch + prompt caching; a small fine-tuned extractor is an optional cheap tier for later.

## 6. Build phases & current status

**Order — ship a thin end-to-end slice first, then layer up:**
1. **Thin slice, deployed:** upload → OCR → extract a few fields → basic Q&A → live URL (Gradio). Ugly is fine; must be whole and online.
2. **Make it real:** hybrid retrieval (BM25 + dense) + reranking; LangGraph agent with the 3 tools; Pydantic validation throughout.
3. **Senior layers:** eval harness + CI gate; Langfuse observability; provider fallback. ← the rate-earning layer.
4. **Polish:** Next.js frontend; README with architecture + before/after metrics; 90s captioned demo video; MCP server; OCR fallback.

**Current status:**
- **Done** — LangGraph agent loop + tool interface working (stub tools verified).
- **Done** — Supabase schema (`documents`/`line_items`/`chunks`), `db.py`, `tools.py` (real SQL + pgvector), `ingest.py` scaffolded.
- **Done** — `instructor` extraction tested on a sample (date-validation bug fixed via before-validator).
- **In progress** — wiring the live Supabase connection (session-pooler psycopg string).
- **Todo** — full ingestion pipeline; hybrid retrieval + rerank; eval harness; observability; frontend; MCP; deployment.
- *Note:* the initial scaffold used an `invoices` table name; generalize to the unified `documents` table when adding receipts.

## 7. Conventions & gotchas (landmines hit / anticipated)

- **Dates:** `instructor` validates in **strict mode**; JSON returns dates as strings and strict Pydantic won't coerce `str → date`. Use a `@field_validator(..., mode="before")` that parses the string into a `date` (handle ISO + `MM/DD/YYYY` etc.). Applies to every date field.
- **Supabase connection:** direct connection is **IPv6-only** → use the **session pooler** string on IPv4 networks. Pooler username is `postgres.<project-ref>`. `DATABASE_URL` must start with `postgresql://` — NOT the `https://<ref>.supabase.co` API URL. Percent-encode special chars in the password.
- **e5 prefixes:** queries get `"Instruct: <task>\nQuery: <text>"`; stored passages are plain text. Mismatch silently degrades retrieval.
- **Validation vs tools:** file / OCR-quality checks are **deterministic pipeline functions, NOT agent tools.** Tools are reasoning-time only (search / query / consistency). The LLM proposes a tool call; your code runs it; a policy gate can refuse.
- **Two stores:** structured fields → relational tables (exact / aggregate queries); text chunks → pgvector (semantic search). **Don't put fields in the vector store.**
- **Schema-as-code:** production pattern is **Supabase CLI migrations** (`supabase/migrations/`, committed to git); `supabase db pull` captures existing dashboard schema as a baseline. Dashboard SQL editor is fine for learning.
- **Ingestion robustness:** wrap per-document extraction in `try/except`; route failures to a review queue — one bad doc shouldn't crash a batch.
- **Eval is offline / CI**, not a live per-answer score on the UI; the UI shows answers **with their sources**.

## 8. Non-goals (keep scope tight)

- No multi-agent system — one agent + tools.
- No auth / RLS (trusted server-side backend).
- No regex-only extraction; no over-engineered toggle UI before the pipeline works.
- No processing the full dataset; no chasing feature count over a deployed/evaluated/documented core.
- Public portfolio version stays domain-neutral (financial/document) — not political.

## 9. Positioning (for README & interviews)

**One-liner:** *"A production document-intelligence agent — RAG with hybrid retrieval, a tool-calling
agent with a policy gate, an eval harness gating CI, full tracing, and provider fallback."*

Lead with **outcomes and production maturity**, not framework names. War stories to surface: model
compression (600M → 45M), eval before/after (e.g. faithfulness X → Y after hybrid + rerank), the policy
gate, provider fallback, cost reasoning (~$/1k docs on Flash). Differentiators: **document/OCR depth,
model compression, rigorous evaluation.**
