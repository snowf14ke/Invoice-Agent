"""
Train the memory model and both baselines on the synthetic recall task, then
report final-answer accuracy bucketed by write-to-read distance.

The result to read:
    - FullContext accuracy should stay high at every distance (ceiling).
    - NoMemory accuracy should sit near chance = 1/n_values (floor) once
      distance >= 1, since it cannot carry anything across steps.
    - Memory accuracy vs distance IS the finding: where it tracks the ceiling
      the gated memory is carrying the fact; where it falls toward the floor is
      the capacity / credit-assignment wall, live.

Run:
    python train.py                      # sensible defaults, auto-detects CUDA
    python train.py --steps 8 --train_iters 8000 --m_slots 8 --d_model 128
"""

import argparse
import torch
import torch.nn.functional as F

from task import TaskConfig, make_batch
from model import MemoryModel, NoMemoryModel, FullContextModel


def evaluate(model, cfg, args, device):
    """Accuracy per fixed write-to-read distance (1 .. T-1)."""
    model.eval()
    accs = {}
    with torch.no_grad():
        for d in range(1, args.steps):
            correct = total = 0
            for _ in range(args.eval_batches):
                tokens, target, _ = make_batch(
                    cfg, args.batch, args.steps, device, fixed_distance=d)
                pred = model(tokens).argmax(-1)
                correct += (pred == target).sum().item()
                total += target.numel()
            accs[d] = correct / total
    model.train()
    return accs


def train_one(name, model, cfg, args, device):
    model.to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr)
    print(f"\n=== training {name} "
          f"({sum(p.numel() for p in model.parameters())/1e6:.2f}M params) ===")
    for it in range(1, args.train_iters + 1):
        tokens, target, _ = make_batch(cfg, args.batch, args.steps, device)
        logits = model(tokens)                      # loss ONLY on final answer
        loss = F.cross_entropy(logits, target)
        opt.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()
        if it % args.log_every == 0 or it == 1:
            acc = (logits.argmax(-1) == target).float().mean().item()
            print(f"  {name:11s} iter {it:5d}  loss {loss.item():.4f}  "
                  f"train_acc {acc:.3f}")
    return evaluate(model, cfg, args, device)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--steps", type=int, default=6, help="steps per episode (>=3)")
    p.add_argument("--n_keys", type=int, default=16)
    p.add_argument("--n_values", type=int, default=16)
    p.add_argument("--m_slots", type=int, default=8)
    p.add_argument("--d_model", type=int, default=128)
    p.add_argument("--n_heads", type=int, default=4)
    p.add_argument("--n_layers", type=int, default=3)
    p.add_argument("--batch", type=int, default=128)
    p.add_argument("--train_iters", type=int, default=6000)
    p.add_argument("--eval_batches", type=int, default=20)
    p.add_argument("--lr", type=float, default=3e-4)
    p.add_argument("--log_every", type=int, default=500)
    p.add_argument("--seed", type=int, default=0)
    args = p.parse_args()

    assert args.steps >= 3, "need 3+ steps so memory is actually exercised"
    torch.manual_seed(args.seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"device: {device}")

    cfg = TaskConfig(n_keys=args.n_keys, n_values=args.n_values)
    chance = 1.0 / args.n_values

    def build(cls, **extra):
        return cls(cfg.vocab_size, args.n_values, d_model=args.d_model,
                   n_heads=args.n_heads, n_layers=args.n_layers, **extra)

    results = {
        "Memory": train_one("Memory",
                             build(MemoryModel, m_slots=args.m_slots),
                             cfg, args, device),
        "NoMemory": train_one("NoMemory",
                              build(NoMemoryModel, m_slots=args.m_slots),
                              cfg, args, device),
        "FullContext": train_one("FullContext",
                                 build(FullContextModel),
                                 cfg, args, device),
    }

    print("\n\n================ accuracy by write-to-read distance ================")
    print(f"(chance = 1/n_values = {chance:.3f};  steps = {args.steps}, "
          f"m_slots = {args.m_slots})\n")
    header = "distance   " + "".join(f"{k:>13s}" for k in results)
    print(header)
    print("-" * len(header))
    for d in range(1, args.steps):
        row = f"   d={d:<5d} " + "".join(f"{results[k][d]:>13.3f}" for k in results)
        print(row)
    print("\nRead it: FullContext = ceiling, NoMemory ~ chance = floor, "
          "Memory's curve vs distance is the result.")


if __name__ == "__main__":
    main()
