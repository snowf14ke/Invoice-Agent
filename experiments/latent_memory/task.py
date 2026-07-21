"""
Synthetic multi-step recall task.

Each episode is a sequence of T steps. Each non-final step WRITES a key->value
binding ("SET k = v"). The final step QUERIES one key ("GET k") whose binding
was written `distance` steps earlier. The label is that key's value.

The point: when the model runs step-by-step and only carries a fixed-size memory
between steps (no access to earlier steps' tokens), answering the final GET
REQUIRES that the earlier SET was folded into memory and survived until now.
`distance` = (final_step_index - write_step_index) is the write-to-read gap; the
whole experiment is measuring how accuracy decays as this gap grows.

Token layout (fixed length L=4 per step):
    write step:  [SET, key, EQ,  value]
    query step:  [GET, key, PAD, PAD  ]
"""

import torch

PAD, SET, GET, EQ = 0, 1, 2, 3
SPECIAL = 4                      # number of special tokens above
L = 4                           # tokens per step


class TaskConfig:
    def __init__(self, n_keys=16, n_values=16):
        self.n_keys = n_keys
        self.n_values = n_values
        self.key_base = SPECIAL
        self.val_base = SPECIAL + n_keys
        self.vocab_size = SPECIAL + n_keys + n_values

    def key_id(self, k):
        return self.key_base + k

    def val_id(self, v):
        return self.val_base + v


def make_batch(cfg, batch_size, n_steps, device, fixed_distance=None):
    """
    Returns:
        tokens:   (B, T, L) long   -- token ids per step
        target:   (B,)      long   -- value index [0, n_values) queried at final step
        distance: (B,)      long   -- write-to-read gap for the queried key
    """
    B, T = batch_size, n_steps
    tokens = torch.full((B, T, L), PAD, dtype=torch.long)
    target = torch.empty(B, dtype=torch.long)
    distance = torch.empty(B, dtype=torch.long)

    for b in range(B):
        tkey = torch.randint(0, cfg.n_keys, (1,)).item()
        tval = torch.randint(0, cfg.n_values, (1,)).item()

        if fixed_distance is None:
            d = torch.randint(1, T, (1,)).item()      # 1 .. T-1
        else:
            d = min(max(int(fixed_distance), 1), T - 1)
        w = (T - 1) - d                               # write step index

        # Fill every non-final step with a distractor SET, avoiding the target
        # key so it is not overwritten after step w.
        for s in range(T - 1):
            if s == w:
                k, v = tkey, tval
            else:
                k = torch.randint(0, cfg.n_keys, (1,)).item()
                while k == tkey:                      # keep target's last write at w
                    k = torch.randint(0, cfg.n_keys, (1,)).item()
                v = torch.randint(0, cfg.n_values, (1,)).item()
            tokens[b, s] = torch.tensor([SET, cfg.key_id(k), EQ, cfg.val_id(v)])

        # Final step: query the target key.
        tokens[b, T - 1] = torch.tensor([GET, cfg.key_id(tkey), PAD, PAD])
        target[b] = tval
        distance[b] = d

    return tokens.to(device), target.to(device), distance.to(device)
