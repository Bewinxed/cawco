"""Draws the cut points (design B3) from cawco.db and the Claude Code transcripts under the account dirs → cuts.json.

Kinds:
  native           a compact_boundary between turns: the cut is the boundary, the next message the turn after it
  native-midturn   an auto compaction inside a turn (the context overflowed mid-turn): the cut moves to the start of
                   that turn; the user record that opened it is the next message, and the context at the cut is the
                   prompt of the last request before it
  moved-compacted  a manual boundary just after a limit_events `moved` with `compact` set on its instance
  moved            a limit_events `moved` (an account move, at a limit, by a rebalance or asked): the cut is the last
                   record before the move, the next message the first turn after it; `cross_org` from the move
  continued        a limit_events `continued`: the conversation it ended (instance_conversations.next_event_id) is
                   the pre-cut transcript; the next conversation (ord + 1, or the instance's current one) opens with
                   the CawCo opening, and the first turn after that opening is the next message
Every instance id read from limit_events is resolved through instance_aliases (folded former sessions); every
transcript is found by its session id under any account dir (the conversation's own account first); a transcript's end
time is its last record that has a timestamp.

Eligible: context at the cut ≥ --min-context, ≥ --horizon real turns after it, no assistant record between the cut and
the next message (a model that went on by itself has no next message to replay), a CawCo instance for the session, and
its directory a git repo on this host. The next message must be the person's words or another session's (core sentRow:
"user" / "user.peer", next_kind person / agent; a `<task-notification>` is typed through the agent's harnessNoteOf as
the product does, Claude Code's interrupt line opens no turn, and the markers CawCo wrote before 2026-09-23 are typed
as the product typed them then, see legacy_type) — or, for a cut at a limit event (moved, continued, moved-compacted, and a native cut with a limit event
on its instance from 30 minutes before the cut to its next message), the hub's own resume nudge (server.ts CARRY_ON,
read from --cockpit-root), marked next_kind "resume". Any other CawCo note stays excluded. (The resume rule is our
call: resuming is the very thing the arms are judged on.)
Chained pair: two eligible boundaries (native kinds) in one transcript with ≥ --chain-gap turns between them.
The draw is seeded and stratified by band (design B3): per band n/3 cuts, n/12 of them chained pairs, n/12 continued,
n/12 orchestrator sessions, and at least one same-org and one cross-org move where the pool has them; a shortfall is
written, never filled from another stratum. One non-chained cut per band is marked `floor` for the noise-floor runs.

Usage:
  python3 -I compaction-bench/cuts.py --db ~/.local/share/cawco/cawco.db --accounts ~/.cawco/accounts \
      --cockpit-root ~/cockpit --out out/cuts.json --n 24 --seed 1 [--explain]
  python3 -I compaction-bench/cuts.py --fixture --out compaction-bench/out/dry/cuts.json --explain
"""
import argparse
import collections
import glob
import json
import os
import random
import re
import sqlite3
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402

OPENING = re.compile(r'^(Continuing|Restarting) session ".*" \(instance (\S+), ')
# CawCo's own delivery markers before 2026-09-23, as the product's parser read them then (core transcript-rules.ts
# before d33fc5795: HANDOFF_MARKER, DELEGATE_ASK_OPENING, the delegate report's opening; `[Rule: <name>]` is a rule
# reply, user.rule). Today's sentRow reads only the current markers, so in older transcripts these pass as the
# person's words. A rule reply is cawco's own; the other three are another session's words (user.peer).
LEGACY_PEER = (re.compile(r"^\[Hand-off from the (.*?) session"), re.compile(r"^\[Delegate ask from (.+?)\]\n"),
               re.compile(r"^\[Report from delegate (.+?)#([0-9a-f]{8}) — turn (complete|failed)\]\n"))
LEGACY_RULE = re.compile(r"^\[Rule: [^\]\n]+\]\n")


def legacy_type(text, typ):
    """sentRow's type, with the pre-2026-09-23 markers typed as the product typed them then."""
    if typ != "user" or not text:
        return typ
    if LEGACY_RULE.match(text):
        return "user.rule"
    if any(p.match(text) for p in LEGACY_PEER):
        return "user.peer"
    return typ
LIMIT_WINDOW_MS = 30 * 60_000


def carry_on_texts(root):
    """The hub's resume nudges, verbatim from server.ts `CARRY_ON` (not exported: read from the source)."""
    src = open(os.path.join(root, "packages/hub/src/server.ts")).read()
    m = re.search(r"const CARRY_ON: Record<[^>]*> = \{(.*?)\n  \};", src, re.S)
    texts = re.findall(r'"((?:[^"\\]|\\.)*)"', m.group(1)) if m else []
    if not texts:
        raise SystemExit("server.ts no longer has CARRY_ON: the resume rule cannot be applied")
    return set(texts)


def _table(con, name):
    return con.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone() is not None


def load_db(db):
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    inst = {r["id"]: dict(r) for r in con.execute(
        "SELECT id, session_id, cwd, title, model, effort, parent_instance_id, account_id, harness FROM instances")}
    alias = {r[0]: r[1] for r in con.execute("SELECT id, instance_id FROM instance_aliases")} if _table(con, "instance_aliases") else {}
    events = []
    for r in con.execute("SELECT id, instance_id, at, move FROM limit_events ORDER BY at"):
        e = dict(r)
        e["move"] = json.loads(e["move"])
        e["instance_id"] = alias.get(e["instance_id"], e["instance_id"])
        events.append(e)
    convs = [dict(r) for r in con.execute(
        "SELECT instance_id, ord, session_id, account_id, ended_at, next_event_id FROM instance_conversations ORDER BY instance_id, ord")] \
        if _table(con, "instance_conversations") else []
    con.close()
    for c in convs:
        c["instance_id"] = alias.get(c["instance_id"], c["instance_id"])
    return inst, events, convs


class Transcripts:
    """Every transcript under the account dirs, by session id (the file's name). Parsed records are kept for the last
    CACHE files only: the account dirs hold many GB of JSONL, and keeping every parsed file resident took 25 GiB on the
    first real draw."""
    CACHE = 8

    def __init__(self, accounts):
        self.by_sid = collections.defaultdict(list)
        for p in glob.glob(os.path.join(accounts, "*", "claude", "projects", "*", "*.jsonl")):
            self.by_sid[os.path.basename(p)[:-6]].append(p)
        self._recs = collections.OrderedDict()

    def path(self, sid, account=None):
        paths = self.by_sid.get(sid) or []
        mine = [p for p in paths if account and f"/{account}/claude/" in p]
        pool = mine or paths
        return max(pool, key=os.path.getsize) if pool else None

    def recs(self, path):
        if path in self._recs:
            self._recs.move_to_end(path)
        else:
            self._recs[path] = common.read_jsonl(path)
            while len(self._recs) > self.CACHE:
                self._recs.popitem(last=False)
        return self._recs[path]

    @staticmethod
    def has_boundary(path):
        """Whether the file holds a compact_boundary record at all, by its bytes, before any parse."""
        needle, tail = b'"compact_boundary"', b""
        with open(path, "rb") as fh:
            for chunk in iter(lambda: fh.read(1 << 22), b""):
                if needle in tail + chunk:
                    return True
                tail = chunk[-len(needle):]
        return False

    def paths(self):
        return sorted(p for ps in self.by_sid.values() for p in ps)


def last_ts(recs):
    return next((r["timestamp"] for r in reversed(recs) if r.get("timestamp")), None)


def is_repo(path):
    return bool(path) and os.path.isdir(path) and subprocess.run(
        ["git", "-C", path, "rev-parse", "--show-toplevel"], capture_output=True).returncode == 0


def cwd_at(recs, upto):
    return next((r["cwd"] for r in reversed(recs[:upto]) if isinstance(r.get("cwd"), str)), None)


def branch_at(recs, upto):
    return next((r["gitBranch"] for r in reversed(recs[:upto]) if r.get("gitBranch")), None)


def model_at(recs, upto):
    return next(((r.get("message") or {}).get("model") for r in reversed(recs[:upto])
                 if r.get("type") == "assistant" and (r.get("message") or {}).get("model") not in (None, "<synthetic>")), None)


def next_turn(recs, start):
    """The first turn-opening user record at or after `start`, and whether an assistant record came first."""
    for j in range(start, len(recs)):
        if recs[j].get("type") == "assistant" and not recs[j].get("isSidechain"):
            return None, True
        if common.user_text(recs[j]):
            return j, False
    return None, False


def context_before(recs, k):
    reqs = common.requests_of(recs[:k])
    return common.prompt_tokens(reqs[-1]) if reqs else 0


def find(db, accounts, o):
    inst, events, convs = load_db(db)
    carry = carry_on_texts(o.cockpit_root)
    tx = Transcripts(accounts)
    sid_inst = {r["session_id"]: r["id"] for r in inst.values() if r.get("session_id")}
    for c in convs:
        sid_inst.setdefault(c["session_id"], c["instance_id"])
    conv_of_event = {c["next_event_id"]: c for c in convs if c.get("next_event_id")}
    convs_by_inst = collections.defaultdict(list)
    for c in convs:
        convs_by_inst[c["instance_id"]].append(c)
    events_by_inst = collections.defaultdict(list)
    for e in events:
        events_by_inst[e["instance_id"]].append(e)
    cands, excluded = [], []

    def exclude(kind, why, where, detail=None):
        excluded.append({"kind": kind, "why": why, "where": where, **({"detail": detail} if detail else {})})

    def next_conv_sid(c):
        later = [x for x in convs_by_inst[c["instance_id"]] if x["ord"] == c["ord"] + 1]
        return later[0]["session_id"] if later else (inst.get(c["instance_id"]) or {}).get("session_id")

    # ---- boundaries: native, native-midturn (moved-compacted is marked below)
    for path in tx.paths():
        if not tx.has_boundary(path):
            continue
        recs = tx.recs(path)
        sid = os.path.basename(path)[:-6]
        starts = common.turn_starts(recs)
        bounds = [k for k, r in enumerate(recs) if common.is_boundary(r)]
        for i in bounds:
            r, where = recs[i], f"{path}#{i}"
            meta = r.get("compactMetadata") or {}
            later = [b for b in bounds if b > i]
            end = later[0] if later else len(recs)
            j, mid_turn = next_turn(recs, i + 1)
            if mid_turn:
                t = max((s for s in starts if s < i), default=None)
                if t is None:
                    exclude("native-midturn", "no turn start before the mid-turn compaction", where)
                    continue
                cands.append({"kind": "native-midturn", "path": path, "session_id": sid, "cut_index": t,
                              "cut_uuid": recs[t].get("uuid"), "cut_at": recs[t].get("timestamp") or r.get("timestamp"),
                              "pre_tokens": context_before(recs, t), "trigger": meta.get("trigger"), "next_index": t,
                              "next_path": path, "horizon_end": end, "boundary_index": i})
            elif j is None:
                exclude("native", "no next message", where)
            else:
                cands.append({"kind": "native", "path": path, "session_id": sid, "cut_index": i, "cut_uuid": r.get("uuid"),
                              "cut_at": r.get("timestamp"), "pre_tokens": meta.get("preTokens") or 0,
                              "trigger": meta.get("trigger"), "next_index": j, "next_path": path, "horizon_end": end,
                              "boundary_index": i})
    # moved + compacted: a manual boundary on the instance within 2 h after the move
    for e in events:
        m = e["move"]
        if m.get("kind") != "moved" or not m.get("compact"):
            continue
        after = [c for c in cands if sid_inst.get(c["session_id"]) == e["instance_id"] and c["trigger"] == "manual"
                 and c["kind"] == "native" and c["cut_at"] and 0 <= common.ts_ms(c["cut_at"]) - e["at"] <= 2 * 3600_000]
        if after:
            hit = min(after, key=lambda c: c["cut_at"])
            hit.update(kind="moved-compacted", event_id=e["id"], at_limit=True,
                       cross_org=not m.get("sameOrganization", False))
    # ---- continued: the conversation the event ended, then the next one
    for e in events:
        if e["move"].get("kind") != "continued":
            continue
        where = f"limit_events {e['id']}"
        c = conv_of_event.get(e["id"])
        if not c:
            exclude("continued", "no instance_conversations row ends at this event", where)
            continue
        a = tx.path(c["session_id"], c.get("account_id"))
        bsid = next_conv_sid(c)
        b = tx.path(bsid) if bsid else None
        if not a:
            exclude("continued", "the ended conversation's transcript is not on this host", where, c["session_id"])
            continue
        if not b:
            exclude("continued", "the next conversation's transcript is not on this host", where, bsid)
            continue
        arecs, brecs = tx.recs(a), tx.recs(b)
        k = next((n for n, r in enumerate(brecs) if common.user_text(r)), None)
        if k is not None and OPENING.match(common.user_text(brecs[k]) or ""):
            k = next((n for n in range(k + 1, len(brecs)) if common.user_text(brecs[n])), None)
        if k is None:
            exclude("continued", "no turn after the opening", where)
            continue
        cands.append({"kind": "continued", "path": a, "session_id": c["session_id"], "cut_index": len(arecs),
                      "cut_uuid": next((r.get("uuid") for r in reversed(arecs) if r.get("uuid")), None),
                      "cut_at": last_ts(arecs), "pre_tokens": context_before(arecs, len(arecs)), "trigger": None,
                      "next_index": k, "next_path": b, "horizon_end": next((n for n, r in enumerate(brecs) if n > k and common.is_boundary(r)), len(brecs)),
                      "instance": e["instance_id"], "event_id": e["id"], "at_limit": True})
    # ---- moved: the last record before the move, the first turn after it
    seen = set()
    for e in events:
        m = e["move"]
        if m.get("kind") != "moved" or m.get("compact"):
            continue
        where = f"limit_events {e['id']}"
        common_fields = {"instance": e["instance_id"], "event_id": e["id"], "at_limit": True,
                         "cross_org": not m.get("sameOrganization", False), "move_from": (m.get("from") or {}).get("id"),
                         "move_to": (m.get("to") or {}).get("id"), "move_because": (m.get("because") or {}).get("kind"),
                         "move_asked": bool(m.get("asked"))}
        c = conv_of_event.get(e["id"])
        if c:  # the move ended a conversation: like a continuation
            a, bsid = tx.path(c["session_id"], c.get("account_id")), next_conv_sid(c)
            b = tx.path(bsid) if bsid else None
            if not (a and b):
                exclude("moved", "a conversation of the move is not on this host", where)
                continue
            arecs, brecs = tx.recs(a), tx.recs(b)
            k = next((n for n, r in enumerate(brecs) if common.user_text(r)), None)
            if k is not None and OPENING.match(common.user_text(brecs[k]) or ""):
                k = next((n for n in range(k + 1, len(brecs)) if common.user_text(brecs[n])), None)
            if k is None:
                exclude("moved", "no turn after the move", where)
                continue
            cands.append({"kind": "moved", "path": a, "session_id": c["session_id"], "cut_index": len(arecs),
                          "cut_uuid": None, "cut_at": last_ts(arecs), "pre_tokens": context_before(arecs, len(arecs)),
                          "trigger": None, "next_index": k, "next_path": b, "horizon_end": len(brecs), **common_fields})
            continue
        # the move kept the conversation: the one the instance ran at the event
        mine = sorted(convs_by_inst[e["instance_id"]], key=lambda x: x["ord"])
        active = next((x for x in mine if x["ended_at"] >= e["at"]), None)
        sid = active["session_id"] if active else (inst.get(e["instance_id"]) or {}).get("session_id")
        path = tx.path(sid) if sid else None
        if not path:
            exclude("moved", "the session's transcript at the move is not on this host", where, sid)
            continue
        recs = tx.recs(path)
        cut, cur = None, None
        for n, r in enumerate(recs):
            if r.get("timestamp"):
                cur = common.ts_ms(r["timestamp"])
            if cur is not None and cur > e["at"]:
                cut = n
                break
        if cut is None:
            exclude("moved", "the transcript ends before the move", where)
            continue
        while cut > 0 and not recs[cut - 1].get("timestamp") and recs[cut - 1].get("type") not in ("user", "assistant"):
            cut -= 1
        if (path, cut) in seen:
            exclude("moved", "another move already cut here", where)
            continue
        seen.add((path, cut))
        j, mid_turn = next_turn(recs, cut)
        if mid_turn or j is None:
            exclude("moved", "the session went on after the move with no new message" if mid_turn else "no next message", where)
            continue
        cands.append({"kind": "moved", "path": path, "session_id": sid, "cut_index": cut,
                      "cut_uuid": next((r.get("uuid") for r in reversed(recs[:cut]) if r.get("uuid")), None),
                      "cut_at": last_ts(recs[:cut]), "pre_tokens": context_before(recs, cut), "trigger": None,
                      "next_index": j, "next_path": path,
                      "horizon_end": next((n for n in range(j, len(recs)) if common.is_boundary(recs[n])), len(recs)),
                      **common_fields})
    # ---- eligibility; every next message is classified in one call. Ordered by file so the bounded cache serves
    # each file's candidates from one parse (the draw sorts its pools itself, so this order changes no cut).
    cands.sort(key=lambda c: (c["path"], c["next_path"], c["cut_index"]))
    texts =[common.user_text(tx.recs(c["next_path"])[c["next_index"]]) for c in cands]
    types = common.cockpit("classify", o.cockpit_root, {"texts": texts})["types"] if texts else []
    types = [legacy_type(x, t) for x, t in zip(texts, types)]
    eligible = []
    for c, text, typ in zip(cands, texts, types):
        where = f"{c['path']}#{c['cut_index']}"
        recs, nrecs = tx.recs(c["path"]), tx.recs(c["next_path"])
        iid = c.get("instance") or sid_inst.get(c["session_id"])
        row = inst.get(iid)
        if c["kind"] in ("native", "native-midturn") and row and c.get("cut_at"):
            lo = common.ts_ms(c["cut_at"]) - LIMIT_WINDOW_MS
            hi = common.ts_ms(nrecs[c["next_index"]]["timestamp"]) if nrecs[c["next_index"]].get("timestamp") else lo + LIMIT_WINDOW_MS
            c["at_limit"] = any(lo <= e["at"] <= hi for e in events_by_inst[iid])
        horizon = len(common.turn_starts(nrecs[c["next_index"]:c["horizon_end"]]))
        cwd = cwd_at(recs, c["cut_index"]) or (row or {}).get("cwd")
        # the nudge is stored as plain user text, so it is recognised by its exact words before the type is read
        if text in carry:
            next_kind = "resume" if c.get("at_limit") else None
        else:
            next_kind = {"user": "person", "user.peer": "agent"}.get(typ)
        why = None
        if row is None:
            why = "no CawCo instance for this session"
        elif c["pre_tokens"] < o.min_context:
            why = f"context below {o.min_context // 1000}k"
        elif horizon < o.horizon:
            why = f"fewer than {o.horizon} turns after the cut"
        elif next_kind is None:
            why = "the next message is cawco's own" + (" (a resume nudge, not at a limit event)" if text in carry else f" ({typ})")
        elif not is_repo(cwd):
            why = "its directory is not a git repo on this host"
        if why:
            exclude(c["kind"], why, where)
            continue
        eligible.append({
            "kind": c["kind"], "band": common.band_of(c["pre_tokens"]), "instance_id": row["id"],
            "role": "orchestrator" if not row.get("parent_instance_id") else "delegate", "title": row.get("title"),
            "account_id": c.get("move_from") or row.get("account_id"), "model": row.get("model") or model_at(recs, c["cut_index"]),
            "effort": row.get("effort") if row.get("effort") not in (None, "none") else None,
            "cwd": cwd, "git_branch": branch_at(recs, c["cut_index"]), "jsonl": c["path"], "session_id": c["session_id"],
            "cut_index": c["cut_index"], "cut_uuid": c["cut_uuid"], "cut_at": c["cut_at"], "pre_tokens": c["pre_tokens"],
            "trigger": c["trigger"], "session_started": next((r.get("timestamp") for r in recs if r.get("timestamp")), None),
            "next_text": text, "next_uuid": nrecs[c["next_index"]].get("uuid"), "next_type": typ, "next_kind": next_kind,
            "at_limit": bool(c.get("at_limit")), "cross_org": c.get("cross_org"), "event_id": c.get("event_id"),
            "move": {k: c[k] for k in ("move_from", "move_to", "move_because", "move_asked") if k in c} or None,
            "real": {"jsonl": c["next_path"], "index": c["next_index"],
                     "end": next((k for k in common.turn_starts(nrecs) if k > c["next_index"]), len(nrecs)),
                     "horizon_end": c["horizon_end"]},
            "horizon_turns": horizon, "boundary_index": c.get("boundary_index")})
    # ---- chained pairs within one transcript (the boundary kinds)
    pairs, by_path = [], collections.defaultdict(list)
    for e in eligible:
        if e["kind"] in ("native", "native-midturn", "moved-compacted"):
            by_path[e["jsonl"]].append(e)
    for path, es in by_path.items():
        es.sort(key=lambda e: e["cut_index"])
        recs = tx.recs(path)
        for a, b in zip(es, es[1:]):
            between = [k for k in common.turn_starts(recs) if a["real"]["index"] <= k < b["cut_index"]]
            if len(between) >= o.chain_gap:
                pairs.append(dict(a, chained=True, replay_texts=[common.user_text(recs[k]) for k in between],
                                  second={k: b[k] for k in ("cut_index", "cut_uuid", "cut_at", "pre_tokens", "trigger",
                                                            "next_text", "next_uuid", "next_type", "next_kind", "real",
                                                            "horizon_turns")}))
    return eligible, pairs, excluded


def draw(eligible, pairs, n, seed, taken=()):
    """Seeded, stratified (design B3). Returns (cuts, shortfall)."""
    rng = random.Random(seed)
    taken = set(taken)
    key = lambda c: (c["jsonl"], c["cut_index"], bool(c.get("chained")))  # noqa: E731
    per_band = [n // 3 + (1 if k < n % 3 else 0) for k in range(3)]
    quota = max(1, round(n / 12)) if n >= 6 else 0
    out, short = [], []
    for (band, _, _), want in zip(common.BANDS, per_band):
        pool_p = sorted((p for p in pairs if p["band"] == band and key(p) not in taken), key=key)
        pool_s = sorted((c for c in eligible if c["band"] == band and key(c) not in taken), key=key)
        rng.shuffle(pool_p)
        rng.shuffle(pool_s)
        chosen = pool_p[:min(quota, want)]
        used = {(p["jsonl"], i) for p in chosen for i in (p["cut_index"], p["second"]["cut_index"])}
        pool_s = [c for c in pool_s if (c["jsonl"], c["cut_index"]) not in used]

        def take(pred, k):
            got = [c for c in pool_s if pred(c)][:max(0, k)]
            for c in got:
                pool_s.remove(c)
            chosen.extend(got)
            return len(got)
        if len(chosen) < min(quota, want):
            short.append(f"{band}: {len(chosen)} chained pairs of {min(quota, want)}")
        want_cont = min(quota, want - len(chosen))
        got = take(lambda c: c["kind"] == "continued", want_cont)
        if got < want_cont:
            short.append(f"{band}: {got} continued cuts of {want_cont}")
        if quota:
            for org in (True, False):
                label = "cross-org" if org else "same-org"
                if want - len(chosen) > 0 and not any(c["kind"] == "moved" and c.get("cross_org") is org for c in chosen):
                    if not take(lambda c, org=org: c["kind"] == "moved" and c.get("cross_org") is org, 1):
                        short.append(f"{band}: no {label} move in the pool")
        orch = sum(1 for c in chosen if c["role"] == "orchestrator")
        if orch < quota:
            got = take(lambda c: c["role"] == "orchestrator", min(quota - orch, want - len(chosen)))
            if orch + got < quota:
                short.append(f"{band}: {orch + got} orchestrator cuts of {quota}")
        take(lambda c: True, want - len(chosen))
        if len(chosen) < want:
            short.append(f"{band}: {len(chosen)} cuts of {want}")
        out.extend(chosen)
    return out, short


FIXTURE_FILES = (("session.jsonl", "acct-fixture"), ("continued-a.jsonl", "acct-fixture-b"),
                 ("continued-b.jsonl", "acct-fixture-b"), ("midturn.jsonl", "acct-fixture"),
                 ("moved.jsonl", "acct-fixture"))


def build_fixture(out_dir):
    """The fixture as a host would hold it: a DB from fixtures/cawco.sql and the transcripts in an accounts tree, all
    naming this repo (the bench's own checkout) as the sessions' directory."""
    repo = subprocess.run(["git", "-C", common.HERE, "rev-parse", "--show-toplevel"], capture_output=True,
                          text=True, check=True).stdout.strip()
    root = os.path.join(out_dir, "fixture")
    db = os.path.join(root, "cawco.db")
    os.makedirs(root, exist_ok=True)
    if os.path.exists(db):
        os.remove(db)
    con = sqlite3.connect(db)
    con.executescript(open(os.path.join(common.FIXTURES, "cawco.sql")).read().replace("{REPO}", repo))
    con.commit()
    con.close()
    proj = common.encode_project_dir(repo)
    for name, acct in FIXTURE_FILES:
        text = open(os.path.join(common.FIXTURES, name)).read().replace("{REPO}", repo)
        sid = json.loads(text.splitlines()[0])["sessionId"]
        d = os.path.join(root, "accounts", acct, "claude", "projects", proj)
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, f"{sid}.jsonl"), "w") as fh:
            fh.write(text)
    return db, os.path.join(root, "accounts"), repo


def summary_counts(eligible, pairs, cuts=None):
    def tally(cs):
        return {"by_band": dict(collections.Counter(c["band"] for c in cs)),
                "by_kind": dict(collections.Counter(c["kind"] for c in cs)),
                "by_role": dict(collections.Counter(c["role"] for c in cs)),
                "by_next_kind": dict(collections.Counter(c.get("next_kind") for c in cs)),
                "moves": {"cross_org": sum(1 for c in cs if c["kind"] == "moved" and c.get("cross_org")),
                          "same_org": sum(1 for c in cs if c["kind"] == "moved" and c.get("cross_org") is False)}}
    out = {"eligible": len(eligible), "chained_pairs": len(pairs), "pool": tally(eligible)}
    if cuts is not None:
        out["drawn"] = tally(cuts)
    return out


def write(path, cuts, short, excluded, eligible, pairs, seed, extra=None):
    common.save(path, {"seed": seed, "drawn_at": common.now_iso(), "cuts": cuts, "shortfall": short,
                       "counts": summary_counts(eligible, pairs, cuts), "excluded": excluded, **(extra or {})})


def explain(excluded, eligible, pairs, cuts):
    """Exclusions by kind and reason with three examples each, then what is eligible and what was drawn."""
    groups = collections.defaultdict(list)
    for x in excluded:
        groups[(x["kind"], x["why"])].append(x)
    print(f"excluded {len(excluded)}:")
    for (kind, why), xs in sorted(groups.items(), key=lambda kv: -len(kv[1])):
        print(f"  {len(xs):5d}  {kind:16s} {why}")
        for x in xs[:3]:
            print(f"           e.g. {x['where']}" + (f" ({x['detail']})" if x.get("detail") else ""))
    counts = summary_counts(eligible, pairs, cuts)
    print(f"eligible {counts['eligible']} (+{counts['chained_pairs']} chained pairs): {json.dumps(counts['pool'])}")
    print(f"drawn {len(cuts)}: {json.dumps(counts['drawn'])}")


def number(cuts, start):
    floors = set()
    for k, c in enumerate(cuts):
        c["id"] = f"c{start + k:02d}"
        c.setdefault("chained", False)
        c["floor"] = False
        if start == 1 and not c["chained"] and c["band"] not in floors:
            c["floor"] = True
            floors.add(c["band"])
    return cuts


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--db")
    ap.add_argument("--accounts")
    ap.add_argument("--cockpit-root")
    ap.add_argument("--out", required=True)
    ap.add_argument("--n", type=int, default=24)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--min-context", type=int, default=100_000)
    ap.add_argument("--horizon", type=int, default=10)
    ap.add_argument("--chain-gap", type=int, default=15)
    ap.add_argument("--explain", action="store_true", help="print exclusions by reason and kind, with examples")
    ap.add_argument("--fixture", action="store_true", help="draw the synthetic fixture's cuts")
    ap.add_argument("--replace-chained", type=int, metavar="MAX_GAP",
                    help="in the existing --out, draw the chained slots again from pairs at most MAX_GAP turns apart")
    o = ap.parse_args(argv)
    if o.replace_chained:
        got = replace_chained(o.out, o.db, o.accounts, o.cockpit_root, o.replace_chained)
        print(json.dumps(got, indent=1))
        return 0
    if o.fixture:
        o.db, o.accounts, repo = build_fixture(os.path.dirname(os.path.abspath(o.out)))
        o.cockpit_root = o.cockpit_root or repo
    if not (o.db and o.accounts and o.cockpit_root):
        ap.error("--db, --accounts and --cockpit-root are required (or --fixture)")
    eligible, pairs, excluded = find(o.db, o.accounts, o)
    if o.fixture:
        # every eligible cut once, the chained pair's first cut only inside its pair
        firsts = {(p["jsonl"], p["cut_index"]) for p in pairs}
        cuts, short = [dict(p) for p in pairs] + [dict(c) for c in sorted(eligible, key=lambda c: (c["kind"], c["jsonl"], c["cut_index"]))
                                                  if (c["jsonl"], c["cut_index"]) not in firsts], []
    else:
        cuts, short = draw(eligible, pairs, o.n, o.seed)
    number(cuts, 1)
    write(o.out, cuts, short, excluded, eligible, pairs, o.seed)
    print(f"{len(cuts)} cuts → {o.out}; eligible {len(eligible)} (+{len(pairs)} chained pairs), excluded {len(excluded)}"
          + (f"; shortfall: {'; '.join(short)}" if short else ""))
    if o.explain:
        explain(excluded, eligible, pairs, cuts)
    return 0


def replace_chained(path, db, accounts, cockpit_root, max_gap, seed=None):
    """The chained slots of an existing cuts.json drawn again from the pairs at most `max_gap` turns apart, seeded,
    each in its own band and id; no pair that shares a cut with one already drawn. The single cuts and their runs stay.
    The first real run's chained pairs replayed 117 and 121 real turns per run and drained two of the fleet's accounts'
    5-hour windows before half their runs were through (our call: a cap of 30)."""
    cur = common.load(path)
    o = argparse.Namespace(min_context=100_000, horizon=10, chain_gap=15, cockpit_root=cockpit_root)
    eligible, pairs, excluded = find(db, accounts, o)
    pool = [p for p in pairs if len(p["replay_texts"]) <= max_gap]
    used = {(c["jsonl"], i) for c in cur["cuts"] if not c.get("chained")
            for i in (c["cut_index"], (c.get("second") or {}).get("cut_index")) if i is not None}
    rng = random.Random((seed if seed is not None else cur["seed"]) * 1000 + max_gap)
    out, replaced = [], []
    for c in cur["cuts"]:
        if not c.get("chained"):
            out.append(c)
            continue
        mine = sorted((p for p in pool if p["band"] == c["band"]
                       and (p["jsonl"], p["cut_index"]) not in used and (p["jsonl"], p["second"]["cut_index"]) not in used),
                      key=lambda p: (p["jsonl"], p["cut_index"]))
        rng.shuffle(mine)
        if not mine:
            out.append(dict(c, chained_replaced=f"no pair within {max_gap} turns in {c['band']}: kept"))
            continue
        new = dict(mine[0], id=c["id"], chained=True, floor=False)
        used |= {(new["jsonl"], new["cut_index"]), (new["jsonl"], new["second"]["cut_index"])}
        replaced.append({"id": c["id"], "was": {"jsonl": c["jsonl"], "cut_index": c["cut_index"],
                                                 "replays": len(c.get("replay_texts") or [])},
                         "now": {"jsonl": new["jsonl"], "cut_index": new["cut_index"], "replays": len(new["replay_texts"])}})
        out.append(new)
    cur["cuts"] = out
    gaps = sorted(len(p["replay_texts"]) for p in pairs)
    cur.setdefault("chained_replaced", []).append({
        "at": common.now_iso(), "max_gap": max_gap, "pool_pairs": len(pairs), "within_gap": len(pool),
        "pair_gaps": {"min": gaps[0] if gaps else None, "median": gaps[len(gaps) // 2] if gaps else None,
                      "max": gaps[-1] if gaps else None},
        "within_gap_by_band": dict(collections.Counter(p["band"] for p in pool)), "replaced": replaced})
    common.save(path, cur)
    return cur["chained_replaced"][-1]


def add_cuts(path, n, db, accounts, cockpit_root, seed=None):
    """run.py --add-cuts: n more cuts from what the first draw left, same strata, appended to cuts.json."""
    cur = common.load(path)
    o = argparse.Namespace(min_context=100_000, horizon=10, chain_gap=15, cockpit_root=cockpit_root)
    eligible, pairs, excluded = find(db, accounts, o)
    taken = [(c["jsonl"], c["cut_index"], bool(c.get("chained"))) for c in cur["cuts"]]
    more, short = draw(eligible, pairs, n, (seed if seed is not None else cur["seed"]) + len(cur["cuts"]), taken)
    number(more, len(cur["cuts"]) + 1)
    cur["cuts"] += more
    cur.setdefault("added", []).append({"at": common.now_iso(), "n": n, "got": len(more), "shortfall": short})
    common.save(path, cur)
    return more


if __name__ == "__main__":
    sys.exit(main())
