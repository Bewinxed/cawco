"""E5: what a warm native compaction costs in window percent (design B5) → out/e5.md and out/e5.json. No model call.

Every compact_boundary in the transcripts, manual and auto. A warm native compaction's cost is its summarisation
request, by formula:
  prompt  a cache read of the boundary's `compactMetadata.preTokens` (warm by definition: the boundary sits inside a
          live turn, or in a /compact sent right after one);
  output  the summary it wrote, the `isCompactSummary` user record right after the boundary, counted with the
          product's own `estimateTokens` (core continuation.ts: four characters a token plus 15 %).
That request is priced with the product's `costForUsage` at the boundary's time, weighted with forecast.ts
`weightedTokens`, and turned into window percent with forecast.ts `tokensPerPercent` for the account the session was on
then (the last `moved` before it, else the conversation's or the instance's account), per window its readings measure.

Calibration: a manual /compact is a turn of its own, so its turn_usage row (within 5 minutes of the boundary) is the
compaction measured. For each, measured and formula are both reported, priced the same way.

compactAtPct = 100 − 3 × (median window % per 100k context × the 95th-percentile context / 100k), per window kind; the
default is the lowest across windows (the window a compaction costs most of). The rule is the design's own call (B5).

Usage: python -I compaction-bench/e5.py --db ~/.local/share/cawco/cawco.db --accounts ~/.cawco/accounts \
           --cockpit-root ~/cockpit --out out/e5.md
"""
import argparse
import collections
import os
import sqlite3
import statistics
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
from cuts import Transcripts, load_db  # noqa: E402

WINDOW_MS = 5 * 60_000


def pct(values, q):
    v = sorted(values)
    return v[min(len(v) - 1, int(round(q * (len(v) - 1))))] if v else None


def weigh_row(req):
    return {"inputTokens": req["input"], "cacheReadTokens": req["cacheRead"], "cacheWriteTokens": req["cacheCreation"],
            "cacheWrite1hTokens": req["cacheWrite1h"], "outputTokens": req["output"]}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    ap.add_argument("--accounts", required=True)
    ap.add_argument("--cockpit-root", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args(argv)
    inst, events, convs = load_db(a.db)
    con = sqlite3.connect(f"file:{a.db}?mode=ro", uri=True)
    usage = collections.defaultdict(list)
    for r in con.execute("SELECT instance_id, model, account_id, input_tokens, cache_read_tokens, cache_write_tokens,"
                         " cache_write_1h_tokens, output_tokens, at FROM turn_usage WHERE keep_alive = 0"):
        usage[r[0]].append(r)
    sid_inst = {r["session_id"]: (r["id"], r.get("account_id")) for r in inst.values() if r.get("session_id")}
    for c in convs:
        sid_inst.setdefault(c["session_id"], (c["instance_id"], c.get("account_id")))
    moves = collections.defaultdict(list)
    for e in events:
        if e["move"].get("kind") == "moved":
            moves[e["instance_id"]].append(e)
    tx = Transcripts(a.accounts)
    found, skipped = [], collections.Counter()
    for path in tx.paths():
        if not tx.has_boundary(path):
            continue
        recs = tx.recs(path)
        sid = os.path.basename(path)[:-6]
        for i, r in enumerate(recs):
            if not common.is_boundary(r):
                continue
            meta = r.get("compactMetadata") or {}
            if sid not in sid_inst:
                skipped["no instance"] += 1
                continue
            if not (meta.get("preTokens") and r.get("timestamp")):
                skipped["no preTokens or time"] += 1
                continue
            summ = next((x for x in recs[i + 1:i + 4] if common.is_summary(x)), None)
            if summ is None:
                skipped["no summary record after it"] += 1
                continue
            iid, acct0 = sid_inst[sid]
            at = common.ts_ms(r["timestamp"])
            before = [e for e in moves[iid] if e["at"] <= at]
            account = ((before[-1]["move"].get("to") or {}).get("id") if before else None) or acct0
            # the compaction runs on the session's model: the last one before the boundary, or, when the file opens on
            # a summary and has none before it, the first one after it
            real = [(x.get("message") or {}).get("model") for x in recs
                    if x.get("type") == "assistant" and (x.get("message") or {}).get("model") not in (None, "<synthetic>")]
            before_i = [(x.get("message") or {}).get("model") for x in recs[:i]
                        if x.get("type") == "assistant" and (x.get("message") or {}).get("model") not in (None, "<synthetic>")]
            model = before_i[-1] if before_i else (real[len(before_i)] if len(real) > len(before_i) else None)
            if model is None:
                skipped["no model in the transcript"] += 1
                continue
            text = "\n".join(b.get("text", "") for b in common.content_blocks(summ) if b.get("type") == "text")
            measured = None
            if meta.get("trigger") == "manual":
                near = [u for u in usage.get(iid, []) if abs(u[8] - at) <= WINDOW_MS and u[1]]
                if near:
                    u = min(near, key=lambda u: abs(u[8] - at))
                    measured = {"model": u[1], "at": u[8], "input": u[3], "cacheRead": u[4], "cacheCreation": u[5],
                                "cacheWrite1h": u[6] or 0, "output": u[7]}
            # what the session carried after it: the prompt of the first request after the summary (arith.py's S for
            # native compaction), and whether that request wrote it to the cache
            post = common.requests_of(recs[i + 1:i + 400])
            found.append({"instance": iid, "account": account, "model": model, "trigger": meta.get("trigger"),
                          "pre_tokens": meta["preTokens"], "at": at, "summary_chars": len(text), "measured": measured,
                          "post_prompt": common.prompt_tokens(post[0]) if post else None,
                          "post_write": post[0]["cacheCreation"] if post else None})
    con.close()
    if found:
        est = common.cockpit("tokens", a.cockpit_root, {"chars": [f["summary_chars"] for f in found]})["tokens"]
        for f, n in zip(found, est):
            f["summary_tokens"] = n
            f["formula"] = {"model": f["model"], "at": f["at"], "input": 0, "cacheCreation": 0, "cacheWrite1h": 0,
                            "cacheRead": f["pre_tokens"], "output": n}
        reqs = [f["formula"] for f in found] + [f["measured"] for f in found if f["measured"]]
        priced = common.cockpit("price", a.cockpit_root, {"requests": reqs})["priced"]
        bad = sorted({r["model"] for r, p in zip(reqs, priced) if "error" in p})
        if bad:
            raise SystemExit(f"e5: no product price for {bad}")
        k = len(found)
        for f, p in zip(found, priced[:k]):
            f["formula_usd"] = p["usd"]
        for f, p in zip([f for f in found if f["measured"]], priced[k:]):
            f["measured_usd"] = p["usd"]
    # window percent per account, through the product's forecast
    rows = []
    for acct in sorted({f["account"] for f in found if f["account"]}):
        mine = [f for f in found if f["account"] == acct]
        con = sqlite3.connect(f"file:{a.db}?mode=ro", uri=True)
        hist = [{"accountId": r[0], "kind": r[1], "scopeLabel": r[2], "percent": r[3], "resetsAt": r[4], "fetchedAt": r[5]}
                for r in con.execute("SELECT account_id, kind, scope_label, percent, resets_at, fetched_at"
                                     " FROM usage_limit_history WHERE account_id = ?", (acct,))]
        turns = [{"at": r[0], "inputTokens": r[1], "cacheReadTokens": r[2], "cacheWriteTokens": r[3],
                  "cacheWrite1hTokens": r[4], "outputTokens": r[5]} for r in con.execute(
            "SELECT at, input_tokens, cache_read_tokens, cache_write_tokens, cache_write_1h_tokens, output_tokens"
            " FROM turn_usage WHERE account_id = ?", (acct,))]
        con.close()
        windows = [{"kind": k, "scopeLabel": s} for k, s in sorted({(h["kind"], h["scopeLabel"]) for h in hist}, key=str)]
        if not windows:
            skipped["account has no limit readings"] += len(mine)
            continue
        weigh = [weigh_row(f["formula"]) for f in mine] + [weigh_row(f["measured"]) for f in mine if f["measured"]]
        got = common.cockpit("forecast", a.cockpit_root, {"accountId": acct, "history": hist, "turns": turns,
                                                         "windows": windows, "weigh": weigh})
        wf, wm = got["weighted"][:len(mine)], got["weighted"][len(mine):]
        for f, w in zip(mine, wf):
            f["formula_weighted"] = w
        for f, w in zip([f for f in mine if f["measured"]], wm):
            f["measured_weighted"] = w
        measured_any = False
        for win in got["windows"]:
            if not win["tokensPerPct"]:
                continue
            measured_any = True
            name = win["kind"] + (f"/{win['scopeLabel']}" if win["scopeLabel"] else "")
            for f in mine:
                p = f["formula_weighted"] / win["tokensPerPct"]
                f.setdefault("window_pct", {})[name] = p
                if f.get("measured_weighted") is not None:
                    f.setdefault("measured_window_pct", {})[name] = f["measured_weighted"] / win["tokensPerPct"]
                rows.append({"model": f["model"], "window": name, "trigger": f["trigger"], "pct": p,
                             "pct_per_100k": p / (f["pre_tokens"] / 100_000), "pre_tokens": f["pre_tokens"]})
        if not measured_any:
            skipped["account's window cost per percent not measured"] += len(mine)
    table, rules = [], {}
    p95_ctx = pct([f["pre_tokens"] for f in found], 0.95)
    for (model, window) in sorted({(r["model"], r["window"]) for r in rows}, key=str):
        sel = [r for r in rows if r["model"] == model and r["window"] == window]
        med = statistics.median(r["pct_per_100k"] for r in sel)
        cost_p95 = med * (p95_ctx or 0) / 100_000
        rule = 100 - 3 * cost_p95
        rules.setdefault(window, []).append(rule)
        table.append({"model": model, "window": window, "n": len(sel),
                      "n_manual": sum(1 for r in sel if r["trigger"] == "manual"),
                      "n_auto": sum(1 for r in sel if r["trigger"] == "auto"), "median_pct_per_100k": med,
                      "p95_context": p95_ctx, "pct_at_p95": cost_p95, "compactAtPct": rule})
    default = min((min(v) for v in rules.values()), default=None)
    calib = [f for f in found if f["measured"]]
    res = {"boundaries": len(found), "manual": sum(1 for f in found if f["trigger"] == "manual"),
           "auto": sum(1 for f in found if f["trigger"] == "auto"), "skipped": dict(skipped), "table": table,
           "boundary_rows": [{k: f.get(k) for k in ("model", "trigger", "pre_tokens", "summary_tokens", "post_prompt",
                                                  "post_write", "at")} for f in found],
           "calibration": [{k: f.get(k) for k in ("model", "pre_tokens", "summary_chars", "summary_tokens", "measured",
                                                   "measured_usd", "formula_usd", "measured_weighted", "formula_weighted",
                                                   "measured_window_pct", "window_pct")} for f in calib],
           "compactAtPct_default": default, "token_count": "core continuation.ts estimateTokens (chars / 4 × 1.15)"}
    common.save(os.path.splitext(a.out)[0] + ".json", res)
    lines = ["# E5: the window cost of a warm native compaction", "",
             f"Boundaries priced: {len(found)} ({res['manual']} manual, {res['auto']} auto). Left out: " +
             (", ".join(f"{k} {v}" for k, v in skipped.items()) or "none") + ".",
             "Formula: a cache read of preTokens plus the summary record's tokens (the product's estimateTokens), priced with "
             "costForUsage at the boundary's time; window % = weightedTokens / tokensPerPercent.", "",
             "Calibration against the manual compactions whose turn_usage row was measured:", "",
             "| model | preTokens | summary tokens (est.) | measured: read / write / input / output | measured $ | formula $ | "
             "formula ÷ measured | measured window % | formula window % |", "|---|---|---|---|---|---|---|---|---|"]
    for f in calib:
        m = f["measured"]
        ratio = f["formula_usd"] / f["measured_usd"] if f.get("measured_usd") else None
        mw = ", ".join(f"{k} {v:.3f}" for k, v in (f.get("measured_window_pct") or {}).items()) or "–"
        fw = ", ".join(f"{k} {v:.3f}" for k, v in (f.get("window_pct") or {}).items()) or "–"
        lines.append(f"| {f['model']} | {f['pre_tokens']:,} | {f['summary_tokens']:,} | {m['cacheRead']:,} / {m['cacheCreation']:,} / "
                     f"{m['input']:,} / {m['output']:,} | {f['measured_usd']:.4f} | {f['formula_usd']:.4f} | "
                     f"{'%.2f' % ratio if ratio else '–'} | {mw} | {fw} |")
    if not calib:
        lines.append("| – | – | – | – | – | – | – | – | – |")
    lines += ["", "Over all boundaries (formula):", "",
              "| model | window | n (manual / auto) | median window % per 100k context | 95th-pct context | window % at it | compactAtPct = 100 − 3× |",
              "|---|---|---|---|---|---|---|"]
    lines += [f"| {t['model']} | {t['window']} | {t['n']} ({t['n_manual']} / {t['n_auto']}) | {t['median_pct_per_100k']:.3f} | "
              f"{t['p95_context']:,} | {t['pct_at_p95']:.2f} | {t['compactAtPct']:.1f} |" for t in table] or \
        ["| – | – | 0 | – | – | – | – |"]
    lines += ["", f"compactAtPct default (the lowest across windows): {'%.1f' % default if default is not None else 'not measured'}"]
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, "w") as fh:
        fh.write("\n".join(lines) + "\n")
    print(f"e5: {len(found)} boundaries ({res['manual']} manual, {res['auto']} auto), {len(calib)} calibrated; "
          f"compactAtPct {default}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
