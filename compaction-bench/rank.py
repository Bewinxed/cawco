"""out/ranking.md and one chart per cache case (out/ranking-<case>.png): every arm ranked on quality and cost.

The three cache cases are the paper's situations (§1):
  warm      warm, same organization: the session's own account, its cache warm. Every run's warm regime (cost.py):
            A0 reads its context from cache, A1's /compact reads it from cache, a summariser never shares the cache.
  cold      cold or cross-organization: the target shares no cache. Every run's cold regime. A1 here compacts on the
            target, cold; the variant "A1 compact first" (the /compact on the warm source account, then the move;
            report.py §1b) is ranked beside it, since a planned move can still compact on the warm account.
  limit     the limit gone early: nothing more runs on the account that ran out, so a compaction ahead of the move is
            unavailable. The cold regime with no compact-first variant.
Quality does not depend on the cache: it is the same reading in every case. Quality is the primary judge's (Opus 5.5)
absolute 0-5 score, mean of its four dimensions, median over runs, then over cuts; Sonnet 5.5's beside it. Cost is the
total over the next 20 real turns (make + turn 1 + horizon, cost.py `total_20`), median over runs, then over cuts.

A loss is outside the floor only when §4.7 acts on it (CI excludes zero, median at least the floor, both judges agree).
Every arm is compared on the same cuts: the single cuts where every ranked arm has a quality and a cost reading
(`shared`). Whole (A0) cannot run where the context does not fit ("Prompt is too long"); those cuts leave the shared set,
and the arms are ranked again over every cut where all but A0 ran (`without A0`).

Ranking (the design's B6 rule): the arms whose quality is within the noise floor of the best arm's, cheapest first, then
the rest by quality. The noise floor is report.py's (A0 against its own repeats, at least Nous's 0.3). Δ quality is
paired per cut against the best arm, with a 95 % bootstrap CI over cuts.

Usage: python3 -I rank.py --out out [--cuts out/cuts.json]
"""
import argparse
import os
import statistics
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
import report  # noqa: E402
from report import boot_ci, ci_txt, fmt, med  # noqa: E402

CASES = [("warm", "warm, same organization"), ("cold", "cold or cross-organization"),
         ("limit", "limit gone early")]
SHORT = {"A0": "whole", "A1": "native /compact", "A1cf": "native /compact first, then move",
         "A2": "Sonnet · extract · CawCo", "A3": "Haiku · extract · CawCo", "A4": "Sonnet · full-clipped · CawCo",
         "A5": "Sonnet · full-clipped · Claude Code shape", "A6": "Factory merge (chained)",
         "A7d": "OpenCode deepseek · CawCo", "A7g": "pi gpt · CawCo"}


HORIZON = ["20"]  # "20": the next 20 real turns; "K": the session's own horizon (to its next compaction or its end)


def run_cost(d, case, arm, c, r):
    """total_20 (or total_K) of one run in a case; A1cf is A1's warm regime (its /compact read warm, the rest cold, §1b)."""
    row = d.cost.get((c, "A1" if arm == "A1cf" else arm, r)) or {}
    regime = "warm" if case == "warm" or arm == "A1cf" else "cold"
    r = row.get(regime) or {}
    if HORIZON[0] == "K":
        return r.get("total_K")
    # a session with fewer than 20 turns after its own continued turn has no total_20: its whole horizon stands in
    return r.get("total_20") if r.get("total_20") is not None else r.get("total_K")


def readings(d, case, arm, cuts):
    """{cut: (opus, sonnet, cost)} medians over runs, for cuts with an Opus quality and a cost reading."""
    base = "A1" if arm == "A1cf" else arm
    qo, qs = d.quality(base, "opus", cuts), d.quality(base, "sonnet", cuts)
    co = d.per_cut(base, lambda c, a, r: run_cost(d, case, arm, c, r), cuts)
    return {c: (qo[c], qs.get(c), co[c]) for c in qo if c in co}


def rank(d, case, arms, cuts, floor):
    per = {a: readings(d, case, a, cuts) for a in arms}
    per = {a: v for a, v in per.items() if v}
    shared = sorted(set.intersection(*(set(v) for v in per.values()))) if per else []
    rows = []
    for a, v in per.items():
        q = med(v[c][0] for c in shared)
        rows.append({"arm": a, "q": q, "qs": med(v[c][1] for c in shared), "cost": med(v[c][2] for c in shared)})
    if not rows or not shared:
        return [], shared, None
    best = max(rows, key=lambda x: x["q"])
    for x in rows:
        diffs = [per[x["arm"]][c][0] - per[best["arm"]][c][0] for c in shared]
        cdiffs = [per[x["arm"]][c][2] - per[best["arm"]][c][2] for c in shared]
        sdiffs = [per[x["arm"]][c][1] - per[best["arm"]][c][1] for c in shared
                  if per[x["arm"]][c][1] is not None and per[best["arm"]][c][1] is not None]
        x.update(dq=med(diffs), dq_ci=boot_ci(diffs), dqs=med(sdiffs), dcost=med(cdiffs), dcost_ci=boot_ci(cdiffs))
        # §4.7: a quality loss is acted on only when its CI excludes zero, its median is at least the floor, and both
        # judges agree on its sign; an arm whose loss against the best is not acted on is within the floor
        x["within"] = not (x["dq_ci"] and x["dq_ci"][1] < 0 and x["dq"] <= -floor and x["dqs"] is not None
                           and x["dqs"] < 0)
    rows.sort(key=lambda x: (not x["within"], x["cost"] if x["within"] else -x["q"]))
    return rows, shared, best["arm"]


def pair_txt(d, arm, cuts):
    base = "A1" if arm == "A1cf" else arm
    if base == "A0":
        return "—"
    out = []
    for j in ("opus", "sonnet"):
        n = [v["outcome"] for k, v in d.pair.items() if k[1] == base and k[3] == j and k[0] in cuts]
        out.append(f"{n.count('win')}/{n.count('tie')}/{n.count('loss')}")
    return " · ".join(out)


def table(d, rows, shared, floor):
    L = ["| rank | arm | method | quality Opus 0-5 | Δ vs best (95 % CI) | Sonnet 0-5 (Δ) | within floor | cost, next 20 turns | "
         "Δ cost vs best quality | pairwise vs whole, w/t/l Opus · Sonnet |",
         "|---|---|---|---|---|---|---|---|---|---|"]
    for i, x in enumerate(rows, 1):
        L.append(f"| {i} | {'**' + x['arm'] + '**' if i == 1 else x['arm']} | {SHORT[x['arm']]} | {fmt(x['q'])} | "
                 f"{fmt(x['dq'], 2, '+' if (x['dq'] or 0) >= 0 else '')} {ci_txt(x['dq_ci'])} | {fmt(x['qs'])} "
                 f"({fmt(x['dqs'], 2, '+' if (x['dqs'] or 0) >= 0 else '')}) | {'yes' if x['within'] else 'no'} | "
                 f"${x['cost']:.2f} | {report.usd_signed(x['dcost'], 2)} {ci_txt(x['dcost_ci'])} | {pair_txt(d, x['arm'], set(shared))} |")
    return L


def chart(rows, shared, floor, title, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    # the dataviz reference palette, light mode: one hue for the pick, neutral ink for the rest. Identity is the direct
    # label (rank, arm, method), never colour; an arm whose loss is beyond the noise floor is a hollow marker.
    surface, ink, ink2, muted, pick, grid = "#fcfcfb", "#0b0b0b", "#52514e", "#8a8984", "#2a78d6", "#ecebe7"
    fig, ax = plt.subplots(figsize=(10, 6), dpi=160, facecolor=surface)
    ax.set_facecolor(surface)
    xs, qs = [x["cost"] for x in rows], [x["q"] for x in rows]
    pad = (max(xs) - min(xs)) * 0.45 + 0.5
    ax.set_xlim(min(xs) - pad * 0.25, max(xs) + pad)
    ax.set_ylim(min(qs) - 0.45, max(qs) + 0.35)
    for i, x in enumerate(rows):
        top = i == 0
        ax.scatter(x["cost"], x["q"], s=80 if top else 52, zorder=3, linewidth=1.6 if x["within"] else 1.8,
                   color=(pick if top else muted) if x["within"] else surface,
                   edgecolor=surface if x["within"] else muted)
    fig.canvas.draw()
    r = fig.canvas.get_renderer()
    taken = [ax.transData.transform((x["cost"], x["q"])) for x in rows]
    boxes = []

    frame = ax.get_window_extent(r)

    def clash(bb):
        if bb.x0 < frame.x0 + 2 or bb.x1 > frame.x1 - 2 or bb.y0 < frame.y0 + 2 or bb.y1 > frame.y1 - 2:
            return True
        return any(bb.overlaps(o) for o in boxes) or any(bb.x0 - 4 <= px <= bb.x1 + 4 and bb.y0 - 4 <= py <= bb.y1 + 4
                                                       for px, py in taken)
    offsets = [(9, 6, "left"), (9, -14, "left"), (-9, 6, "right"), (-9, -14, "right"), (9, 18, "left"),
               (9, -26, "left"), (-9, 18, "right"), (-9, -26, "right"), (9, 30, "left"), (9, -38, "left"), (-9, 30, "right"), (-9, -38, "right"),
               (0, 14, "center"), (0, -22, "center")]
    for i, x in enumerate(rows):
        label = f"{i + 1}  {x['arm']}  {SHORT[x['arm']]}" + ("" if x["within"] else "  (loss beyond floor)")
        for dx, dy, ha in offsets:
            t = ax.annotate(label, (x["cost"], x["q"]), xytext=(dx, dy), textcoords="offset points", ha=ha,
                            fontsize=8.5, color=ink if i == 0 else ink2, fontweight="bold" if i == 0 else "normal")
            bb = t.get_window_extent(r)
            if not clash(bb):
                break
            t.remove()
        else:
            t = ax.annotate(label, (x["cost"], x["q"]), xytext=offsets[0][:2], textcoords="offset points",
                            fontsize=8.5, color=ink2)
            bb = t.get_window_extent(r)
        boxes.append(bb)
    ax.set_xlabel("cost over the next 20 real turns, USD (median over cuts)", color=ink2, fontsize=9.5)
    ax.set_ylabel("quality, Opus 5.5 judge, 0-5 (median over cuts)", color=ink2, fontsize=9.5)
    ax.set_title(f"{title}: quality against cost, {len(shared)} cuts", color=ink, fontsize=11.5, loc="left", pad=22)
    ax.text(0, 1.015, f"Ranked by the cheapest method whose quality loss is within the noise floor ({floor:.2f}); "
            "hollow: a loss beyond it (§4.7)", transform=ax.transAxes, fontsize=8.5, color=ink2, va="bottom")
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color("#d6d5d0")
    ax.tick_params(colors=ink2, labelsize=8.5)
    ax.grid(color=grid, lw=0.8, zorder=0)
    ax.set_axisbelow(True)
    fig.tight_layout()
    fig.savefig(path, facecolor=surface)
    plt.close(fig)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--cuts")
    a = ap.parse_args(argv)
    out = os.path.abspath(a.out)
    d = report.Data(out, a.cuts)
    floor, _, spreads, _, floor_cuts = report.noise_floor(d)
    single = {c for c, v in d.cuts.items() if not v.get("chained")}
    chained = {c for c, v in d.cuts.items() if v.get("chained")}
    present = {k[1] for k in d.results if d.results[k]["status"] == "done"}
    single_arms = [x for x in common.ARMS_SINGLE if x in present]
    not_run = common.load(os.path.join(out, "not_run.json"), {})
    L = ["# Compaction methods ranked, per cache case", "",
         f"Written {common.now_iso()} by rank.py from out/. Quality: Opus 5.5's absolute 0-5 (mean of decision, "
         "artifact and continuation fidelity and no-repetition), median over runs then over cuts; Sonnet 5.5 beside it. "
         "Cost: make + turn 1 + the next 20 real turns (all of them where the session had fewer), each request priced on "
         "its own with the product's prices, median over runs then over cuts. Rank: every arm within the noise floor of "
         "the best quality, cheapest first; then the rest by quality (the design's rule: the cheapest method whose "
         "quality is not below the best by more than the noise floor). An arm is outside the floor only when its loss "
         "against the best arm is one §4.7 acts on: the 95 % CI of the paired Opus difference excludes zero, its median "
         "is at least the floor, and Sonnet's median difference has the same sign.", "",
         f"Noise floor: **{floor:.2f}** (the larger of Nous's 0.3 and the 95th percentile of A0's 0-5 distance to its own "
         f"repeats: {len(spreads)} repeats at {', '.join(floor_cuts) or 'no cut'}). Δ quality is paired per cut against "
         "the best arm, 95 % bootstrap CI over cuts (10,000 resamples). Pairwise: the arm's turn against whole's turn of "
         "the same run, both orders; a win or loss counts only when both orders agree.", ""]
    reading = os.path.join(out, "ranking-reading.md")  # the hand-written reading of these tables, when there is one
    if os.path.exists(reading):
        L += [open(reading).read().strip(), ""]
    if not_run:
        L += ["Not run: " + "; ".join(f"**{k}**: {v}" for k, v in not_run.items() if k.startswith("A")), ""]
    for key, title in CASES:
        arms = single_arms + (["A1cf"] if key == "cold" and "A1" in single_arms else [])
        L += [f"## {title}", ""]
        rows, shared, best = rank(d, key, arms, single, floor)
        if rows:
            png = f"ranking-{key}.png"
            chart(rows, shared, floor, title, os.path.join(out, png))
            L += [f"Over the {len(shared)} single cuts where every arm here has both readings "
                  f"({', '.join(shared)}).", ""] + table(d, rows, shared, floor) + ["", f"![{title}]({png})", ""]
        no_a0 = [x for x in arms if x != "A0"]
        rows2, shared2, _ = rank(d, key, no_a0, single, floor)
        extra = sorted(set(shared2) - set(shared))
        if rows2 and extra:
            L += [f"Without whole (A0), over {len(shared2)} cuts: {len(extra)} more where whole did not run or was not "
                  f"judged ({', '.join(extra)}).", ""] + table(d, rows2, shared2, floor) + [""]
        if key != "warm":
            ch_arms = [x for x in common.ARMS_CHAINED if x in present] + (["A1cf"] if key == "cold" else [])
            rows3, shared3, _ = rank(d, key, ch_arms, chained, floor)
            if rows3:
                L += [f"Chained cuts (a second compaction after replaying the real turns), {len(shared3)} cuts "
                      f"({', '.join(shared3)}):", ""] + table(d, rows3, shared3, floor) + [""]
        elif chained:
            rows3, shared3, _ = rank(d, key, [x for x in common.ARMS_CHAINED if x in present], chained, floor)
            if rows3:
                L += [f"Chained cuts, {len(shared3)} cuts ({', '.join(shared3)}):", ""] + table(d, rows3, shared3, floor) + [""]
    # robustness: the same rule at the session's whole horizon, and per context band
    L += ["## Robustness", "", "The order under the same rule, at the next 20 turns (above) and over the session's whole "
          "horizon (to its next compaction or its end), over all single cuts and per context band. Cells: arm and its "
          "median cost; an arm with a loss beyond the floor is struck out and put last.", "",
          "| case | cuts | horizon | order (cheapest within the floor first) |", "|---|---|---|---|"]
    for key, title in CASES:
        arms = single_arms + (["A1cf"] if key == "cold" and "A1" in single_arms else [])
        for label, cs in [("all", single)] + [(b, {c for c in single if d.cuts[c]["band"] == b}) for b, _, _ in common.BANDS]:
            for hz in ("20", "K"):
                HORIZON[0] = hz
                rows, shared, _ = rank(d, key, arms, cs, floor)
                cells = ", ".join((f"{x['arm']} ${x['cost']:.2f}" if x["within"] else f"~~{x['arm']} ${x['cost']:.2f}~~")
                                  for x in rows)
                L.append(f"| {title} · {label} | {len(shared)} | {'20 turns' if hz == '20' else 'whole'} | {cells or '–'} |")
    HORIZON[0] = "20"
    L.append("")
    path = os.path.join(out, "ranking.md")
    with open(path, "w") as f:
        f.write("\n".join(L) + "\n")
    print(f"wrote {path}")


if __name__ == "__main__":
    sys.exit(main())
