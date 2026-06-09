"""
Database + embedding helpers.

One home for the Supabase connection and the OpenAI embedding model, so the tools
stay clean.

Connection: set SUPABASE_URI (or DATABASE_URL) to your Supabase connection string, e.g.
    postgresql://postgres.<ref>:<password>@aws-1-<region>.pooler.supabase.com:5432/postgres
Get it from Supabase: Project Settings -> Database -> Connection string -> URI.
If you hit an SSL error, append '?sslmode=require'.

Embeddings: OpenAI text-embedding-3-small => 1536-dim. The SAME model is used at ingest
time (prepare_db.ipynb) and at query time here. They MUST match the vector(1536) column
in schema.sql, or pgvector retrieval breaks. OpenAI embeddings are symmetric, so queries
and documents are embedded identically (no e5-style instruction prefix).
"""

import os
import functools

import psycopg
from pgvector.psycopg import register_vector
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

EMBED_MODEL = "text-embedding-3-small"   # 1536 dims; matches vector(1536) in schema.sql


def _db_url() -> str:
    url = os.getenv("SUPABASE_URI") or os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("Set SUPABASE_URI (or DATABASE_URL) to your Supabase connection string.")
    return url


def get_conn():
    """Open a Supabase/Postgres connection with the pgvector type registered.
    register_vector is what lets you pass a plain Python list into a vector
    column (and read one back) without manual string formatting."""
    conn = psycopg.connect(_db_url())
    register_vector(conn)
    return conn


@functools.lru_cache(maxsize=1)
def _client() -> OpenAI:
    return OpenAI(api_key=os.getenv("OPEN_AI_API") or os.getenv("OPENAI_API_KEY"))


def _embed(text: str) -> list[float]:
    resp = _client().embeddings.create(model=EMBED_MODEL, input=text)
    return resp.data[0].embedding   # list[float], len 1536


# Queries and documents are embedded the same way (OpenAI embeddings are symmetric).
# Both helpers are kept so tools.py / ingest.py read intuitively.
def embed_query(text: str) -> list[float]:
    return _embed(text)


def embed_document(text: str) -> list[float]:
    return _embed(text)
