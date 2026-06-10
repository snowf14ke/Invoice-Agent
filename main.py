"""
FastAPI backend for the document-intelligence agent.

Endpoints (what the Next.js frontend calls):
    GET  /health         -> {"ok": true}
    POST /demo/ingest    -> pick a dataset image NOT yet ingested, run the full
                            pipeline (OCR -> extract -> store), return its summary
    POST /ask            -> {"question": "..."} -> agent answer + sources
    GET  /documents      -> list ingested documents (for the UI)

Run:
    uvicorn main:app --reload --port 8000

The agent + DB do the heavy lifting; this file is just HTTP glue over pipeline.py
and agent_core.answer.
"""

import os
import random
import functools

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from db import get_conn
from pipeline import ingest_document
from agent_core import answer as agent_answer

# How many of the dataset's images the demo is allowed to draw from.
DEMO_POOL = int(os.getenv("DEMO_POOL", "300"))

app = FastAPI(title="Document Intelligence Agent")

# Allow the Next.js frontend to call us. Tighten allow_origins to your domain in prod.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@functools.lru_cache(maxsize=1)
def _dataset():
    from datasets import load_dataset
    return load_dataset("mychen76/invoices-and-receipts_ocr_v1")["train"]


class AskRequest(BaseModel):
    question: str


class IngestRequest(BaseModel):
    index: int | None = None   # specific dataset index, or None to pick a random unused one


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/demo/ingest")
def demo_ingest(req: IngestRequest | None = None):
    """Run one fresh document through the whole pipeline so a visitor can then query it."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("select source_id from documents where source_id is not null")
        used = {r[0] for r in cur.fetchall()}

    if req and req.index is not None:
        i = req.index
    else:
        choices = [j for j in range(DEMO_POOL) if f"ds_{j}" not in used]
        if not choices:
            raise HTTPException(409, "Demo pool exhausted — reset to free up images.")
        i = random.choice(choices)

    source_id = f"ds_{i}"
    if source_id in used:
        raise HTTPException(409, f"{source_id} already ingested.")

    try:
        return ingest_document(_dataset()[i]["image"], source_id=source_id)
    except Exception as e:
        raise HTTPException(502, f"ingest failed: {e}")


@app.post("/ask")
def ask(req: AskRequest):
    if not req.question.strip():
        raise HTTPException(400, "question is empty")
    return agent_answer(req.question)


@app.get("/documents")
def documents(limit: int = 50):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """select id, invoice_number, vendor, total_gross_worth, doc_date, image_url, source_id
               from documents order by created_at desc limit %s""",
            (limit,),
        )
        rows = cur.fetchall()
    return [
        {"id": r[0], "invoice_number": r[1], "vendor": r[2],
         "total_gross_worth": float(r[3]) if r[3] is not None else None,
         "doc_date": str(r[4]) if r[4] else None, "image_url": r[5], "source_id": r[6]}
        for r in rows
    ]
