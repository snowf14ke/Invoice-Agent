# Spec: <module name>

<!-- One file per pipeline stage. Copy this template into specs/<stage>.md
     e.g. specs/extraction.md, specs/ingestion.md, specs/agent.md, specs/eval.md

     RULE (also in CLAUDE.md): this spec is the source of truth for INTENDED
     behavior. Code that contradicts it is wrong by definition. The spec only
     changes by explicit decision, recorded in plan.md's decisions log. -->

## Purpose
<!-- 1-2 sentences: what this module is for -->

## Contract
<!-- The behavior that must hold. Be precise enough that "wrong implementation"
     is checkable. Examples for the extraction stage:

- Input: raw OCR output (PaddleOCR-VL JSON) for one document
- Output: InvoiceExtraction Pydantic model
- All dates ISO 8601; unparseable dates → None, never a guessed date
- Line items: missing fields → None; an empty line-item list is valid
- Currency detected from document; if ambiguous → None plus a flag, never a default currency
- Must not raise on any valid OCR output; failures return a structured error -->

## Non-goals
<!-- What this module deliberately does NOT do, so agents don't "helpfully" add it -->

## Invariants checked by tests
<!-- Map each contract line to the test that enforces it:
- ISO dates → tests/test_extraction.py::test_date_normalization
- ... -->
