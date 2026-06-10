"""
Record the agent's ACTUAL answers (with full tool trace) to a fixed set of
showcase questions, frozen as JSON per version. The website's before/after panel
shows these recorded replays next to a live run of the current system — so the
"it used to answer like this" half never depends on keeping old code deployed.

The questions deliberately mix what the current version does well (exact lookups,
vendor totals, consistency checks) with what it is known to fail (category
spending needs aggregation over many invoices; top-k retrieval can't do that).

    python record_replays.py --save evals/replays/v0-baseline.json
"""

import os
import json
import datetime
import argparse

from agent_core import answer, llm

QUESTIONS = [
    # The question that exposed the retrieval weakness in the first place.
    "How much did we spend on food and drinks in total?",
    # Category aggregation with a known ground truth (see eval_set.json).
    "How much did we spend in total on carpets and rugs, across all invoices?",
    # Exact-field lookups — the baseline handles these via query_fields.
    "What is the total gross worth of invoice 61356291?",
    "Who is the seller on invoice 10372826?",
    # Vendor aggregate — verified working in the agent demo.
    "How much did we spend with Davis PLC in total?",
    # Deterministic verification tool.
    "Do the line items on invoice 61356291 sum to its stated total?",
    # Item-level semantic lookup — stresses pure-vector search at baseline.
    'Which vendor sold the item "Dell Core 2 Duo Desktop Computer I Windows XP Pro I 4GB I 500GB"?',
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--save", default="evals/replays/v0-baseline.json")
    args = ap.parse_args()

    items = []
    for q in QUESTIONS:
        print(f"asking: {q}")
        try:
            r = answer(q)
        except Exception as e:           # record the failure — that can be the story
            r = {"answer": f"(agent error: {e})", "trace": [], "sources": []}
        print(f"  -> {r['answer'][:100]}")
        items.append({"question": q, **r})

    snapshot = {
        "version": os.path.splitext(os.path.basename(args.save))[0],
        "date": datetime.date.today().isoformat(),
        "agent_model": getattr(llm, "model_name", None) or getattr(llm, "model", "?"),
        "items": items,
    }
    os.makedirs(os.path.dirname(args.save) or ".", exist_ok=True)
    with open(args.save, "w") as f:
        json.dump(snapshot, f, indent=2)
    print(f"\n{len(items)} replays -> {args.save}")


if __name__ == "__main__":
    main()
