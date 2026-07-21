# Memory Architecture — Hypotheses to Test

> These are my own hypotheses, in my own framing. This file is a record of what
> I want to test, not conclusions. Test criteria are taken from the method I set:
> small model, multi-step synthetic data, judge on the LAST answer, 3+ steps.

---

## 0. The core problem (my starting claim)

People use the active input context as memory. The model degrades over longer
context. Treating a fixed context window as "memory" is a band-aid — it
introduced the bug, it is not long-term sustainable. What is needed is an
**active memory solution** that lets the current LLM keep improving instead of
degrading as the interaction grows.

**Prediction:** as context length grows, answer quality on facts stated early
drops. A dedicated active memory should hold those facts flat regardless of how
long the interaction runs.

---

## 1. RAM-like memory + a memory-manager network

A memory architecture combined with the transformer, like RAM. Deciding *which*
memory to save is left to an internal **secondary network** built specifically
for memory management — dynamic memory *with its own manager*. Turn generation
into a **loop** instead of a single forward pass.

**Test:** a manager network chooses what to keep/write; measure whether the
looped-generation model answers a late question that depends on an early fact,
vs. the same model without the manager.

---

## 2. Snapshot activations as memory

Snapshot the network's activations for the entire network — including the input
and the response — and use that saved snapshot as memory when responding later.

**Test:** save the activation snapshot from an earlier exchange, reload it at a
later step, and check whether the later answer can use the earlier fact from the
snapshot alone (earlier tokens not in context).

---

## 3. Hidden layer as dynamic memory weights (secondary input)

Use some part of the hidden layer as dynamic memory weights that act as a
**secondary input** to the model. Two variants:

- **3a — user/​external-set memory, learned at training time:** the memory slots
  are set from outside; the model *learns during training* to read and use those
  layers.
- **3b — inference-updated memory:** the memory layer is *updated by the input
  during inference*.

**Test:** for 3a, fix content in the slots and check the model reads it. For 3b,
let the input write the slots step by step and check a later step recovers it.

---

## 4. Reserve part of the tokens as memory, output updates it

Reserve ~50% of the input tokens as memory. The **output** produces tokens
specifically designed to **update** those memory tokens — a constant summarizer
that keeps rewriting the memory. It doesn't forget recent conversation but
gradually forgets old. This connects each inference call to the next (memory out
of one call → memory into the next). The model learns to use the chain of
outputs to answer, and retains some of it, so it has storage that does **not**
grow in parameter size — it grows in value/weights.

**Test:** run a chain of calls where memory is carried call-to-call; check that a
question at call N is answered from memory written at an earlier call, and that
memory size stays fixed while effective history grows.

---

## 5. Always-on auto-maintenance with graded abstraction

Not compaction-when-full. Instead: a fixed working context (e.g. 100k) plus the
rest (e.g. 900k) as an information/memory region. The model **learns to hold the
context at that length on every inference** — automatic, so it never bloats
because the memory always exists. Some of it is long-term static user input;
the rest holds the live conversation. Over time content is progressively
abstracted, e.g.:

- "how are you" → stored as "he asked how are you"
- later → "he greeted, then we talked"

Recent stays detailed; old collapses to gist.

**Test:** over a long run, check recent facts stay verbatim-accurate while old
ones survive as correct summaries, and total memory size stays constant.

---

## 6. Two-head model, memory as vectors OR tokens (the experiment)

A small model takes **(question, blank memory)** → hidden states → **(answer,
memory)**. Two output heads: one outputs the **answer**, the other outputs the
**memory** — memory can be **vectors or tokens, it doesn't matter as long as the
model utilizes it**. The dynamic memory layer serves as a secondary input on the
next step.

**Test (my spec):**
- Train on multi-step synthetic data where the **last answer requires the memory
  input** from an earlier step.
- **Judge only the last response.**
- Keep step count **3+** (step 1 has no memory yet, step 2 has only one, so the
  effect only shows at 3+).
- Compare **vectors vs tokens** for the memory head — see which the model
  actually uses.

---

## 7. Change the transformer math itself

If all of the above don't yield results, go under the architecture: change the
math behind the transformer so it **either does not degrade over long context**,
**or** uses a **dynamic layer as input that serves as memory**, with the output
split into two — one output for the answer, one output for the memory.

**Test:** measure long-context degradation before/after the math change on the
same recall task; success = flat accuracy across distance.

---

## Shared success criterion (applies to all)

For every hypothesis above, the test is the same shape I specified: a fact is
written early, queried late, earlier tokens are NOT in context, and only the
final answer is scored — as a function of how many steps back the fact was
written. A hypothesis "works" to the extent final-answer accuracy stays high as
that write-to-read gap grows.
