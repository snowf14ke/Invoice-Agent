-- Canonical schema for the OCR -> Supabase -> RAG pipeline.
-- Single source of truth: prepare_db.ipynb (ingest) and db.py/tools.py (agent) both target this.
-- Embeddings are OpenAI text-embedding-3-small => vector(1536).
-- Most columns are nullable on purpose: OCR/extraction can miss fields, and the
-- Pydantic models in schemas.py use Optional, so missing data stays NULL rather than failing.

CREATE EXTENSION IF NOT EXISTS vector;

DROP TABLE IF EXISTS chunks, line_items, documents CASCADE;

CREATE TABLE documents (
    id                SERIAL PRIMARY KEY,
    vendor            VARCHAR(255),          -- normalized seller name, for exact-match filtering
    seller            TEXT,                  -- full raw seller block
    buyer             TEXT,                  -- full raw client block
    doc_date          DATE,
    total_net_worth   NUMERIC(15,2),
    tax               NUMERIC(15,2),         -- summary VAT
    total_gross_worth NUMERIC(15,2),
    invoice_number    VARCHAR(100),
    image_url         TEXT,                  -- traceability to Supabase storage
    raw_ocr           TEXT,                  -- original OCR text, for re-extraction / eval
    source_id         VARCHAR(64),           -- e.g. "ds_42": which dataset image this came from
    created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE line_items (
    id               SERIAL PRIMARY KEY,
    document_id      INT REFERENCES documents(id) ON DELETE CASCADE,
    description      TEXT NOT NULL,
    quantity         INT,
    unit_price       NUMERIC(15,2),
    item_gross_worth NUMERIC(15,2)
);

CREATE TABLE chunks (
    id             SERIAL PRIMARY KEY,
    document_id    INT REFERENCES documents(id) ON DELETE CASCADE,
    invoice_number VARCHAR(100),
    content        TEXT NOT NULL,
    embedding      vector(1536),
    -- v1-hybrid: lexical complement to the embedding. GENERATED = Postgres
    -- maintains it on every write; indexes words AND digit-strings (invoice
    -- numbers), which embeddings are nearly blind to. See migrations/001.
    content_tsv    tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
);

-- Cosine HNSW index for fast nearest-neighbour at query time.
-- pgvector requires a fixed dimension on the column, which is why ingest and query
-- MUST use the same embedding model (1536).
CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw
    ON chunks USING hnsw (embedding vector_cosine_ops);

-- GIN inverted index over the tsvector — makes full-text @@ matches fast.
CREATE INDEX IF NOT EXISTS chunks_content_tsv_gin
    ON chunks USING gin (content_tsv);

-- Helps exact/aggregate vendor filters used by the agent's query_fields tool.
CREATE INDEX IF NOT EXISTS documents_vendor_idx ON documents (vendor);

-- One row per source image: stops the live demo from ingesting the same dataset image twice.
CREATE UNIQUE INDEX IF NOT EXISTS documents_source_id_uq
    ON documents (source_id) WHERE source_id IS NOT NULL;
