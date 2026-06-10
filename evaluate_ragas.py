"""
Ragas evaluation + judge-free retrieval metrics.

The eval set (eval_set.json, built by build_eval_set.py) comes from the clean
parsed_data of the ingested invoices, so the answer key is never polluted by OCR
noise. This script runs it: for each question, retrieve over the (OCR-noisy)
chunks, write an answer, and score. Fails CI if faithfulness drops below the
threshold.

Two measurement principles learned the hard way:
- **Independent judge.** Letting gpt-5.4-mini judge its own answers inflated
  answer_correctness (0.848 self-judged vs ~0.63 with an external judge). The
  judge is deepseek-v4-pro and MUST stay fixed across versions, or the
  version-to-version deltas mean nothing.
- **Judge-free retrieval metrics.** Each eval row carries `target_invoices` (the
  invoice whose chunk is needed). hit@5 / MRR are computed deterministically from
  those — no LLM, no noise — which makes them the cleanest before/after signal
  for retrieval changes (hybrid search, reranker).

    python evaluate_ragas.py --limit 8                      # cheap smoke run
    python evaluate_ragas.py --save evals/v0-baseline.json  # full + snapshot

Needs a populated DB (prepare_db.ipynb), OPEN_AI_API + DEEPSEEK_API_KEY in .env.
"""

import os
import re
import sys
import json
import types
import argparse
import datetime
import subprocess

from dotenv import load_dotenv

load_dotenv()
os.environ.setdefault("OPENAI_API_KEY", os.getenv("OPEN_AI_API", ""))   # ragas reads this

# Compat shim: ragas (<=0.4.3) imports ChatVertexAI from a legacy module that
# langchain-community 0.4 removed. It's only used in an isinstance() capability
# check (we never pass a VertexAI model), so an empty stub class is safe.
_vertex = types.ModuleType("langchain_community.chat_models.vertexai")
_vertex.ChatVertexAI = type("ChatVertexAI", (), {})
sys.modules.setdefault("langchain_community.chat_models.vertexai", _vertex)

from datasets import Dataset
from ragas import evaluate
from ragas.metrics import faithfulness, answer_correctness, context_recall
from langchain_openai import OpenAIEmbeddings
from langchain_deepseek import ChatDeepSeek
from openai import OpenAI

from db import get_conn, embed_query

ANSWER_MODEL = "gpt-5.4-mini"      # model that writes the RAG answer
JUDGE_MODEL = "deepseek-v4-pro"    # INDEPENDENT judge — never the answer model
THRESHOLD = 0.8                    # CI gate on average faithfulness


def retrieve(question: str, k: int = 5) -> list[tuple[str | None, str]]:
    """Hybrid retrieval -> [(invoice_number, content), ...]. Embeddings are nearly
    blind to digit strings — measured 0/15 top-5 hit rate for "invoice 53737787"-style
    questions with pure vector search, because every chunk has the same shape and only
    the number differs. So: exact invoice-number match first, then vector fills."""
    qv = embed_query(question)
    with get_conn() as conn, conn.cursor() as cur:
        exact = []
        for num in re.findall(r"\b\d{4,}\b", question):
            cur.execute("select invoice_number, content from chunks where invoice_number = %s", (num,))
            exact += cur.fetchall()
        cur.execute("select invoice_number, content from chunks order by embedding <=> %s::vector limit %s",
                    (qv, k))
        vect = cur.fetchall()
    seen, out = set(), []
    for inv, c in exact + vect:
        if c not in seen:
            seen.add(c)
            out.append((inv, c))
    return out[:k]


def answer(question: str, contexts: list[str]) -> str:
    ctx = "\n---\n".join(contexts) or "(no context)"
    client = OpenAI(api_key=os.getenv("OPEN_AI_API"))
    resp = client.chat.completions.create(
        model=ANSWER_MODEL,
        messages=[{"role": "user",
                   "content": f"Answer using only the context. Be concise.\n\nContext:\n{ctx}\n\nQuestion: {question}"}],
    )
    return resp.choices[0].message.content.strip()


def retrieval_rank(retrieved_invoices: list[str | None], targets: list[str]) -> int | None:
    """1-based rank of the first retrieved chunk whose invoice is a target, else None.
    hit@k = rank is not None; MRR uses 1/rank. Matching is on the OCR-extracted
    invoice_number column — if extraction garbled the number, that's a real miss."""
    tset = set(targets)
    for pos, inv in enumerate(retrieved_invoices, start=1):
        if inv in tset:
            return pos
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None,
                    help="score only the first N questions (cheap smoke run)")
    ap.add_argument("--save", default=None,
                    help="write a versioned snapshot JSON (e.g. evals/v0-baseline.json)")
    args = ap.parse_args()

    with open("eval_set.json") as f:
        rows = json.load(f)
    if args.limit:
        rows = rows[:args.limit]

    metas = [retrieve(r["question"]) for r in rows]
    contexts = [[c for _, c in m] for m in metas]
    answers = [answer(r["question"], c) for r, c in zip(rows, contexts)]
    ranks = [retrieval_rank([inv for inv, _ in m], r.get("target_invoices", []))
             for m, r in zip(metas, rows)]

    data = Dataset.from_dict({
        "question":     [r["question"] for r in rows],
        "contexts":     contexts,
        "answer":       answers,
        "ground_truth": [r["ground_truth"] for r in rows],
    })

    print(f"Scoring {len(rows)} questions with Ragas (judge: {JUDGE_MODEL})...")
    # Pass the judge LLM + embeddings explicitly: ragas 0.4's default embedding
    # factory builds a sync client where the metrics await an async one, so
    # answer_correctness silently fails (NaN) without these.
    score = evaluate(
        data,
        metrics=[faithfulness, answer_correctness, context_recall],
        llm=ChatDeepSeek(model=JUDGE_MODEL, temperature=0),
        embeddings=OpenAIEmbeddings(model="text-embedding-3-small"),
    )
    df = score.to_pandas()
    df["type"] = [r["type"] for r in rows]
    df["hit@5"] = [r is not None for r in ranks]
    df["rr"] = [1.0 / r if r else 0.0 for r in ranks]
    print(df)

    metric_cols = ["faithfulness", "answer_correctness", "context_recall", "hit@5", "rr"]
    headline = {m: round(float(df[m].mean()), 3) for m in metric_cols}
    per_type = {t: {m: round(float(g[m].mean()), 3) for m in metric_cols}
                for t, g in df.groupby("type")}

    print("\n== headline ==")
    for m, v in headline.items():
        print(f"  {m:>20}: {v:.3f}")
    print("\n== by question type ==")
    for t, ms in per_type.items():
        print(f"  {t:<15} " + "  ".join(f"{m}={v:.3f}" for m, v in ms.items()))

    if args.save:
        git = subprocess.run(["git", "describe", "--always", "--dirty"],
                             capture_output=True, text=True).stdout.strip()
        snapshot = {
            "version": os.path.splitext(os.path.basename(args.save))[0],
            "git": git,
            "date": datetime.date.today().isoformat(),
            "answer_model": ANSWER_MODEL,
            "judge_model": JUDGE_MODEL,
            "n_questions": len(rows),
            "headline": headline,
            "per_type": per_type,
            "per_question": [
                {"question": r["question"], "type": r["type"],
                 "ground_truth": r["ground_truth"], "answer": a,
                 "rank": rank,
                 **{m: (None if df.loc[i, m] != df.loc[i, m] else round(float(df.loc[i, m]), 3))
                    for m in ("faithfulness", "answer_correctness", "context_recall")}}
                for i, (r, a, rank) in enumerate(zip(rows, answers, ranks))
            ],
        }
        os.makedirs(os.path.dirname(args.save) or ".", exist_ok=True)
        with open(args.save, "w") as f:
            json.dump(snapshot, f, indent=2)
        print(f"\nsnapshot -> {args.save}")

    avg = df["faithfulness"].mean()
    if avg < THRESHOLD:
        raise SystemExit(f"FAIL: faithfulness {avg:.3f} < {THRESHOLD}")


if __name__ == "__main__":
    main()
