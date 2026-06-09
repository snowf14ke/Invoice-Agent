"""
Seed Supabase with a tiny dataset on the `documents` schema (see schema.sql) so you
can smoke-test the agent without running the full OCR pipeline. Re-running is safe.

    python ingest.py

For the real ingest from OCR'd invoices, use prepare_db.ipynb instead.
"""

from db import get_conn, embed_document

# invoice_number, vendor, seller, buyer, doc_date, total_gross_worth, tax, total_net_worth
DOCUMENTS = [
    ("INV-1002", "Acme", "Acme Corp", "Globex Inc", "2026-03-14", 4212.50, 0.00, 4212.50),
    ("INV-1001", "Acme", "Acme Corp", "Globex Inc", "2026-02-02", 980.00, 0.00, 980.00),
]

# invoice_number, description, quantity, unit_price, item_gross_worth
LINE_ITEMS = [
    ("INV-1002", "Widgets x100", 100, 40.00, 4000.00),
    ("INV-1002", "Shipping", 1, 212.50, 212.50),
    ("INV-1001", "Consulting", 1, 980.00, 980.00),
]

# invoice_number, passage
CHUNKS = [
    ("INV-1002", "Invoice INV-1002, line 3: 'Late delivery fee waived per agreement.'"),
    ("INV-1002", "Invoice INV-1002 notes: 'Net-30 terms, due 2026-04-15.'"),
    ("INV-1001", "Invoice INV-1001: 'Consulting services, paid in full.'"),
]


def main():
    invoice_numbers = [row[0] for row in DOCUMENTS]
    with get_conn() as conn, conn.cursor() as cur:
        # Idempotent: clear prior sample rows (line_items + chunks cascade-delete).
        cur.execute("delete from documents where invoice_number = any(%s)", (invoice_numbers,))

        # Insert documents one at a time so we can map invoice_number -> serial id.
        doc_id = {}
        for inv, vendor, seller, buyer, date, gross, tax, net in DOCUMENTS:
            cur.execute(
                """insert into documents
                   (invoice_number, vendor, seller, buyer, doc_date,
                    total_gross_worth, tax, total_net_worth)
                   values (%s, %s, %s, %s, %s, %s, %s, %s) returning id""",
                (inv, vendor, seller, buyer, date, gross, tax, net),
            )
            doc_id[inv] = cur.fetchone()[0]

        cur.executemany(
            """insert into line_items (document_id, description, quantity, unit_price, item_gross_worth)
               values (%s, %s, %s, %s, %s)""",
            [(doc_id[inv], desc, qty, price, gross)
             for inv, desc, qty, price, gross in LINE_ITEMS],
        )
        for inv, content in CHUNKS:
            cur.execute(
                "insert into chunks (document_id, invoice_number, content, embedding) values (%s, %s, %s, %s)",
                (doc_id[inv], inv, content, embed_document(content)),
            )
        conn.commit()

    print(f"Seeded {len(DOCUMENTS)} documents, {len(LINE_ITEMS)} line items, {len(CHUNKS)} chunks.")


if __name__ == "__main__":
    main()
