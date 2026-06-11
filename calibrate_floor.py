"""
Calibrate retrieval.SIM_FLOOR from the eval set — never copy a similarity
threshold between embedding models; their scales differ.

For every eval question: embed, pull top-20 by cosine, split sims into
target-invoice vs non-target, print the distributions and what each candidate
floor would keep.

Result on this corpus (text-embedding-3-small, 150 one-chunk-per-invoice
summaries, 2026-06-11):

    TARGET    : min=0.443  median=0.552  max=0.698
    NON-TARGET: min=0.344  median=0.517  max=0.682

The distributions OVERLAP almost completely — invoice summaries are
near-identical in shape, so cosine similarity cannot cleanly separate "the
right invoice" from "any invoice". A floor of 0.40 keeps 100% of targets and
trims only the junk tail (~0.7% of non-targets). That is the calibrated
choice — and the measured proof that bi-encoder scores aren't a relevance
oracle here, which is exactly what the v2 cross-encoder reranker is for.

    python calibrate_floor.py
"""

import json

from db import get_conn, embed_query


def main():
    rows = json.load(open("eval_set.json"))
    tgt, non = [], []
    with get_conn() as conn, conn.cursor() as cur:
        for r in rows:
            qv = embed_query(r["question"])
            cur.execute(
                """select invoice_number, 1 - (embedding <=> %s::vector)
                   from chunks order by embedding <=> %s::vector limit 20""",
                (qv, qv),
            )
            targets = set(r["target_invoices"])
            for inv, sim in cur.fetchall():
                (tgt if inv in targets else non).append(float(sim))

    def desc(name, xs):
        xs = sorted(xs)
        pct = lambda p: xs[int(p * (len(xs) - 1))]
        print(f"{name}: n={len(xs)} min={xs[0]:.3f} p25={pct(.25):.3f} "
              f"median={pct(.5):.3f} p75={pct(.75):.3f} max={xs[-1]:.3f}")

    desc("TARGET    ", tgt)
    desc("NON-TARGET", non)
    for floor in (0.30, 0.35, 0.40, 0.45, 0.50):
        print(f"floor={floor:.2f}: keeps {sum(s >= floor for s in tgt)/len(tgt):.1%} of targets, "
              f"{sum(s >= floor for s in non)/len(non):.1%} of non-targets")


if __name__ == "__main__":
    main()
