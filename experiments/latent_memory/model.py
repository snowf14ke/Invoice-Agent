"""
Two-head recurrent-memory transformer, plus two baselines.

MemoryModel (the thing under test)
----------------------------------
Per step t the model sees ONLY this step's tokens plus the memory carried from
step t-1 -- earlier steps' tokens are gone. It runs one bidirectional encoder
over [memory slots | step tokens | ANS] and produces:
    * answer logits, read from the ANS position   (the "answer head")
    * a new memory,  read from the slot positions  (the "memory head")

The memory update is gated (the write policy):
    M_t = (1 - g) * M_{t-1} + g * M_hat
where M_hat and g are both functions of the encoded slot states. g in [0,1] per
slot per feature decides keep-vs-overwrite. Only the final step's answer logits
are used for the loss; gradients flow back through the whole chain of memory
updates (truncated BPTT over T steps).

Baselines
---------
NoMemoryModel : identical, but memory is re-blanked every step -> the floor.
                It literally cannot carry a fact across steps.
FullContextModel : a plain encoder that sees ALL steps concatenated in one
                context, no memory bottleneck -> the ceiling.
"""

import torch
import torch.nn as nn

from task import L, PAD


def _encoder(d_model, n_heads, n_layers, dropout=0.0):
    layer = nn.TransformerEncoderLayer(
        d_model=d_model, nhead=n_heads, dim_feedforward=4 * d_model,
        dropout=dropout, batch_first=True, activation="gelu",
    )
    return nn.TransformerEncoder(layer, num_layers=n_layers)


class MemoryModel(nn.Module):
    def __init__(self, vocab_size, n_values, d_model=128, n_heads=4,
                 n_layers=3, m_slots=8, use_memory=True):
        super().__init__()
        self.d_model = d_model
        self.m_slots = m_slots
        self.use_memory = use_memory

        self.tok = nn.Embedding(vocab_size, d_model, padding_idx=PAD)
        self.tok_pos = nn.Embedding(L, d_model)
        self.slot_pos = nn.Embedding(m_slots, d_model)
        self.slot_type = nn.Parameter(torch.zeros(1, 1, d_model))
        self.ans_vec = nn.Parameter(torch.randn(1, 1, d_model) * 0.02)

        self.encoder = _encoder(d_model, n_heads, n_layers)

        self.mem_out = nn.Linear(d_model, d_model)   # produces M_hat
        self.gate = nn.Linear(d_model, d_model)      # produces g (pre-sigmoid)
        self.answer = nn.Linear(d_model, n_values)   # answer head

        # Start the gate biased toward WRITING so early training gets signal
        # through memory; it is free to learn to keep later.
        nn.init.constant_(self.gate.bias, 1.0)

    def init_memory(self, batch_size, device):
        return torch.zeros(batch_size, self.m_slots, self.d_model, device=device)

    def step(self, tokens_t, M):
        """One step. tokens_t: (B, L). M: (B, m, d). Returns (answer_logits, M_new)."""
        B = tokens_t.size(0)
        dev = tokens_t.device

        tok_e = self.tok(tokens_t) + self.tok_pos(torch.arange(L, device=dev))[None]
        slot_e = M + self.slot_type + self.slot_pos(torch.arange(self.m_slots, device=dev))[None]
        ans_e = self.ans_vec.expand(B, 1, self.d_model)

        seq = torch.cat([slot_e, tok_e, ans_e], dim=1)   # (B, m+L+1, d)
        h = self.encoder(seq)

        ans_logits = self.answer(h[:, -1])               # answer head @ ANS pos
        if self.use_memory:
            slot_h = h[:, : self.m_slots]                # memory head @ slot pos
            M_hat = self.mem_out(slot_h)
            g = torch.sigmoid(self.gate(slot_h))
            M_new = (1 - g) * M + g * M_hat
        else:
            M_new = M                                    # floor: never carries
        return ans_logits, M_new

    def forward(self, tokens):
        """tokens: (B, T, L). Returns final-step answer logits (B, n_values)."""
        B, T, _ = tokens.shape
        M = self.init_memory(B, tokens.device)
        ans_logits = None
        for t in range(T):
            ans_logits, M = self.step(tokens[:, t], M)
        return ans_logits


class NoMemoryModel(MemoryModel):
    def __init__(self, *a, **k):
        k["use_memory"] = False
        super().__init__(*a, **k)


class FullContextModel(nn.Module):
    """Sees every step's tokens at once. No memory bottleneck -> ceiling."""

    def __init__(self, vocab_size, n_values, d_model=128, n_heads=4, n_layers=3):
        super().__init__()
        self.d_model = d_model
        self.tok = nn.Embedding(vocab_size, d_model, padding_idx=PAD)
        self.pos = nn.Embedding(4096, d_model)
        self.ans_vec = nn.Parameter(torch.randn(1, 1, d_model) * 0.02)
        self.encoder = _encoder(d_model, n_heads, n_layers)
        self.answer = nn.Linear(d_model, n_values)

    def forward(self, tokens):
        B, T, _ = tokens.shape
        dev = tokens.device
        flat = tokens.reshape(B, T * L)
        e = self.tok(flat) + self.pos(torch.arange(T * L, device=dev))[None]
        ans_e = self.ans_vec.expand(B, 1, self.d_model)
        seq = torch.cat([e, ans_e], dim=1)
        h = self.encoder(seq)
        return self.answer(h[:, -1])
