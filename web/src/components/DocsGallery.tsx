"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

import { demoIngest, listDocuments } from "@/lib/api";
import type { DocumentRow } from "@/lib/types";

export default function DocsGallery() {
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setDocs(await listDocuments(12));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function ingest() {
    setIngesting(true);
    setNotice("Running the full pipeline: upload → OCR (GPU) → extract → store. Cold starts can take a minute…");
    try {
      const r = await demoIngest();
      setNotice(`Ingested ${r["source_id"] ?? "document"} — vendor: ${r["vendor"] ?? "?"}, total: ${r["total_gross_worth"] ?? "?"}`);
      await refresh();
    } catch (e) {
      setNotice(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIngesting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">
          The corpus the agent answers from — latest 12 of the ingested documents.
        </p>
        <button
          onClick={ingest}
          disabled={ingesting}
          className="rounded-lg border border-emerald-500/50 px-3.5 py-2 text-sm text-emerald-400 transition-colors hover:bg-emerald-500/10 disabled:opacity-50"
        >
          {ingesting ? "Ingesting…" : "Ingest a fresh document"}
        </button>
      </div>

      {notice && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 px-4 py-2.5 text-sm text-zinc-300">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">
          {error}
        </div>
      )}

      {docs && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {docs.map((d) => (
            <div key={d.id} className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40">
              {d.image_url ? (
                <div className="relative h-36 w-full bg-zinc-950">
                  <Image
                    src={d.image_url}
                    alt={`Invoice ${d.invoice_number ?? d.id}`}
                    fill
                    sizes="(max-width: 640px) 50vw, 25vw"
                    className="object-cover object-top opacity-80"
                  />
                </div>
              ) : (
                <div className="flex h-36 items-center justify-center bg-zinc-950 text-xs text-zinc-600">
                  no image
                </div>
              )}
              <div className="space-y-0.5 p-2.5">
                <div className="truncate text-xs font-medium text-zinc-200">
                  {d.vendor ?? "Unknown vendor"}
                </div>
                <div className="flex justify-between font-mono text-[11px] text-zinc-500">
                  <span>#{d.invoice_number ?? "—"}</span>
                  <span>{d.total_gross_worth != null ? d.total_gross_worth.toFixed(2) : ""}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
