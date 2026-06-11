"""
The three agent tools — backed by real Supabase data on the `documents` schema
(see schema.sql). The NAMES, DOCSTRINGS, and SIGNATURES match the stubs in
agent_core.py; only the bodies query the live DB. That tool seam is why the agent
loop, the graph, and the model's tool-routing never notice the swap.

In agent_core.py, delete the three @tool stubs and `TOOLS = [...]`, then add:
    from tools import TOOLS
"""

from langchain_core.tools import tool

from db import get_conn
from retrieval import retrieve


@tool
def query_fields(vendor: str | None = None, min_total: float | None = None) -> str:
    """Look up exact, structured invoice fields with optional filters.
    Use for precise / aggregate questions like 'total spent with vendor X'."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select vendor, total_gross_worth, doc_date, invoice_number
            from documents
            where (%(vendor)s::text is null or vendor ilike '%%' || %(vendor)s || '%%')
              and (%(min_total)s::numeric is null or total_gross_worth >= %(min_total)s)
            order by doc_date
            """,
            {"vendor": vendor, "min_total": min_total},
        )
        rows = cur.fetchall()
    if not rows:
        return "No matching invoices found."
    return str([
        {"vendor": r[0], "total": float(r[1]) if r[1] is not None else None,
         "date": str(r[2]), "invoice_number": r[3]}
        for r in rows
    ])


@tool
def search_text(query: str, k: int = 5) -> str:
    """Search the document text for passages relevant to a query.
    Use for fuzzy / content questions like 'what does it say about refunds?'."""
    # v1-hybrid: delegates to the ONE shared retrieve() (FTS + vector + RRF +
    # floor) — the same function the eval scores, so tool and eval can't drift.
    # The floor means this can return fewer than k hits, or none at all.
    hits = [content for _inv, content in retrieve(query, k)]
    return "\n".join(hits) if hits else "No relevant passages found."


@tool
def check_consistency(invoice_number: str) -> str:
    """Check whether an invoice's line items sum to its stated gross total.
    Deterministic verification — use it to flag inconsistencies."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "select id, total_gross_worth from documents where invoice_number = %s",
            (invoice_number,),
        )
        row = cur.fetchone()
        if not row:
            return f"No invoice found with number {invoice_number}."
        doc_id, stated = row[0], row[1]
        if stated is None:
            return f"Invoice {invoice_number} has no stated total to check against."
        stated = float(stated)
        cur.execute(
            "select coalesce(sum(item_gross_worth), 0) from line_items where document_id = %s",
            (doc_id,),
        )
        line_sum = float(cur.fetchone()[0])
    consistent = abs(stated - line_sum) < 0.01
    verdict = "consistent" if consistent else "INCONSISTENT"
    return f"{invoice_number}: line items sum to {line_sum:.2f}, stated total {stated:.2f} — {verdict}."


TOOLS = [query_fields, search_text, check_consistency]
