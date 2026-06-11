"""
The ONE retrieval function — shared by the agent tool (tools.search_text) and
the eval (evaluate_ragas.retrieve), so the thing being measured is exactly the
thing being shipped. Before this module they were separate implementations that
could drift apart; that drift is how evals silently stop meaning anything.

v1-hybrid = three ideas stacked on the v0 pure-vector search:

1. **Full-text search (FTS) alongside vector search.** Embeddings capture
   meaning but are nearly blind to exact tokens — invoice numbers, item names,
   model codes ("Dell Core 2 Duo ... 4GB 500GB"). Measured at v0: 0/15 top-5
   hits for invoice-number questions. Postgres FTS is the lexical complement:
   it matches the exact tokens, including digit strings. We OR the question's
   words together (a question is not a phrase the document must contain) and
   let ts_rank order matches by how MANY terms each chunk hits.

2. **Reciprocal-rank fusion (RRF).** FTS scores (ts_rank) and vector scores
   (cosine) live on incomparable scales, so you can't average them. RRF sidesteps
   scales entirely by fusing on *positions*: each list contributes
   1/(RRF_K + rank) per chunk. A chunk near the top of either list scores well;
   a chunk on BOTH lists gets both contributions and floats to the top.
   RRF_K=60 is the standard damping constant from the original paper — it keeps
   rank 1 from dominating rank 5 too hard.

3. **A similarity floor.** Top-k vector search ALWAYS returns k chunks, however
   unrelated — that's where v0's "five invoices with no food on them" came from.
   The floor drops vector candidates below SIM_FLOOR cosine similarity unless
   FTS also matched them (a lexical match is independent evidence of relevance).
   Returning *fewer* than k — or nothing — is now possible, and honest:
   the answer model says "not found" instead of fabricating from noise.

4. **Exact-identifier pin.** If the question contains a long digit string and a
   chunk's invoice_number column EQUALS it, that chunk goes first, period. A key
   match is deterministic evidence no fuzzy score should outrank — the same
   reason production search engines boost exact keyword-field matches. Measured:
   pin lifts MRR 0.618 -> 0.940 (RRF alone leaves exact-id chunks at rank 2-3,
   because generic invoice words make many chunks match FTS weakly and chunks on
   both lists collect two RRF contributions).

SIM_FLOOR was calibrated on the eval set (see calibrate_floor.py): target-chunk
similarities vs non-target similarities for text-embedding-3-small on this
corpus. Embedding-similarity scales are model-specific — never copy a floor
from another model.

Variant shootout on the eval set (judge-free hit@5 / MRR, n=77):
    v0 pure vector        0.286 / 0.227   <- what the agent actually shipped
    hybrid RRF            0.974 / 0.618
    hybrid + exact pin    0.974 / 0.940   <- shipped
    FTS only              1.000 / 0.987   <- rejected: eval questions quote
                                             invoice tokens verbatim (lexical
                                             bias); paraphrased real queries
                                             still need the semantic side.
"""

import re

from db import get_conn, embed_query

RRF_K = 60        # standard RRF damping constant (Cormack et al.)
POOL = 20         # candidates pulled per retriever before fusion
# Calibrated on the eval set (calibrate_floor.py, 2026-06-11): keeps 100% of
# target chunks, trims only the junk tail. Measured caveat: target/non-target
# sims overlap heavily on this corpus (median 0.552 vs 0.517) — a cosine floor
# can't separate relevance here; that's the v2 reranker's job.
SIM_FLOOR = 0.40


def _or_query(question: str) -> str:
    """Turn a natural-language question into an OR'd websearch query.
    websearch_to_tsquery ANDs plain words — fine for documents, fatal for
    questions ("which vendor sold X?" would require 'vendor' AND 'sold' to
    appear in the chunk). OR-ing lets ts_rank reward chunks that match many
    terms without requiring all of them. Stopwords are dropped by Postgres."""
    terms = re.findall(r"[A-Za-z0-9]+", question)
    return " OR ".join(terms)


def retrieve(question: str, k: int = 5) -> list[tuple[str | None, str]]:
    """Hybrid retrieve -> [(invoice_number, content), ...], best first.
    May return FEWER than k results (or none): the floor drops chunks with no
    evidence of relevance instead of padding to k with noise."""
    qv = embed_query(question)
    with get_conn() as conn, conn.cursor() as cur:
        # Lexical list: GIN-indexed match on the generated tsvector column
        # (migrations/001_chunks_fts.sql), ranked by how many terms hit.
        cur.execute(
            """
            select invoice_number, content, ts_rank(content_tsv, q) as score
            from chunks, websearch_to_tsquery('english', %s) q
            where content_tsv @@ q
            order by score desc
            limit %s
            """,
            (_or_query(question), POOL),
        )
        fts = cur.fetchall()

        # Semantic list: cosine distance (<=>), converted to similarity so the
        # floor reads naturally (higher = more similar).
        cur.execute(
            """
            select invoice_number, content, 1 - (embedding <=> %s::vector) as sim
            from chunks
            order by embedding <=> %s::vector
            limit %s
            """,
            (qv, qv, POOL),
        )
        vect = cur.fetchall()

    # RRF fusion, keyed by content (chunks are one-per-invoice; content is unique).
    fused: dict[str, dict] = {}
    for rank, (inv, content, _score) in enumerate(fts, start=1):
        c = fused.setdefault(content, {"inv": inv, "rrf": 0.0, "fts": False, "sim": None})
        c["rrf"] += 1.0 / (RRF_K + rank)
        c["fts"] = True
    for rank, (inv, content, sim) in enumerate(vect, start=1):
        c = fused.setdefault(content, {"inv": inv, "rrf": 0.0, "fts": False, "sim": None})
        c["rrf"] += 1.0 / (RRF_K + rank)
        c["sim"] = float(sim)

    # The floor: vector-only candidates must clear SIM_FLOOR; an FTS match is
    # independent lexical evidence, so those stay regardless of similarity.
    survivors = [
        (c["inv"], content)
        for content, c in sorted(fused.items(), key=lambda kv: kv[1]["rrf"], reverse=True)
        if c["fts"] or (c["sim"] is not None and c["sim"] >= SIM_FLOOR)
    ]

    # The pin: an exact invoice_number match outranks every fuzzy score.
    ids = set(re.findall(r"\b\d{4,}\b", question))
    if ids:
        survivors = ([s for s in survivors if s[0] in ids]
                     + [s for s in survivors if s[0] not in ids])
    return survivors[:k]
