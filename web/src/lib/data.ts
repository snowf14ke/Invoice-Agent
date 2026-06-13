// Server-side loaders for the eval snapshots synced into src/data/evals by
// scripts/sync-data.mjs. fs at build/request time keeps the version list
// dynamic — adding evals/v1-hybrid.json requires no code change here.
import fs from "node:fs";
import path from "node:path";

import type { ExtractionComparison, ReplaySet, Snapshot } from "./types";

const EVALS_DIR = path.join(process.cwd(), "src", "data", "evals");

function readJsonDir<T>(dir: string): T[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    // vN- prefix = ragas snapshots; other json (extraction-models) lives beside them
    .filter((f) => /^v\d.*\.json$/.test(f))
    .sort() // v0-… < v1-… < v2-… — version prefix gives chronological order
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as T);
}

export function loadSnapshots(): Snapshot[] {
  return readJsonDir<Snapshot>(EVALS_DIR);
}

/** evals/extraction-models.json — written by evaluate_extraction.py --save */
export function loadExtractionComparison(): ExtractionComparison | undefined {
  const file = path.join(EVALS_DIR, "extraction-models.json");
  if (!fs.existsSync(file)) return undefined;
  return JSON.parse(fs.readFileSync(file, "utf8")) as ExtractionComparison;
}

export function loadReplaySets(): ReplaySet[] {
  return readJsonDir<ReplaySet>(path.join(EVALS_DIR, "replays"));
}

export function latestSnapshot(): Snapshot | undefined {
  const all = loadSnapshots();
  return all[all.length - 1];
}
