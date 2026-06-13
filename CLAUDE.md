# Document Intelligence Pipeline

Invoice/receipt extraction: PaddleOCR-VL (RunPod serverless) → instructor + Pydantic structured extraction → Supabase (Postgres + pgvector) → LangGraph ReAct agent → RAGAS eval. FastAPI backend (`main.py`), Next.js frontend + portfolio site in `web/`.

## Commands
Python is ALWAYS the conda env `agent`: `/opt/anaconda3/envs/agent/bin/python` (plain `python` is the wrong interpreter).
- Run API locally: `/opt/anaconda3/envs/agent/bin/python -m uvicorn main:app --port 8000`
- RAGAS eval (smoke): `/opt/anaconda3/envs/agent/bin/python evaluate_ragas.py --limit 8`
- RAGAS eval (full): `/opt/anaconda3/envs/agent/bin/python evaluate_ragas.py`
- Extraction eval: `/opt/anaconda3/envs/agent/bin/python evaluate_extraction.py`
- DB migration: `/opt/anaconda3/envs/agent/bin/python apply_migration.py migrations/<file>.sql`
- Reset DB + storage (DESTRUCTIVE, ask first): `/opt/anaconda3/envs/agent/bin/python pipeline.py reset`
- Frontend: `cd web && npm run dev` (build check: `npm run build`)
- No pytest suite or mypy config yet — verification is the eval harnesses above.

## Hard conventions (learned from real bugs — do not violate)
- All line-item fields in Pydantic extraction models are Optional with None defaults. Real receipts omit fields; required fields cause validation failures on valid documents.
- All dates normalized to ISO 8601 (YYYY-MM-DD) at extraction time, before DB insert. Never store raw OCR date strings.
- Embeddings are LOCKED to OpenAI `text-embedding-3-small` (1536-dim) for BOTH ingest and query — must match the `vector(1536)` column.
- `retrieval.py` is THE shared retriever — the agent's search tool and evaluate_ragas both import it. Never fork retrieval logic into eval-only or agent-only paths (this divergence once hid a 0.286-vs-0.935 hit@5 gap).
- Ingest ONLY via `pipeline.ingest_document(pil_image, source_id)` — the notebook seeder and the API share it so they can't drift.
- psycopg3 params: add explicit casts — `::text`/`::numeric` on `%(p)s IS NULL` patterns (AmbiguousParameter) and `::vector` on `embedding <=> %s` (lists adapt as float8[]).
- OCR endpoint is URL-only: images must be uploaded to Supabase Storage (bucket `invoices`) first; `ocr/handler.py` does `requests.get(image)`.
- `schema.sql` is the single source of truth for the DB schema. DDL order: extensions (pgvector) → tables → indexes.

## Source of truth
- `project-brief.md` is user-authored intent; `specs/` defines INTENDED behavior per pipeline stage. Existing code is NOT evidence of intended behavior — when code contradicts a spec, the code is wrong. Never silently edit a spec to match code; spec changes are explicit decisions logged in plan.md.
- Bug reports, wrong behavior, and "should do X but does Y" follow the bugfix-protocol skill: failing test/repro first, stated root cause, no symptom patches.
- Before modifying any module, read its spec (if one exists) and check plan.md's "Known wrong implementations" — you may be about to build on top of diagnosed-wrong code.

## Workflow rules
- Non-trivial tasks: plan first (plan mode), get approval, then implement.
- Every implementation task ends with running the relevant verification command yourself and iterating until green. Do not report success without showing the passing output.
- Read `plan.md` at session start. Update it before the session ends: what was done, decisions made, what's next.
- Delegate per the user-level delegation policy: scout for exploration, docs-researcher for library APIs (LangGraph, instructor, RAGAS, PaddleOCR, Supabase APIs all move fast), db-inspector for schema/data questions, code-reviewer after changes.
- Never read large dataset files, OCR outputs, or eval result dumps directly into context. Use Bash (head/wc/jq) or delegate to scout for summaries.
- User is learning this stack (storage, OCR serving, embeddings, agents, eval) — when a step touches those, explain the why in 1-2 sentences, not just the what.

## Compact instructions
When summarizing this conversation:
- Preserve all schema changes, API contract changes, and their rationale
- Keep error messages and their solutions
- Maintain the list of modified files
- Summarize exploration attempts in one line each
