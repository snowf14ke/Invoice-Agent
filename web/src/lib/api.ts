// Client-side helpers for the FastAPI backend (main.py).
import type { AskResponse, DocumentRow } from "./types";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${body ? ` — ${body}` : ""}`);
  }
  return res.json() as Promise<T>;
}

export const ask = (question: string) =>
  req<AskResponse>("/ask", { method: "POST", body: JSON.stringify({ question }) });

export const listDocuments = (limit = 24) =>
  req<DocumentRow[]>(`/documents?limit=${limit}`);

export const demoIngest = () =>
  req<Record<string, unknown>>("/demo/ingest", { method: "POST", body: "{}" });
