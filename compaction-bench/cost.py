"""The cost model (design B5) for every run → out/cost/.

Every request is priced on its own (harness/cockpit.ts price: the product's `costForUsage` and `resolveRates` from
--cockpit-root, at the request's own time, so a context tier applies to that request's prompt alone). A turn's summed
tokens are never priced. A request the product has no price for stops the costing with its model named.

Terms, per run, in two regimes:
  C_make     cold (measured): A0 none of its own (its cache write of the carried context is in C_turn1's first
             request, priced whole, since one request is never split); A1 its /compact turn(s);
             A2-A7 the summariser's requests plus the opening turn on the target. Warm (computed from the same
             requests): A0 nothing; A1 the /compact turn with its first request's cache write read from cache instead;
             A2-A7 as cold (a summariser never shares the session's cache).
  C_between  chained cuts: the replayed turns between the two cuts, as measured.
  C_turn1    the continued turn, as measured; warm: A0's first request reads the carried context (the prompt of the
             session's last request before the cut) instead of writing it, and still writes what is new.
  C_horizon  the real session's requests after its own continued turn, turn 2..K, each re-priced with its prompt moved
             by (S − P): S the arm's carried size (the prompt of its continued turn's first request), P the real
             session's at the same point; Δ and output are the real ones (cache read = max(0, real read + S − P)).
             K = the real turns to its next compaction or end; also K = 20 and K = 50 where the session has them.
  window %   where --db holds the account's limit readings: weighted tokens (forecast.ts weightedTokens) over the
             account's measured tokens per percent (tokensPerPercent), per window kind.

Usage: python -I compaction-bench/cost.py --runs out/runs --cockpit-root ~/cockpit [--db ~/.local/share/cawco/cawco.db]
"""
import argparse
import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402

KS = ("K", 20, 50)


def turns_of(recs, start, end):
    """[(turn index, [requests])] for the real records start..end, by turn."""
    starts = [k for k in common.turn_starts(recs) if start <= k < end] + [end]
    return [common.requests_of(recs[a:b]) for a, b in zip(starts, starts[1:])]


def price_all(reqs, root):
    if not reqs:
        return []
    got = common.cockpit("price", root, {"requests": [
        {k: r[k] for k in ("model", "at", "input", "output", "cacheCreation", "cacheWrite1h", "cacheRead")} for r in reqs]})
    bad = [(r["model"], p["error"]) for r, p in zip(reqs, got["priced"]) if "error" in p]
    if bad:
        raise SystemExit(f"cost: no product price: {sorted(set(bad))}")
    return [p["usd"] for p in got["priced"]]


def warm(req, carried=None):
    """The same request with what a warm cache already held read instead of written: the carried context
    (`carried` prompt tokens; everything when None, as for a /compact, whose prompt is all carried). What is new in the
    request (the next message) stays a write."""
    held = req["cacheCreation"] if carried is None else min(req["cacheCreation"], max(0, carried - req["cacheRead"]))
    w = dict(req)
    w["cacheRead"] = req["cacheRead"] + held
    w["cacheCreation"] = req["cacheCreation"] - held
    w["cacheWrite1h"] = min(req["cacheWrite1h"], w["cacheCreation"])
    return w


def windows_for(db, account):
    if not (db and account and os.path.exists(db)):
        return None
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    hist = [{"accountId": r[0], "kind": r[1], "scopeLabel": r[2], "percent": r[3], "resetsAt": r[4], "fetchedAt": r[5]}
            for r in con.execute("SELECT account_id, kind, scope_label, percent, resets_at, fetched_at FROM usage_limit_history"
                                 " WHERE account_id = ?", (account,))]
    turns = [{"at": r[0], "inputTokens": r[1], "cacheReadTokens": r[2], "cacheWriteTokens": r[3], "cacheWrite1hTokens": r[4],
              "outputTokens": r[5]} for r in con.execute(
        "SELECT at, input_tokens, cache_read_tokens, cache_write_tokens, cache_write_1h_tokens, output_tokens FROM turn_usage"
        " WHERE account_id = ?", (account,))]
    con.close()
    kinds = sorted({(h["kind"], h["scopeLabel"]) for h in hist}, key=str)
    return {"history": hist, "turns": turns, "windows": [{"kind": k, "scopeLabel": s} for k, s in kinds]}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs")
    ap.add_argument("--out")
    ap.add_argument("--cuts")
    ap.add_argument("--cockpit-root", required=True)
    ap.add_argument("--db")
    a = ap.parse_args(argv)
    out = os.path.abspath(a.out or os.path.dirname(os.path.abspath(a.runs)))
    cuts = common.load(a.cuts or os.path.join(out, "cuts.json"))["cuts"]
    rows = []
    for cut in cuts:
        nxt = cut["second"] if cut.get("chained") else cut
        real = common.read_jsonl(nxt["real"]["jsonl"])
        real_turns = turns_of(real, nxt["real"]["index"], nxt["real"]["horizon_end"])
        if not real_turns or not real_turns[0]:
            continue
        P = common.prompt_tokens(real_turns[0][0])
        # what the session held at the cut: the prompt of its last request in the live scope (A0's warm read)
        pre = common.read_jsonl(cut["jsonl"])[:nxt["cut_index"] if cut.get("chained") else cut["cut_index"]]
        held = common.requests_of(common.live_scope(pre)[1])
        carried = common.prompt_tokens(held[-1]) if held else 0
        win = windows_for(a.db, cut.get("account_id"))
        root = os.path.join(out, "runs", cut["id"])
        for arm in sorted(os.listdir(root)) if os.path.isdir(root) else []:
            for run in sorted(os.listdir(os.path.join(root, arm)), key=int):
                res = common.load(os.path.join(root, arm, run, "result.json")) or {}
                if res.get("status") != "done":
                    continue
                steps = res["steps"]
                make = [r for s in steps if s["kind"] in ("summarize", "opening", "compact") for r in s["requests"]]
                between = [r for s in steps if s["kind"] == "replay" for r in s["requests"]]
                t1 = next(s for s in steps if s["kind"] == "turn1")["requests"]
                if not t1:
                    continue
                S = common.prompt_tokens(t1[0])
                horizon = {}
                for K in KS:
                    k = nxt["horizon_turns"] if K == "K" else K
                    if k > len(real_turns):
                        horizon[str(K)] = None
                        continue
                    horizon[str(K)] = [dict(r, cacheRead=max(0, r["cacheRead"] + S - P)) for t in real_turns[1:k] for r in t]
                rows.append({"cut": cut, "arm": arm, "run": int(run), "make": make, "between": between, "t1": t1,
                             "S": S, "P": P, "carried": carried, "horizon": horizon, "win": win})
    # one pricing call for everything, warm variants included
    flat, index = [], []

    def add(reqs):
        index.append((len(flat), len(reqs)))
        flat.extend(reqs)
        return len(index) - 1
    for r in rows:
        arm = r["arm"]
        compacts = r["make"]
        cold_make = list(compacts)
        if arm == "A0":
            # its cache write of the carried context is in the continued turn's first request, priced whole there:
            # splitting one request to show the write as C_make would price two halves under the wrong context tier
            cold_make = []
            t1_cold = r["t1"]
            t1_warm = [warm(r["t1"][0], r["carried"])] + r["t1"][1:]
            warm_make = []
        else:
            t1_cold = t1_warm = r["t1"]
            warm_make = ([warm(compacts[0])] + compacts[1:]) if arm == "A1" and compacts else compacts
        r["ix"] = {"make_cold": add(cold_make), "make_warm": add(warm_make), "between": add(r["between"]),
                   "t1_cold": add(t1_cold), "t1_warm": add(t1_warm),
                   **{f"h{K}": add(v) for K, v in r["horizon"].items() if v is not None}}
    usd = price_all(flat, a.cockpit_root)

    def total(i):
        s, n = index[i]
        return sum(usd[s:s + n])
    summary = []
    for r in rows:
        ix = r["ix"]
        rec = {"cut": r["cut"]["id"], "arm": r["arm"], "run": r["run"], "band": r["cut"]["band"],
               "chained": bool(r["cut"].get("chained")), "pre_tokens": r["cut"]["pre_tokens"], "S": r["S"], "P": r["P"]}
        for regime in ("cold", "warm"):
            parts = {"make": total(ix[f"make_{regime}"]), "between": total(ix["between"]), "turn1": total(ix[f"t1_{regime}"])}
            for K in KS:
                parts[f"horizon_{K}"] = total(ix[f"h{K}"]) if f"h{K}" in ix else None
                parts[f"total_{K}"] = None if parts[f"horizon_{K}"] is None else (
                    parts["make"] + parts["between"] + parts["turn1"] + parts[f"horizon_{K}"])
            rec[regime] = parts
        if r["win"] and r["win"]["windows"]:
            reqs = [flat[s:s + n] for s, n in (index[ix["make_cold"]], index[ix["t1_cold"]], index[ix["hK"]] if "hK" in ix else (0, 0))]
            weigh = [{"inputTokens": q["input"], "cacheWriteTokens": q["cacheCreation"], "cacheWrite1hTokens": q["cacheWrite1h"],
                      "cacheReadTokens": q["cacheRead"], "outputTokens": q["output"]} for part in reqs for q in part]
            got = common.cockpit("forecast", a.cockpit_root, {"accountId": r["cut"]["account_id"], "history": r["win"]["history"],
                                                             "turns": r["win"]["turns"], "windows": r["win"]["windows"],
                                                             "weigh": weigh})
            weighted = sum(got["weighted"])
            rec["window_pct_cold_total_K"] = {f"{w['kind']}{'/' + w['scopeLabel'] if w['scopeLabel'] else ''}":
                                              (weighted / w["tokensPerPct"] if w["tokensPerPct"] else None)
                                              for w in got["windows"]}
        common.save(os.path.join(out, "cost", r["cut"]["id"], r["arm"], f"{r['run']}.json"), rec)
        summary.append(rec)
    common.save(os.path.join(out, "cost", "summary.json"), summary)
    print(f"cost: {len(summary)} runs priced, {len(flat)} requests, each on its own", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
