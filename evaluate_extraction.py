"""
Extraction quality diagnostic — "is OCR or the extractor producing the errors?"

For each ALIGNED record we have three views of the SAME document:
    image  ->  OCR text (`result`)      # may contain OCR errors
    OCR text  ->  extracted fields      # may contain extraction errors
    parsed_data['json']                 # clean ground truth

For each key field we check whether the extracted value matches ground truth, and
when it doesn't, WHOSE fault it is — without needing clean text:
    * ground-truth value IS present in the OCR text  -> EXTRACTOR missed it
    * ground-truth value is NOT in the OCR text      -> OCR lost it

Run it for one or more models to see if a bigger model helps:
    python evaluate_extraction.py --n 60 --models gpt-5.4-nano gpt-5.4-mini

Needs OPEN_AI_API in .env and an aligned corpus (run the corrected Phase 0 first).
"""

import os
import ast
import json
import argparse
from decimal import Decimal

from dotenv import load_dotenv
import instructor
from openai import OpenAI

from schemas import Invoice, normalize_date

load_dotenv()

FIELDS = ["invoice_no", "invoice_date", "seller", "total_net_worth", "total_vat",
          "total_gross_worth", "n_items"]


# ---------- normalization (so "$ 212,09" and "212.09" compare equal) ----------
def _money(v):
    if v in (None, ""):
        return None
    try:
        return float(Decimal(str(v).replace("$", "").replace(" ", "").replace(",", ".")))
    except Exception:
        return None

def _txt(v):
    return " ".join(str(v).lower().split()) if v not in (None, "") else None

def _date(v):
    d = normalize_date(v) if v else None
    return d.isoformat() if d else None


def gt_values(gt: dict) -> dict:
    h, s, items = gt.get("header", {}), gt.get("summary", {}), gt.get("items", [])
    return {
        "invoice_no":        _txt(h.get("invoice_no")),
        "invoice_date":      _date(h.get("invoice_date")),
        "seller":            _txt((h.get("seller") or "").split("\n")[0][:30]),
        "total_net_worth":   _money(s.get("total_net_worth")),
        "total_vat":         _money(s.get("total_vat")),
        "total_gross_worth": _money(s.get("total_gross_worth")),
        "n_items":           len(items) if items else None,
    }

def pred_values(inv: Invoice) -> dict:
    h, s, items = inv.header, inv.summary, inv.items
    return {
        "invoice_no":        _txt(h.invoice_no),
        "invoice_date":      _date(h.invoice_date),
        "seller":            _txt((h.seller or "").split("\n")[0][:30]),
        "total_net_worth":   _money(s.total_net_worth),
        "total_vat":         _money(s.total_vat),
        "total_gross_worth": _money(s.total_gross_worth),
        "n_items":           len([li for li in items if li.item_desc]) or None,
    }


def in_ocr(field: str, gt_val, ocr_text: str) -> bool:
    """Is the ground-truth value visibly present in the OCR text?"""
    if gt_val is None:
        return False
    ocr = ocr_text.lower()
    if field in ("total_net_worth", "total_vat", "total_gross_worth"):
        s = f"{gt_val:.2f}"                       # 212.09
        return s in ocr or s.replace(".", ",") in ocr
    if field == "n_items":
        return True                              # count isn't a string to find
    if field == "seller":
        first = str(gt_val).split()[0] if gt_val else ""
        return len(first) > 2 and first in ocr
    if field == "invoice_date":
        # gt is ISO ("2012-09-06") but documents print other formats — check the
        # common ones, otherwise every date error gets blamed on OCR.
        from datetime import date
        d = date.fromisoformat(gt_val)
        variants = {gt_val, d.strftime("%m/%d/%Y"), d.strftime("%d/%m/%Y"),
                    d.strftime("%m-%d-%Y"), d.strftime("%d.%m.%Y"),
                    d.strftime("%b %d, %Y").lower(), d.strftime("%d %b %Y").lower()}
        return any(v in ocr for v in variants)
    return str(gt_val) in ocr                     # invoice_no


def extract(client, model: str, ocr_text: str) -> Invoice | None:
    try:
        return client.chat.completions.create(
            model=model, response_model=Invoice,
            messages=[{"role": "user",
                       "content": f"Extract the invoice/receipt fields from this OCR text (leave missing fields null):\n\n{ocr_text}"}],
        )
    except Exception:
        return None


def run(model: str, records: list) -> None:
    client = instructor.from_openai(OpenAI(api_key=os.getenv("OPEN_AI_API")))
    # counters
    correct = {f: 0 for f in FIELDS}
    present = {f: 0 for f in FIELDS}          # gt has a value -> field is gradeable
    ocr_miss = {f: 0 for f in FIELDS}
    ext_miss = {f: 0 for f in FIELDS}
    extract_failures = 0

    for rec in records:
        gt = gt_values(ast.literal_eval(json.loads(rec["parsed_data"])["json"]))
        inv = extract(client, model, rec["result"])
        if inv is None:
            extract_failures += 1
            continue
        pred = pred_values(inv)
        for f in FIELDS:
            if gt[f] is None:
                continue
            present[f] += 1
            if pred[f] == gt[f]:
                correct[f] += 1
            elif in_ocr(f, gt[f], rec["result"]):
                ext_miss[f] += 1                # info was in the OCR -> extractor's fault
            else:
                ocr_miss[f] += 1               # info wasn't in the OCR -> OCR's fault

    print(f"\n===== model: {model}  (n={len(records)}, extract_failures={extract_failures}) =====")
    print(f"{'field':<18}{'acc':>7}{'correct/present':>18}{'ocr_miss':>10}{'ext_miss':>10}")
    tot_c = tot_p = tot_ocr = tot_ext = 0
    for f in FIELDS:
        p = present[f]
        acc = correct[f] / p if p else 0.0
        print(f"{f:<18}{acc:>7.2f}{f'{correct[f]}/{p}':>18}{ocr_miss[f]:>10}{ext_miss[f]:>10}")
        tot_c += correct[f]; tot_p += p; tot_ocr += ocr_miss[f]; tot_ext += ext_miss[f]
    print(f"{'OVERALL':<18}{(tot_c/tot_p if tot_p else 0):>7.2f}{f'{tot_c}/{tot_p}':>18}{tot_ocr:>10}{tot_ext:>10}")
    wrong = tot_ocr + tot_ext
    if wrong:
        print(f"  of {wrong} wrong fields: {tot_ocr} ({100*tot_ocr/wrong:.0f}%) OCR's fault, "
              f"{tot_ext} ({100*tot_ext/wrong:.0f}%) extractor's fault")


def load_records(n: int) -> list:
    """Pull (raw_ocr, ground truth) for seeded documents straight from the DB.
    source_id 'ds_{i}' maps back to the dataset row whose parsed_data is the truth.
    Rows whose parsed_data won't parse are skipped (some dataset entries are malformed)."""
    from db import get_conn
    from datasets import load_dataset
    ds = load_dataset("mychen76/invoices-and-receipts_ocr_v1")["train"]
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "select source_id, raw_ocr from documents "
            "where source_id like 'ds_%%' and raw_ocr is not null "
            "order by id limit %s", (n,))
        rows = cur.fetchall()
    records, skipped = [], 0
    for sid, raw_ocr in rows:
        parsed = ds[int(sid[3:])]["parsed_data"]
        try:
            ast.literal_eval(json.loads(parsed)["json"])
        except Exception:
            skipped += 1
            continue
        records.append({"result": raw_ocr, "parsed_data": parsed})
    if skipped:
        print(f"skipped {skipped} records with unparseable parsed_data")
    return records


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=60, help="number of seeded documents to grade")
    ap.add_argument("--models", nargs="+", default=["gpt-5.4-nano"],
                    help="one or more extraction models to compare")
    args = ap.parse_args()

    records = load_records(args.n)
    if not records:
        raise SystemExit("No seeded documents found — run the notebook seeder (pipeline) first.")
    print(f"grading {len(records)} seeded documents against parsed_data ground truth")

    for model in args.models:
        run(model, records)


if __name__ == "__main__":
    main()
