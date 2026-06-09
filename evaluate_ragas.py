"""
Ragas evaluation wired to the real pipeline.

Key principle: the STORED / RETRIEVED content is OCR-noisy, but the ground-truth
ANSWERS come from the dataset's clean `parsed_data` — never from the OCR text — so
OCR errors are not baked into the answer key. That measures the real question:
can the system recover the correct value despite OCR noise?

Flow:
  1. Build an eval set from processed_data.json rows that have real OCR `result`.
     For each, read the clean fields from `parsed_data` and form deterministic
     (question, ground_truth) pairs (totals, seller, dates).
  2. For each question, retrieve contexts from the live `chunks` table (pgvector,
     same OpenAI embedding as ingest) and generate an answer with a small RAG prompt.
  3. Score with ragas (faithfulness, answer_correctness, context_recall) + CI gate.

    python evaluate_ragas.py --build 50   # build eval_set.json from 50 OCR'd rows
    python evaluate_ragas.py              # evaluate using eval_set.json

Needs a populated DB (run prepare_db.ipynb first) and OPEN_AI_API in .env.
"""

import os
import ast
import json
import argparse

from dotenv import load_dotenv

load_dotenv()
# ragas / langchain look for OPENAI_API_KEY; mirror our project's var onto it.
os.environ.setdefault("OPENAI_API_KEY", os.getenv("OPEN_AI_API", ""))

EVAL_SET_PATH = "eval_set.json"
ANSWER_MODEL = "gpt-4o-mini"     # generates the RAG answer at eval time
QA_GEN_MODEL = "gpt-4o-mini"     # generates the eval questions from clean parsed_data
FAITHFULNESS_THRESHOLD = 0.8


def _parse_fields(rec: dict) -> dict | None:
    """Pull the clean ground-truth dict (header/items/summary) out of a
    processed_data.json record's `parsed_data` (JSON whose 'json' value is a
    python-dict-literal string using single quotes)."""
    try:
        pd_obj = json.loads(rec["parsed_data"])
        return ast.literal_eval(pd_obj["json"])
    except Exception:
        return None


def _deterministic_qa(fields: dict, inv: str) -> list[dict]:
    """Template QA pairs straight from the clean fields — cheap, no LLM, fully grounded."""
    header, summary = fields.get("header", {}), fields.get("summary", {})
    rows = []
    if summary.get("total_gross_worth"):
        rows.append({"question": f"What is the total gross worth of invoice {inv}?",
                     "ground_truth": str(summary["total_gross_worth"])})
    if header.get("seller"):
        rows.append({"question": f"Who is the seller on invoice {inv}?",
                     "ground_truth": header["seller"].split("\n")[0].strip()})
    return rows


def llm_generate_qa(fields: dict, inv: str, per_invoice: int = 3) -> list[dict]:
    """Ask the LLM to write natural, varied questions whose answers are fully
    determined by the CLEAN invoice fields. The answer key therefore comes from
    ground truth, never from OCR text — OCR errors can't pollute it. Each question
    must mention the invoice number so retrieval can find the right document."""
    from openai import OpenAI
    client = OpenAI(api_key=os.getenv("OPEN_AI_API"))
    prompt = (
        "You are building an evaluation set for an invoice question-answering system.\n"
        f"Given the STRUCTURED invoice data below (the ground truth), write {per_invoice} "
        "diverse natural-language questions a user might ask about THIS invoice, each with a "
        "short exact answer taken directly from the data. Vary the fields you ask about "
        "(totals, VAT/tax, dates, seller, buyer, a specific line item). "
        f"Every question MUST mention invoice number {inv} so it is unambiguous. "
        'Return strict JSON: {"qa": [{"question": "...", "answer": "..."}]}\n\n'
        f"Invoice data:\n{json.dumps(fields, ensure_ascii=False)[:4000]}"
    )
    resp = client.chat.completions.create(
        model=QA_GEN_MODEL,
        response_format={"type": "json_object"},
        messages=[{"role": "user", "content": prompt}],
    )
    try:
        qa = json.loads(resp.choices[0].message.content).get("qa", [])
    except Exception:
        return []
    return [{"question": x["question"], "ground_truth": str(x["answer"])}
            for x in qa if x.get("question") and x.get("answer") is not None]


def build_eval_set(n_invoices: int, per_invoice: int = 3, use_llm: bool = True) -> list[dict]:
    """Build (question, ground_truth) pairs from CLEAN parsed_data, using only rows
    that actually have OCR `result` (so retrieval at eval time runs over noisy text)."""
    with open("processed_data.json") as f:
        datas = json.load(f)

    eval_rows, used = [], 0
    for rec in datas:
        if used >= n_invoices:
            break
        if not rec.get("result"):
            continue
        fields = _parse_fields(rec)
        inv = (fields or {}).get("header", {}).get("invoice_no")
        if not fields or not inv:
            continue
        rows = llm_generate_qa(fields, inv, per_invoice) if use_llm else _deterministic_qa(fields, inv)
        eval_rows.extend(rows)
        used += 1

    with open(EVAL_SET_PATH, "w") as f:
        json.dump(eval_rows, f, indent=2)
    print(f"Built {len(eval_rows)} eval pairs from {used} invoices "
          f"({'LLM' if use_llm else 'deterministic'}) -> {EVAL_SET_PATH}")
    return eval_rows


def retrieve_contexts(question: str, k: int = 5) -> list[str]:
    """Real retrieval: embed the query with the SAME OpenAI model used at ingest,
    then cosine-search the live chunks table."""
    from db import get_conn, embed_query
    qv = embed_query(question)
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "select content from chunks order by embedding <=> %s limit %s", (qv, k)
        )
        return [r[0] for r in cur.fetchall()]


def generate_answer(question: str, contexts: list[str]) -> str:
    """Small RAG answer over the retrieved (OCR-noisy) contexts."""
    from openai import OpenAI
    client = OpenAI(api_key=os.getenv("OPEN_AI_API"))
    ctx = "\n---\n".join(contexts) if contexts else "(no context retrieved)"
    resp = client.chat.completions.create(
        model=ANSWER_MODEL,
        messages=[{
            "role": "user",
            "content": f"Answer using only the context. Be concise.\n\nContext:\n{ctx}\n\nQuestion: {question}",
        }],
    )
    return resp.choices[0].message.content.strip()


def run_evaluation():
    from datasets import Dataset
    from ragas import evaluate
    from ragas.metrics import faithfulness, answer_correctness, context_recall

    if not os.path.exists(EVAL_SET_PATH):
        raise FileNotFoundError(
            f"{EVAL_SET_PATH} not found — run `python evaluate_ragas.py --build N` first."
        )
    with open(EVAL_SET_PATH) as f:
        eval_rows = json.load(f)

    questions, contexts, answers, truths = [], [], [], []
    for row in eval_rows:
        q = row["question"]
        ctx = retrieve_contexts(q)
        questions.append(q)
        contexts.append(ctx)
        answers.append(generate_answer(q, ctx))
        truths.append(row["ground_truth"])

    dataset = Dataset.from_dict({
        "question": questions,
        "contexts": contexts,
        "answer": answers,
        "ground_truth": truths,
    })

    print(f"Starting Ragas evaluation on {len(questions)} questions...")
    score = evaluate(
        dataset,
        metrics=[faithfulness, answer_correctness, context_recall],
        in_ci=True,
    )

    df = score.to_pandas()
    print("\n--- Evaluation Results ---")
    print(df)

    avg_faithfulness = df["faithfulness"].mean()
    print(f"\nAverage Faithfulness Score: {avg_faithfulness}")
    if avg_faithfulness < FAITHFULNESS_THRESHOLD:
        raise ValueError(
            f"Deployment halted: faithfulness {avg_faithfulness:.3f} < {FAITHFULNESS_THRESHOLD}."
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--build", type=int, default=0, metavar="N",
                        help="(Re)build eval_set.json from N OCR'd invoices, then exit.")
    parser.add_argument("--per", type=int, default=3,
                        help="Questions per invoice when building (LLM mode).")
    parser.add_argument("--deterministic", action="store_true",
                        help="Use template questions instead of the LLM generator.")
    args = parser.parse_args()
    if args.build:
        build_eval_set(args.build, per_invoice=args.per, use_llm=not args.deterministic)
    else:
        run_evaluation()
