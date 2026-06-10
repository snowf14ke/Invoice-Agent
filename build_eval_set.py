"""
Build eval_set.json from the CLEAN parsed_data of the documents that actually made
it into the DB (a failed ingest must not generate questions nothing can answer).
Ground-truth answers come from parsed_data, NEVER the OCR text, so OCR errors can't
pollute the answer key. At eval time we retrieve over the noisy stored chunks.

Rows: {question, ground_truth, type, target_invoices}
  - type            -> per-category score breakdowns in evaluate_ragas.py
  - target_invoices -> the invoice number(s) whose chunk must be retrieved to answer;
                       enables judge-free retrieval metrics (hit@5 / MRR).

This set is FROZEN at the v0-baseline git tag: every later version (v1 hybrid, v2
reranker, ...) re-runs the exact same questions, so deltas are apples-to-apples.
It deliberately includes question types the baseline is known to fail (category
spending needs aggregation, not top-k retrieval) — the baseline snapshot must
contain the failure evidence, or there is no "before" story to improve on.

    python build_eval_set.py
"""

import ast
import json
import random

from datasets import load_dataset

from db import get_conn
from schemas import _money

# Keyword lists were chosen by surveying the corpus: "wine" is NOT alcohol here
# (it's wine glasses / racks), so it's excluded as ambiguous. Each category below
# matches item descriptions crisply.
CATEGORIES = {
    "dresses": ["dress"],
    "shoes": ["shoes", "sneaker", "sandal"],
    "Nintendo consoles and games": ["nintendo"],
    "desktop computers": ["desktop computer", "gaming pc", "gaming desktop"],
    "carpets and rugs": ["carpet", "rug"],
}


def safe_money(v):
    """_money, but None for unparseable values (parsed_data has e.g. 'each' in qty)."""
    try:
        return _money(v)
    except Exception:
        return None


def seller_name(raw: str) -> str:
    # parsed_data flattens "name\naddress" into one spaced string; the address part
    # starts at the first token containing a digit ("185 Stewart Mall..."). Keep just
    # the name — the stored chunks only mention the vendor name, so a ground truth
    # with the address would be unanswerable and tank context_recall.
    words = []
    for w in raw.split("\n")[0].split():
        if any(ch.isdigit() for ch in w):
            break
        words.append(w)
    return " ".join(words)


def load_parsed(ds, i):
    try:
        return ast.literal_eval(json.loads(ds[i]["parsed_data"])["json"])
    except Exception:
        return None


def main():
    ds = load_dataset("mychen76/invoices-and-receipts_ocr_v1")["train"]
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("select source_id from documents where source_id like 'ds_%'")
        seeded = sorted(int(r[0][3:]) for r in cur.fetchall())
    print(f"{len(seeded)} seeded documents in the DB")

    # ---- original 60 (unchanged questions/order; +type/+target_invoices fields) ----
    eval_rows = []
    for i in seeded:
        f = load_parsed(ds, i)
        if not f:
            continue
        h, s = f.get("header", {}), f.get("summary", {})
        inv = h.get("invoice_no")
        if not inv:
            continue
        if s.get("total_gross_worth"):
            eval_rows.append({"question": f"What is the total gross worth of invoice {inv}?",
                              "ground_truth": str(s["total_gross_worth"]),
                              "type": "gross-worth", "target_invoices": [inv]})
        if h.get("seller") and seller_name(h["seller"]):
            eval_rows.append({"question": f"Who is the seller on invoice {inv}?",
                              "ground_truth": seller_name(h["seller"]),
                              "type": "seller", "target_invoices": [inv]})

    random.seed(0)
    random.shuffle(eval_rows)
    eval_rows = eval_rows[:60]

    # ---- collect items once for the new question types ---------------------------
    # docs[i] = (invoice_no, [(desc, gross, qty), ...])
    docs = {}
    for i in seeded:
        f = load_parsed(ds, i)
        if not f:
            continue
        inv = f.get("header", {}).get("invoice_no")
        if not inv:
            continue
        items = [(it.get("item_desc") or "", it.get("item_gross_worth"), it.get("item_qty"))
                 for it in (f.get("items") or [])]
        docs[i] = (inv, items, f.get("header", {}).get("seller"))

    rng = random.Random(1)   # separate seed: must not disturb the seed-0 block above

    # ---- category-spend: known baseline failures (top-k can't aggregate) ---------
    for cat, kws in CATEGORIES.items():
        targets, total = [], 0
        for inv, items, _ in docs.values():
            matched = [g for d, g, _ in items
                       if any(k in d.lower() for k in kws) and safe_money(g) is not None]
            if matched:
                targets.append(inv)
                total += sum(safe_money(g) for g in matched)
        if targets:
            eval_rows.append({
                "question": f"How much did we spend in total on {cat}, across all invoices?",
                "ground_truth": f"{total:.2f}",
                "type": "category-spend",
                "target_invoices": targets,
            })

    # ---- item-lookup / line-item value: distinctive items only -------------------
    # "distinctive" = a long description that appears in exactly one document, so the
    # question has a unique correct answer.
    desc_docs = {}
    for i, (inv, items, seller) in docs.items():
        for d, g, q in items:
            if len(d) >= 25:
                desc_docs.setdefault(d, []).append((inv, seller, q))
    unique = sorted(d for d, occ in desc_docs.items() if len(occ) == 1)

    lookup_pool = [d for d in unique if seller_name(desc_docs[d][0][1] or "")]
    for d in rng.sample(lookup_pool, min(6, len(lookup_pool))):
        inv, seller, _ = desc_docs[d][0]
        eval_rows.append({
            "question": f"Which vendor sold the item \"{d}\"?",
            "ground_truth": seller_name(seller),
            "type": "item-lookup",
            "target_invoices": [inv],
        })

    qty_pool = [d for d in unique if desc_docs[d][0][2] and safe_money(desc_docs[d][0][2])]
    for d in rng.sample(qty_pool, min(6, len(qty_pool))):
        inv, _, qty = desc_docs[d][0]
        eval_rows.append({
            "question": f"What quantity of \"{d}\" was purchased on invoice {inv}?",
            "ground_truth": str(int(safe_money(qty))),
            "type": "line-item",
            "target_invoices": [inv],
        })

    with open("eval_set.json", "w") as f:
        json.dump(eval_rows, f, indent=2)
    by_type = {}
    for r in eval_rows:
        by_type[r["type"]] = by_type.get(r["type"], 0) + 1
    print(f"wrote {len(eval_rows)} eval QA pairs -> eval_set.json  {by_type}")


if __name__ == "__main__":
    main()
