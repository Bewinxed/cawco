"""out/report.md (design B7): the decision table, then every table it rests on.

Statistics (B6): per arm, the median over runs, then over cut points; a 95 % bootstrap CI over cut points (10,000
resamples, seeded) of each difference. A direction is acted on only when the CI of the difference excludes zero, the
median difference is at least the noise floor, and both judges agree on its sign; otherwise the cell says what failed.
Decision rule per situation × band: the cheapest arm whose quality is not below the best arm's by more than the noise
floor. Quality is the primary judge's (Opus 5.5) absolute score, mean of its four dimensions, 0-5; cost is the cold
total at K (the real session's own horizon).

Usage: python -I compaction-bench/report.py --out out
"""
import argparse
import collections
import os
import random
import re
import statistics
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402

NOUS_FLOOR = 0.3
DIMS = ("decision_fidelity", "artifact_fidelity", "continuation_fidelity", "no_repetition")
SUMMARY_ARMS = ["A2", "A3", "A4", "A5", "A7d", "A7g"]
NAMES = {"A0": "whole (control)", "A1": "native /compact", "A2": "summarize · Sonnet · extract · CawCo",
         "A3": "summarize · Haiku · extract · CawCo", "A4": "summarize · Sonnet · full-clipped · CawCo",
         "A5": "summarize · Sonnet · full-clipped · Claude Code shape", "A6": "Factory anchored merge (chained)",
         "A7d": "summarize · OpenCode deepseek-v4-pro · full-clipped · CawCo",
         "A7g": "summarize · pi openai-codex · full-clipped · CawCo"}


def med(v):
    v = [x for x in v if x is not None]
    return statistics.median(v) if v else None


def fmt(x, nd=2, pre=""):
    return "–" if x is None else f"{pre}{x:,.{nd}f}"


def boot_ci(diffs, n=10_000, seed=7):
    if len(diffs) < 2:
        return None
    rng = random.Random(seed)
    means = sorted(statistics.fmean(rng.choice(diffs) for _ in diffs) for _ in range(n))
    return means[int(0.025 * n)], means[int(0.975 * n) - 1]


class Data:
    def __init__(self, out, cuts_path):
        self.out = out
        self.cuts = {c["id"]: c for c in common.load(cuts_path or os.path.join(out, "cuts.json"))["cuts"]}
        self.results, self.q, self.engine, self.pair, self.probe, self.rules = {}, {}, {}, {}, {}, {}
        for cid in self.cuts:
            root = os.path.join(out, "runs", cid)
            for arm in os.listdir(root) if os.path.isdir(root) else []:
                for run in os.listdir(os.path.join(root, arm)):
                    r = common.load(os.path.join(root, arm, run, "result.json"))
                    if r:
                        self.results[(cid, arm, int(run))] = r
                    jd = os.path.join(out, "judge", cid, arm, run)
                    for j in ("opus", "sonnet"):
                        a = common.load(os.path.join(jd, f"abs-{j}.json"))
                        if a:
                            self.q[(cid, arm, int(run), j)] = statistics.fmean(a[d] for d in DIMS)
                        ps = [common.load(os.path.join(jd, f"pair-{j}-{o}.json")) for o in ("arm-first", "control-first")]
                        if all(ps):
                            out_ = {p["outcome"] for p in ps}
                            self.pair[(cid, arm, int(run), j)] = {
                                "outcome": out_.pop() if len(out_) == 1 else "tie",
                                "asked_back": sum(p["asked_back_arm"] for p in ps) / 2}
                        rl = common.load(os.path.join(jd, f"rules-{j}.json"))
                        if rl:
                            self.rules[(cid, arm, int(run), j)] = (rl["rule1"], rl["rule2"])
                    e = common.load(os.path.join(jd, "engine.json"))
                    if e:
                        self.engine[(cid, arm, int(run))] = e
            pd = os.path.join(out, "judge", cid, "probes")
            for f in os.listdir(pd) if os.path.isdir(pd) else []:
                fid, j = f[:-5].rsplit("-", 1)
                for arm, s in (common.load(os.path.join(pd, f)) or {}).items():
                    self.probe.setdefault((cid, arm, j), []).append(s)
        self.cost = {(c["cut"], c["arm"], c["run"]): c for c in common.load(os.path.join(out, "cost", "summary.json"), [])}
        # B6: a cut leaves an arm's CI only when fewer than 2 of its runs finished there; 1 when every arm ran once
        self.min_runs = 2 if max((k[2] for k in self.results), default=1) > 1 else 1
        self.e5 = common.load(os.path.join(out, "e5.json"), {})

    def per_cut(self, arm, value, cuts=None):
        """{cut: median over runs of value(cut, arm, run)} for cuts with at least one value."""
        got = collections.defaultdict(list)
        for (cid, a, run) in self.results:
            if a == arm and (cuts is None or cid in cuts):
                v = value(cid, arm, run)
                if v is not None:
                    got[cid].append(v)
        return {c: statistics.median(v) for c, v in got.items() if len(v) >= self.min_runs}

    def quality(self, arm, judge="opus", cuts=None):
        return self.per_cut(arm, lambda c, a, r: self.q.get((c, a, r, judge)), cuts)

    def cost_total(self, arm, regime="cold", K="K", cuts=None):
        return self.per_cut(arm, lambda c, a, r: (self.cost.get((c, a, r)) or {}).get(regime, {}).get(f"total_{K}"), cuts)


def compare(d, a, b, floor, cuts=None):
    """a − b on quality (both judges) and cold cost at K, over the cuts both have."""
    out = {}
    for j in ("opus", "sonnet"):
        qa, qb = d.quality(a, j, cuts), d.quality(b, j, cuts)
        diffs = [qa[c] - qb[c] for c in qa if c in qb]
        out[j] = {"n": len(diffs), "median": med(diffs), "ci": boot_ci(diffs)}
    ca, cb = d.cost_total(a, cuts=cuts), d.cost_total(b, cuts=cuts)
    cd = [ca[c] - cb[c] for c in ca if c in cb]
    out["cost"] = {"n": len(cd), "median": med(cd), "ci": boot_ci(cd)}
    o, s = out["opus"], out["sonnet"]
    reasons = []
    if not o["ci"]:
        reasons.append("fewer than 2 shared cuts")
    elif o["ci"][0] <= 0 <= o["ci"][1]:
        reasons.append("quality CI spans 0")
    if o["median"] is not None and abs(o["median"]) < floor:
        reasons.append(f"|Δ| {abs(o['median']):.2f} < floor {floor:.2f}")
    if o["median"] is None or s["median"] is None or (o["median"] > 0) != (s["median"] > 0):
        reasons.append("judges disagree on direction")
    out["actionable"], out["why_not"] = not reasons, reasons
    return out


def rules_txt(d, arm, judge):
    """'rule 1 / rule 2' medians over runs, then cuts; '–' for an arm with no summary (A0)."""
    out = []
    for k in (0, 1):
        per = d.per_cut(arm, lambda c, a, r, k=k: (d.rules.get((c, a, r, judge)) or (None, None))[k])
        out.append(med(per.values()))
    return "–" if out[0] is None else f"{fmt(out[0], 1)} / {fmt(out[1], 1)}"


def ci_txt(ci, nd=2):
    return "–" if not ci else f"[{ci[0]:+.{nd}f}, {ci[1]:+.{nd}f}]"


def choose(d, arms_, floor, cuts):
    """The cheapest arm whose quality is within the floor of the best's, among arms with both readings."""
    cand = []
    for a in arms_:
        q, c = med(d.quality(a, cuts=cuts).values()), med(d.cost_total(a, cuts=cuts).values())
        if q is not None and c is not None:
            cand.append((a, q, c))
    if not cand:
        return None, "no arm has both a quality and a cost reading here", cand
    best = max(q for _, q, _ in cand)
    ok = sorted((c, a) for a, q, c in cand if best - q <= floor)
    return ok[0][1], f"best quality {best:.2f}; within the floor: {', '.join(a for _, a in ok)}", cand


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--cuts")
    ap.add_argument("--eval-report", default=os.path.join(common.EVAL_DIR, "out", "report.md"))
    ap.add_argument("--paper", help="PAPER.md whose Results section (between the results markers) is rewritten from out/")
    a = ap.parse_args(argv)
    out = os.path.abspath(a.out)
    d = Data(out, a.cuts)
    arms_present = sorted({k[1] for k in d.results}, key=lambda x: common.ALL_ARMS.index(x))
    single = {c for c, v in d.cuts.items() if not v.get("chained")}
    chained = {c for c, v in d.cuts.items() if v.get("chained")}
    bands = {b: {c for c in single if d.cuts[c]["band"] == b} for b, _, _ in common.BANDS}

    # ---- noise floor
    floor_cuts = [c for c, v in d.cuts.items() if v.get("floor")]
    spreads, floor_pairs = [], []
    for c in floor_cuts:
        base = d.q.get((c, "A0", 1, "opus"))
        for run in range(2, 6):
            v = d.q.get((c, "A0", run, "opus"))
            if base is not None and v is not None:
                spreads.append(abs(v - base))
            for j in ("opus", "sonnet"):
                ps = [common.load(os.path.join(out, "judge", c, "floor", str(run), f"pair-{j}-{o}.json"))
                      for o in ("arm-first", "control-first")]
                if all(ps):
                    floor_pairs.append((c, run, j, {p["outcome"] for p in ps}))
    p95 = sorted(spreads)[int(0.95 * (len(spreads) - 1))] if spreads else None
    floor = max(NOUS_FLOOR, p95 or 0)

    L = [f"# Compaction benchmark{' (DRY RUN: every model reply simulated)' if any(r.get('dry') for r in d.results.values()) else ''}", "",
         f"Written {common.now_iso()}. Cuts: {len(d.cuts)} ({len(chained)} chained). Runs: "
         f"{sum(1 for r in d.results.values() if r['status'] == 'done')} done, "
         f"{sum(1 for r in d.results.values() if r['status'] == 'stopped')} stopped. Noise floor: {floor:.2f} "
         f"(the larger of Nous's {NOUS_FLOOR} and the 95th percentile of A0-vs-A0 spread, {fmt(p95)}).", ""]
    S = {}  # section name → where it starts in L (PAPER.md's Results take the aggregate ones)

    # ---- 0. the cuts
    S["cuts"] = len(L)
    drawn = common.load(a.cuts or os.path.join(out, "cuts.json"))
    cnt = drawn.get("counts") or {}
    L += ["## 0. Cut points", "", f"Seed {drawn.get('seed')}; eligible {cnt.get('eligible', '–')} "
          f"(+{cnt.get('chained_pairs', '–')} chained pairs); drawn {len(d.cuts)}."
          + (f" Shortfall: {'; '.join(drawn['shortfall'])}." if drawn.get("shortfall") else ""), "",
          "| stratum | value | in the pool | drawn |", "|---|---|---|---|"]
    pool, got = cnt.get("pool") or {}, cnt.get("drawn") or {}
    for key, label in (("by_band", "band"), ("by_kind", "kind"), ("by_next_kind", "next message"), ("by_role", "role")):
        for v in sorted(set(pool.get(key, {})) | set(got.get(key, {})), key=str):
            L.append(f"| {label} | {v} | {pool.get(key, {}).get(v, 0)} | {got.get(key, {}).get(v, 0)} |")
    for v in ("cross_org", "same_org"):
        L.append(f"| move | {v.replace('_', '-')} | {(pool.get('moves') or {}).get(v, 0)} | {(got.get('moves') or {}).get(v, 0)} |")
    reasons = collections.Counter((x["kind"], x["why"]) for x in drawn.get("excluded", []))
    L += ["", f"Excluded {sum(reasons.values())}:", "", "| kind | reason | n |", "|---|---|---|"]
    L += [f"| {k} | {w} | {n} |" for (k, w), n in reasons.most_common()] or ["| – | – | 0 |"]
    L.append("")

    # ---- 1. decision table
    S["decision"] = len(L)
    e5_default = d.e5.get("compactAtPct_default")
    L += ["## 1. Decision table", "", "| situation | band | default | setting |", "|---|---|---|---|",
          f"| warm, same org | all | native at turn end | `compactAtPct` = {fmt(e5_default, 1) if e5_default is not None else 'not measured (E5)'} |"]
    e6 = []
    summ_best, _, _ = choose(d, [x for x in SUMMARY_ARMS if x in arms_present], floor, single)
    for b, cs in bands.items():
        ref = summ_best or "A2"
        s, w = d.cost_total(ref, cuts=cs), d.cost_total("A0", cuts=cs)
        diffs = sorted((d.cuts[c]["pre_tokens"], s[c] - w[c]) for c in s if c in w)
        e6.append((b, ref, diffs))
    cross = sorted((p, x) for _, _, diffs in e6 for p, x in diffs)
    if not cross:
        be = "not measured (E6)"
    elif all(x < 0 for _, x in cross):
        be = f"below {cross[0][0] // 1000}k: summarize was cheaper than whole at every measured cut (E6)"
    elif all(x >= 0 for _, x in cross):
        be = f"above {cross[-1][0] // 1000}k: whole was cheaper at every measured cut (E6)"
    else:
        k = next(i for i, (_, x) in enumerate(cross) if x < 0 and all(y < 0 for _, y in cross[i:])) if cross[-1][1] < 0 else None
        be = (f"{cross[k - 1][0] // 1000}k-{cross[k][0] // 1000}k: whole cheaper below, summarize above (E6)" if k
              else "no single crossing: the sign changes more than once across cuts (E6)")
    L.append(f"| cold / cross-org / no cache | < floor | move whole | `moveWholeUnderK` = {be} |")
    for b, cs in bands.items():
        pick, why, _ = choose(d, [x for x in ["A0", "A1"] + SUMMARY_ARMS if x in arms_present], floor, cs)
        act = compare(d, pick, "A2", floor, cs) if pick and pick != "A2" and pick in arms_present and "A2" in arms_present else None
        note = "" if not act else (" (actionable)" if act["actionable"] else f" (not actionable: {'; '.join(act['why_not'])})")
        overfloor = {"A0": "whole", "A1": "compact"}.get(pick, "summarize") if pick else "undecided"
        L.append(f"| cold / cross-org / no cache | {b} | {('E1: ' + pick + ' ' + NAMES.get(pick, '')) if pick else 'undecided: ' + why}{note} | `overFloor` = {overfloor} |")
        L.append(f"| limit gone early | {b} | {('E1: ' + pick) if pick else 'undecided'} (ahead-of-limit unavailable) | `overFloor` = {overfloor} |")
    for label, x, y in (("E2 model", "A3", "A2"), ("E3 input", "A4", "A2"), ("E4 shape", "A5", "A4"),
                        ("A7d vs A4", "A7d", "A4"), ("A7g vs A4", "A7g", "A4")):
        if x in arms_present and y in arms_present:
            c = compare(d, x, y, floor, single)
            L.append(f"| (E1 = summarize) | {label} | {x} − {y}: quality {fmt(c['opus']['median'], 2, '+') if c['opus']['median'] is not None else '–'} "
                     f"{ci_txt(c['opus']['ci'])}, cost {fmt(c['cost']['median'], 4, '+$') if c['cost']['median'] is not None else '–'} "
                     f"{ci_txt(c['cost']['ci'], 4)}; {'actionable' if c['actionable'] else 'not actionable: ' + '; '.join(c['why_not'])} | "
                     f"`summarizer.model`; the extract and prompt in `continuation.ts` |")
    e7, why7, _ = choose(d, [x for x in ("A1", "A2", "A6") if x in arms_present], floor, chained)
    L.append(f"| chained | — | {('E7: ' + e7 + ' ' + NAMES.get(e7, '')) if e7 else 'undecided: ' + why7} | whether the summarizer merges the prior summary (Factory) or restates it |")

    # ---- 1b. the move question: compact on the warm account first, or move whole
    S["move"] = len(L)
    L += ["", "## 1b. Before a move to another organization: compact on the warm account first (A1 warm), or move whole (A0 cold)",
          "", "A1 warm: `/compact` priced with its read of the context from the warm cache (the session's own account), then "
          "the continued turn and the horizon on the target, cold (another organization shares no cache). A0 cold: the "
          "whole context written to the target's cache by the continued turn's first request, then the horizon. "
          "Paired per cut; difference A1 warm − A0 cold; 95 % bootstrap CI over cuts.", "",
          "| band | cuts | A0 cold total K | A1 warm total K | median Δ (A1w − A0c) | CI | A1 cheaper at | quality Δ A1 − A0 Opus | quality Δ A1 − A0 Sonnet | A1 vs A0 pairwise Opus w/t/l |",
          "|---|---|---|---|---|---|---|---|---|---|"]
    for b in [x for x, _, _ in common.BANDS] + ["all"]:
        cs = single if b == "all" else bands[b]
        w, c0 = d.cost_total("A1", "warm", cuts=cs), d.cost_total("A0", "cold", cuts=cs)
        both = sorted(c for c in w if c in c0)
        diffs = [w[c] - c0[c] for c in both]
        qd = {j: [d.quality("A1", j, cs)[c] - d.quality("A0", j, cs)[c] for c in d.quality("A1", j, cs)
                  if c in d.quality("A0", j, cs)] for j in ("opus", "sonnet")}
        cnt = collections.Counter(v["outcome"] for k, v in d.pair.items() if k[1] == "A1" and k[3] == "opus" and k[0] in cs)
        L.append(f"| {b} | {len(both)} | {fmt(med(c0[c] for c in both), 4, '$')} | {fmt(med(w[c] for c in both), 4, '$')} | "
                 f"{fmt(med(diffs), 4, '$') if diffs else '–'} | {ci_txt(boot_ci(diffs), 4)} | "
                 f"{sum(1 for x in diffs if x < 0)} of {len(diffs)} | {fmt(med(qd['opus']), 2)} {ci_txt(boot_ci(qd['opus']))} | "
                 f"{fmt(med(qd['sonnet']), 2)} {ci_txt(boot_ci(qd['sonnet']))} | {cnt['win']}/{cnt['tie']}/{cnt['loss']} |")
    per = sorted((d.cuts[c]["pre_tokens"], c, d.cost_total("A1", "warm", cuts={c}).get(c), d.cost_total("A0", "cold", cuts={c}).get(c))
                 for c in single)
    L += ["", "Per cut (context at the cut → A1 warm, A0 cold, Δ): " + (", ".join(
        f"{c} {p // 1000}k → ${a1:.2f}, ${a0:.2f}, {a1 - a0:+.2f}" for p, c, a1, a0 in per if a1 is not None and a0 is not None) or "–")]

    # ---- 2. per-arm quality
    S["quality"] = len(L)
    L += ["", "## 2. Quality per arm (median over runs, then over cuts)", "",
          "| arm | what | cuts | abs 0-5 Opus | abs 0-5 Sonnet | win/tie/loss vs A0 Opus | win/tie/loss vs A0 Sonnet | asked back | files J | commands J | re-fetches | anchor keys carried | probe score Opus | probe score Sonnet | summary rules 1 / 2 Opus | summary rules 1 / 2 Sonnet |",
          "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for arm in arms_present:
        cuts_ = {k[0] for k in d.results if k[1] == arm}
        wtl = {}
        for j in ("opus", "sonnet"):
            cnt = collections.Counter(v["outcome"] for k, v in d.pair.items() if k[1] == arm and k[3] == j)
            wtl[j] = f"{cnt['win']}/{cnt['tie']}/{cnt['loss']}"
        eng = [v for k, v in d.engine.items() if k[1] == arm]
        asked = [v["asked_back"] for k, v in d.pair.items() if k[1] == arm and k[3] == "opus"]
        probes = {j: [s for (c, a2, jj), v in d.probe.items() if a2 == arm and jj == j for s in v] for j in ("opus", "sonnet")}
        L.append(f"| {arm} | {NAMES.get(arm, '')} | {len(cuts_)} | {fmt(med(d.quality(arm).values()))} | "
                 f"{fmt(med(d.quality(arm, 'sonnet').values()))} | {wtl['opus'] if arm != 'A0' else '—'} | "
                 f"{wtl['sonnet'] if arm != 'A0' else '—'} | {fmt(med(asked), 1)} | {fmt(med(e['files_jaccard'] for e in eng))} | "
                 f"{fmt(med(e['commands_jaccard'] for e in eng))} | {fmt(med(e['refetch'] for e in eng), 1)} | "
                 f"{fmt(med(len(e['keys_present']) / max(1, e['keys_total']) for e in eng))} | "
                 f"{fmt(statistics.fmean(probes['opus']) if probes['opus'] else None)} | "
                 f"{fmt(statistics.fmean(probes['sonnet']) if probes['sonnet'] else None)} | "
                 + " | ".join(rules_txt(d, arm, j) for j in ("opus", "sonnet")) + " |")
    if not arms_present:
        L.append("| – | – | 0 | – | – | – | – | – | – | – | – | – | – | – | – | – |")
    L += ["", "Summary rules: the owner's rules for a compaction summary (2026-10-21), 0-5 each, on the summary the arm "
          "carried (A1: Claude Code's; A2-A7: the summariser's): 1, the person's messages carried as meaning, never quoted; "
          "2, only what the next turns need. Median over runs, then over cuts. Secondary: it enters no decision."]

    # ---- 2b. strata: what the next message was, the cut's kind, same or cross org
    S["strata"] = len(L)
    L += ["", "## 2b. Quality and cost by stratum (Opus absolute 0-5; cold total at K)", "",
          "| arm | stratum | value | cuts | abs 0-5 Opus | total K (USD) |", "|---|---|---|---|---|---|"]
    strata = (("next message", lambda c: c.get("next_kind") or "person"), ("kind", lambda c: c["kind"]),
              ("move", lambda c: None if c.get("cross_org") is None else ("cross-org" if c["cross_org"] else "same-org")))
    nstrata = 0
    for arm in arms_present:
        for label, f in strata:
            for v in sorted({f(c) for c in d.cuts.values() if f(c) is not None}, key=str):
                cs_ = {cid for cid, c in d.cuts.items() if f(c) == v}
                q, c_ = d.quality(arm, cuts=cs_), d.cost_total(arm, cuts=cs_)
                if q or c_:
                    L.append(f"| {arm} | {label} | {v} | {len(set(q) | set(c_))} | {fmt(med(q.values()))} | {fmt(med(c_.values()), 4)} |")
                    nstrata += 1
    if not nstrata:
        L.append("| – | – | – | 0 | – | – |")

    # ---- 3. costs
    S["cost"] = len(L)
    L += ["", "## 3. Cost per arm, per regime and band (USD; median over runs, then over cuts; product prices, each request on its own)", "",
          "| arm | band | regime | C_make | C_between | C_turn1 | C_horizon(K) | total K | total K=20 | total K=50 | CI total K vs A0 |",
          "|---|---|---|---|---|---|---|---|---|---|---|"]
    rows3 = 0
    for arm in arms_present:
        for b in [x for x, _, _ in common.BANDS] + ["chained"]:
            cs = chained if b == "chained" else bands[b]
            for regime in ("cold", "warm"):
                recs = [v for k, v in d.cost.items() if k[1] == arm and k[0] in cs]
                if not recs:
                    continue
                part = lambda name: med(r[regime].get(name) for r in recs)  # noqa: E731
                ca, c0 = d.cost_total(arm, regime, cuts=cs), d.cost_total("A0", regime, cuts=cs)
                ci = boot_ci([ca[c] - c0[c] for c in ca if c in c0]) if arm != "A0" else None
                L.append(f"| {arm} | {b} | {regime} | {fmt(part('make'), 4)} | {fmt(part('between'), 4)} | {fmt(part('turn1'), 4)} | "
                         f"{fmt(part('horizon_K'), 4)} | {fmt(part('total_K'), 4)} | {fmt(part('total_20'), 4)} | "
                         f"{fmt(part('total_50'), 4)} | {ci_txt(ci, 4)} |")
                rows3 += 1
    if not rows3:
        L.append("| – | – | – | – | – | – | – | – | – | – | – |")
    wp = [(k, v["window_pct_cold_total_K"]) for k, v in d.cost.items() if v.get("window_pct_cold_total_K")]
    L += ["", "Window percent of the cold total at K, where the account's readings measure it:", "",
          "| cut | arm | run | window % |", "|---|---|---|---|"]
    L += [f"| {k[0]} | {k[1]} | {k[2]} | " + ", ".join(f"{w} {fmt(p, 3)}" for w, p in v.items()) + " |" for k, v in sorted(wp)] or \
        ["| – | – | – | – |"]

    # ---- 4. noise floor
    S["floor"] = len(L)
    L += ["", "## 4. Noise floor (A0 run 1 against A0 runs 2-5 at the floor cuts)", "",
          f"Floor cuts: {', '.join(floor_cuts) or 'none'}. Absolute spreads (Opus): {', '.join(f'{s:.2f}' for s in spreads) or 'none'}; "
          f"95th percentile {fmt(p95)}; floor used {floor:.2f}.", "", "| cut | run | judge | outcome(s) |", "|---|---|---|---|"]
    L += [f"| {c} | {r} | {j} | {', '.join(sorted(o))} |" for c, r, j, o in floor_pairs] or ["| – | – | – | – |"]

    # ---- 5. judge disagreements
    S["disagree"] = len(L)
    L += ["", "## 5. Judge disagreements (Opus vs Sonnet)", "", "| cut | arm | run | reading | Opus | Sonnet |", "|---|---|---|---|---|---|"]
    dis = []
    for (c, arm, run, j), v in d.pair.items():
        if j == "opus" and (c, arm, run, "sonnet") in d.pair and d.pair[(c, arm, run, "sonnet")]["outcome"] != v["outcome"]:
            dis.append(f"| {c} | {arm} | {run} | pairwise | {v['outcome']} | {d.pair[(c, arm, run, 'sonnet')]['outcome']} |")
    for (c, arm, run, j), v in d.q.items():
        s = d.q.get((c, arm, run, "sonnet"))
        if j == "opus" and s is not None and abs(s - v) > 1:
            dis.append(f"| {c} | {arm} | {run} | absolute | {v:.2f} | {s:.2f} |")
    L += sorted(dis) or ["| – | – | – | – | – | – |"]

    # ---- 6. E5, E6
    S["e5"] = len(L)
    L += ["", "## 6. E5: warm native compaction, window cost", ""]
    e5md = os.path.join(out, "e5.md")
    L += open(e5md).read().split("\n")[2:] if os.path.exists(e5md) else ["(not run: e5.py)"]
    S["e6"] = len(L)
    L += ["", "## 7. E6: summarize against whole, per band (cold total at K)", "",
          "| band | summarize arm | cuts | median (summarize − whole) | per cut: context → difference |", "|---|---|---|---|---|"]
    for b, ref, diffs in e6:
        L.append(f"| {b} | {ref} | {len(diffs)} | {fmt(med(x for _, x in diffs), 4, '$')} | "
                 + (", ".join(f"{p // 1000}k → {x:+.4f}" for p, x in diffs) or "–") + " |")

    # ---- 8. stopped: by class first (what PAPER.md carries; no error text, which can quote a transcript), then each
    S["stopped"] = len(L)
    judge_stops = common.read_jsonl(os.path.join(out, "judge", "stopped.jsonl"))
    classes = collections.Counter(
        (k[1], re.split(r"[:(\n]", r.get("error") or "", maxsplit=1)[0].strip()[:60] or "?")
        for k, r in d.results.items() if r["status"] == "stopped")
    L += ["", "## 8. Stopped runs and judgments", ""]
    not_run = common.load(os.path.join(out, "not_run.json"), {})
    if not_run:
        L += ["Arms not run (out/not_run.json):", ""] + [f"- **{arm}**: {why}" for arm, why in sorted(not_run.items())] + [""]
    L += ["By arm and class:", "", "| arm | class | runs |", "|---|---|---|"]
    L += [f"| {arm} | {cl} | {n} |" for (arm, cl), n in sorted(classes.items())] or ["| – | – | 0 |"]
    L += ["", f"Judgments stopped: {len(judge_stops)}.", ""]
    S["stopped_each"] = len(L)
    L += ["Each:", "", "| cut | arm | run | error |", "|---|---|---|---|"]
    stops = [f"| {k[0]} | {k[1]} | {k[2]} | {r.get('error', '').splitlines()[0][:300] if r.get('error') else ''} |"
             for k, r in sorted(d.results.items()) if r["status"] == "stopped"]
    stops += [f"| judge | {s['where']} | – | {s['error'][:300]} |" for s in judge_stops]
    L += stops or ["| – | – | – | none |"]
    cs = [c for c in d.cuts if 0 < sum(1 for k, r in d.results.items() if k[0] == c and r["status"] == "done")]
    L += ["", f"Cuts with at least one finished run: {len(cs)} of {len(d.cuts)}. A cut is left out of a CI only where fewer than "
          "2 of an arm's runs finished there (B6)."]

    # ---- 9. recall appendix
    S["appendix"] = len(L)
    L += ["", "## 9. Recall appendix (the infinite-chat eval, not redone)", ""]
    if os.path.exists(a.eval_report):
        L += open(a.eval_report).read().split("\n")
    else:
        L.append(f"(the eval's report is not at {a.eval_report})")
    with open(os.path.join(out, "report.md"), "w") as fh:
        fh.write("\n".join(L) + "\n")
    print(f"report: {os.path.join(out, 'report.md')}", flush=True)
    if a.paper:
        write_paper(a.paper, L, S, L[0], L[2])
    return 0


START, END = "<!-- results:start (written by report.py --paper; do not edit by hand) -->", "<!-- results:end -->"
# Aggregates only: the cut counts, the decision table, quality and cost per arm and stratum, the noise floor, judge
# disagreements, E5 with its calibration, E6, and stopped runs by class. No transcript text, no error text.
PAPER_SECTIONS = ["cuts", "decision", "move", "quality", "strata", "cost", "floor", "disagree", "e5", "e6", "stopped"]


def write_paper(path, L, S, title, written):
    order = sorted(S.items(), key=lambda kv: kv[1])
    bounds = {name: (start, order[i + 1][1] if i + 1 < len(order) else len(L)) for i, (name, start) in enumerate(order)}
    body = [f"_{written}_ {'(dry run: every model reply simulated)' if 'DRY RUN' in title else ''}", ""]
    for name in PAPER_SECTIONS:
        s, e = bounds[name]
        body += [ln.replace("## ", "### ", 1) if ln.startswith("## ") else ln for ln in L[s:e]]
    text = open(path).read()
    if START not in text or END not in text:
        raise SystemExit(f"{path} has no results markers")
    head, rest = text.split(START, 1)
    _, tail = rest.split(END, 1)
    with open(path, "w") as fh:
        fh.write(head + START + "\n\n" + "\n".join(body).rstrip() + "\n\n" + END + tail)
    print(f"paper: Results in {path} rewritten", flush=True)


if __name__ == "__main__":
    sys.exit(main())
