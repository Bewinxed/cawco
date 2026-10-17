"""The infinite-chat measurement, rerun on Claude: every call is claude-sonnet-5-5.

Phases (each skips whatever out/ already holds, so a rerun resumes):
  build   the memory each method leaves: CawCo's summary (port of continuation.ts), Claude Code
          2.1.299's compaction prompt, the Factory-style merge, each chained through the five
          real cut points; 2b (the real 00:55 compaction + one replayed compaction at 02:49);
          and the UniiChat tree (512-byte nodes, 64-128 KB view, the gist's due order).
  answer  the 54 probes for every method, one fresh call each; the tree with zoom (the prompt's
          own lookup protocol, up to 6 zoom replies) and without; the real 23:19 CawCo opening
          and 00:55 native compaction kept as they are, answered on the probes before them.
  judge   the fixed 0-2 rubric, every method's answers to a probe shuffled under letters, 4 a call.
  report  out/report.md: the tables, tokens from the ledger, zoom use, key-string survival,
          the tree view's cache behaviour.

Usage: python3 -I pipeline.py plan | run [--phases build,answer,judge,report] | report | probe [--answer]
       every command takes --scope full|end|decision|minimal|incremental (which runs get answered and judged)
  plan     re-estimates what remains from out/ledger.jsonl, per scope; spends nothing
  probe    3 real merge calls (5 with --answer) that test the tree prompt; writes out/probe/ only
  --scope incremental  builds the tree as the chat goes, design A and/or B (--designs A,B; --a-turns N builds A
           over the first N turns only), answers the probes from each finished one, and judges it beside the batch
           tree and cc-real+C-filed in the same judge calls. run refuses when the plan is over EVAL_BUDGET ($40), and
           no call starts once the reported spend reaches it (reruns count what earlier runs spent).
Exit: 0 complete, 75 stopped: a call failed (login, usage limit, exit, network, refusal) or the budget is reached;
      nothing from the failed call is stored and no turn advances (rerun to resume), 1 something incomplete,
      2 not run (what was spent plus the plan is over the budget; plan exits 2 too).
"""
import argparse
import collections
import concurrent.futures as cf
import datetime
import hashlib
import json
import math
import os
import random
import re
import subprocess
import sys
import threading
import time
import uuid
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import claude_call as C  # noqa: E402
import methods as M  # noqa: E402
import tree as TR  # noqa: E402

OUT = C.OUT
BUILD = os.path.join(OUT, "build")
ANS = os.path.join(OUT, "answers")
JUD = os.path.join(OUT, "judge")
TREE = os.path.join(BUILD, "tree")
# characters a token when out/ledger.jsonl has none to measure: the first Claude run's own figure ("0.443 tokens
# per character sent (2.26 characters a token)"), so a plan without its ledger does not under-price the run
CPT = float(os.environ.get("EVAL_CHARS_PER_TOKEN", "2.26"))
PROBES = json.load(open(os.path.join(M.DATA, "probes.json")))
P = {p["id"]: p for p in PROBES}
_log_lock = threading.Lock()


def log(msg):
    line = f"{time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime())} {msg}"
    with _log_lock:
        print(line, flush=True)
        with open(os.path.join(OUT, "run.log"), "a") as fh:
            fh.write(line + "\n")


def save(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = f"{path}.{os.getpid()}.{threading.get_ident()}.tmp"
    with open(tmp, "w") as fh:
        json.dump(obj, fh, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def load(path):
    try:
        return json.load(open(path))
    except (OSError, ValueError):
        return None


def add_usage(total, u):
    for k, v in u.items():
        total[k] = total.get(k, 0) + v
    return total


# ============================================================ build: the three summary chains
# Claude Code 2.1.299's own compaction system prompt, verbatim from the binary, for its compaction
# replay (and 2b, and Factory, which has no production harness). CawCo's summariser runs in
# production as an ordinary Claude Code session (server.ts summariserRun → spawnFromHub), so its
# replay runs under Claude Code's own default system prompt (system=None).
SUMMARY_SYSTEM = "You are a helpful AI assistant tasked with summarizing conversations."
SYSTEM_OF = {"cc": SUMMARY_SYSTEM, "factory": SUMMARY_SYSTEM, "cawco": None}
METHODS = ["cc", "cawco", "factory"]
SUMMARY_TRIES = 3


def chain_path(meth, k):
    return os.path.join(BUILD, meth, f"gen{k}.json")


def chain_prompt(meth, k, prior):
    if meth == "cc":
        return M.cc_input(k, prior), None
    if meth == "factory":
        return M.factory_prompt(prior, k), None
    ex = M.cawco_extract(M.seg_msgs(k), opener_text=prior, since="2026-10-15T13:49")
    return M.cawco_prompt(ex["middle"]), ex


def summarise(meth, key, prompt):
    tries, r = [], None
    for attempt in range(SUMMARY_TRIES):
        r = C.call(f"{key}/try{attempt}", "build", SYSTEM_OF[meth], prompt, cache="off")
        wf = M.well_formed(meth, r["text"])
        tries.append({"chars": len(r["text"]), "well_formed": wf, "usage": r["usage"], "seconds": r["seconds"],
                      "off_model": r["off_model"]})
        if wf:
            break
        log(f"{key}: malformed attempt {attempt} ({len(r['text'])} chars)")
    return r, tries


def run_chain(meth):
    prior = None
    for k in range(5):
        f = chain_path(meth, k)
        rec = load(f)
        if rec:
            prior = rec["carry"]
            continue
        prompt, ex = chain_prompt(meth, k, prior)
        r, tries = summarise(meth, f"build/{meth}/gen{k}", prompt)
        raw = r["text"]
        if meth == "cc":
            summary = M.cc_extract(raw)
            carry, ctx = summary, M.cc_context(summary)
        elif meth == "factory":
            summary = raw.strip()
            carry, ctx = summary, M.factory_context(summary)
        else:
            summary = raw.strip()
            carry = M.cawco_opening(summary, ex)
            ctx = carry
        save(f, {"k": k, "cut": M.CUT_LABELS[k], "model": C.MODEL, "prompt_chars": len(prompt),
                 "summary_chars": len(summary), "carry": carry, "context": ctx, "raw": raw,
                 "attempts": tries, "well_formed": tries[-1]["well_formed"],
                 "off_model": sorted({m for t in tries for m in t["off_model"]})})
        log(f"build {meth} gen{k}: prompt {len(prompt):,} chars → summary {len(summary):,} chars, "
            f"{len(tries)} attempt(s), well-formed {tries[-1]['well_formed']}")
        prior = carry


def cc_real_prompt():
    real = open(os.path.join(M.DATA, "artifacts/native-compact-2026-10-16T0055.md")).read()
    return M.cc_input(4, real.split("Summary:", 1)[-1].strip())


def run_cc_real():
    f = os.path.join(BUILD, "cc-real.json")
    if load(f):
        return
    prompt = cc_real_prompt()
    r, tries = summarise("cc", "build/cc-real", prompt)
    summary = M.cc_extract(r["text"])
    save(f, {"model": C.MODEL, "prompt_chars": len(prompt), "summary_chars": len(summary), "raw": r["text"],
             "context": M.cc_context(summary), "attempts": tries, "well_formed": tries[-1]["well_formed"],
             "off_model": sorted({m for t in tries for m in t["off_model"]})})
    log(f"build cc-real: prompt {len(prompt):,} chars → summary {len(summary):,} chars")


# ============================================================ build: the UniiChat tree
UNII = open(os.path.join(M.WORK, "prompts/unii_system.txt")).read()
# Line length. The first run asked for "at most 512 bytes (about 70 words)" against a 512-dash
# ruler, and Sonnet's first reply ran over the validator's 536 bytes on about 4 of 20 lines at
# levels 1-2 and 8 of 20 at level 3; each such batch then cost a full fix call carrying the 16 KB
# <chat> again (384 of its 703 calls). The prompt now aims at 400 bytes with 512 as the stated
# hard limit, and a line still over goes to one batched shorten call per level (lines only).
# Missing lines. The first 400-byte probe (host, 3 calls) fixed length but lost 13, 7 and 16 of 20
# lines: the model merged neighbouring inputs into one line and ended its turn (end_turn, ~1k
# output tokens): L1/0-41's <<0+2>> carries input 2+2's "Unii restarting in place", and its
# <<44+2>> the archive results of inputs 46+2 to 82+2; L2/132-151 returned made-up ids 590+4 and
# 598+4. So each task now says the inputs are separate, and every request ends by naming how many
# lines to write and their ids (ids_rule). A line still missing is re-asked at the end of its
# level, 20 to a call, with its input only (retry_missing).
TARGET_BYTES = 400
OVER = TR.LIMIT + 24  # the validator's line, unchanged from the first run
RULER = "-" * TARGET_BYTES
SPLIT = 30_000
CTX_BYTES = 16_000
LEAF_BATCH_BYTES = 70_000
LEAF_BATCH_MAX = 10
MERGE_BATCH_MAX = 20
SHORTEN_BATCH_MAX = 20
LENGTH_RULE = ("one line of about 400 bytes (about 55 words), the length of this ruler:\n{RULER}\n"
               "512 bytes is the hard limit: a longer line is sent back to be shortened.")
SEPARATE_RULE = ("The inputs are separate: write one line for every input, covering that input only. Never move content from "
                 "one input into another's line, never combine inputs, and never skip one, even when inputs are short, "
                 "repetitive or about the same thing.")
LEAF_TASK = ("Compaction: below are separate <input>s, each one message. Compress each input on its own into " + LENGTH_RULE + "\n"
             "<chat> is the view before these messages: context, never content to add.\n" + SEPARATE_RULE)
MERGE_TASK = ("Compaction: below are separate <input>s. Each holds two adjacent lines of the view, a then b. For each input on "
              "its own, merge its a and b into " + LENGTH_RULE + "\n"
              "<chat> is the view before them: context, never content to add.\n" + SEPARATE_RULE)
SHORTEN_TASK = ("Compaction: below are separate <input>s, each holding one line that is over the 512-byte limit. Rewrite each "
                "one on its own as " + LENGTH_RULE + "\nKeep what matters most and cut the least valuable items; add nothing.\n" +
                SEPARATE_RULE)
REPLY_RULE = ("Reply with exactly one line per input, in order, each starting with <<id>> (for example <<12+1>> ) "
              "followed by the line, and nothing else.")


def ids_rule(labels):
    """Ends every tree request: how many lines, and exactly which ids, in order."""
    n = len(labels)
    return (f"\n\nThere are {n} inputs. Reply with exactly {n} lines, one for each of these ids, in this order: " +
            " ".join(f"<<{lab}>>" for lab in labels) + ".")
HEAD = lambda k: f"{k[1] * 2 ** k[0]}+{2 ** k[0]}|"  # noqa: E731


def tree_system(task):
    return UNII + "\n\n" + task.replace("{RULER}", RULER) + "\n\n" + REPLY_RULE


def merge_prompt_id():
    """Fingerprint of today's merge request; a probe result counts for the plan only if it matches."""
    return hashlib.sha256((tree_system(MERGE_TASK) + ids_rule(["0+2"])).encode("utf-8")).hexdigest()[:12]


def inputs_body(items):
    return "\n".join(f'<input id="{lab}">\n{txt}\n</input>' for lab, txt in items)


def hard_cut(text):
    """The gist's last resort for a line still over the limit: cut at 512 bytes, mark the cut."""
    raw = text.encode("utf-8")[:TR.LIMIT]
    return raw.decode("utf-8", "ignore").rsplit(" ", 1)[0] + "…"


def label(key):
    return f"{key[1] * 2 ** key[0]}+{2 ** key[0]}"


def tree_messages():
    """The log as UniiChat logs it: long non-tool texts split into several messages."""
    msgs = []
    for e in M.L:
        if e["kind"] == "reset":
            continue
        t = e["text"]
        if e["kind"] != "echo" and len(t) > SPLIT:
            parts = [t[k:k + SPLIT] for k in range(0, len(t), SPLIT)]
            for n, p in enumerate(parts):
                msgs.append({"i": e["i"], "kind": e["kind"],
                             "text": p + ("\n[continues in the next message]" if n < len(parts) - 1 else "")})
        else:
            msgs.append({"i": e["i"], "kind": e["kind"], "text": t})
    return msgs


def leaf_batches(todo, msgs):
    batches, cur, size = [], [], 0
    for j in todo:
        s = len(msgs[j]["text"])
        if cur and (len(cur) >= LEAF_BATCH_MAX or size + s > LEAF_BATCH_BYTES or j - cur[-1] > 40):
            batches.append(cur)
            cur, size = [], 0
        cur.append(j)
        size += s
    if cur:
        batches.append(cur)
    return batches


def parse_lines(reply, ids):
    got = {}
    for m in re.finditer(r"<<\s*([0-9+]+)\s*>>\s*(.+?)(?=\n\s*<<\s*[0-9+]+\s*>>|\Z)", reply, re.S):
        got[m.group(1)] = re.sub(r"\s*\n\s*", " ", m.group(2)).strip()
    return {k: got.get(k) for k in ids}


class TreeStore:
    def __init__(self, write=True, root=None):
        root = root or TREE
        self.root = root
        self.msgs = tree_messages()
        self.nodes, self.meta = {}, {}
        self.lock = threading.Lock()
        self.path = os.path.join(root, "nodes.jsonl")
        if os.path.exists(self.path):
            for line in open(self.path):
                d = json.loads(line)
                self.nodes[(d["l"], d["i"])] = d["text"]
                self.meta[(d["l"], d["i"])] = d
        # lines over the limit, held until their level's shorten step (kept on disk for a resume)
        self.pending_path = os.path.join(root, "pending.jsonl")
        self.pending = {}
        self.missing = []  # (node key, id, input) a batch's reply left out; retried at the level's end
        if os.path.exists(self.pending_path):
            for line in open(self.pending_path):
                d = json.loads(line)
                if (d["l"], d["i"]) not in self.nodes:
                    self.pending[(d["l"], d["i"])] = d
        self.fh = self.pfh = None
        if write:
            os.makedirs(root, exist_ok=True)
            self.fh = open(self.path, "a")
            self.pfh = open(self.pending_path, "a")
            save(os.path.join(root, "msgs.json"), [m["i"] for m in self.msgs])

    def replace(self, key, text, call=None, off_model=()):
        """A held over-limit line, rewritten: the later record wins when nodes.jsonl is read back."""
        with self.lock:
            self.nodes[key] = text
            rec = {"l": key[0], "i": key[1], "text": text, "size": TR.b(text),
                   "model": None if call is None else C.MODEL, "call": call, "off_model": list(off_model)}
            self.meta[key] = rec
            if self.fh:
                self.fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
                self.fh.flush()

    def src(self, j):
        return f"{self.msgs[j]['kind']}: {self.msgs[j]['text']}"

    def put(self, key, text, call=None, off_model=()):
        with self.lock:
            if key in self.nodes:
                return
            self.nodes[key] = text
            rec = {"l": key[0], "i": key[1], "text": text, "size": TR.b(text),
                   "model": None if call is None else C.MODEL, "call": call, "off_model": list(off_model)}
            self.meta[key] = rec
            if self.fh:
                self.fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
                self.fh.flush()

    def line_of(self, key):
        return HEAD(key) + self.nodes[key].replace("\n", " ")

    def ctx_before(self, start_msg):
        lines, sz, k = [], 0, start_msg - 1
        while k >= 0 and sz < CTX_BYTES:
            if (0, k) in self.nodes:
                ln = self.line_of((0, k))
                lines.append(ln)
                sz += TR.b(ln) + 1
            k -= 1
        return "<chat>\n" + "\n".join(reversed(lines)) + "\n</chat>"

    # ---- one batched call: the lines it returned, by id. take() stores them (holding any over
    # the limit for shorten_pending) and queues the ids it left out for retry_missing.
    def run_batch(self, task, ctx, items, key):
        labels = [lab for lab, _ in items]
        r = C.call(key, "build", tree_system(task), ctx + "\n\n" + inputs_body(items) + ids_rule(labels), cache="off")
        return {lab: v for lab, v in parse_lines(r["text"], labels).items() if v}, sorted(r["off_model"])

    def take(self, batch, res, key, off):
        """batch: [(node key, id, input text)]."""
        for k, lab, txt in batch:
            if lab in res:
                self.store_line(k, res[lab], key, off)
            else:
                with self.lock:
                    self.missing.append((k, lab, txt))

    def retry_missing(self, task):
        """The level's left-out lines, SHORTEN_BATCH_MAX to a call, with their inputs only (no
        <chat>). One the model's answer still leaves out is stored as "(compaction failed)"; a failed
        call stops the run (C.Stopped) and stores nothing."""
        todo, self.missing = sorted(self.missing), []
        if not todo:
            return
        groups = [todo[n:n + SHORTEN_BATCH_MAX] for n in range(0, len(todo), SHORTEN_BATCH_MAX)]
        log(f"tree: {len(todo)} lines left out of their batch's reply, asked again in {len(groups)} calls")
        system = tree_system(task)

        def do(group):
            (l0, i0), (_, i1) = group[0][0], group[-1][0]
            key = f"build/tree/retry/L{l0}/{i0}-{i1}"
            labels = [lab for _, lab, _ in group]
            r = C.call(key, "build", system, inputs_body([(lab, txt) for _, lab, txt in group]) + ids_rule(labels), cache="off")
            got, off = {lab: v for lab, v in parse_lines(r["text"], labels).items() if v}, r["off_model"]
            for k, lab, _ in group:
                self.store_line(k, got.get(lab, "(compaction failed)"), key, off)
        pool_run(do, groups, "tree retry batch")

    def store_line(self, key, text, call, off):
        """A line within the limit becomes its node; one over it is held for shorten_pending."""
        if TR.b(text) <= OVER:
            self.put(key, text, call, off)
            return
        rec = {"l": key[0], "i": key[1], "text": text, "call": call, "off_model": list(off)}
        with self.lock:
            self.pending[key] = rec
            if self.pfh:
                self.pfh.write(json.dumps(rec, ensure_ascii=False) + "\n")
                self.pfh.flush()

    def shorten_pending(self):
        """Every held line, SHORTEN_BATCH_MAX to a call, lines only (no <chat>, no inputs). The
        shorter of the two is kept; one still over the limit is cut and marked (hard_cut)."""
        todo = sorted(k for k in self.pending if k not in self.nodes)
        if not todo:
            return
        groups = [todo[n:n + SHORTEN_BATCH_MAX] for n in range(0, len(todo), SHORTEN_BATCH_MAX)]
        log(f"tree: {len(todo)} lines over {OVER} bytes, shortened in {len(groups)} calls")
        system = tree_system(SHORTEN_TASK)

        def do(group):
            key = f"build/tree/shorten/L{group[0][0]}/{group[0][1]}-{group[-1][1]}"
            items = [(label(k), self.pending[k]["text"]) for k in group]
            r = C.call(key, "build", system, inputs_body(items) + ids_rule([lab for lab, _ in items]), cache="off")
            got, off = parse_lines(r["text"], [lab for lab, _ in items]), r["off_model"]
            for k, (lab, text) in zip(group, items):
                v = got.get(lab)
                if v and TR.b(v) < TR.b(text):
                    text = v
                if TR.b(text) > OVER:
                    text = hard_cut(text)
                self.put(k, text, key, set(self.pending[k]["off_model"]) | set(off))
        pool_run(do, groups, "tree shorten batch")

    # ---- leaves
    def leaf_todo(self):
        """Messages that fit in 512 bytes are their own node (no call; kept in memory only when
        the store isn't writing). Returns the ones that need the model."""
        todo = []
        for j in range(len(self.msgs)):
            s = self.src(j)
            if TR.b(s) <= TR.LIMIT:
                self.put((0, j), s)
            elif (0, j) not in self.nodes:
                todo.append(j)
        return todo

    def build_leaves(self):
        batches = leaf_batches(self.leaf_todo(), self.msgs)
        if not batches:
            self.shorten_pending()
            return
        log(f"tree: {len(batches)} leaf calls to make")

        def do(batch):
            key = f"build/tree/leaf/{batch[0]}-{batch[-1]}"
            entries = [((0, j), f"{j}+1", self.src(j)) for j in batch]
            res, off = self.run_batch(LEAF_TASK, self.ctx_before(batch[0]), [(lab, txt) for _, lab, txt in entries], key)
            self.take(entries, res, key, off)
        pool_run(do, batches, "tree leaf batch")
        self.retry_missing(LEAF_TASK)
        self.shorten_pending()

    # ---- merges: replay the view with real sizes (512-byte bound for unbuilt lines), build the
    # lowest missing level of planned parents, repeat until a replay plans nothing unbuilt
    def size(self, k):
        if k in self.nodes:
            return TR.b(HEAD(k) + self.nodes[k].replace("\n", " ")) + 1
        return TR.b(HEAD(k)) + TR.LIMIT + 1

    def replay(self, write=True):
        view, total, planned, events = [], 0, set(), []
        for j in range(len(self.msgs)):
            view.append((0, j))
            total += self.size((0, j))
            T = j + 1
            if total <= TR.HI:
                continue
            before, n = total, 0
            while total > TR.LO:
                best = None
                for idx in range(len(view) - 1):
                    (l1, i1), (l2, i2) = view[idx], view[idx + 1]
                    if l1 == l2 and i1 % 2 == 0 and i2 == i1 + 1:
                        due = (T + 1) / 2 ** l1 - i1
                        if best is None or due > best[0]:
                            best = (due, idx)
                if best is None:
                    break
                idx = best[1]
                a, c = view[idx], view[idx + 1]
                p = (a[0] + 1, a[1] // 2)
                if write and p not in self.nodes and a in self.nodes and c in self.nodes:
                    fit = TR.merged_if_fits(self.nodes[a], self.nodes[c])
                    if fit is not None:
                        self.put(p, fit)
                total += self.size(p) - self.size(a) - self.size(c)
                view[idx:idx + 2] = [p]
                planned.add(p)
                n += 1
            events.append({"T": T, "before": before, "after": total, "merges": n})
        return view, planned, events

    def build_level(self, parents):
        parents = sorted(parents, key=lambda p: p[1] * 2 ** p[0])
        groups = [parents[k:k + MERGE_BATCH_MAX] for k in range(0, len(parents), MERGE_BATCH_MAX)]

        def do(group):
            l = group[0][0]
            key = f"build/tree/merge/L{l}/{group[0][1]}-{group[-1][1]}"
            entries = [((l, i), label((l, i)), self.line_of((l - 1, 2 * i)) + "\n" + self.line_of((l - 1, 2 * i + 1)))
                       for (_, i) in group]
            res, off = self.run_batch(MERGE_TASK, self.ctx_before(group[0][1] * 2 ** l), [(lab, txt) for _, lab, txt in entries], key)
            self.take(entries, res, key, off)
        pool_run(do, groups, "tree merge batch")
        self.retry_missing(MERGE_TASK)
        self.shorten_pending()

    def build_merges(self):
        self.shorten_pending()  # lines a stopped run left held
        for rnd in range(60):
            view, planned, events = self.replay()
            missing = [p for p in planned if p not in self.nodes]
            if not missing:
                return view, events
            ready = [p for p in missing if (p[0] - 1, 2 * p[1]) in self.nodes and (p[0] - 1, 2 * p[1] + 1) in self.nodes]
            if not ready:
                raise RuntimeError(f"tree stalled: {len(missing)} planned parents missing, none ready")
            lvl = min(p[0] for p in ready)
            todo = [p for p in ready if p[0] == lvl]
            before = len(self.nodes)
            self.build_level(todo)
            log(f"tree round {rnd}: {len(missing)} planned parents missing; level {lvl}: built {len(self.nodes) - before} of {len(todo)}")
            if len(self.nodes) == before:
                raise RuntimeError(f"tree round {rnd} built nothing at level {lvl}")
        raise RuntimeError("tree: 60 rounds without finishing")

    def view_text(self, view):
        return "<chat>\n" + "\n".join(self.line_of(k) for k in view) + "\n</chat>"


def run_tree():
    stats = load(os.path.join(TREE, "stats.json"))
    if stats and stats.get("done"):
        return
    st = TreeStore()
    st.build_leaves()
    view, events = st.build_merges()
    vt = st.view_text(view)
    save(os.path.join(TREE, "view.json"), [list(k) for k in view])
    open(os.path.join(TREE, "view.txt"), "w").write(vt)
    levels = collections.Counter(k[0] for k in view)
    save(os.path.join(TREE, "stats.json"), {"done": True, "messages": len(st.msgs), "nodes": len(st.nodes),
                                            "model_nodes": sum(1 for m in st.meta.values() if m.get("call")),
                                            "view_lines": len(view), "view_bytes": TR.b(vt),
                                            "view_levels": dict(sorted(levels.items())), "events": events})
    log(f"tree done: {len(st.nodes):,} nodes, view {len(view)} lines, {TR.b(vt):,} bytes")


# ============================================================ build: the tree filed as the chat goes (designs A and B)
# Why the batch build paid $71: run_batch (above) sends `ctx + inputs_body(items) + ids_rule(labels)` as the one
# user message, with ctx = ctx_before(batch start), a 16 KB window that is different for every batch. The first run
# had no cache setting, so Claude Code marked that whole user message for a 1-hour cache write ($4/MTok) on every
# call; no later call starts with the same bytes, so none was ever read back (14.3M written, 1.1M read: only the
# 1.4k-token system prompt was shared). Prompt caching only pays when a later request repeats the prefix byte for byte
# (https://platform.claude.com/docs/en/build-with-claude/prompt-caching: "placing it on a block that changes every
# request ... writes a fresh entry each time and never hits").
#
# Here the same tree (512-byte lines, 64-128 KB view, the gist's due order) is built turn by turn, every call
# claude-sonnet-5-5 with the 5-minute cache ($2.50 write, $0.10 read), calls in chat order:
#   A  the agent files as it works: one Claude Code session (--session-id, then --resume) holds the view it starts
#      from and every exchange since; each turn files that turn's messages; Claude Code resends the stored turns
#      unchanged and marks the last message, so all earlier turns are cache reads. At each rewrite (view over
#      128 KB) the agent merges in the same session; the next turn starts a new session from the merged view.
#      A session also restarts past A_SESSION_CHARS characters.
#   B  the hub files each turn in its own call: the system prompt is UniiChat's prompt, the task and the view as
#      of the last rewrite (one cached prefix, rewritten only at a rewrite); the request is the latest lines filed
#      since (<recent>, at most B_TAIL_BYTES) and the new messages, written once.
# A turn opens at each user, work, sys or note message. A turn with nothing over 512 bytes needs no call; its
# messages go with the next call. A rewrite is checked at the end of each turn (the gist checks after each message).
DESIGNS = ("A", "B")
INC = {d: os.path.join(BUILD, f"inc-{d}") for d in DESIGNS}
A_SESSION_CHARS = int(os.environ.get("EVAL_A_SESSION_CHARS", "400000"))  # Sonnet 5.5 holds 1M tokens
B_TAIL_BYTES = 6_000
EST_LINE = 420          # the plan's guess for a merged line not written yet (bytes)
OVER_RATE_PCT = 15      # the dry run's share of lines over the limit (the probe: 9 of 60)
TURN_KINDS = ("note", "user", "work", "sys")
BUDGET = float(os.environ.get("EVAL_BUDGET", "40"))
A_TURNS = None  # --a-turns: build design A over the chat's first N turns only (cost per turn; no score)
INC_TASK = ("# This session\n\n"
            "You keep this chat's memory tree as the chat goes. Each request brings new messages to file, or pairs of "
            "lines to merge, or lines to shorten.\n\n"
            "Filing: a <msg> is a message of at most 512 bytes; it is already its own line, so it is context only. "
            "Compress each <input> on its own into " + LENGTH_RULE + "\n\n"
            "Merging: when the view passes 128,000 bytes, a request holds <input>s that each carry two adjacent lines "
            "of the view, a then b; merge each input's a and b into one such line.\n\n"
            "The view, earlier messages and earlier requests are context: use them to understand an <input>, never to "
            "add what it lacks.\n" + SEPARATE_RULE)
MSG_TS = {e["i"]: e["ts"] for e in M.L}


def inc_system(design, snapshot=None):
    s = UNII + "\n\n" + INC_TASK.replace("{RULER}", RULER) + "\n\n" + REPLY_RULE
    if design == "B":
        s += ("\n\n# The view\n\nYour memory of the chat as of its last rewrite. Each request adds the latest lines filed "
              "since then (<recent>) and the new messages.\n\n" + snapshot)
    return s


def chat_turns(msgs):
    """(first, end) message ranges; a turn opens at a user, work, sys or note message (one source message split
    in parts opens one turn)."""
    opens = [j for j, m in enumerate(msgs)
             if m["kind"] in TURN_KINDS and (j == 0 or msgs[j - 1]["i"] != m["i"])]
    if not opens or opens[0] != 0:
        opens = [0] + opens
    b = opens + [len(msgs)]
    return [(x, y) for x, y in zip(b, b[1:]) if y > x]


def live_caller(key, design, system, user, labels, kind, session=None, meta=None):
    r = C.call(key, f"build-{design}", system, user, cache="5m", session=session, meta=dict(meta or {}, kind=kind))
    return r["text"], r["off_model"]


class SimCaller:
    """The plan's dry run: no call. Each reply is the batch tree's line for that id (400 bytes where it has none,
    OVER_RATE_PCT of them over the limit), billed by the cache rules the designs rely on: a prefix seen before is
    read, anything new is written, a resumed session reads every earlier turn and writes the last reply plus the
    new request."""
    def __init__(self, tpc, batch_nodes):
        self.tpc, self.batch = tpc, batch_nodes
        self.cached, self.sessions = set(), {}
        self.rows = []  # (design, kind, write tokens, read tokens, output tokens)
        self.lock = threading.Lock()

    def __call__(self, key, design, system, user, labels, kind, session=None, meta=None):
        lines = []
        for lab in labels:
            i, n = (int(x) for x in lab.split("+"))
            k = (n.bit_length() - 1, i // n)
            if kind == "shorten":
                txt = "s" * 400
            else:
                txt = self.batch.get(k) or "x" * 400
                if zlib.crc32(lab.encode()) % 100 < OVER_RATE_PCT:
                    txt = (txt + " " + "y" * 600)[:560]
            lines.append(f"<<{lab}>> {txt}")
        reply = "\n".join(lines)
        t = lambda s: len(s) * self.tpc  # noqa: E731
        with self.lock:
            w = r = 0.0
            h = hashlib.sha256(system.encode()).hexdigest()
            if h in self.cached:
                r += t(system)
            else:
                w += t(system)
                self.cached.add(h)
            if session is None:
                w += t(user)
            else:
                sid, new = session
                hist = self.sessions.setdefault(sid, [])
                if not new and hist:
                    r += sum(t(x) for x in hist[:-1])
                    w += t(hist[-1])
                w += t(user)
                hist += [user, reply]
            self.rows.append((design, kind, w, r, t(reply)))
        return reply, []

    def cost(self, design):
        rows = [x for x in self.rows if x[0] == design]
        w, r, o = (sum(x[n] for x in rows) for n in (2, 3, 4))
        return {"calls": len(rows), "write": int(w), "read": int(r), "output": int(o),
                "usd": (w * PRICE["w5"] + r * PRICE["rd"] + o * PRICE["out"]) / 1e6,
                "by_kind": collections.Counter(x[1] for x in rows)}


class IncBuild:
    def __init__(self, design, caller=live_caller, write=True):
        self.d, self.call, self.write = design, caller, write
        self.root = INC[design]
        self.st = TreeStore(write=write, root=self.root if write else os.path.join(self.root, "__dry_run__"))
        self.state_path = os.path.join(self.root, "state.json")
        self.s = (load(self.state_path) if write else None) or {
            "turn": 0, "view": [], "carry": [], "over": [], "events": [], "snapshot": None, "snap_len": 0,
            "session": None, "session_chars": 0, "sessions": 0,
            "started": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
        self.view = [tuple(k) for k in self.s["view"]]
        self.s["session"] = None  # never continue a session a stopped run may have left mid-turn
        self.lock = threading.Lock()

    # ---- state
    def save_state(self):
        if self.write:
            self.s["view"] = [list(k) for k in self.view]
            save(self.state_path, self.s)

    def line(self, k):
        return self.st.line_of(k)

    def vbytes(self):
        return sum(TR.b(self.line(k)) + 1 for k in self.view)

    def view_text(self):
        return "<chat>\n" + "\n".join(self.line(k) for k in self.view) + "\n</chat>"

    def ts(self, j):
        return MSG_TS.get(self.st.msgs[j]["i"])

    def block(self, js):
        out = []
        for j in js:
            s = self.st.src(j)
            tag = "input" if TR.b(s) > TR.LIMIT else "msg"
            out.append(f'<{tag} id="{j}+1">\n{s}\n</{tag}>')
        return "New messages, oldest first:\n\n" + "\n".join(out)

    # ---- one request, as each design sends it; returns {id: line or None}
    def ask(self, key, kind, user, labels, meta):
        return (self.ask_a if self.d == "A" else self.ask_b)(key, kind, user, labels, meta)

    def ask_a(self, key, kind, user, labels, meta):
        new = self.s["session"] is None or self.s["session_chars"] > A_SESSION_CHARS
        if new:
            self.s["session"], self.s["session_chars"] = str(uuid.uuid4()), 0
            self.s["sessions"] += 1
            body = self.view_text() + "\n\nThe view above is your memory of the chat so far.\n\n" + user
        else:
            body = user
        text, _ = self.call(key, self.d, inc_system("A"), body, labels, kind, session=(self.s["session"], new), meta=meta)
        self.s["session_chars"] += len(body) + len(text)
        return parse_lines(text, labels)

    def ask_b(self, key, kind, user, labels, meta):
        if self.s["snapshot"] is None:
            self.snap()
        head = ""
        if kind in ("file", "fix"):
            tail = [self.line(k) for k in self.view[self.s["snap_len"]:]]
            keep, size = [], 0
            for ln in reversed(tail):
                if keep and size + TR.b(ln) + 1 > B_TAIL_BYTES:
                    break
                keep.append(ln)
                size += TR.b(ln) + 1
            if keep:
                head = ("<recent>\n" + (f"({len(tail) - len(keep)} earlier lines filed since the view are left out)\n"
                                        if len(keep) < len(tail) else "") + "\n".join(reversed(keep)) + "\n</recent>\n\n")
        text, _ = self.call(key, self.d, inc_system("B", self.s["snapshot"]), head + user, labels, kind, meta=meta)
        return parse_lines(text, labels)

    def snap(self):
        self.s["snapshot"], self.s["snap_len"] = self.view_text(), len(self.view)

    def store(self, k, text, call):
        self.st.put(k, text, call)
        with self.lock:
            if TR.b(text) > OVER and list(k) not in self.s["over"]:
                self.s["over"].append(list(k))

    def each(self, fn, groups, what):
        """A's requests are turns of one session, so in order; B's merge and shorten calls share one cached prefix
        and run side by side."""
        if self.d == "A" or not self.write:
            for g in groups:
                fn(g)
        else:
            pool_run(fn, groups, what)

    # ---- filing, merging, shortening
    def file(self, t, js, need):
        labels = [f"{j}+1" for j in need]
        key = f"build/inc-{self.d}/file/t{t}"
        meta = {"turn": t, "chat_ts": self.ts(js[-1]), "msgs": len(js), "lines": len(need),
                "block_chars": sum(len(self.st.src(j)) for j in js)}
        got = self.ask(key, "file", self.block(js) + ids_rule(labels), labels, meta)
        miss = [j for j in need if not got.get(f"{j}+1")]
        if miss:
            ml = [f"{j}+1" for j in miss]
            user = ("Your last reply left out some lines; write them now." if self.d == "A" else self.block(miss)) + ids_rule(ml)
            got.update({k: v for k, v in self.ask(key + "/fix", "fix", user, ml, dict(meta, lines=len(ml))).items() if v})
        for j in need:
            self.store((0, j), got.get(f"{j}+1") or "(compaction failed)", key)

    def shorten(self, tag, t):
        todo = [tuple(k) for k in self.s["over"]]
        if not todo:
            return
        groups = [todo[n:n + SHORTEN_BATCH_MAX] for n in range(0, len(todo), SHORTEN_BATCH_MAX)]

        def do(g):
            items = [(label(k), self.st.nodes[k]) for k in g]
            labs = [lab for lab, _ in items]
            key = f"build/inc-{self.d}/shorten/{tag}/{labs[0]}"
            user = SHORTEN_TASK.replace("{RULER}", RULER) + "\n\n" + inputs_body(items) + ids_rule(labs)
            got = self.ask(key, "shorten", user, labs, {"turn": t, "lines": len(g)})
            for k, (lab, text) in zip(g, items):
                v = got.get(lab)
                if v and TR.b(v) < TR.b(text):
                    text = v
                if TR.b(text) > OVER:
                    text = hard_cut(text)
                self.st.replace(k, text, key)
        self.each(do, groups, f"inc-{self.d} shorten")
        self.s["over"] = []

    def plan(self, T):
        """The parents the gist's due order merges next, from the view as it is (real sizes; EST_LINE for a
        parent not written yet), until it would fit 64,000 bytes."""
        view = list(self.view)

        def size(k):
            if k in self.st.nodes:
                return TR.b(self.line(k)) + 1
            a, c = (k[0] - 1, 2 * k[1]), (k[0] - 1, 2 * k[1] + 1)
            if a in self.st.nodes and c in self.st.nodes:
                fit = TR.merged_if_fits(self.st.nodes[a], self.st.nodes[c])
                if fit is not None:
                    return TR.b(HEAD(k) + fit.replace("\n", " ")) + 1
            return TR.b(HEAD(k)) + EST_LINE + 1
        sizes = [size(k) for k in view]
        total, planned = sum(sizes), []
        while total > TR.LO:
            best = None
            for idx in range(len(view) - 1):
                (l1, i1), (l2, i2) = view[idx], view[idx + 1]
                if l1 == l2 and i1 % 2 == 0 and i2 == i1 + 1:
                    due = (T + 1) / 2 ** l1 - i1
                    if best is None or due > best[0]:
                        best = (due, idx)
            if best is None:
                break
            idx = best[1]
            p = (view[idx][0] + 1, view[idx][1] // 2)
            ps = size(p)
            total += ps - sizes[idx] - sizes[idx + 1]
            view[idx:idx + 2], sizes[idx:idx + 2] = [p], [ps]
            planned.append(p)
        return planned

    def merge(self, todo, t, T):
        need = []
        for p in todo:
            if p in self.st.nodes:
                continue
            a, c = (p[0] - 1, 2 * p[1]), (p[0] - 1, 2 * p[1] + 1)
            fit = TR.merged_if_fits(self.st.nodes[a], self.st.nodes[c])
            if fit is not None:
                self.st.put(p, fit)
            else:
                need.append(p)
        groups = [need[k:k + MERGE_BATCH_MAX] for k in range(0, len(need), MERGE_BATCH_MAX)]

        def do(g):
            l = g[0][0]
            items = [(label(p), self.line((l - 1, 2 * p[1])) + "\n" + self.line((l - 1, 2 * p[1] + 1))) for p in g]
            labs = [lab for lab, _ in items]
            key = f"build/inc-{self.d}/merge/t{t}/L{l}/{g[0][1]}-{g[-1][1]}"
            meta = {"turn": t, "chat_ts": self.ts(T - 1), "lines": len(g)}
            got = self.ask(key, "merge", "The view has passed 128,000 bytes. Merge each input below.\n\n" +
                           inputs_body(items) + ids_rule(labs), labs, meta)
            miss = [(lab, txt) for lab, txt in items if not got.get(lab)]
            if miss:
                ml = [lab for lab, _ in miss]
                got.update({k: v for k, v in self.ask(key + "/fix", "fix", "Merge each input below.\n\n" + inputs_body(miss) +
                                                      ids_rule(ml), ml, dict(meta, lines=len(ml))).items() if v})
            for p in g:
                self.store(p, got.get(label(p)) or "(compaction failed)", key)
        self.each(do, groups, f"inc-{self.d} merge")

    def event(self, t, T):
        """The view passed 128,000 bytes: shorten what is held, then merge level by level (the lowest level whose
        pairs are both in the view first, re-planned on real sizes after each) until it fits 64,000 bytes."""
        before = self.vbytes()
        self.shorten(f"t{t}a", t)
        merges = 0
        for _ in range(60):
            plan = self.plan(T)
            vset = set(self.view)
            ready = [p for p in plan if (p[0] - 1, 2 * p[1]) in vset and (p[0] - 1, 2 * p[1] + 1) in vset]
            if not ready:
                break
            lvl = min(p[0] for p in ready)
            todo = [p for p in ready if p[0] == lvl]
            self.merge(todo, t, T)
            for p in todo:
                idx = self.view.index((p[0] - 1, 2 * p[1]))
                self.view[idx:idx + 2] = [p]
            merges += len(todo)
        self.shorten(f"t{t}b", t)
        self.s["events"].append({"turn": t, "T": T, "before": before, "after": self.vbytes(), "merges": merges})
        if self.d == "B":
            self.snap()
        else:
            self.s["session"] = None

    def run(self):
        turns = chat_turns(self.st.msgs)
        end = len(turns) if self.d != "A" or A_TURNS is None else min(A_TURNS, len(turns))
        for t in range(self.s["turn"], end):
            a, b = turns[t]
            for j in range(a, b):
                if TR.b(self.st.src(j)) <= TR.LIMIT:
                    self.st.put((0, j), self.st.src(j))
            js = self.s["carry"] + list(range(a, b))
            need = [j for j in range(a, b) if (0, j) not in self.st.nodes]
            if need:
                self.file(t, js, need)
                self.s["carry"] = []
            else:
                self.s["carry"] = js
            self.view += [(0, j) for j in range(a, b)]
            if self.vbytes() > TR.HI:
                self.event(t, b)
            self.s["turn"] = t + 1
            self.save_state()
            if self.write and t % 25 == 0:
                log(f"inc-{self.d}: turn {t + 1}/{len(turns)}, view {self.vbytes():,} B, {len(self.s['events'])} rewrites")
        if end < len(turns):
            if self.write:
                log(f"inc-{self.d}: stopped after turn {end} of {len(turns)} (--a-turns)")
            return
        self.shorten("end", len(turns))
        self.finish(len(turns))

    def finish(self, nturns):
        if not self.write:
            return
        vt = self.view_text()
        save(os.path.join(self.root, "view.json"), [list(k) for k in self.view])
        open(os.path.join(self.root, "view.txt"), "w").write(vt)
        levels = collections.Counter(k[0] for k in self.view)
        save(os.path.join(self.root, "stats.json"), {
            "done": True, "design": self.d, "turns": nturns, "messages": len(self.st.msgs), "nodes": len(self.st.nodes),
            "model_nodes": sum(1 for m in self.st.meta.values() if m.get("call")),
            "failed_nodes": sum(1 for m in self.st.meta.values() if m.get("text") == "(compaction failed)"),
            "view_lines": len(self.view), "view_bytes": TR.b(vt), "view_levels": dict(sorted(levels.items())),
            "sessions": self.s["sessions"], "events": self.s["events"]})
        self.save_state()
        log(f"inc-{self.d} done: {len(self.st.nodes):,} nodes, view {len(self.view)} lines, {TR.b(vt):,} bytes, "
            f"{len(self.s['events'])} rewrites")


def inc_done(d):
    return bool((load(os.path.join(INC[d], "stats.json")) or {}).get("done"))


def inc_built(d):
    """Done, or (A with --a-turns) built as far as asked."""
    if inc_done(d):
        return True
    return d == "A" and A_TURNS is not None and (load(os.path.join(INC[d], "state.json")) or {}).get("turn", 0) >= A_TURNS


def run_inc(d):
    if not inc_built(d):
        IncBuild(d).run()


def inc_estimate(tpc, designs):
    """Dry run of each design not built yet, on the real chat, with the batch tree's lines standing in for replies
    (a design part-built is estimated whole: an upper bound)."""
    batch = TreeStore(write=False).nodes
    sim = SimCaller(tpc, batch)
    out = {}
    for d in designs:
        if inc_built(d):
            continue
        IncBuild(d, caller=sim, write=False).run()
        out[d] = sim.cost(d)
    return out


def pool_run(fn, items, what):
    """Run fn over items, at most 8 threads (the 4-call cap is in claude_call). A failed item is
    logged and left for a rerun; a stop re-raises after the in-flight calls end."""
    stopped = None
    with cf.ThreadPoolExecutor(8) as ex:
        futs = [ex.submit(fn, it) for it in items]
        for f in cf.as_completed(futs):
            try:
                f.result()
            except C.Stopped as e:
                stopped = e
            except Exception as e:  # noqa: BLE001
                log(f"{what} failed: {e}")
    if stopped:
        raise stopped


def build_phase():
    if SCOPE == "incremental":  # only the trees filed as the chat goes; A and B side by side
        tasks = [lambda d=d: run_inc(d) for d in DESIGNS_ON]
    else:
        tasks = [lambda m=m: run_chain(m) for m in METHODS] + [run_cc_real, run_tree]
    pool_run(lambda t: t(), tasks, "build task")


# ============================================================ answer
FRAME = ("You are the orchestrator agent of a CawCo fleet (session \"Orchestrate cockpit fleet work\", instance 23cb5219, "
         "repo /home/bewinxed/cockpit), resuming after a context reset at 2026-10-16 02:49 UTC.")
RULES = ("Answer only from your memory. If it does not hold the answer, say so plainly instead of guessing. "
         "Be specific: quote names, ids, paths, numbers and the owner's own words when your memory has them. "
         "At most 120 words. Use no tools.")
MAX_ZOOM_ROUNDS = 6
ZOOM_RULE = ("To open lines, reply with nothing but lines of the form ZOOM id n (for line id+n of the view or of an earlier zoom; at most 6 per reply). "
             "I answer with what each opens: zoom(id, n) gives the two lines of n/2 under it, and zoom(id, 1) gives message id whole. "
             f"You get at most {MAX_ZOOM_ROUNDS} zoom replies. When you have what you need, reply with ANSWER: followed by your answer. ")
NOZOOM_RULE = "Zoom is not available in this call: answer from the view as it stands. Reply with ANSWER: followed by your answer. "
ZOOM_RE = re.compile(r"ZOOM\s*\(?\s*(\d+)\s*[, +]\s*(\d+)\s*\)?")
RUNS_END = ["cawco", "cc", "factory", "cc-real", "cc+C-existing", "cc+C-filed", "cc-real+C-existing", "cc-real+C-filed",
            "tree", "tree-nozoom"]
RUNS_CUT = {"real-cawco-2319": "10-15 23:19", "replay-cawco-2319": "10-15 23:19",
            "real-native-0055": "10-16 00:55", "replay-cc-0055": "10-16 00:55"}
ZOOM_CALLS_PER_PROBE = 2.3  # from the free-model run (longcat): 1.3 zoom replies a question, plus the first call

# Which runs get answered and judged. "full" is everything above. The others keep what the
# decision needs: today's CawCo summary, Claude Code's production compaction chain (2b), (a)+C
# with records as they were (5a) and as filed (5b), and the tree with and without zoom.
SCOPES = {
    "full": (RUNS_END, list(RUNS_CUT)),
    "end": (RUNS_END, []),
    "decision": (["cawco", "cc-real", "cc-real+C-existing", "cc-real+C-filed", "tree", "tree-nozoom"], []),
    "minimal": (["cawco", "cc-real+C-filed", "tree"], []),
    # the batch tree (56%) and native + filed records (47%) judged again beside the two trees filed as the chat
    # goes, four answers to a judge call, so all four are scored in the same calls (main() drops a design not run)
    "incremental": (["tree", "cc-real+C-filed", "tree-A", "tree-B"], []),
}
SCOPE = "full"  # main() sets it from --scope
DESIGNS_ON = list(DESIGNS)  # main() sets it from --designs
# tree runs: (tree folder, zoom allowed)
TREE_RUNS = {"tree": (TREE, True), "tree-nozoom": (TREE, False), "tree-A": (INC["A"], True), "tree-B": (INC["B"], True)}


def scope_runs():
    end, cut = SCOPES[SCOPE]
    return list(end) + list(cut)


def groups():
    end, cut = SCOPES[SCOPE]
    return {"end": list(end), **({"cuts": list(cut)} if cut else {})}


def judge_dir(group):
    """Per scope: the judge sees 4 shuffled answers a call, so a group's calls depend on its runs."""
    return os.path.join(JUD, SCOPE, group)


def tkey(ts):
    mo, rest = ts.split(" ", 1)
    return (mo, rest[:5])


def eligible(pid, run):
    cut = RUNS_CUT.get(run)
    return cut is None or all(tkey(ev["ts"]) < tkey(cut) for ev in P[pid]["evidence"])


def memory_of(run):
    """The text a method carries, or None while its build is missing. Tree runs use the view."""
    def gen(meth, k):
        r = load(chain_path(meth, k))
        return r["context"] if r else None

    def real():
        r = load(os.path.join(BUILD, "cc-real.json"))
        return r["context"] if r else None
    if run in ("cawco", "cc", "factory"):
        return gen(run, 4)
    if run == "cc-real":
        return real()
    if run.startswith("cc-real+C-"):
        base = real()
        return base and base + "\n\n" + M.ledger_open_items(run.split("+C-")[1])
    if run.startswith("cc+C-"):
        base = gen("cc", 4)
        return base and base + "\n\n" + M.ledger_open_items(run.split("+C-")[1])
    if run == "real-cawco-2319":
        return open(os.path.join(M.DATA, "artifacts/cawco-opening-2026-10-15T2319.md")).read()
    if run == "replay-cawco-2319":
        return gen("cawco", 2)
    if run == "real-native-0055":
        return open(os.path.join(M.DATA, "artifacts/native-compact-2026-10-16T0055.md")).read()
    if run == "replay-cc-0055":
        return gen("cc", 3)
    if run in TREE_RUNS:
        root = TREE_RUNS[run][0]
        p = os.path.join(root, "view.txt")
        return open(p).read() if (load(os.path.join(root, "stats.json")) or {}).get("done") else None
    raise SystemExit(f"unknown run {run}")


def answer_system(memory):
    return (FRAME + " Everything you remember about the session so far is in <memory> below. The owner asks you a question. " +
            RULES + f"\n\n<memory>\n{memory}\n</memory>")


def tree_answer_system(view_txt, zoom):
    return (UNII + "\n\n# This call\n\n" + FRAME + " You are Unii in the prompt above. Your memory is the view below. " +
            (ZOOM_RULE if zoom else NOZOOM_RULE) + RULES + "\n\n" + view_txt)


def zoom(st, ident, n):
    if n < 1 or n & (n - 1) or ident % n:
        return f"zoom({ident}, {n}): no such line (n must be a power of 2 and id a multiple of n)"
    if n == 1:
        if 0 <= ident < len(st.msgs):
            t = st.src(ident)
            if len(t) > 20_000:
                t = t[:20_000] + f"\n…[page 1 of {len(t) // 20_000 + 1}; rest cut]"
            return f"zoom({ident}, 1) → message {ident} whole:\n{t}"
        return f"zoom({ident}, 1): no such message"
    l = n.bit_length() - 1
    a, c = (l - 1, 2 * (ident // n)), (l - 1, 2 * (ident // n) + 1)
    if a in st.nodes and c in st.nodes:
        return f"zoom({ident}, {n}) →\n{st.line_of(a)}\n{st.line_of(c)}"
    return f"zoom({ident}, {n}): no such line"


def final_answer(text):
    return text.split("ANSWER:", 1)[1].strip() if "ANSWER:" in text else text.strip()


def answer_one(run, pid, ctx):
    q = f"Owner's question: {P[pid]['question']}"
    key = f"answer/{run}/{pid}"
    usage, calls, off, zooms = {}, [], set(), []

    def ask(k, system, user):
        r = C.call(k, "answer", system, user, cache="5m")
        add_usage(usage, r["usage"])
        calls.append(k)
        off.update(r["off_model"])
        return r["text"]
    if run in TREE_RUNS and TREE_RUNS[run][1]:
        st, system = ctx
        convo = q
        text = ask(f"{key}/r0", system, convo)
        for rnd in range(MAX_ZOOM_ROUNDS):
            reqs = ZOOM_RE.findall(text)
            if "ANSWER:" in text or not reqs:
                break
            reqs = reqs[:6]
            opened = [zoom(st, int(a), int(b)) for a, b in reqs]
            zooms.append([f"{a}+{b}" for a, b in reqs])
            convo += (f"\n\nYour reply:\n{text}\n\nWhat it opened:\n" + "\n\n".join(opened) +
                      f"\n\n({MAX_ZOOM_ROUNDS - rnd - 1} zoom replies left.)")
            text = ask(f"{key}/r{rnd + 1}", system, convo)
        if "ANSWER:" not in text and ZOOM_RE.search(text):
            convo += f"\n\nYour reply:\n{text}\n\nNo more zooms. Reply now with ANSWER: and your answer from what you have."
            text = ask(f"{key}/final", system, convo)
        ans = final_answer(text)
    elif run in TREE_RUNS:
        ans = final_answer(ask(f"{key}/r0", ctx[1], q))
    else:
        ans = ask(f"{key}/r0", ctx, q).strip()
    save(os.path.join(ANS, run, f"{pid}.json"), {"id": pid, "run": run, "model": C.MODEL, "answer": ans, "zooms": zooms,
                                                 "calls": calls, "usage": usage, "off_model": sorted(off)})


def answer_jobs():
    jobs, waiting = [], []
    stores = {}
    for run in scope_runs():
        mem = memory_of(run)
        if mem is None:
            waiting.append(run)
            continue
        if run in TREE_RUNS:
            root, zoomable = TREE_RUNS[run]
            st = stores.get(root) or stores.setdefault(root, TreeStore(write=False, root=root))
            ctx = (st, tree_answer_system(mem, zoomable))
        else:
            ctx = answer_system(mem)
        for pid in P:
            if eligible(pid, run) and not os.path.exists(os.path.join(ANS, run, f"{pid}.json")):
                jobs.append((run, pid, ctx))
    return jobs, waiting


def answer_phase():
    jobs, waiting = answer_jobs()
    if waiting:
        log(f"answer: no memory yet for {', '.join(waiting)} (their build is missing); skipped")
    log(f"answer: {len(jobs)} probe answers to make")
    # one call per run first, so each run's memory is written to the 5-minute cache once and
    # the rest of its probes read it, instead of 4 parallel first calls each writing it
    first, seen = [], set()
    for j in jobs:
        if j[0] not in seen:
            seen.add(j[0])
            first.append(j)
    pool_run(lambda j: answer_one(*j), first, "answer")
    pool_run(lambda j: answer_one(*j), [j for j in jobs if j not in first], "answer")


# ============================================================ judge
RUBRIC = """Score each answer 0, 1 or 2 against the gold answer and the required facts:
2 = every required fact is present and correct, and nothing in the answer contradicts the gold answer.
1 = on the right thread and partly right: some required facts are missing or vague, or there is a minor error, but nothing that would send the agent the wrong way.
0 = says it doesn't know or can't find it, answers about something else, contradicts the gold answer, or invents specifics (ids, paths, numbers, words) that differ from the gold.
Rules: judge only against the gold answer and the required facts. Length earns nothing. Paraphrase is fine, except where a required fact is the owner's own words: then they must be close to verbatim. An id, path, commit or number counts only if it matches exactly. Extra true detail is fine; extra detail that contradicts the gold is an error."""
JUDGE_SYSTEM = ("You grade answers an AI agent gave about its own earlier work.\n\n" + RUBRIC +
                "\n\nReply with JSON only, one key per answer id: {\"A\": {\"score\": 0|1|2, \"why\": \"one short sentence\"}, ...}. Use no tools.")
JUDGE_GROUP_SIZE = 4


def answers_for(run):
    out = {}
    d = os.path.join(ANS, run)
    if os.path.isdir(d):
        for f in os.listdir(d):
            if f.endswith(".json"):
                a = load(os.path.join(d, f))
                if a:
                    out[a["id"]] = a
    return out


def judge_jobs():
    jobs, pending = [], 0
    for group, runs in groups().items():
        A = {r: answers_for(r) for r in runs}
        for pid in P:
            applicable = [r for r in runs if eligible(pid, r)]
            if not applicable:
                continue
            if any(pid not in A[r] for r in applicable):
                pending += 1
                continue
            judged = [r for r in applicable if not A[r][pid]["off_model"]]
            random.Random(f"{group}-{pid}").shuffle(judged)
            for k in range(0, len(judged), JUDGE_GROUP_SIZE):
                path = os.path.join(judge_dir(group), f"{pid}-{k // JUDGE_GROUP_SIZE}.json")
                if not os.path.exists(path):
                    jobs.append((group, pid, judged[k:k + JUDGE_GROUP_SIZE], {r: A[r][pid]["answer"] for r in judged}, path))
    return jobs, pending


def judge_one(group, pid, runs, answers, path):
    p = P[pid]
    letters = [chr(65 + n) for n in range(len(runs))]
    user = (f"Question: {p['question']}\n\nGold answer: {p['gold']}\n\nRequired facts:\n" +
            "\n".join(f"- {m}" for m in p["must"]) + "\n\n" +
            "\n\n".join(f"<answer id=\"{L}\">\n{answers[r]}\n</answer>" for L, r in zip(letters, runs)))
    last = None
    for attempt in range(3):
        r = C.call(f"judge/{SCOPE}/{group}/{os.path.basename(path)[:-5]}/try{attempt}", "judge", JUDGE_SYSTEM, user, cache="off")
        try:
            res = json.loads(re.search(r"\{.*\}", r["text"], re.S).group(0))
            scores = {}
            for L, run in zip(letters, runs):
                s = int(res[L]["score"])
                if s not in (0, 1, 2):
                    raise ValueError(f"score {s}")
                scores[run] = {"score": s, "why": res[L].get("why", "")}
            save(path, {"group": group, "id": pid, "letters": dict(zip(letters, runs)), "scores": scores,
                        "judge": C.MODEL, "off_model": r["off_model"]})
            return
        except (AttributeError, ValueError, KeyError, TypeError) as e:
            last = e
    raise RuntimeError(f"judge {group} {pid}: no usable JSON after 3 calls ({last})")


def judge_phase():
    jobs, pending = judge_jobs()
    if pending:
        log(f"judge: {pending} probe groups wait on missing answers; skipped")
    log(f"judge: {len(jobs)} judge calls to make")
    pool_run(lambda j: judge_one(*j), jobs, "judge")


# ============================================================ report
TYPES = ["recall", "artifact", "continuation", "decision", "correction"]
SEGS = ["NOTE", "S0", "S1", "S2", "S3", "S4"]
SEG_LABEL = {"NOTE": "carried in at 13:49", "S0": "13:49–18:04", "S1": "18:04–20:32", "S2": "20:32–23:18",
             "S3": "23:19–00:55", "S4": "00:55–02:49"}
KEY = {'P01': ['sudo'], 'P02': ['useless tests'], 'P03': ['reducing delegates', 'reduce delegates', 'number of delegates'],
       'P04': ['owner rules', 'owner-rules'], 'P05': ['own canvas'], 'P06': ['CawField'],
       'P07': ['harness and model selector', 'inventing new patterns'], 'P08': ['instead of the preview tool', 'links instead'],
       'P09': ['refetch'], 'P10': ['c shape', 'C-shape', 'C shape'], 'P11': ['jumping to action'], 'P12': ['for the sake of'],
       'P13': ["what i'm approving", 'what changes and why'], 'P14': ['Penpot'], 'P15': ['iPad'], 'P16': ['interface-craft'],
       'P17': ['bento'], 'P18': ['lazy'], 'P19': ['per-project', 'per project', 'onboarding'], 'P20': ['200k'], 'P21': ['Vite 5'],
       'P22': ['floating'], 'P23': ['battery'], 'P24': ['medium'], 'P25': ['by title'], 'P26': ['design system'],
       'P27': ['languages and frameworks', 'all frameworks', 'across frameworks'], 'P28': ['6 runs', 'mock model'],
       'P29': ['64G', '64 G'], 'P30': ['tailscale', 'Tailscale'], 'P31': ['2a74e9fa6'], 'P32': ['bits-ui#2202'],
       'P33': ['44996b923'], 'P34': ['31 KB'], 'P35': ['90-cawco-inotify'], 'P36': ['kept-audit'], 'P37': ['cdd94a2a4'],
       'P38': ['d9ede1e03'], 'P39': ['ffa87e41'], 'P40': ['a2eafa079'], 'P41': ['routineMade'], 'P42': ['Connecting'],
       'P43': ['folder-bytes'], 'P44': ['darwin'], 'P45': ['0.1.12'], 'P46': ['23e62015'], 'P47': ['inspector'],
       'P48': ['own queries'], 'P49': ['20261015'], 'P50': ['Ink chip', 'ink chip'], 'P51': ['12.7'],
       'P52': ['Screen Recording'], 'P53': ['baseline'], 'P54': ['5b112f95']}


def scores_of(group):
    S = {}
    d = judge_dir(group)
    if os.path.isdir(d):
        for f in sorted(os.listdir(d)):
            j = load(os.path.join(d, f)) if f.endswith(".json") else None
            for run, v in ((j or {}).get("scores") or {}).items():
                S[(j["id"], run)] = v["score"]
    return S


def table(S, runs, key, cols, labels=None):
    out = ["| method | " + " | ".join(labels[c] if labels else c for c in cols) + " | **all** |", "|" + "---|" * (len(cols) + 2)]
    for r in runs:
        row, allv = [r], []
        for c in cols:
            v = [S[(pid, r)] for pid in P if (pid, r) in S and key(P[pid]) == c]
            allv += v
            row.append(f"{sum(v)}/{2 * len(v)}" if v else "–")
        row.append(f"**{sum(allv)}/{2 * len(allv)} ({100 * sum(allv) / (2 * len(allv)):.0f}%)**" if allv else "–")
        out.append("| " + " | ".join(row) + " |")
    return "\n".join(out)


def ledger_summary():
    rows = collections.OrderedDict()
    if not os.path.exists(C.LEDGER):
        return "(no calls yet)"
    for d in ledger_rows():
        r = rows.setdefault(d["phase"], {"ok": 0, "failed": 0, "refused": 0, "off_model": 0, "cost": 0.0, "seconds": 0.0,
                                         "input": 0, "cache_write": 0, "cache_read": 0, "output": 0, "thinking": 0})
        r["ok" if d["ok"] else "failed"] += 1
        r["refused"] += 1 if d.get("refused") else 0
        r["off_model"] += 1 if d["off_model"] else 0
        r["cost"] += d.get("cost_usd") or 0
        r["seconds"] += d["seconds"]
        for k in ("input", "cache_write", "cache_read", "output", "thinking"):
            r[k] += d["usage"].get(k, 0)
    out = ["| phase | calls ok | failed attempts | of them refused | off-model | input | cache write | cache read | output (of it thinking) | cost reported | call-seconds |",
           "|---|---|---|---|---|---|---|---|---|---|---|"]
    tot = collections.Counter()
    for ph, r in rows.items():
        out.append(f"| {ph} | {r['ok']:,} | {r['failed']:,} | {r['refused']} | {r['off_model']} | {r['input']:,} | {r['cache_write']:,} | "
                   f"{r['cache_read']:,} | {r['output']:,} ({r['thinking']:,}) | ${r['cost']:.2f} | {r['seconds']:,.0f} |")
        tot.update({k: v for k, v in r.items()})
    out.append(f"| **all** | {tot['ok']:,} | {tot['failed']:,} | {tot['refused']} | {tot['off_model']} | {tot['input']:,} | "
               f"{tot['cache_write']:,} | {tot['cache_read']:,} | {tot['output']:,} ({tot['thinking']:,}) | ${tot['cost']:.2f} | {tot['seconds']:,.0f} |")
    return "\n".join(out)


def cache_sim():
    """Cached share of the view's bytes from one message to the next, in whole 4-line blocks."""
    st = TreeStore(write=False)
    t = TR.Tree()
    t.nodes = st.nodes
    prev, read_b, write_b, sizes, batch = [], 0, 0, [], []
    for j in range(len(st.msgs)):
        t.view.append((0, j))
        t.T = j + 1
        was = False
        if t.view_bytes() > TR.HI:
            def est(p, a, c):
                return TR.b(t.line(p)) + 1 if p in st.nodes else TR.b("x" * TR.LIMIT) + 1
            _, t.view = t.plan_merges(est)
            was = True
        k = 0
        while k < min(len(prev), len(t.view)) and prev[k] == t.view[k]:
            k += 1
        k = (k // 4) * 4
        cached = sum(TR.b(t.line(x)) + 1 for x in t.view[:k])
        total = sum(TR.b(t.line(x)) + 1 for x in t.view)
        read_b += cached
        write_b += total - cached
        sizes.append(total)
        if was:
            batch.append(round(cached / total, 3))
        prev = list(t.view)
    out = {"view_bytes_mean": round(sum(sizes) / len(sizes)), "view_bytes_max": max(sizes), "view_bytes_final": sizes[-1],
           "cached_share_of_view_bytes": round(read_b / (read_b + write_b), 4), "batch_events": len(batch)}
    save(os.path.join(TREE, "cache_sim.json"), out)
    return out


def _usd(u):
    return (u["input"] * PRICE["in"] + u["cache_write"] * PRICE["w5"] + u["cache_read"] * PRICE["rd"] +
            u["output"] * PRICE["out"]) / 1e6


def _sum_usage(rows):
    u = collections.Counter()
    for x in rows:
        u.update({k: x["usage"].get(k, 0) for k in ("input", "cache_write", "cache_read", "output", "thinking")})
    return u


def _secs(ts):
    return datetime.datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()


def chat_hours():
    ts = [_secs(e["ts"]) for e in M.L if e["kind"] != "reset"]
    return (max(ts) - min(ts)) / 3600


def inc_report():
    """Cost of each design from its own ledger rows, per turn and per hour of chat, and what the chat's real
    pauses would add (the replay sends calls back to back, so no cache entry expires during it)."""
    rows = [d for d in ledger_rows() if d["ok"] and d["phase"].startswith("build-")]
    msgs = tree_messages()
    all_turns = chat_turns(msgs)
    turns, hours = len(all_turns), chat_hours()
    t0 = min(_secs(e["ts"]) for e in M.L if e["kind"] != "reset")

    def covered(d):
        """(turns, hours of chat) the design was built over: all of it, or A's first --a-turns."""
        n = (load(os.path.join(INC[d], "state.json")) or {}).get("turn", 0)
        if inc_done(d) or n >= turns:
            return turns, hours
        last = msgs[all_turns[n - 1][1] - 1]["i"] if n else 0
        return n, (_secs(MSG_TS[last]) - t0) / 3600 if n else 0.0
    out = ["## Incremental builds: the tree filed as the chat goes", "",
           f"The chat: {turns} turns over {hours:.2f} hours. $ is the tokens at list price for {C.MODEL} "
           f"(${PRICE['in']} input, ${PRICE['w5']} 5-minute cache write, ${PRICE['rd']} cache read, ${PRICE['out']} output per MTok; "
           "https://platform.claude.com/docs/en/build-with-claude/prompt-caching); the cost Claude Code reported is beside it.", "",
           "| design | requests | calls | input | cache write | cache read | output (of it thinking) | $ | $ reported |",
           "|---|---|---|---|---|---|---|---|---|"]
    summary = ["", "| design | built over | $ build | $ a turn | $ an hour of chat | cache read share of prompt tokens | "
               "$ an hour with the chat's pauses, 5-minute cache | same, 1-hour cache | $ an hour beyond the chat's own context |",
               "|---|---|---|---|---|---|---|---|---|"]
    stats_lines = []
    for d in DESIGNS:
        # only this build's rows: a build moved aside and restarted (inc-B.corrupt-20261017) keeps its rows in the
        # ledger, before the new build's "started"
        since = (load(os.path.join(INC[d], "state.json")) or {}).get("started", "")
        R = [x for x in rows if x["phase"] == f"build-{d}" and x["ts"] >= since]
        if not R:
            continue
        for kind in ("file", "fix", "merge", "shorten", None):
            sel = R if kind is None else [x for x in R if x.get("kind") == kind]
            if not sel:
                continue
            u = _sum_usage(sel)
            out.append(f"| {d} | {kind or '**all**'} | {len(sel):,} | {u['input']:,} | {u['cache_write']:,} | {u['cache_read']:,} | "
                       f"{u['output']:,} ({u['thinking']:,}) | {_usd(u):.2f} | {sum(x.get('cost_usd') or 0 for x in sel):.2f} |")
        u = _sum_usage(R)
        total = _usd(u)
        prompt = u["input"] + u["cache_write"] + u["cache_read"]
        # the chat's pauses: a call more than 5 minutes (1 hour) of chat time after the previous one finds its
        # cached prefix gone and writes it again
        timed = [x for x in R if x.get("chat_ts")]
        timed.sort(key=lambda x: _secs(x["chat_ts"]))
        extra5 = extra1 = 0.0
        prev = None
        for x in timed:
            gap = _secs(x["chat_ts"]) - prev if prev is not None else 0
            rd = x["usage"]["cache_read"]
            if gap > 300:
                extra5 += rd * (PRICE["w5"] - PRICE["rd"]) / 1e6
            if gap > 3600:
                extra1 += rd * (PRICE["w1h"] - PRICE["rd"]) / 1e6
            prev = _secs(x["chat_ts"])
        extra1 += u["cache_write"] * (PRICE["w1h"] - PRICE["w5"]) / 1e6
        # beyond the chat's own context: in design A the session is the chat itself, which pays to carry its
        # messages anyway; what the tree adds is the lines it writes and every merge, shorten and fix request
        if d == "A":
            filing = [x for x in R if x.get("kind") == "file"]
            own = sum(x["usage"]["output"] for x in filing) * PRICE["out"] / 1e6 + _usd(_sum_usage([x for x in R if x.get("kind") != "file"]))
        else:
            own = total
        nt, nh = covered(d)
        nh = max(nh, 1e-9)
        summary.append(f"| {d} | {nt} of {turns} turns, {nh:.2f} h | {total:.2f} | {total / max(1, nt):.4f} | {total / nh:.2f} | "
                       f"{u['cache_read'] / max(1, prompt):.0%} | {(total + extra5) / nh:.2f} | {(total + extra1) / nh:.2f} | {own / nh:.2f} |")
        st = load(os.path.join(INC[d], "stats.json")) or {}
        if not st:
            sa = load(os.path.join(INC[d], "state.json")) or {}
            stats_lines.append(f"- {d}: built over the first {nt} turns only (--a-turns): {len(sa.get('events', []))} rewrites, "
                               f"{sa.get('sessions', 0)} sessions; not answered or judged")
        if st:
            stats_lines.append(f"- {d}: {st['nodes']:,} nodes ({st['model_nodes']:,} written by the model, {st['failed_nodes']} left as "
                               f"\"(compaction failed)\"), view {st['view_lines']} lines, {st['view_bytes']:,} bytes, "
                               f"{len(st['events'])} rewrites" + (f", {st['sessions']} sessions" if d == "A" else ""))
    batch = [x for x in ledger_rows() if x["ok"] and x["phase"] == "build" and x["key"].startswith("build/tree/")]
    bu = _sum_usage(batch)
    out += summary + ["", f"For comparison, the batch tree's build in this ledger: {len(batch):,} calls, {bu['cache_write']:,} cache write, "
                      f"{bu['cache_read']:,} cache read, {bu['output']:,} output, ${sum(x.get('cost_usd') or 0 for x in batch):.2f} reported.",
                      "In A the last column counts only the lines it writes (output) and its merge, shorten and fix requests: the "
                      "session is the chat's own context, which the chat carries whether or not it files.", ""] + stats_lines + [""]
    return out


def report():
    lines = [f"# infinite-chat on Claude: every call {C.MODEL} (effort {C.EFFORT})", "",
             f"Written {time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime())}. Scores are the judge's ({C.MODEL}); "
             f"answers from another model are left out and listed below. Scope: {SCOPE}.", ""]
    for group, runs in groups().items():
        S = scores_of(group)
        lines += [f"## {group}: by probe type", "", table(S, runs, lambda p: p["type"], TYPES), "",
                  f"## {group}: by where the evidence sits", "", table(S, runs, lambda p: p["seg"], SEGS, SEG_LABEL), "",
                  f"## {group}: per probe", "", "| probe | type | " + " | ".join(runs) + " |", "|" + "---|" * (len(runs) + 2)]
        for pid in P:
            if any((pid, r) in S for r in runs):
                lines.append(f"| {pid} | {P[pid]['type']} | " + " | ".join(str(S.get((pid, r), "·")) for r in runs) + " |")
        lines.append("")
    # zoom use
    S = scores_of("end")
    zl = []
    for run in [r for r in scope_runs() if r in TREE_RUNS and TREE_RUNS[r][1]]:
        T = answers_for(run)
        if not T:
            continue
        z = [a for a in T.values() if a["zooms"]]
        sz = [S[(pid, run)] for pid, a in T.items() if a["zooms"] and (pid, run) in S]
        snz = [S[(pid, run)] for pid, a in T.items() if not a["zooms"] and (pid, run) in S]
        zl += [f"- {run} answers: {len(T)}; zoomed on {len(z)} ({100 * len(z) / len(T):.0f}%), "
               f"{sum(len(a['zooms']) for a in T.values()) / len(T):.2f} zoom replies a question, "
               f"{sum(len(r) for a in T.values() for r in a['zooms']) / len(T):.2f} lines opened a question",
               f"- {run} score when it zoomed: {sum(sz)}/{2 * len(sz)}; when it didn't: {sum(snz)}/{2 * len(snz)}"]
    if zl:
        lines += ["## Zoom", ""] + zl + [""]
    if SCOPE == "incremental":
        lines += inc_report()
    # survival
    ctx = {r: memory_of(r) for r in RUNS_END + list(RUNS_CUT) + ["tree-A", "tree-B"] if r != "tree-nozoom"}
    ctx["C-filed records alone"] = M.ledger_open_items("filed")
    lines += ["## Does the key fact exist in what is carried (no judge)", "", "| carried text | chars | probes whose key string is present |", "|---|---|---|"]
    surv = {}
    for name, c in ctx.items():
        if not c:
            continue
        low = c.lower()
        hit = [pid for pid in P if eligible(pid, name if name in RUNS_CUT else "cc") and any(k.lower() in low for k in KEY[pid])]
        n = sum(1 for pid in P if eligible(pid, name if name in RUNS_CUT else "cc"))
        surv[name] = hit
        lines.append(f"| {name}{' (view, before any zoom)' if name in TREE_RUNS else ''} | {len(c):,} | {len(hit)}/{n} |")
    save(os.path.join(OUT, "survival.json"), surv)
    lines.append("")
    if (load(os.path.join(TREE, "stats.json")) or {}).get("done"):
        cs = cache_sim()
        stats = load(os.path.join(TREE, "stats.json"))
        lines += ["## The tree", "",
                  f"- {stats['nodes']:,} nodes ({stats['model_nodes']:,} written by the model), view {stats['view_lines']} lines, "
                  f"{stats['view_bytes']:,} bytes, levels {stats['view_levels']}",
                  f"- view mean {cs['view_bytes_mean']:,} B, max {cs['view_bytes_max']:,} B; cached share of view bytes per message "
                  f"{cs['cached_share_of_view_bytes']:.1%}; {cs['batch_events']} batch rewrites", ""]
    # anything another model produced (left out); a refusal stops the run, so none is stored
    offs = []
    for run in RUNS_END + list(RUNS_CUT) + ["tree-A", "tree-B"]:
        for pid, a in answers_for(run).items():
            if a["off_model"]:
                offs.append(f"{run}/{pid}: {a['off_model']}")
    builds = [(f"{meth} gen{k}", load(chain_path(meth, k))) for meth in METHODS for k in range(5)]
    for name, r in builds + [("cc-real", load(os.path.join(BUILD, "cc-real.json")))]:
        if r and r.get("off_model"):
            offs.append(f"build {name}: {r['off_model']}")
    st_meta = TreeStore(write=False).meta if os.path.exists(os.path.join(TREE, "nodes.jsonl")) else {}
    tree_off = sum(1 for m in st_meta.values() if m.get("off_model"))
    tree_failed = sum(1 for m in st_meta.values() if m.get("text") == "(compaction failed)")
    lines += [f"Tree nodes left as \"(compaction failed)\" (a line the model's answer left out after the fix rounds): {tree_failed}", "",
        "## Answered by another model (left out of the scores)", ""] + ([f"- {o}" for o in offs] or ["- none"]) + [
        f"- tree nodes from another model: {tree_off}", ""]
    lines += ["## Tokens and cost, from the ledger (`out/ledger.jsonl`)", "", ledger_summary(), ""]
    open(os.path.join(OUT, "report.md"), "w").write("\n".join(lines))
    log(f"report written: {os.path.join(OUT, 'report.md')}")


# ============================================================ plan: measured from the ledger
PRICE = {"in": 2.0, "w5": 2.5, "w1h": 4.0, "rd": 0.10, "out": 10.0}  # $/MTok, Sonnet 5.5 (pricing page)
ANSWER_OUT_BOUND = 300  # tokens a call; answers are capped at 120 words; not yet measured on Sonnet
JUDGE_OUT_BOUND = 400   # tokens a call; 4 scores with one sentence each; not yet measured on Sonnet
PASS_BAR = 1 / 20  # the probe's bar for missing and for over-limit lines


def probe_rates():
    """(missing rate, over-limit rate, lines, where from): from the probe results made with today's
    merge prompt; the pass bar while there are none."""
    d = os.path.join(OUT, "probe")
    runs = [load(os.path.join(d, f)) for f in (os.listdir(d) if os.path.isdir(d) else []) if f.startswith("build_") and f.endswith(".json")]
    runs = [x for x in runs if x and x.get("prompt") == merge_prompt_id()]
    n = sum(len(x["lines"]) for x in runs)
    if not n:
        return PASS_BAR, PASS_BAR, 0, "the pass bar (1 in 20); no probe yet with today's prompt"
    miss = sum(len(x["missing"]) for x in runs)
    over = sum(1 for x in runs for s in x["sizes"] if s > OVER)
    return miss / n, over / n, n, f"the probe: {miss} of {n} lines missing, {over} of {n} over {OVER} B"


def ledger_rows():
    """Every row with cost_usd the call's own cost. Rows written before claude_call split a resumed session's
    running total (a "session" and no "session_cost_usd") are converted here: the total minus the session's
    previous total."""
    rows = [json.loads(x) for x in open(C.LEDGER)] if os.path.exists(C.LEDGER) else []
    last = {}
    for d in rows:
        if "session" in d and "session_cost_usd" not in d and d.get("cost_usd"):
            total = d["cost_usd"]
            d["cost_usd"], d["session_cost_usd"] = max(0.0, total - last.get(d["session"], 0.0)), total
            last[d["session"]] = total
    return rows


def call_kind(key):
    p = key.split("/")
    if p[0] != "build":
        return p[0]
    if p[1] != "tree":
        return "chain"
    if "/fix" in key:  # the first run's per-batch fix rounds
        return "tree fix"
    if p[2] == "merge":
        return f"merge {p[3]}"
    return f"tree {p[2]}"


def measured():
    """Per call kind over successful calls: n, mean input/output tokens, cache reads; and tokens per
    character sent over every successful call."""
    rows = [d for d in ledger_rows() if d["ok"]]
    kinds = collections.defaultdict(collections.Counter)
    sent = toks = 0
    for d in rows:
        u = d["usage"]
        t = u["input"] + u["cache_write"] + u["cache_read"]
        k = kinds[call_kind(d["key"])]
        k["n"] += 1
        k["in"] += t
        k["out"] += u["output"]
        k["read"] += u["cache_read"]
        # build/cawco: its default system prompt isn't in system_chars. A resumed design-A session call: its tokens include
        # the session's stored turns, which user_chars leaves out (the 10-17 rows: 4.25 tokens a character, fresh calls 0.45)
        if not d["key"].startswith("build/cawco/") and not ("session" in d and not d.get("session_new")):
            sent += d["system_chars"] + d["user_chars"]
            toks += t
    return (toks / sent if sent else 1 / CPT), kinds


def tree_remaining(st):
    """Planned parents still missing, by level, and the final view's bytes (unbuilt lines at the
    512-byte bound, so an upper bound)."""
    view, planned, _ = st.replay(write=False)
    per_level = collections.Counter(p[0] for p in planned if p not in st.nodes)
    return per_level, sum(st.size(k) for k in view)


def answer_cost(run, todo, tpc, view_chars, zoom_calls):
    """(calls, input tokens, read from cache, output tokens, $). 5-minute cache: the run's first
    call writes its system part, the rest read it; each call's own question part is written."""
    if not todo:
        return 0, 0, 0, 0, 0.0
    mem = memory_of(run)
    if run in TREE_RUNS:
        zoomable = TREE_RUNS[run][1]
        sys_chars = len(tree_answer_system("", zoomable)) + view_chars
        calls = math.ceil(len(todo) * (zoom_calls if zoomable else 1))
        user_chars = 200 + (3_000 if zoomable else 0)  # zoom rounds carry the earlier rounds (avg)
    else:
        sys_chars = len(answer_system(mem or ""))
        calls, user_chars = len(todo), 200
    sys_t, user_t = sys_chars * tpc, user_chars * tpc
    inp = calls * (sys_t + user_t)
    read = (calls - 1) * sys_t
    out = calls * ANSWER_OUT_BOUND
    usd = (sys_t * PRICE["w5"] + read * PRICE["rd"] + calls * user_t * PRICE["w5"] + out * PRICE["out"]) / 1e6
    return calls, int(inp), int(read), out, usd


def judge_cost(scope_groups, tpc):
    calls = chars = 0
    for group, runs in scope_groups.items():
        for pid in P:
            n = len([r for r in runs if eligible(pid, r)])
            for k in range(math.ceil(n / JUDGE_GROUP_SIZE)):
                path = os.path.join(JUD, SCOPE, group, f"{pid}-{k}.json")
                if os.path.exists(path):
                    continue
                p = P[pid]
                calls += 1
                chars += (len(JUDGE_SYSTEM) + len(p["question"]) + len(p["gold"]) + sum(len(m) for m in p["must"]) + 150 +
                          min(JUDGE_GROUP_SIZE, n - k * JUDGE_GROUP_SIZE) * 750)
    inp, out = int(chars * tpc), calls * JUDGE_OUT_BOUND
    return calls, inp, 0, out, (inp * PRICE["in"] + out * PRICE["out"]) / 1e6


def spent_so_far():
    """What this measurement's earlier runs spent, which the budget covers across reruns: every ledger row's cost of the
    scope incremental's calls (a failed call's too; the 10-16 run's 1,168 failed rows reported $0). Other scopes run
    without a carried-over spend."""
    if SCOPE != "incremental":
        return 0.0
    mine = ("build/inc-", "answer/tree-A/", "answer/tree-B/", f"judge/{SCOPE}/")
    return sum(d.get("cost_usd") or 0 for d in ledger_rows() if d["key"].startswith(mine))


def plan():
    global SCOPE
    tpc, kinds = measured()
    chosen = SCOPE
    out = [f"Plan for {C.MODEL}, effort {C.EFFORT}, at most {C.MAX_PARALLEL} calls at once. Measured from out/ledger.jsonl "
           f"where it has the call kind; remaining work only.", "",
           "Spent so far (ledger):", "", ledger_summary(), "",
           f"Measured: {tpc:.3f} tokens per character sent ({1 / tpc:.2f} characters a token).", ""]
    # ---- build that remains
    build = []  # (item, calls, input tokens, read, output, $)
    for meth in METHODS:
        for k in range(5):
            if not load(chain_path(meth, k)):
                build.append((f"{meth} gen{k} (not built)", 1, 0, 0, 0, 0.0))
    if not (load(os.path.join(TREE, "stats.json")) or {}).get("done"):
        st = TreeStore(write=False)
        st.leaf_todo()
        leaf_left = leaf_batches([j for j in range(len(st.msgs)) if (0, j) not in st.nodes], st.msgs)
        lk = kinds.get("tree leaf", collections.Counter())
        if leaf_left:
            n = len(leaf_left)
            i_t, o_t = lk["in"] / max(1, lk["n"]), lk["out"] / max(1, lk["n"])
            build.append(("tree leaves", n, int(n * i_t), 0, int(n * o_t), n * (i_t * PRICE["in"] + o_t * PRICE["out"]) / 1e6))
        per_level, view_bytes = tree_remaining(st)
        all_merge = collections.Counter()
        for k, v in kinds.items():
            if k.startswith("merge "):
                all_merge.update(v)
        line_out = all_merge["out"] / max(1, all_merge["n"] * MERGE_BATCH_MAX)  # output tokens a merged line
        miss_rate, over_rate, _, rate_src = probe_rates()
        out += [f"Missing and over-limit rates: {rate_src}.", ""]
        for lvl, n in sorted(per_level.items()):
            mk = kinds.get(f"merge L{lvl}") if kinds.get(f"merge L{lvl}", {}).get("n", 0) >= 5 else all_merge
            calls = math.ceil(n / MERGE_BATCH_MAX)
            i_t = mk["in"] / max(1, mk["n"])
            o_t = line_out * MERGE_BATCH_MAX
            build.append((f"tree merges, level {lvl} ({n} lines)", calls, int(calls * i_t), 0, int(calls * o_t),
                          calls * (i_t * PRICE["in"] + o_t * PRICE["out"]) / 1e6))
            # the level's end: left-out lines re-asked with their inputs (~1,000 chars each), then
            # over-limit lines shortened (~650 chars each); SHORTEN_BATCH_MAX to a call, no <chat>
            for what, rate, task, per_line in (("retry", miss_rate, MERGE_TASK, 1_000), ("shorten", over_rate, SHORTEN_TASK, 650)):
                k_lines = n * rate
                kc = math.ceil(k_lines / SHORTEN_BATCH_MAX) if k_lines >= 0.5 else 0
                if kc:
                    k_in = kc * len(tree_system(task)) * tpc + k_lines * per_line * tpc
                    k_out = k_lines * line_out
                    build.append((f"  {what}, level {lvl} (about {k_lines:.0f} lines)", kc, int(k_in), 0, int(k_out),
                                  (k_in * PRICE["in"] + k_out * PRICE["out"]) / 1e6))
    else:
        view_bytes = len(memory_of("tree") or "")
    btot = [sum(r[n] for r in build) for n in range(1, 6)]
    out += ["Build still to do (cache off: plain input at $2/MTok):", "",
            "| item | calls | input tokens | output tokens | $ |", "|---|---|---|---|---|"]
    out += [f"| {r[0]} | {r[1]:,} | {r[2]:,} | {r[4]:,} | {r[5]:.2f} |" for r in build]
    out += [f"| **build** | **{btot[0]:,}** | **{btot[1]:,}** | **{btot[3]:,}** | **{btot[4]:.2f}** |", ""]
    # ---- answers and judge, per scope
    tk = kinds.get("tree leaf", collections.Counter())
    out += [f"Answers: memory sizes are the built texts; the tree view at most {view_bytes:,} bytes (upper bound). "
            f"Cross-process cache reads are measured: the first run's tree leaf calls read {tk['read'] / max(1, tk['n']):,.0f} tokens a call "
            f"from cache, their shared system prompt. Output per call is a bound ({ANSWER_OUT_BOUND} answer, {JUDGE_OUT_BOUND} judge), "
            f"not a measurement; zoom answers take {ZOOM_CALLS_PER_PROBE} calls a probe as on the free-model run.", "",
            "| scope | runs | answer calls | judge calls | input tokens | of it read from cache | output | $ answer + judge | $ with build |",
            "|---|---|---|---|---|---|---|---|---|"]
    # ---- the trees filed as the chat goes (scope incremental only): a dry run of each design still to build
    inc = inc_estimate(tpc, DESIGNS_ON) if chosen == "incremental" else {}
    inc_usd = sum(v["usd"] for v in inc.values()) * 1.05  # 5% for thinking and Claude Code's own per-call tokens
    if chosen == "incremental":
        out += [f"Incremental builds still to do (dry run on the real chat: the batch tree's lines stand in for the replies, "
                f"{OVER_RATE_PCT}% of lines over the limit; 5-minute cache; {tpc:.3f} tokens a character):", "",
                "| design | calls (by request) | cache write | cache read | output | $ |", "|---|---|---|---|---|---|"]
        for d, v in inc.items():
            out.append(f"| {d} | {v['calls']:,} ({', '.join(f'{k} {n}' for k, n in sorted(v['by_kind'].items()))}) | "
                       f"{v['write']:,} | {v['read']:,} | {v['output']:,} | {v['usd']:.2f} |")
        out += [f"| **incremental build, +5%** | | | | | **{inc_usd:.2f}** |", ""]
    planned_calls, chosen_total = {}, 0.0
    for name in SCOPES:
        SCOPE = name
        runs = scope_runs()
        a = [0, 0, 0, 0, 0.0]
        for run in runs:
            todo = [pid for pid in P if eligible(pid, run) and not os.path.exists(os.path.join(ANS, run, f"{pid}.json"))]
            for n, v in enumerate(answer_cost(run, todo, tpc, view_bytes, ZOOM_CALLS_PER_PROBE)):
                a[n] += v
        j = judge_cost(groups(), tpc)
        usd = a[4] + j[4]
        bld = inc_usd if name == "incremental" else btot[4]
        out.append(f"| {name}{' (chosen)' if name == chosen else ''} | {', '.join(runs)} | {a[0]:,} | {j[0]:,} | {a[1] + j[1]:,} | "
                   f"{a[2]:,} | {a[3] + j[3]:,} | {usd:.2f} | {usd + bld:.2f} |")
        if name == chosen:
            chosen_total = usd + bld
            planned_calls = {"answer": a[0], "judge": j[0]}
            if name == "incremental":
                planned_calls.update({f"build-{d}": v["calls"] for d, v in inc.items()})
            else:
                planned_calls["build"] = btot[0]
    SCOPE = chosen
    prior = spent_so_far()
    verdict = ("over it: run refuses (exit 2)" if prior + chosen_total > BUDGET else "within it")
    out += ["", f"Chosen scope {chosen}: about ${chosen_total:.2f} still to spend, ${prior:.2f} already spent by this measurement, "
            f"${prior + chosen_total:.2f} in all; the budget is ${BUDGET:.0f} (EVAL_BUDGET): {verdict}.",
            "", "Prices: $2 input, $2.50 5-minute cache write, $0.10 cache read, $10 output per MTok "
            "(https://platform.claude.com/docs/en/about-claude/pricing). On a subscription the run uses up usage allowance rather than dollars."]
    return "\n".join(out), planned_calls, chosen_total


# ============================================================ probe: the merge fix, on real calls
# the first run's batches with the most fix calls at each level whose 20 nodes it stored
# (L1/0-41: 3 fix calls, L2/132-151: 2, L3/20-42: 3)
PROBE_BATCHES = ["build/tree/merge/L1/0-41", "build/tree/merge/L2/132-151", "build/tree/merge/L3/20-42"]
PROBE_ANSWER = ("cc-real+C-filed", "P04")


def probe(with_answer):
    """3 real calls (5 with --answer): the first run's merge batches with the most fix calls, rebuilt
    from their stored children (the same 20 parents, by the call key on each node) under today's
    prompt. With --answer, one answer and one judge call, to measure those phases' tokens.
    Writes out/probe/ only; never a node, an answer or a score."""
    st = TreeStore(write=False)
    led = ledger_rows()
    lines = ["| batch | lines | missing | over 512 B | over 536 B (would be shortened) | median B | max B | input tok | output tok | first run's fix calls |",
             "|---|---|---|---|---|---|---|---|---|---|"]
    for key in PROBE_BATCHES:
        lvl = int(key.split("/")[3][1:])
        parents = sorted(k for k, m in st.meta.items() if m.get("call") == key)
        if not parents:
            lines.append(f"| {key} | no stored nodes carry this call key; skipped, no call made |||||||||")
            continue
        items = [(label(k), st.line_of((lvl - 1, 2 * k[1])) + "\n" + st.line_of((lvl - 1, 2 * k[1] + 1))) for k in parents]
        labels = [lab for lab, _ in items]
        r = C.call(f"probe/{key}", "probe", tree_system(MERGE_TASK),
                   st.ctx_before(parents[0][1] * 2 ** lvl) + "\n\n" + inputs_body(items) + ids_rule(labels), cache="off")
        got = parse_lines(r["text"], labels)
        sizes = sorted(TR.b(v) for v in got.values() if v)
        missing = [lab for lab, v in got.items() if not v]
        fixes = sorted(d["key"].rsplit("/", 1)[1] for d in led if d["key"].startswith(key + "/fix") and d["ok"])
        save(os.path.join(OUT, "probe", key.replace("/", "_") + ".json"),
             {"batch": key, "prompt": merge_prompt_id(), "parents": [list(k) for k in parents], "raw": r["text"], "lines": got,
              "sizes": sizes, "missing": missing, "usage": r["usage"], "first_run_fix_calls": fixes})
        lines.append(f"| {key} | {len(items)} | {len(missing)} | {sum(1 for s in sizes if s > 512)} | {sum(1 for s in sizes if s > OVER)} | "
                     f"{sizes[len(sizes) // 2] if sizes else '-'} | {sizes[-1] if sizes else '-'} | "
                     f"{sum(r['usage'][k] for k in ('input', 'cache_write', 'cache_read')):,} | {r['usage']['output']:,} | {', '.join(fixes) or 'none'} |")
    if with_answer:
        run, pid = PROBE_ANSWER
        r = C.call(f"probe/answer/{run}/{pid}", "probe", answer_system(memory_of(run)), f"Owner's question: {P[pid]['question']}", cache="5m")
        p = P[pid]
        user = (f"Question: {p['question']}\n\nGold answer: {p['gold']}\n\nRequired facts:\n" + "\n".join(f"- {m}" for m in p["must"]) +
                f"\n\n<answer id=\"A\">\n{r['text']}\n</answer>")
        j = C.call(f"probe/judge/{run}/{pid}", "probe", JUDGE_SYSTEM, user, cache="off")
        save(os.path.join(OUT, "probe", "answer_judge.json"), {"run": run, "id": pid, "answer": r["text"], "answer_usage": r["usage"],
                                                               "judge": j["text"], "judge_usage": j["usage"]})
        for name, x in (("answer", r), ("judge", j)):
            u = x["usage"]
            lines.append(f"| {name} {run}/{pid} | | | | | | | {u['input'] + u['cache_write'] + u['cache_read']:,} "
                         f"(cache write {u['cache_write']:,}, read {u['cache_read']:,}) | {u['output']:,} (thinking {u['thinking']:,}) | |")
    text = "\n".join(lines)
    open(os.path.join(OUT, "probe", "probe.md"), "w").write(text + "\n")
    print(text, flush=True)


# ============================================================ main
def complete():
    missing = []
    for meth in METHODS:
        missing += [f"{meth} gen{k}" for k in range(5) if not load(chain_path(meth, k))]
    if not load(os.path.join(BUILD, "cc-real.json")):
        missing.append("cc-real")
    if not (load(os.path.join(TREE, "stats.json")) or {}).get("done"):
        missing.append("tree")
    if SCOPE == "incremental":
        missing += [f"tree {d} (incremental)" for d in DESIGNS_ON if not inc_built(d)]
    for run in scope_runs():
        n = sum(1 for pid in P if eligible(pid, run) and not os.path.exists(os.path.join(ANS, run, f"{pid}.json")))
        if n:
            missing.append(f"{n} answers for {run}")
    jobs, pending = judge_jobs()
    if jobs or pending:
        missing.append(f"{len(jobs)} judge calls, {pending} probe groups waiting on answers")
    return missing


def main():
    global SCOPE, DESIGNS_ON, A_TURNS
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["plan", "run", "report", "probe"])
    ap.add_argument("--phases", default="build,answer,judge,report")
    ap.add_argument("--scope", choices=list(SCOPES), default="full", help="which runs get answered and judged")
    ap.add_argument("--designs", default="A,B", help="scope incremental: which designs to build, answer and judge")
    ap.add_argument("--a-turns", type=int, default=None,
                    help="scope incremental: build design A over the first N turns only (its cost per turn; it is not scored)")
    ap.add_argument("--answer", action="store_true", help="probe: also one answer and one judge call")
    a = ap.parse_args()
    SCOPE = a.scope
    DESIGNS_ON = [d for d in a.designs.split(",") if d in DESIGNS]
    A_TURNS = a.a_turns
    scored = [d for d in DESIGNS_ON if not (d == "A" and A_TURNS is not None)]
    SCOPES["incremental"] = (["tree", "cc-real+C-filed"] + [f"tree-{d}" for d in scored], [])
    if a.cmd == "report":
        report()
        return 0
    if a.cmd == "probe":
        try:
            probe(a.answer)
        except C.Stopped as e:
            print(f"STOPPED: {e}", flush=True)
            return 75
        return 0
    text, planned_calls, total = plan()
    print(text, flush=True)
    open(os.path.join(OUT, "plan.txt"), "w").write(text + "\n")
    prior = spent_so_far()
    if prior + total > BUDGET:
        log(f"NOT RUN: ${prior:.2f} spent so far plus the plan's ${total:.2f} is over the ${BUDGET:.0f} budget (EVAL_BUDGET)")
        return 2
    if a.cmd == "plan":
        return 0
    # and a hard stop while running: no call starts once the reported cost reaches the budget
    C.SPEND_LIMIT, C._spent[0] = BUDGET, prior
    C.PLAN.update(planned_calls)
    C.on_progress = log
    try:
        ver = subprocess.run([C.claude_bin(), "--version"], capture_output=True, text=True, timeout=60).stdout.strip()
    except (OSError, subprocess.SubprocessError) as e:
        ver = f"(claude --version failed: {e})"
    log(f"run start: {C.claude_bin()} {ver}; model {C.MODEL}, effort {C.EFFORT}, {C.MAX_PARALLEL} at once; out {OUT}")
    phases = a.phases.split(",")
    try:
        if "build" in phases:
            build_phase()
        if "answer" in phases:
            answer_phase()
        if "judge" in phases:
            judge_phase()
    except C.Stopped as e:
        log(f"STOPPED (rerun to resume): {e}")
        report()
        return 75
    if "report" in phases:
        report()
    missing = complete()
    if missing:
        log("incomplete: " + "; ".join(missing))
        return 1
    log("ALL DONE")
    return 0


if __name__ == "__main__":
    sys.exit(main())
