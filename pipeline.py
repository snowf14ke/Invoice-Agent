"""
The ingestion pipeline: turn one document image into DB rows.

    image (PIL) -> Supabase Storage (public URL)
                -> RunPod PaddleOCR (text)
                -> instructor + Pydantic (structured fields)
                -> Postgres: documents + line_items + chunks(embedding)

This is the SINGLE place that logic lives — the notebook seeder and the FastAPI
backend (main.py) both call `ingest_document`, so they can never drift.

Reused from elsewhere: db.get_conn / db.embed_document (same OpenAI 1536 model as the
agent's query side), schemas.Invoice / schemas.normalize_date.

CLI:
    python pipeline.py reset     # wipe DB tables + Storage images, reapply schema.sql
"""

import io
import os
import time
import functools

import requests
import instructor
from openai import OpenAI
from supabase import create_client
from urllib.parse import urlparse
from dotenv import load_dotenv

import psycopg
from pgvector.psycopg import register_vector

from db import get_conn, embed_document
from schemas import Invoice, normalize_date

load_dotenv()

EXTRACT_MODEL = os.getenv("EXTRACT_MODEL", "gpt-5.4-mini")
OCR_ENDPOINT_NAME = os.getenv("OCR_ENDPOINT_NAME", "ocr")
BUCKET = "invoices"


# ---------- lazy clients (built once) -----------------------------------------
@functools.lru_cache(maxsize=1)
def _storage():
    url = os.getenv("SUPABASE_PROJECT_URL")
    if not url:
        ref = (urlparse(os.environ["SUPABASE_URI"]).username or "").split(".", 1)[1]
        url = f"https://{ref}.supabase.co"
    sb = create_client(url, os.environ["SUPABASE_SERVICE_KEY"])
    try:
        sb.storage.create_bucket(BUCKET, options={"public": True})
    except Exception:
        pass   # already exists
    return sb


@functools.lru_cache(maxsize=1)
def _extractor():
    return instructor.from_openai(OpenAI(api_key=os.getenv("OPEN_AI_API")))


@functools.lru_cache(maxsize=1)
def _ocr_url():
    headers = {"Authorization": f"Bearer {os.getenv('RUNPOD_API_KEY')}"}
    r = requests.get("https://rest.runpod.io/v1/endpoints", headers=headers, timeout=30)
    r.raise_for_status()
    for ep in r.json():
        if ep["name"] == OCR_ENDPOINT_NAME:
            return f"https://api.runpod.ai/v2/{ep['id']}/runsync"
    raise RuntimeError(f"RunPod endpoint {OCR_ENDPOINT_NAME!r} not found")


# ---------- the three steps ---------------------------------------------------
def upload(image, name: str) -> str:
    """Resize + upload a PIL image, return its public URL (the OCR endpoint needs a URL)."""
    image = image.convert("RGB")
    image.thumbnail((1280, 1280))                      # under the OCR ~1MP cap; small storage
    buf = io.BytesIO(); image.save(buf, format="JPEG", quality=90)
    key = f"images/{name}"
    sb = _storage()
    sb.storage.from_(BUCKET).upload(key, buf.getvalue(),
                                    {"content-type": "image/jpeg", "upsert": "true"})
    return sb.storage.from_(BUCKET).get_public_url(key)


def ocr(image_url: str, max_new_tokens: int = 1024) -> str:
    """Ask the endpoint to download the URL and return recognized text.

    runsync can return before the job finishes (e.g. a cold-started worker), so poll
    /status/{id} until it completes. Raises instead of returning None/empty: a silent
    empty OCR result would flow into extraction and produce a garbage DB row."""
    headers = {"Authorization": f"Bearer {os.getenv('RUNPOD_API_KEY')}", "Content-Type": "application/json"}
    payload = {"input": {"image": image_url, "task": "ocr", "max_new_tokens": max_new_tokens}}
    r = requests.post(_ocr_url(), headers=headers, json=payload, timeout=300)
    r.raise_for_status()
    body = r.json()

    deadline = time.time() + 300
    while body.get("status") in ("IN_QUEUE", "IN_PROGRESS"):
        if time.time() > deadline:
            raise TimeoutError(f"OCR job {body.get('id')} still {body['status']} after 300s")
        time.sleep(3)
        status_url = _ocr_url().replace("/runsync", f"/status/{body['id']}")
        r = requests.get(status_url, headers=headers, timeout=30)
        r.raise_for_status()
        body = r.json()

    if body.get("status") not in (None, "COMPLETED"):
        raise RuntimeError(f"OCR job failed: {str(body)[:300]}")
    out = body.get("output", body)
    text = out.get("result") if isinstance(out, dict) else out
    if not text or not str(text).strip():
        raise RuntimeError(f"OCR returned no text for {image_url}: {str(body)[:300]}")
    return text


def extract(ocr_text: str) -> Invoice:
    """OCR text -> validated Pydantic Invoice (lenient schema: receipts leave fields null)."""
    return _extractor().chat.completions.create(
        model=EXTRACT_MODEL, response_model=Invoice,
        messages=[{"role": "user",
                   "content": f"Extract the invoice/receipt fields from this OCR text ):\n\n{ocr_text}"}],
    )


def insert(inv: Invoice, raw_ocr: str, image_url: str | None, source_id: str | None) -> dict:
    """Write one extracted document to documents + line_items + chunks. Returns a summary."""
    h, s, items = inv.header, inv.summary, inv.items
    vendor = (h.seller or "").split("\n")[0].strip() or None
    good_items = [li for li in items if li.item_desc]
    content = (
        f"Invoice {h.invoice_no} dated {h.invoice_date} from {h.seller} to {h.client}. "
        f"Net {s.total_net_worth}, VAT {s.total_vat}, gross {s.total_gross_worth}. "
        "Items: " + "; ".join(
            f"{li.item_desc} x{li.item_qty} @ {li.item_net_price} = {li.item_gross_worth}"
            for li in good_items)
    )
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """INSERT INTO documents
               (vendor, seller, buyer, doc_date, total_net_worth, tax,
                total_gross_worth, invoice_number, image_url, raw_ocr, source_id)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
            (vendor, h.seller, h.client, normalize_date(h.invoice_date),
             s.total_net_worth, s.total_vat, s.total_gross_worth,
             h.invoice_no, image_url, raw_ocr, source_id),
        )
        doc_id = cur.fetchone()[0]
        if good_items:
            cur.executemany(
                """INSERT INTO line_items (document_id, description, quantity, unit_price, item_gross_worth)
                   VALUES (%s,%s,%s,%s,%s)""",
                [(doc_id, li.item_desc, li.item_qty, li.item_net_price, li.item_gross_worth)
                 for li in good_items],
            )
        cur.execute(
            "INSERT INTO chunks (document_id, invoice_number, content, embedding) VALUES (%s,%s,%s,%s)",
            (doc_id, h.invoice_no, content, embed_document(content)),
        )
        conn.commit()
    return {
        "doc_id": doc_id,
        "invoice_number": h.invoice_no,
        "vendor": vendor,
        "total_gross_worth": float(s.total_gross_worth) if s.total_gross_worth is not None else None,
        "n_items": len(good_items),
        "image_url": image_url,
    }


def ingest_document(image, source_id: str | None = None) -> dict:
    """Full pipeline for one image: upload -> OCR -> extract -> insert. Returns a summary."""
    name = f"{source_id or 'doc'}.jpg"
    image_url = upload(image, name)
    text = ocr(image_url)
    inv = extract(text)
    return insert(inv, raw_ocr=text, image_url=image_url, source_id=source_id)


# ---------- maintenance -------------------------------------------------------
def apply_schema() -> None:
    """Run schema.sql (drops + recreates documents/line_items/chunks)."""
    with open(os.path.join(os.path.dirname(__file__), "schema.sql")) as f:
        sql = f.read()
    conn = psycopg.connect(os.getenv("SUPABASE_URI") or os.environ["DATABASE_URL"])
    with conn.cursor() as cur:
        cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
    conn.commit()
    register_vector(conn)
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()
    conn.close()


def clear_storage() -> int:
    """Delete every uploaded image from the bucket. Returns how many were removed.
    list() pages at 100 names per call, so loop until the folder comes back empty."""
    sb = _storage()
    removed = 0
    while True:
        files = sb.storage.from_(BUCKET).list("images", {"limit": 100})
        keys = [f"images/{f['name']}" for f in files]
        if not keys:
            return removed
        sb.storage.from_(BUCKET).remove(keys)
        removed += len(keys)


def reset() -> None:
    """Clean slate: wipe Storage images and recreate the DB tables."""
    n = clear_storage()
    apply_schema()
    print(f"reset done: removed {n} storage objects, reapplied schema.sql")


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "reset":
        reset()
    else:
        print("usage: python pipeline.py reset")
