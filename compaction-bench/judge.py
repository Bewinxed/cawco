"""Quality readings (design B4) for every finished run → out/judge/.

Per cut:
  anchors   8-12 expected facts written by Opus 5.5 from the pre-cut live scope ({id, question, gold, must, key}); a fact
            is kept only when its key string is in the pre-cut transcript verbatim (Nous style). Too few kept is
            reported, never topped up.
Per arm × run (the arm's continued turn against the real one):
  engine    no judge: files edited (Jaccard against the real turn's), commands run (normalised Jaccard), re-fetches
            (Read/Grep/cat/sed -n/head/tail of a path or pattern the pre-cut transcript already read), and which anchor
            keys are present in what the arm carried (state X)
  pairwise  arm turn vs the A0 turn of the same run index, blinded as X and Y, both orders, each judge: win/tie/loss for
            the arm (both orders must agree, else tie), and questions asked back that the pre-cut transcript answers
  absolute  0-5 on decision, artifact and continuation fidelity and no-repetition, each judge
  probes    run 1 only: the anchors' questions answered from the arm's carried state (Sonnet 5.5, no tools), each
            question's answers from every arm scored 0/1/2 under the eval's own rubric (pipeline.JUDGE_SYSTEM),
            shuffled under letters, by each judge
Noise floor: A0 run 1 against A0's other runs at every cut where A0 has repeats, pairwise and absolute.
Judges: Opus 5.5 primary, Sonnet 5.5 second; the judge never sees arm names. Every judgment is a file; a rerun skips it.
A judgment whose reply is not the asked JSON stops that judgment (listed in out/judge/stopped.jsonl), never retried.

Scope: --only-cuts, --pairs ARM:CONTROL (default *:A0), --abs-arms, --no-noise, --no-probes, --no-rules; --estimate
prices the judgments not yet saved and calls nothing; --budget stops new judgments once the calls made report that many
USD.

Usage: python -I compaction-bench/judge.py --runs out/runs   (BENCH_JUDGE_CONFIG_DIR: the account judges run on)
"""
import argparse
import concurrent.futures as cf
import json
import os
import random
import re
import sys
import threading

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
import llm  # noqa: E402

JUDGES = {"opus": common.OPUS, "sonnet": common.SONNET}
CHANGE = {"Edit", "Write", "MultiEdit", "NotebookEdit"}
READ_CMD = re.compile(r"^\s*(cat|head|tail|less|sed\s+-n\s+\S+)\s+(.+)$")
ANCHOR_SYSTEM = ("You read the transcript of a coding-agent session up to a point where its context is about to be made "
                 "small. You write the facts a continuing agent must still hold to carry on correctly. Use no tools.")
ANCHOR_ASK = """Write 10 expected facts (at least 8, at most 12) that an agent continuing this session must still know: what the person asked, decided, ruled out or set as a constraint; files, commands, ids and paths in play; corrections; where the work stands. Each fact must be checkable by a key string copied verbatim from the transcript above (3 to 60 characters, unique enough to prove the fact).

Reply with a JSON array only: [{"id": "F01", "question": "a question the person could ask", "gold": "the answer", "must": ["required fact", ...], "key": "verbatim substring"}, ...]"""
PAIR_SYSTEM = ("You judge which of two continuations of a coding-agent session continues it better. Use no tools. "
               "Reply with JSON only.")
PAIR_ASK = """Below: the facts the session established before the cut (anchors), the person's next message, what the real session did with it, and two other continuations of the same message, X and Y.

Which turn continues this session better? Judge on: the same next action as the real turn; no contradiction of a decision or constraint the anchors record; no re-asking the person what the anchors answer; no re-doing work already done.

Reply with JSON only: {"winner": "X" | "Y" | "tie", "asked_back": {"X": <questions X asks the person that the anchors already answer>, "Y": <the same for Y>}, "why": "one sentence"}"""
ABS_SYSTEM = "You score one continuation of a coding-agent session. Use no tools. Reply with JSON only."
ABS_ASK = """Below: the facts the session established before the cut (anchors), the person's next message, what the real session did with it, and one other continuation of the same message.

Score the continuation 0-5 on each: decision_fidelity (keeps the decisions and constraints in the anchors), artifact_fidelity (right files, ids, paths, commands), continuation_fidelity (does what the real turn did next), no_repetition (does not redo or re-ask what was done or answered).

Reply with JSON only: {"decision_fidelity": n, "artifact_fidelity": n, "continuation_fidelity": n, "no_repetition": n, "why": "one sentence"}"""
RULES_SYSTEM = "You score one compaction summary of a coding-agent session against two rules. Use no tools. Reply with JSON only."
# The owner's rules for a compaction summary, 2026-10-21 (orchestrator's notes, owner-summary-rules-2026-10-21.md), with
# the orchestrator's call recorded there before any judging: score each arm's summary on rules 1 and 2.
RULES_ASK = """Rule 1. The person's messages are carried as their meaning, never quoted. The summary restates what they asked for, decided, ruled out and set as constraints, with their reasons. It has no list of their messages.
Rule 2. It carries only what the next turns need to act. It leaves out:
- what is already stored where the session can read it again (file contents, token values, design-doc text, plans, tasks, artifacts, pin threads), which it points at by path or id instead;
- talk about compaction itself;
- tool errors and dead ends that changed nothing;
- any section that repeats another.

Score the summary above 0-5 on each rule (5: fully kept; 0: ignored throughout).

Reply with JSON only: {"rule1": n, "rule2": n, "why": "one sentence"}"""
ANSWER_SYSTEM = ("You are resuming a coding-agent session. Everything you remember of it is in <memory> below. Answer only "
                 "from your memory; if it does not hold the answer, say so plainly instead of guessing. Be specific: "
                 "quote names, ids, paths and numbers. At most 80 words each. Use no tools.")


def _json(text):
    m = re.search(r"(\{.*\}|\[.*\])", text, re.S)
    if not m:
        raise ValueError("no JSON in the reply")
    return json.loads(m.group(1))


def render(recs, result_chars=1500):
    """A turn as a judge reads it: words, each tool call, its result clipped."""
    C, M, _ = common.eval_modules(O.out)
    return M.render_conv(common.to_eval_entries(recs), echo_clip=result_chars, tool_clip=600)


def _norm_path(p, cwd):
    p = str(p or "")
    return os.path.relpath(p, cwd) if cwd and p.startswith(cwd.rstrip("/") + "/") else p


def readings(recs, cwd):
    edited, commands, reads = set(), [], []
    for name, inp, _, _ in common.tool_calls(recs):
        if name in CHANGE:
            edited.add(_norm_path(inp.get("file_path") or inp.get("notebook_path"), cwd))
        elif name == "Bash":
            cmd = re.sub(r"\s+", " ", str(inp.get("command", ""))).strip().replace(cwd, ".") if cwd else str(inp.get("command", ""))
            commands.append(cmd)
            m = READ_CMD.match(cmd)
            if m:
                reads.extend(_norm_path(x, cwd) for x in m.group(2).split() if not x.startswith("-"))
        elif name == "Read":
            reads.append(_norm_path(inp.get("file_path"), cwd))
        elif name == "Grep":
            reads.append("grep:" + str(inp.get("pattern")))
    return edited, set(commands), reads


def jaccard(a, b):
    return 1.0 if not a and not b else len(a & b) / len(a | b)


O = argparse.Namespace()
_stop_lock = threading.Lock()


def stopped(where, error):
    with _stop_lock:
        common.append_jsonl(os.path.join(O.out, "judge", "stopped.jsonl"), {"where": where, "error": str(error)[:600]})


def judged(path, key, system, user, model, kind, parse):
    """One judgment, cached in `path`; None when its call or its reply stopped. With --estimate the call is only
    recorded (its model, kind and prompt sizes) for pricing, and nothing is saved."""
    have = common.load(path)
    if have is not None:
        return have
    if O.estimate is not None:
        with _stop_lock:
            O.estimate.append({"key": key, "model": model, "kind": kind, "system_chars": len(system or ""),
                               "user_chars": len(user)})
        return None
    with _stop_lock:
        if O.budget is not None and O.spent >= O.budget:
            over = True
        else:
            over = False
    if over:
        stopped(key, f"budget: ${O.spent:.2f} spent by this judging, the limit is ${O.budget:.2f}")
        return None
    try:
        r = llm.call(key, "judge", system, user, model, O.judge_config_dir, kind)
        with _stop_lock:
            O.spent += r.get("cost_reported") or 0
        val = parse(r["text"])
    except (common.RunStopped, ValueError, KeyError, TypeError) as e:
        stopped(key, e)
        return None
    common.save(path, val)
    return val


def anchors_for(cut):
    path = os.path.join(O.out, "judge", cut["id"], "anchors.json")
    have = common.load(path)
    if have is not None:
        return have
    recs = common.read_jsonl(cut["jsonl"])[:cut["second"]["cut_index"] if cut.get("chained") else cut["cut_index"]]
    prior, scope = common.live_scope(recs)
    _, M, _ = common.eval_modules(O.out)
    text = ("[earlier summary]\n" + prior + "\n\n" if prior else "") + M.render_conv(common.to_eval_entries(scope))
    raw_text = "\n".join(([prior] if prior else []) + [e["text"] for e in common.to_eval_entries(recs)])
    if O.estimate is not None:
        # priced, not made: the judgments that need anchors are sized with ten anchors of a typical length
        O.estimate.append({"key": f"judge/{cut['id']}/anchors", "model": common.OPUS, "kind": "anchors",
                           "system_chars": len(ANCHOR_SYSTEM), "user_chars": len(text) + len(ANCHOR_ASK) + 26})
        return {"kept": [{"id": f"F{k:02d}", "gold": "x" * 160, "key": "\0"} for k in range(10)], "estimate": True}
    if O.budget is not None and O.spent >= O.budget:
        stopped(f"{cut['id']}/anchors", f"budget: ${O.spent:.2f} spent by this judging, the limit is ${O.budget:.2f}")
        return None
    try:
        r = llm.call(f"judge/{cut['id']}/anchors", "anchors", ANCHOR_SYSTEM, f"<transcript>\n{text}\n</transcript>\n\n{ANCHOR_ASK}",
                     common.OPUS, O.judge_config_dir, "anchors")
        with _stop_lock:
            O.spent += r.get("cost_reported") or 0
        facts = _json(r["text"])
    except (common.RunStopped, ValueError) as e:
        stopped(f"{cut['id']}/anchors", e)
        return None
    kept = [f for f in facts if isinstance(f, dict) and f.get("key") and f["key"] in raw_text]
    res = {"written": len(facts), "kept": kept, "dropped": [f for f in facts if f not in kept], "short": len(kept) < 8}
    common.save(path, res)
    return res


def real_turn(cut):
    nxt = cut["second"] if cut.get("chained") else cut
    recs = common.read_jsonl(nxt["real"]["jsonl"])
    return recs[nxt["real"]["index"]:nxt["real"]["end"]]


def anchor_block(anchors):
    return "<anchors>\n" + "\n".join(f"- {f['gold']}" for f in anchors["kept"]) + "\n</anchors>"


def judge_cut(cut, pool):
    # --engine-only: the readings no model makes (files, commands, re-fetches against the real turn); anchors, and so
    # the anchor-key presence, need Opus, so they stay unread
    anchors = {"kept": []} if O.engine_only else anchors_for(cut)
    if anchors is None:
        return
    jd = os.path.join(O.out, "judge", cut["id"])
    runs_root = os.path.join(O.out, "runs", cut["id"])
    real = real_turn(cut)
    real_txt = render(real)
    nxt = (cut["second"] if cut.get("chained") else cut)["next_text"]
    pre = common.read_jsonl(cut["jsonl"])[:cut["second"]["cut_index"] if cut.get("chained") else cut["cut_index"]]
    _, _, pre_reads = readings(pre, cut["cwd"])
    pre_reads = set(pre_reads)
    r_edit, r_cmd, _ = readings(real, cut["cwd"])
    done, summaries = {}, {}
    for arm in sorted(os.listdir(runs_root)) if os.path.isdir(runs_root) else []:
        for run in sorted(os.listdir(os.path.join(runs_root, arm)), key=int):
            res = common.load(os.path.join(runs_root, arm, run, "result.json")) or {}
            if res.get("status") != "done":
                continue
            rd = os.path.join(runs_root, arm, run)
            turn = common.read_jsonl(os.path.join(rd, "turn1.records.jsonl"))
            cwd = (res.get("sandbox") or {}).get("session_cwd")
            carried = open(os.path.join(rd, "carried.md")).read() if os.path.exists(os.path.join(rd, "carried.md")) else ""
            edit, cmd, reads = readings(turn, cwd)
            if O.estimate is None:  # an estimate's stand-in anchors must not reach the engine readings
                common.save(os.path.join(jd, arm, run, "engine.json"), {
                    "files_jaccard": jaccard(edit, r_edit), "commands_jaccard": jaccard(cmd, r_cmd),
                    "refetch": sum(1 for x in reads if x in pre_reads), "edited": sorted(edit), "real_edited": sorted(r_edit),
                    "keys_present": [f["id"] for f in anchors["kept"] if f["key"] in carried],
                    "keys_total": None if O.engine_only else len(anchors["kept"]), "carried_chars": len(carried),
                    "turn_tool_calls": len(common.tool_calls(turn)), "real_tool_calls": len(common.tool_calls(real))})
            done[(arm, int(run))] = (render(turn), carried)
            summaries[(arm, int(run))] = summary_of(rd, arm, carried)
    if O.engine_only:
        return
    jobs = []
    if O.rules:
        for (arm, run), text in summaries.items():
            if not text:
                continue
            for jn, model in JUDGES.items():
                jobs.append(lambda arm=arm, run=run, text=text, jn=jn, model=model: judged(
                    os.path.join(jd, arm, str(run), f"rules-{jn}.json"), f"judge/{cut['id']}/{arm}/{run}/rules-{jn}",
                    RULES_SYSTEM, f"<summary>\n{text}\n</summary>\n\n{RULES_ASK}", model, "rules", _rules))
    head = f"{anchor_block(anchors)}\n\n<next_message>\n{nxt}\n</next_message>\n\n<real_turn>\n{real_txt}\n</real_turn>"
    for (arm, run), (txt, _) in done.items():
        if O.abs_arms is None or arm in O.abs_arms:
            for jn, model in JUDGES.items():
                jobs.append(lambda arm=arm, run=run, txt=txt, jn=jn, model=model: judged(
                    os.path.join(jd, arm, str(run), f"abs-{jn}.json"), f"judge/{cut['id']}/{arm}/{run}/abs-{jn}", ABS_SYSTEM,
                    f"{head}\n\n<continuation>\n{txt}\n</continuation>\n\n{ABS_ASK}", model, "absolute", _abs))
        # each pair of arms asked for, at the same run index; against A0 in the arm's own dir (the design's pairwise),
        # against any other arm under vs-<control>
        for ctl in sorted({c for a, c in O.pairs if a in (arm, "*") and c != arm}):
            if (ctl, run) in done:
                d = os.path.join(jd, arm, str(run)) if ctl == "A0" else os.path.join(jd, arm, str(run), f"vs-{ctl}")
                tag = f"{arm}/{run}" if ctl == "A0" else f"{arm}/{run}/vs-{ctl}"
                jobs += pair_jobs(cut, jd, d, head, txt, done[(ctl, run)][0], tag)
    # the noise: A0 run 1 against every other A0 run of the cut, wherever A0 has repeats (the floor cuts' five runs,
    # and the three runs of any other cut)
    if O.noise:
        for run in sorted(r for a, r in done if a == "A0" and r > 1):
            if ("A0", 1) in done:
                jobs += pair_jobs(cut, jd, os.path.join(jd, "floor", str(run)), head, done[("A0", run)][0],
                                  done[("A0", 1)][0], f"floor/{run}")
    if O.probes:
        jobs += probe_jobs(cut, jd, anchors, {k: v[1] for k, v in done.items() if k[1] == 1})
    list(pool.map(lambda f: f(), jobs))


def summary_of(rd, arm, carried):
    """The summary an arm carried at its last cut, alone: A1's is Claude Code's compaction summary (its carried
    state), A2-A7's the summariser's answer (make2 on chained cuts, else make1). A0 carries none."""
    if arm == "A0":
        return None
    if arm == "A1":
        return carried or None
    for step in ("make2", "make1"):
        p = os.path.join(rd, f"{step}.summary.md")
        if os.path.exists(p):
            text = open(p).read()
            return re.sub(r"^<!-- well-formed: \w+ -->\n", "", text) or None
    return None


def _rules(text):
    d = _json(text)
    return {k: int(d[k]) for k in ("rule1", "rule2")} | {"why": d.get("why", "")}


def _abs(text):
    d = _json(text)
    return {k: int(d[k]) for k in ("decision_fidelity", "artifact_fidelity", "continuation_fidelity", "no_repetition")} | \
        {"why": d.get("why", "")}


def _count(v):
    """asked_back as the judge gives it. PAIR_ASK asks for "<questions X asks the person that the anchors already
    answer>", and judges answer with a number or with the questions themselves (45 of 92 pairwise replies on 2026-10-25
    gave lists): a list counts its items; a number is the count; nothing is 0."""
    if isinstance(v, list):
        return len(v)
    return int(v or 0)


def pair_jobs(cut, jd, d, head, arm_txt, ctl_txt, tag):
    jobs = []
    for jn, model in JUDGES.items():
        for order in ("arm-first", "control-first"):
            x, y = (arm_txt, ctl_txt) if order == "arm-first" else (ctl_txt, arm_txt)

            def parse(text, order=order):
                v = _json(text)
                w = v["winner"]
                if w not in ("X", "Y", "tie"):
                    raise ValueError(f"winner {w}")
                arm_is = "X" if order == "arm-first" else "Y"
                ab = v.get("asked_back") or {}
                return {"order": order, "outcome": "tie" if w == "tie" else ("win" if w == arm_is else "loss"),
                        "asked_back_arm": _count(ab.get(arm_is)),
                        "asked_back_control": _count(ab.get("Y" if arm_is == "X" else "X")),
                        "asked_back_text": {k: ab.get(k) for k in ("X", "Y") if isinstance(ab.get(k), list)} or None,
                        "why": v.get("why", "")}
            jobs.append(lambda jn=jn, model=model, order=order, x=x, y=y, parse=parse: judged(
                os.path.join(d, f"pair-{jn}-{order}.json"), f"judge/{cut['id']}/{tag}/pair-{jn}-{order}", PAIR_SYSTEM,
                f"{head}\n\n<turn id=\"X\">\n{x}\n</turn>\n\n<turn id=\"Y\">\n{y}\n</turn>\n\n{PAIR_ASK}", model, "pairwise",
                parse))
    return jobs


def probe_jobs(cut, jd, anchors, carried_by_arm):
    """Run 1 of each arm: answers from its carried state, then every question's answers judged together, blinded."""
    _, _, P = common.eval_modules(O.out)
    qs = "\n".join(f'<question id="{f["id"]}">{f["question"]}</question>' for f in anchors["kept"])

    def answer(arm, carried):
        path = os.path.join(jd, arm, "1", "probe-answers.json")

        def parse(text):
            d = _json(text)
            return {f["id"]: str(d.get(f["id"], "")) for f in anchors["kept"]}
        return judged(path, f"judge/{cut['id']}/{arm}/1/probe-answers", ANSWER_SYSTEM + f"\n\n<memory>\n{carried}\n</memory>",
                      f"Answer each question. Reply with JSON only: {{\"<question id>\": \"<answer>\", ...}}\n\n{qs}",
                      common.SONNET, "probe-answers", parse)

    def run_all():
        answers = {arm: answer(arm, c) for (arm, _), c in carried_by_arm.items()}
        answers = {a: v for a, v in answers.items() if v}
        for f in anchors["kept"]:
            arms_ = sorted(answers)
            random.Random(f"{cut['id']}-{f['id']}").shuffle(arms_)
            letters = [chr(65 + k) for k in range(len(arms_))]
            user = (f"Question: {f['question']}\n\nGold answer: {f['gold']}\n\nRequired facts:\n" +
                    "\n".join(f"- {m}" for m in f.get("must") or []) + "\n\n" +
                    "\n\n".join(f"<answer id=\"{L}\">\n{answers[a][f['id']]}\n</answer>" for L, a in zip(letters, arms_)))
            for jn, model in JUDGES.items():
                def parse(text, letters=letters, arms_=arms_):
                    d = _json(text)
                    out = {}
                    for L, a in zip(letters, arms_):
                        s = int(d[L]["score"])
                        if s not in (0, 1, 2):
                            raise ValueError(f"score {s}")
                        out[a] = s
                    return out
                judged(os.path.join(jd, "probes", f"{f['id']}-{jn}.json"), f"judge/{cut['id']}/probes/{f['id']}-{jn}",
                       P.JUDGE_SYSTEM, user, model, "probe-judge", parse)
    return [run_all] if anchors["kept"] and carried_by_arm else []


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", help="out/runs (its parent is the out dir)")
    ap.add_argument("--out")
    ap.add_argument("--cuts")
    ap.add_argument("--judge-config-dir", default=os.environ.get("BENCH_JUDGE_CONFIG_DIR"))
    ap.add_argument("--cockpit-root")
    ap.add_argument("--parallel", type=int, default=4)
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--engine-only", action="store_true", help="the engine readings alone: no model call")
    ap.add_argument("--only-cuts", help="comma list of cut ids (default every cut)")
    ap.add_argument("--pairs", default="*:A0",
                    help="comma list ARM:CONTROL of pairwise judgments at the same run index (default *:A0, every arm "
                         "against the control); a CONTROL other than A0 is saved under vs-<CONTROL>")
    ap.add_argument("--abs-arms", help="comma list of arms scored 0-5 (default every arm)")
    ap.add_argument("--no-noise", action="store_true", help="skip A0 run 1 against A0's other runs")
    ap.add_argument("--no-probes", action="store_true")
    ap.add_argument("--no-rules", action="store_true")
    ap.add_argument("--estimate", action="store_true",
                    help="make no call: count the judgments not yet saved and price them (out/judge/estimate.json)")
    ap.add_argument("--output-tokens", type=int, default=2000, help="--estimate: output per judgment (thinking included)")
    ap.add_argument("--anchor-output-tokens", type=int, default=6000, help="--estimate: output per anchors call")
    ap.add_argument("--budget", type=float, help="no judgment starts once the calls made have reported this many USD")
    a = ap.parse_args(argv)
    out = os.path.abspath(a.out or os.path.dirname(os.path.abspath(a.runs)))
    O.__dict__.update(out=out, judge_config_dir=a.judge_config_dir, dry=a.dry, engine_only=a.engine_only,
                      estimate=[] if a.estimate else None, noise=not a.no_noise, probes=not a.no_probes,
                      rules=not a.no_rules, abs_arms=set(a.abs_arms.split(",")) if a.abs_arms else None,
                      pairs=[tuple(p.split(":")) for p in a.pairs.split(",")], budget=a.budget, spent=0.0)
    if not a.dry and not a.engine_only and not a.estimate and not a.judge_config_dir:
        raise SystemExit("BENCH_JUDGE_CONFIG_DIR (or --judge-config-dir) names the account the judges run on")
    llm.setup(out, a.dry)
    cuts = common.load(a.cuts or os.path.join(out, "cuts.json"))["cuts"]
    if a.only_cuts:
        cuts = [c for c in cuts if c["id"] in a.only_cuts.split(",")]
    with cf.ThreadPoolExecutor(a.parallel) as pool:
        for cut in cuts:
            judge_cut(cut, pool)
    if a.estimate:
        return estimate(out, a)
    n_stopped = len(common.read_jsonl(os.path.join(out, "judge", "stopped.jsonl")))
    print(f"judge: {len(cuts)} cuts read; {n_stopped} judgments stopped (out/judge/stopped.jsonl); "
          f"${O.spent:.2f} reported by this judging's calls", flush=True)
    return 0


def estimate(out, a):
    """The recorded calls priced: prompt tokens from the ledger's own calls (a straight-line fit of each request's prompt
    tokens to the characters it was sent, Claude Code's fixed overhead in the intercept), output as --output-tokens;
    each call priced alone by the product's costForUsage, uncached (claude_call's DISABLE_PROMPT_CACHING)."""
    rows = [r for r in common.read_jsonl(os.path.join(out, "ledger.jsonl"))
            if r.get("ok") and r.get("requests") and "claude" in r["requests"][0]["model"] and r.get("user_chars")]
    xs = [r["user_chars"] + (r.get("system_chars") or 0) for r in rows]
    ys = [sum(q["input"] + q["cacheCreation"] + q["cacheRead"] for q in r["requests"]) for r in rows]
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
    icpt = my - slope * mx
    at = common.ts_ms(common.now_iso())
    calls = O.estimate
    reqs = [{"model": c["model"], "at": at, "input": round(icpt + slope * (c["system_chars"] + c["user_chars"])),
             "cacheCreation": 0, "cacheWrite1h": 0, "cacheRead": 0,
             "output": a.anchor_output_tokens if c["kind"] == "anchors" else a.output_tokens} for c in calls]
    priced = common.cockpit("price", a.cockpit_root, {"requests": reqs})["priced"] if reqs else []
    for c, r, p in zip(calls, reqs, priced):
        c.update(input_tokens=r["input"], output_tokens=r["output"], usd=p["usd"])
    by = {}
    for c in calls:
        k = (c["kind"], c["model"])
        b = by.setdefault(k, {"calls": 0, "input_tokens": 0, "usd": 0.0})
        b["calls"] += 1
        b["input_tokens"] += c["input_tokens"]
        b["usd"] += c["usd"]
    res = {"fit": {"rows": n, "tokens_per_char": slope, "overhead_tokens": icpt}, "output_tokens": a.output_tokens,
           "anchor_output_tokens": a.anchor_output_tokens, "calls": len(calls), "usd": sum(c["usd"] for c in calls),
           "by": [{"kind": k, "model": m, **v} for (k, m), v in sorted(by.items())], "each": calls}
    common.save(os.path.join(out, "judge", "estimate.json"), res)
    print(f"estimate: {len(calls)} calls, ${res['usd']:.2f} (fit over {n} ledger calls: {slope:.3f} tokens a "
          f"character + {icpt:,.0f}; output {a.output_tokens:,} a judgment, {a.anchor_output_tokens:,} an anchors call)")
    for b in res["by"]:
        print(f"  {b['kind']:10s} {b['model']:20s} {b['calls']:4d} calls  {b['input_tokens']:>12,} input tokens  ${b['usd']:.2f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
