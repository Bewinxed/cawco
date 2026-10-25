"""What every bench script shares: where things are, the eval's modules, Claude Code transcripts, the cockpit shim.

The eval (`../infinite-chat-eval`) is imported, never copied. Two of its modules read the 13-hour chat's data at import
time (methods.py `data/messages.jsonl`, pipeline.py `data/probes.json`); the bench never uses that chat, so `eval_modules`
loads them with those two reads answered by a one-line stand-in and every other read (prompts/cc_compact.txt,
prompts/unii_system.txt) left as it is. claude_call.py writes its ledger to $EVAL_OUT, set here to the bench's own out
dir before the import, so every call the bench makes is one row of `out/ledger.jsonl`.
"""
import builtins
import datetime
import importlib.util
import io
import json
import os
import re
import subprocess
import sys
import threading

HERE = os.path.dirname(os.path.abspath(__file__))
EVAL_DIR = os.path.normpath(os.path.join(HERE, "..", "infinite-chat-eval"))
HARNESS = os.path.join(HERE, "harness")
FIXTURES = os.path.join(HERE, "fixtures")
DEFAULT_OUT = os.path.join(HERE, "out")

BANDS = [("100-300k", 100_000, 300_000), ("300-600k", 300_000, 600_000), ("600k+", 600_000, 10 ** 12)]
ARMS_SINGLE = ["A0", "A1", "A2", "A3", "A4", "A5", "A7d", "A7g"]
ARMS_CHAINED = ["A0", "A1", "A2", "A6"]
ALL_ARMS = ["A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7d", "A7g"]
SONNET, HAIKU, OPUS = "claude-sonnet-5-5", "claude-haiku-5-5", "claude-opus-5-5"


def band_of(tokens):
    for name, lo, hi in BANDS:
        if lo <= tokens < hi:
            return name
    return None


# ---------------------------------------------------------------- the eval, imported
_EVAL = {}
_eval_lock = threading.Lock()
_STAND_IN_CHAT = json.dumps({"i": 0, "kind": "user", "text": "(the bench does not read the eval's chat)",
                             "ts": "2026-01-01T00:00:00Z"}) + "\n"


def eval_modules(out_dir):
    """(claude_call, methods, pipeline) from ../infinite-chat-eval, with the ledger in out_dir."""
    with _eval_lock:
        if _EVAL:
            return _EVAL["C"], _EVAL["M"], _EVAL["P"]
        if not os.path.isdir(EVAL_DIR):
            raise SystemExit(f"the eval is not at {EVAL_DIR}: unpack infinite-chat-eval beside compaction-bench")
        os.environ["EVAL_OUT"] = out_dir
        data = os.path.join(EVAL_DIR, "data")
        stand_ins = {os.path.join(data, "messages.jsonl"): _STAND_IN_CHAT, os.path.join(data, "probes.json"): "[]"}

        def opener(path, *a, **k):
            p = os.path.normpath(os.fspath(path))
            if p in stand_ins:
                return io.StringIO(stand_ins[p])
            return builtins.open(path, *a, **k)

        if EVAL_DIR not in sys.path:
            sys.path.insert(0, EVAL_DIR)
        mods = {}
        for name in ("claude_call", "methods", "tree", "pipeline"):
            spec = importlib.util.spec_from_file_location(name, os.path.join(EVAL_DIR, f"{name}.py"))
            mod = importlib.util.module_from_spec(spec)
            mod.open = opener
            sys.modules[name] = mod
            spec.loader.exec_module(mod)
            del mod.open
            mods[name] = mod
        _EVAL.update(C=mods["claude_call"], M=mods["methods"], P=mods["pipeline"])
        return _EVAL["C"], _EVAL["M"], _EVAL["P"]


# ---------------------------------------------------------------- files
def load(path, default=None):
    try:
        with open(path) as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return default


def save(path, obj):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = f"{path}.{os.getpid()}.{threading.get_ident()}.tmp"
    with open(tmp, "w") as fh:
        json.dump(obj, fh, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def append_jsonl(path, rec):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "a") as fh:
        fh.write(json.dumps(rec, ensure_ascii=False) + "\n")


def read_jsonl(path):
    out = []
    if not os.path.exists(path):
        return out
    with open(path, errors="replace") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
            except ValueError:
                continue
            if isinstance(d, dict):
                out.append(d)
    return out


def transcript(path):
    """Where a drawn transcript is now. CawCo moves a session's files to the account the session moves to (agent
    `[claude] session …: N entries moved from <account> to <account>`), so a path drawn hours ago can be gone while the
    same file, append-only, lives under another account's same project dir. Searched by project dir and file name
    across every account dir and ~/.claude; the drawn path when it still exists."""
    if os.path.exists(path):
        return path
    proj, name = os.path.basename(os.path.dirname(path)), os.path.basename(path)
    home = os.path.expanduser("~")
    roots = [os.path.join(home, ".cawco", "accounts", a, "claude", "projects")
             for a in sorted(os.listdir(os.path.join(home, ".cawco", "accounts")))] + [os.path.join(home, ".claude", "projects")]
    found = [p for p in (os.path.join(r, proj, name) for r in roots) if os.path.exists(p)]
    if not found:
        raise RunStopped(f"transcript {name} is no longer under any account's projects/{proj}")
    return max(found, key=os.path.getsize)


_transcripts, _transcripts_lock = {}, threading.Lock()


def read_transcript(path, upto=None, uuid=None):
    """read_jsonl of transcript(path), checked to still hold the drawn cut: at least `upto` records and, when given,
    the record `uuid` among them. A transcript only grows, so the prefix a cut was drawn on stays as it was."""
    p = transcript(path)
    with _transcripts_lock:  # a unit's runs share one read of the prefix (a live orchestrator's is ~460 MB)
        key = (p, upto)
        if key not in _transcripts:
            recs = []
            with open(p, errors="replace") as fh:
                for line in fh:
                    if upto is not None and len(recs) > upto:
                        break
                    line = line.strip()
                    try:
                        d = json.loads(line) if line else None
                    except ValueError:
                        d = None
                    if isinstance(d, dict):
                        recs.append(d)
            _transcripts[key] = recs
        recs = _transcripts[key]
    if upto is not None and len(recs) < upto:
        raise RunStopped(f"transcript {p} holds {len(recs)} records; the cut is at {upto}")
    if uuid and not any(r.get("uuid") == uuid for r in recs[:(upto or len(recs)) + 1]):
        raise RunStopped(f"transcript {p} no longer holds the cut's record {uuid} before index {upto}")
    return recs


def write_jsonl(path, recs):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w") as fh:
        for r in recs:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")


def hashlib_short(text, n=8):
    import hashlib
    return hashlib.sha256(text.encode()).hexdigest()[:n]


def now_iso():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def ts_ms(ts):
    return int(datetime.datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp() * 1000)


# ---------------------------------------------------------------- Claude Code transcripts
def content_blocks(rec):
    c = (rec.get("message") or {}).get("content")
    if isinstance(c, str):
        return [{"type": "text", "text": c}]
    return c if isinstance(c, list) else []


def is_boundary(rec):
    return rec.get("type") == "system" and rec.get("subtype") == "compact_boundary" and not rec.get("isSidechain")


def is_summary(rec):
    return rec.get("type") == "user" and rec.get("isCompactSummary") is True


# Claude Code's line for a turn the operator cut short, written in the user's role (core transcript-rules.ts
# INTERRUPTED): the harness's word, never a request of its own, so it opens no turn.
INTERRUPTED = re.compile(r"^\[Request interrupted by user(?: for tool use)?\]$")


def user_text(rec):
    """A main-loop user record's words (text blocks), or None for a tool result, meta record, summary, sidechain or
    Claude Code's interrupt line."""
    if rec.get("type") != "user" or rec.get("isMeta") or rec.get("isSidechain") or is_summary(rec):
        return None
    blocks = content_blocks(rec)
    if any(b.get("type") == "tool_result" for b in blocks if isinstance(b, dict)):
        return None
    text = "\n".join(b.get("text", "") for b in blocks if isinstance(b, dict) and b.get("type") == "text").strip()
    if INTERRUPTED.match(text):
        return None
    return text or None


def turn_starts(recs):
    """Indices of the records that open a turn: a user record with words."""
    return [i for i, r in enumerate(recs) if user_text(r)]


def requests_of(recs):
    """One row per API request: Claude Code writes one assistant record per content block, all with the request's
    message id and usage; the last record of an id carries its final output count."""
    by_id, order = {}, []
    for r in recs:
        if r.get("type") != "assistant" or r.get("isSidechain"):
            continue
        m = r.get("message") or {}
        mid = m.get("id") or r.get("requestId") or r.get("uuid")
        u = m.get("usage") or {}
        if not u:
            continue
        if mid not in by_id:
            order.append(mid)
        cc = u.get("cache_creation") or {}
        w1h = cc.get("ephemeral_1h_input_tokens", 0) or 0
        by_id[mid] = {
            "id": mid, "model": m.get("model") or "", "at": ts_ms(r["timestamp"]) if r.get("timestamp") else 0,
            "input": u.get("input_tokens", 0) or 0, "cacheCreation": u.get("cache_creation_input_tokens", 0) or 0,
            "cacheWrite1h": w1h, "cacheRead": u.get("cache_read_input_tokens", 0) or 0,
            "output": u.get("output_tokens", 0) or 0, "error": r.get("error"),
        }
    return [by_id[i] for i in order if by_id[i]["model"] != "<synthetic>"]


def prompt_tokens(req):
    return req["input"] + req["cacheCreation"] + req["cacheRead"]


def tool_calls(recs):
    """(name, input, result text, is_error) for every tool call in the records, in order."""
    results = {}
    for r in recs:
        for b in content_blocks(r):
            if isinstance(b, dict) and b.get("type") == "tool_result":
                c = b.get("content")
                if isinstance(c, list):
                    c = "\n".join(x.get("text", "") if isinstance(x, dict) else str(x) for x in c)
                results[b.get("tool_use_id")] = (str(c or ""), bool(b.get("is_error")))
    out = []
    for r in recs:
        if r.get("type") != "assistant":
            continue
        for b in content_blocks(r):
            if isinstance(b, dict) and b.get("type") == "tool_use":
                res, err = results.get(b.get("id"), ("", False))
                out.append((b.get("name") or "", b.get("input") or {}, res, err))
    return out


def to_eval_entries(recs):
    """The records as the eval's normalised log (methods.py kinds): user / unii / tool / echo, each with its ts."""
    out = []
    for r in recs:
        ts = r.get("timestamp") or ""
        if r.get("type") == "user" and not r.get("isMeta") and not r.get("isSidechain"):
            if is_summary(r):
                text = "\n".join(b.get("text", "") for b in content_blocks(r) if b.get("type") == "text")
                out.append({"kind": "user", "text": text, "ts": ts, "summary": True})
                continue
            for b in content_blocks(r):
                if not isinstance(b, dict):
                    continue
                if b.get("type") == "text" and b.get("text", "").strip():
                    out.append({"kind": "user", "text": b["text"], "ts": ts})
                elif b.get("type") == "tool_result":
                    c = b.get("content")
                    if isinstance(c, list):
                        c = "\n".join(x.get("text", "") if isinstance(x, dict) and x.get("type") == "text"
                                      else f"[{x.get('type')}]" if isinstance(x, dict) else str(x) for x in c)
                    out.append({"kind": "echo", "text": str(c or ""), "is_error": bool(b.get("is_error")),
                                "tool_use_id": b.get("tool_use_id"), "ts": ts})
        elif r.get("type") == "assistant" and not r.get("isSidechain"):
            for b in content_blocks(r):
                if not isinstance(b, dict):
                    continue
                if b.get("type") == "text" and b.get("text", "").strip():
                    out.append({"kind": "unii", "text": b["text"], "ts": ts})
                elif b.get("type") == "tool_use":
                    out.append({"kind": "tool", "text": json.dumps({"name": b.get("name"), "input": b.get("input") or {}}),
                                "tool_use_id": b.get("id"), "ts": ts})
    return out


def live_scope(recs):
    """(previous summary text or None, the records after it): what the model held at the end of `recs`."""
    last = max((i for i, r in enumerate(recs) if is_boundary(r)), default=-1)
    after = recs[last + 1:] if last >= 0 else list(recs)
    summary = None
    if after and is_summary(after[0]):
        summary = "\n".join(b.get("text", "") for b in content_blocks(after[0]) if b.get("type") == "text")
        after = after[1:]
    return summary, after


def encode_project_dir(path):
    """Claude Code's folder name for a working directory under $CLAUDE_CONFIG_DIR/projects: every character that is not
    a letter or digit becomes '-' (`/home/x/.worktrees/y` → `-home-x--worktrees-y`). Longer than 200 characters it adds a
    hash; the bench keeps its sandbox paths short and refuses one that is not."""
    enc = re.sub(r"[^A-Za-z0-9]", "-", path)
    if len(enc) > 200:
        raise SystemExit(f"sandbox path too long for Claude Code's plain project-dir encoding: {path}")
    return enc


# ---------------------------------------------------------------- the cockpit shim
def cockpit(verb, root, payload=None, timeout=300):
    """One verb of harness/cockpit.ts against the cockpit checkout at `root`."""
    if not root or not os.path.isfile(os.path.join(root, "packages/core/src/usage/pricing.ts")):
        raise SystemExit(f"--cockpit-root {root!r} is not a cockpit checkout (no packages/core/src/usage/pricing.ts)")
    p = subprocess.run(["bun", "run", os.path.join(HARNESS, "cockpit.ts"), verb, os.path.abspath(root)],
                       input=json.dumps(payload) if payload is not None else "", capture_output=True, text=True,
                       timeout=timeout)
    if p.returncode != 0:
        raise SystemExit(f"cockpit.ts {verb} failed ({p.returncode}): {p.stderr.strip()[-800:]}")
    return json.loads(p.stdout.strip().splitlines()[-1])


def git(args, cwd, check=True, timeout=120):
    p = subprocess.run(["git", "-C", cwd] + args, capture_output=True, text=True, timeout=timeout)
    if check and p.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} in {cwd}: {p.stderr.strip()[:400]}")
    return p.stdout


class RunStopped(Exception):
    """A run that cannot go on: a refused or failed call, a missing compaction, an envelope check. No fallback follows."""
