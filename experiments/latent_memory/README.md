# Latent memory experiment

Minimal test of the two-head recurrent-memory idea from our design discussion:
a small transformer that, at each step, reads a fixed-size memory + the current
step's tokens and emits **(answer, new memory)**. Memory is carried step to step
with a learned gate. Loss is on the **final** answer only, so the model is forced
to fold an earlier fact into memory and keep it until it's queried.

This is deliberately the *smallest* experiment that can show the real behavior —
it runs on one GPU in minutes, CPU in a while.

## What it measures

A synthetic task: over `T` steps, each early step writes `SET key = value`; the
last step asks `GET key` for a key written `distance` steps earlier. Because the
model only sees the current step's tokens (never earlier steps'), answering
requires memory.

Three models train on identical data:

| model         | role     | expectation                                  |
|---------------|----------|----------------------------------------------|
| `FullContext` | ceiling  | sees all steps at once; should stay accurate |
| `NoMemory`    | floor    | memory blanked each step; ~chance (1/n_values)|
| `Memory`      | **test** | accuracy vs `distance` is the finding        |

Where `Memory` tracks the ceiling, the gated memory is carrying the fact; where
it decays toward the floor as `distance` grows, you're seeing the capacity /
credit-assignment wall we kept talking about — live, on a curve.

## Run

```bash
pip install -r requirements.txt        # torch
python train.py                        # auto-detects CUDA
```

Useful knobs (stress the memory to find where it breaks):

```bash
python train.py --steps 8              # longer write-to-read gaps
python train.py --m_slots 4            # smaller memory -> earlier interference
python train.py --n_keys 32 --n_values 32   # more to remember per slot
python train.py --train_iters 12000    # if it hasn't converged
```

## Files

- `task.py`  — synthetic multi-step SET/GET data generator
- `model.py` — `MemoryModel` (two heads + gated update), `NoMemoryModel`, `FullContextModel`
- `train.py` — training loop (loss on final answer) + distance-bucketed eval

## Reading the output

The final table is accuracy per `distance`. The three numbers you care about:
does `Memory` beat the `NoMemory` floor at all (memory is being used), how far
out in `distance` does it hold before decaying (capacity), and does it ever match
`FullContext` (lossless carry). Those three curves are the actual research signal.
