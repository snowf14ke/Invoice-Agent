// Server-side loaders for the eval snapshots synced into src/data/evals by
// scripts/sync-data.mjs. fs at build/request time keeps the version list
// dynamic — adding evals/v1-hybrid.json requires no code change here.
import fs from "node:fs";
import path from "node:path";

import type { ReplaySet, Snapshot } from "./types";

const EVALS_DIR = path.join(process.cwd(), "src", "data", "evals");

function readJsonDir<T>(dir: string): T[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort() // v0-… < v1-… < v2-… — version prefix gives chronological order
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as T);
}

export function loadSnapshots(): Snapshot[] {
  return readJsonDir<Snapshot>(EVALS_DIR);
}

export function loadReplaySets(): ReplaySet[] {
  return readJsonDir<ReplaySet>(path.join(EVALS_DIR, "replays"));
}

export function latestSnapshot(): Snapshot | undefined {
  const all = loadSnapshots();
  return all[all.length - 1];
}
