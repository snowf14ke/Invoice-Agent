-- v1-hybrid: full-text search over chunks.
--
-- WHY: embeddings are nearly blind to exact tokens (invoice numbers, item/model
-- names) — measured 0/15 top-5 hits for "invoice 53737787"-style questions at
-- v0. Postgres full-text search (FTS) is the lexical complement: it indexes
-- every word AND every digit-string as a token, so exact identifiers match.
--
-- HOW: a GENERATED column means Postgres computes the tsvector itself on every
-- insert/update — application code can never forget to maintain it. STORED
-- materializes it on disk so the GIN index can be built over it.
--   to_tsvector('english', content)  -> lowercases, strips stopwords, stems
--   ("computers" -> "comput"), and keeps numbers ("61356291") as-is.
--
-- Apply with: python apply_migration.py migrations/001_chunks_fts.sql
-- (also folded into schema.sql so fresh installs get it for free)

ALTER TABLE chunks
    ADD COLUMN IF NOT EXISTS content_tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

-- GIN = inverted index (token -> rows containing it), the standard index type
-- for tsvector. Makes `content_tsv @@ query` fast even on large tables.
CREATE INDEX IF NOT EXISTS chunks_content_tsv_gin
    ON chunks USING gin (content_tsv);
