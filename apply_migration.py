"""
Apply a SQL migration file to the live Supabase DB.

    python apply_migration.py migrations/001_chunks_fts.sql

Why a script instead of pasting into the dashboard SQL editor: the migration
file in git stays the single source of truth for what actually ran. (The
full-blown production pattern is the Supabase CLI's supabase/migrations/
workflow with versioned, ordered files — this is the same idea, hand-rolled.)
"""

import sys

from db import get_conn


def main():
    path = sys.argv[1]
    with open(path) as f:
        sql = f.read()
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql)
    print(f"applied: {path}")


if __name__ == "__main__":
    main()
