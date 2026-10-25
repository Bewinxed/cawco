"""The cost of making a session's context small, by arithmetic alone → out/arith.md, out/arith.json. No model call.

Three ways to carry a session across a move (or a limit), in three situations, per context band:
  whole    the transcript as it is: the next request reads the context P from cache (warm) or writes it (cold);
  native   `/compact` on the session's own model, then the compacted prompt S_n is written as the next prefix;
  sonnet   a Sonnet 5.5 summary (CawCo's extract), then the opening turn on the target, then S_s carried.
Situations: warm same-org (the session's cache is readable where it runs next); cold or cross-org (it is not); limit
gone early (nothing more runs on the account that ran out, so a compaction can only happen on the target, cold: the
same arithmetic as cold, its own column so the table reads per situation).

Every request is priced on its own with the product's `costForUsage` (harness/cockpit.ts `price`) at the cut's time.
Per drawn cut (out/cuts.json; for a chained pair, its first cut):
  P      the prompt of the session's last request before the cut (cuts.py pre_tokens);
  n1     the next message's tokens (the product's estimateTokens of its characters); o1 the real first reply's output;
  H(S)   the real session's requests for its next K = 20 turns (fewer where it has fewer), turn 1's first request
         excepted, each with its cache read moved by (S − P1), P1 being the prompt of the real turn 1's first request:
         growth and outputs are the real ones (cost.py's horizon, B5);
  whole  warm: turn 1's first request reads P, writes n1. cold: writes P + n1. H(P).
  native make = one request: reads P (warm) or writes P at the 5-minute rate (cold; measured on the first smoke: the
         compaction request writes the 5-minute cache), plus I_c input and O_c output, the medians of the measured
         manual compactions (e5.json calibration, Opus). Turn 1's first request writes S_n + n1. H(S_n). S_n is the
         band's median prompt of the first request after a real compaction boundary (e5.json boundary_rows).
  sonnet make = Sonnet: input r_s × P (r_s, the median ratio of the summariser's input tokens to P over the finished
         A2 runs), output O_s (their median); plus the opening turn on the target, priced from its measured requests
         (median over the finished A2 runs). Turn 1's first request reads S_s and writes n1. H(S_s). S_s is the median
         prompt of the turn after the opening in those runs.
Turn-1 writes are at the 1-hour rate, as Claude Code's main thread writes (its first request after a resume carried
`ephemeral_1h_input_tokens` equal to its whole write in every finished A0 run).

Usage: python3 -I arith.py --out out --cockpit-root <cockpit>
"""
import argparse
import collections
import os
import statistics
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
import cost  # noqa: E402

K = 20
METHODS = ("whole", "native", "sonnet")
SITUATIONS = ("warm same-org", "cold or cross-org", "limit gone early")


def med(v):
    v = [x for x in v if x is not None]
    return statistics.median(v) if v else None


def req(model, at, input=0, write5=0, write1h=0, read=0, output=0):
    return {"model": model, "at": at, "input": input, "cacheCreation": write5 + write1h, "cacheWrite1h": write1h,
            "cacheRead": read, "output": output}


def params(out):
    """The measured inputs: compaction call (e5 calibration), S_n per band (e5 boundaries), the Sonnet summary and the
    opening turn (finished A2 runs, make1 only)."""
    e5 = common.load(os.path.join(out, "e5.json"), {})
    cal = [c["measured"] for c in e5.get("calibration", []) if c.get("measured") and "opus" in (c.get("model") or "")]
    p = {"I_c": med(c["input"] for c in cal), "O_c": med(c["output"] for c in cal), "n_cal": len(cal), "S_n": {}}
    for band, lo, hi in common.BANDS:
        post = [b["post_prompt"] for b in e5.get("boundary_rows", []) if b.get("post_prompt") and lo <= b["pre_tokens"] < hi]
        p["S_n"][band] = med(post)
        p.setdefault("n_post", {})[band] = len(post)
    cuts = {c["id"]: c for c in common.load(os.path.join(out, "cuts.json"))["cuts"]}
    ratios, outs, openings, opening_reqs, s_s, a0_1h = [], [], [], [], [], []
    for cid, c in cuts.items():
        for run in range(1, 4):
            r = common.load(os.path.join(out, "runs", cid, "A2", str(run), "result.json")) or {}
            if r.get("status") == "done":
                st = {s["name"]: s for s in r["steps"]}
                summ = st.get("make1-summarize")
                if summ and summ["requests"]:
                    ratios.append(sum(q["input"] + q["cacheRead"] + q["cacheCreation"] for q in summ["requests"]) / c["pre_tokens"])
                    outs.append(sum(q["output"] for q in summ["requests"]))
                op = st.get("make1-opening")
                if op and op["requests"]:
                    openings.append(op["requests"])
                nxt = st.get("turn1") if not c.get("chained") else None
                if nxt and nxt["requests"]:
                    s_s.append(common.prompt_tokens(nxt["requests"][0]))
            a0 = common.load(os.path.join(out, "runs", cid, "A0", str(run), "result.json")) or {}
            if a0.get("status") == "done":
                t1 = next(s for s in a0["steps"] if s["name"] == "turn1")["requests"]
                if t1 and t1[0]["cacheCreation"]:
                    a0_1h.append(t1[0]["cacheWrite1h"] / t1[0]["cacheCreation"])
    p.update(r_s=med(ratios), O_s=med(outs), n_sonnet=len(ratios), S_s=med(s_s), n_open=len(openings),
             a0_1h_share=med(a0_1h), n_a0=len(a0_1h))
    return p, cuts, openings


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--cockpit-root", required=True)
    a = ap.parse_args(argv)
    out = os.path.abspath(a.out)
    p, cuts, openings = params(out)
    if None in (p["I_c"], p["O_c"], p["r_s"], p["O_s"], p["S_s"]) or not openings:
        raise SystemExit(f"arith: a measured input is missing: {p}")
    # the opening turn, priced once per measured run; its median stands for every cut
    flat, index = [], []

    def add(reqs):
        index.append((len(flat), len(reqs)))
        flat.extend(reqs)
        return len(index) - 1
    open_ix = [add(o) for o in openings]
    texts = [c["next_text"] for c in cuts.values()]
    n1s = common.cockpit("tokens", a.cockpit_root, {"chars": [len(t) for t in texts]})["tokens"]
    rows = []
    for (cid, c), n1 in zip(cuts.items(), n1s):
        real = common.read_jsonl(c["real"]["jsonl"])
        turns = cost.horizon_turns(real, c["real"]["index"], c["real"]["horizon_end"])[:K]
        if not turns or not turns[0]:
            continue
        P, band, at = c["pre_tokens"], c["band"], common.ts_ms(c["cut_at"])
        M = c["model"]
        r1 = turns[0][0]
        P1, o1 = common.prompt_tokens(r1), r1["output"]
        rest = turns[0][1:] + [q for t in turns[1:] for q in t]
        S = {"whole": P, "native": p["S_n"][band], "sonnet": p["S_s"]}

        def horizon(s):
            return [dict(q, cacheRead=max(0, q["cacheRead"] + s - P1)) for q in rest]
        ix = {}
        for sit in SITUATIONS:
            warm = sit == "warm same-org"
            ix[(sit, "whole")] = {
                "make": add([]),
                "t1": add([req(M, at, read=P, write1h=n1, output=o1) if warm else req(M, at, write1h=P + n1, output=o1)]),
                "h": add(horizon(S["whole"]))}
            ix[(sit, "native")] = {
                "make": add([req(M, at, read=P, input=p["I_c"], output=p["O_c"]) if warm
                             else req(M, at, write5=P, input=p["I_c"], output=p["O_c"])]),
                "t1": add([req(M, at, write1h=S["native"] + n1, output=o1)]),
                "h": add(horizon(S["native"]))}
            ix[(sit, "sonnet")] = {
                "make": add([req(common.SONNET, at, input=round(p["r_s"] * P), output=p["O_s"])]),
                "t1": add([req(M, at, read=S["sonnet"], write1h=n1, output=o1)]),
                "h": add(horizon(S["sonnet"]))}
        rows.append({"cut": cid, "band": band, "P": P, "turns": len(turns), "ix": ix})
    usd = cost.price_all(flat, a.cockpit_root)

    def total(i):
        s, n = index[i]
        return sum(usd[s:s + n])
    opening_usd = med(total(i) for i in open_ix)
    table = {}
    for r in rows:
        for (sit, m), ix in r["ix"].items():
            make = total(ix["make"]) + (opening_usd if m == "sonnet" else 0)
            parts = {"make": make, "turn1": total(ix["t1"]), "horizon": total(ix["h"])}
            parts["total"] = sum(parts.values())
            table.setdefault((sit, r["band"], m), []).append(dict(parts, cut=r["cut"], P=r["P"], turns=r["turns"]))
    res = {"params": {k: v for k, v in p.items()}, "opening_usd_median": opening_usd, "K": K,
           "cells": [{"situation": s, "band": b, "method": m, "cuts": len(v),
                      **{k: med(x[k] for x in v) for k in ("P", "make", "turn1", "horizon", "total")},
                      "per_cut": v} for (s, b, m), v in sorted(table.items())]}
    common.save(os.path.join(out, "arith.json"), res)
    bands = [b for b, _, _ in common.BANDS]
    L = ["# The cost of making the context small, by arithmetic (no model call)", "",
         f"Per drawn cut, priced request by request with the product's `costForUsage`; the median over the cuts of each "
         f"band. Total = make + turn 1's first request + the next {K} real turns (fewer where the session had fewer). "
         "Session model as drawn (" + ", ".join(f"{m}: {n} cuts" for m, n in sorted(collections.Counter(
             c["model"] for c in cuts.values()).items())) + "). USD.", "",
         "Measured inputs:", "",
         f"- native `/compact`: input {p['I_c']:,} and output {p['O_c']:,} tokens (medians of {p['n_cal']} measured manual "
         f"compactions on Opus); carried after it S_n = " + ", ".join(
             f"{b} {p['S_n'][b]:,.0f} (n={p['n_post'][b]})" for b in bands if p["S_n"][b]) + " tokens (first request after "
         "a real boundary);",
         f"- Sonnet summary: input = {p['r_s']:.3f} × P, output {p['O_s']:,.0f} tokens ({p['n_sonnet']} finished A2 "
         f"summaries); the opening turn ${opening_usd:.4f} ({p['n_open']} measured); carried after it S_s = {p['S_s']:,.0f} "
         "tokens;",
         f"- turn-1 writes at the 1-hour rate: in the finished A0 runs the 1-hour share of the first request's write was "
         f"{p['a0_1h_share']:.2f} (n={p['n_a0']}).", "",
         "| situation | band | cuts | P (median) | whole | native /compact | Sonnet summary | cheapest |",
         "|---|---|---|---|---|---|---|---|"]
    cell = {(c["situation"], c["band"], c["method"]): c for c in res["cells"]}
    for sit in SITUATIONS:
        for b in bands:
            got = {m: cell.get((sit, b, m)) for m in METHODS}
            if not any(got.values()):
                continue
            tot = {m: g["total"] for m, g in got.items() if g}
            best = min(tot, key=tot.get)
            n = max(g["cuts"] for g in got.values() if g)
            L.append(f"| {sit} | {b} | {n} | {got['whole']['P']:,.0f} | " + " | ".join(
                f"${got[m]['total']:.2f} (make {got[m]['make']:.2f}, t1 {got[m]['turn1']:.2f}, next {got[m]['horizon']:.2f})"
                if got[m] else "–" for m in METHODS) + f" | {best} |")
    L += ["", "Per cut (situation · method → total): see out/arith.json."]
    with open(os.path.join(out, "arith.md"), "w") as fh:
        fh.write("\n".join(L) + "\n")
    print("\n".join(L), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
