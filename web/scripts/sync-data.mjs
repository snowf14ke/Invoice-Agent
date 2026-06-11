// Copy the canonical eval snapshots (written by ../evaluate_ragas.py and
// ../record_replays.py into <repo>/evals/) into src/data/ so pages can read
// them at build time. Runs automatically via predev/prebuild.
//
// Vercel note: set Root Directory = web and enable "Include source files
// outside of the Root Directory" so ../evals is present during builds.
import { cpSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, "../../evals");
const dest = path.resolve(here, "../src/data");

if (!existsSync(src)) {
  console.error(`sync-data: ${src} not found — run evaluate_ragas.py --save first`);
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
cpSync(src, path.join(dest, "evals"), { recursive: true });
console.log(`sync-data: copied ${src} -> ${path.join(dest, "evals")}`);
