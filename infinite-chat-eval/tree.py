"""UniiChat-style memory tree and view, per the gist
(https://gist.github.com/VictorTaelin/91837951a5ce5b38f341ec1ba1df6449).

node(0,i) = message i in at most 512 bytes; node(l,i) merges node(l-1,2i) and
node(l-1,2i+1). A source that fits in 512 bytes is its own node (no model call).
The view: one line per node, oldest first; each message appends its line; once
the view passes 128,000 bytes one batch merges the most-due sibling pairs,
due = (T+1)/2^l - i (oldest first on ties), until it is at most 64,000 bytes.

Deviation (stated in the report): compactions are batched several to a model
call, with the recent view as context, instead of one call per node.
"""
import json
import os
import re

LIMIT = 512
HI, LO = 128_000, 64_000


def b(s):
    return len(s.encode("utf-8"))


def leaf_source(e):
    return f"{e['kind']}: {e['text']}"


class Tree:
    def __init__(self):
        self.nodes = {}   # (l,i) -> text
        self.view = []    # list of (l,i), oldest first
        self.T = 0
        self.merges_done = 0
        self.model_nodes = 0

    def line(self, key):
        l, i = key
        n = 2 ** l
        return f"{i * n}+{n}|" + self.nodes[key].replace("\n", " ")

    def view_bytes(self):
        return sum(b(self.line(k)) + 1 for k in self.view)

    def render_view(self, upto=None):
        keys = self.view if upto is None else self.view[:upto]
        return "<chat>\n" + "\n".join(self.line(k) for k in keys) + "\n</chat>"

    def plan_merges(self, est_size):
        """Structural batch: which pairs merge, in due order, until the view fits LO.
        est_size(l,i) gives an upper bound on a parent's line bytes."""
        view = list(self.view)
        sizes = {k: b(self.line(k)) + 1 for k in view}
        total = sum(sizes.values())
        planned = []
        while total > LO:
            best = None
            for idx in range(len(view) - 1):
                (l1, i1), (l2, i2) = view[idx], view[idx + 1]
                if l1 == l2 and i1 % 2 == 0 and i2 == i1 + 1:
                    due = (self.T + 1) / 2 ** l1 - i1
                    if best is None or due > best[0]:
                        best = (due, idx)
            if best is None:
                break
            idx = best[1]
            (l, i) = view[idx]
            parent = (l + 1, i // 2)
            ps = est_size(parent, view[idx], view[idx + 1])
            total -= sizes.pop(view[idx]) + sizes.pop(view[idx + 1])
            sizes[parent] = ps
            total += ps
            view[idx:idx + 2] = [parent]
            planned.append(parent)
        return planned, view


def merged_if_fits(a, b_):
    joined = a + "\n" + b_
    return joined if b(joined) <= LIMIT else None
