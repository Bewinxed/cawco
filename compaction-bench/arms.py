"""How each arm makes state X, and one whole run: sandbox → state X → (chained: replay, compact again) → the real next
message → out/runs/<cut>/<arm>/<run>/.

Arms (design B2, with the brief's A7 split):
  A0   the pre-cut transcript resumed whole (`--resume` of the placed copy)
  A1   resumed whole, then `/compact <focus>` on the session's model; no new manual compact_boundary stops the run
  A2   CawCo summary · Sonnet 5.5 · today's extract (methods.cawco_extract → cawco_prompt) · CawCo shape
  A3   the same on Haiku 5.5
  A4   CawCo shape · Sonnet · full-clipped input (methods.render_conv of the part before the tail)
  A5   Claude Code's compaction prompt (methods.cc_input, prompts/cc_compact.txt) · Sonnet · the same input as A4
  A6   Factory anchored merge (methods.factory_prompt) · Sonnet · chained cut points only
  A7d  A4's prompt written by OpenCode on opencode-go/deepseek-v4-pro (harness/opencode_summarize.ts)
  A7g  A4's prompt written by pi on openai-codex/<--gpt-model> (harness/pi_summarize.ts)
Every summary arm opens a fresh conversation on the session's own model with the CawCo opening (methods.cawco_opening:
header, summary, artifact index, last turns), its header naming the sandbox's directory. That opening is a turn of its
own, as in the product; the real next message is the turn after it. Only the summary differs between A2-A7: one factor
at a time. The chained arms are A0 (at the second cut), A1, A2 and A6.
"""
import os
import shutil
import threading
import uuid as uuidlib

import common
import llm
from sandbox import Sandbox, claude_turn

_extract_lock = threading.Lock()
OLD_SENTENCE = "Old tool output is hidden; failed calls keep the head of their error."
FULL_SENTENCE = "Tool calls and their results are kept, each clipped to its head and tail."
SUMMARY_KIND = {"A2": "summary-cawco", "A3": "summary-cawco", "A4": "summary-cawco", "A5": "summary-cc",
                "A6": "summary-factory", "A7d": "summary-cawco", "A7g": "summary-cawco"}
MODEL = {"A2": common.SONNET, "A3": common.HAIKU, "A4": common.SONNET, "A5": common.SONNET, "A6": common.SONNET}


def _tail_split(M, entries):
    """methods.cawco_extract's turns and tail split, kept here as entries: the part before the tail is A4-A7's input.
    Checked against the tail methods itself returns; a mismatch stops the run."""
    turns = []
    for e in entries:
        opens = (not turns) or (e["kind"] in ("note", "user", "work", "sys") and e["text"].strip())
        if opens:
            turns.append([e])
        else:
            turns[-1].append(e)

    def said(turn):
        lines, speaker = [], None
        for e in turn:
            if e["kind"] in ("note", "user", "work", "sys"):
                head, text = "## User", e["text"].strip()
            elif e["kind"] == "unii":
                head, text = "## Assistant", e["text"].strip()
            else:
                continue
            if not text:
                continue
            if speaker != head:
                lines.append(head)
                speaker = head
            lines.append(text)
        return "\n".join(lines)
    rendered = [said(t) for t in turns]
    split, size = len(rendered), 0
    while split > max(0, len(rendered) - M.TAIL_USER_TURNS):
        nxt = size + len(rendered[split - 1])
        if split < len(rendered) and nxt > M.TAIL_CHARS:
            break
        size = nxt
        split -= 1
    return [e for t in turns[:split] for e in t], "\n\n".join(x for x in rendered[split:] if x)


class _Segment:
    """methods.cc_input and factory_prompt read their span through methods.seg_msgs(k); this hands them one span."""
    def __init__(self, M, entries):
        self.M, self.entries = M, entries

    def __enter__(self):
        self.saved = self.M.seg_msgs
        self.M.seg_msgs = lambda k: self.entries

    def __exit__(self, *exc):
        self.M.seg_msgs = self.saved


def summarize(arm, recs, cut, o, rd, step, prior_factory=None, header_cwd=None):
    """The arm's summary of `recs`' live scope and the opening built on it. Returns (opening, summary, requests, raw)."""
    C, M, P = common.eval_modules(o.out)
    prior, scope = common.live_scope(recs)
    entries = [e for e in common.to_eval_entries(scope)]
    since = (cut.get("session_started") or cut["cut_at"])[:16]
    with _extract_lock:
        M.REPO = cut["cwd"]
        ex = M.cawco_extract(entries, opener_text=prior, since=since)
        scope_entries = ([{"kind": "user", "text": prior, "ts": ""}] if prior else []) + entries
        middle, tail = _tail_split(M, scope_entries)
        if tail != ex["tail"]:
            raise common.RunStopped("the bench's tail split differs from methods.cawco_extract's; the A4-A7 input would be wrong")
        body = [e for e in middle if not (prior and e is scope_entries[0])]
        if arm in ("A2", "A3"):
            prompt = M.cawco_prompt(ex["middle"]) if ex["middle"] else None
            system = None
        elif arm in ("A4", "A7d", "A7g"):
            prompt = M.cawco_prompt([M.render_conv(middle)]).replace(OLD_SENTENCE, FULL_SENTENCE) if middle else None
            system = None
        elif arm == "A5":
            with _Segment(M, body):
                prompt = M.cc_input(0, prior) if body else None
            system = P.SYSTEM_OF["cc"]
        elif arm == "A6":
            with _Segment(M, body):
                prompt = M.factory_prompt(prior_factory if prior_factory is not None else prior, 0) if body else None
            system = P.SYSTEM_OF["factory"]
        else:
            raise ValueError(arm)
    with open(os.path.join(rd, f"{step}.prompt.txt"), "w") as fh:
        fh.write(prompt or "(nothing before the tail: no summary call)")
    reqs, summary, raw = [], None, None
    if prompt:
        key = f"run/{cut['id']}/{arm}/{os.path.basename(rd)}/{step}"
        if arm == "A7d":
            r = llm.other_harness(key, "summarize", "opencode_summarize.ts",
                                  ["--cockpit-root", o.cockpit_root, "--account-dir", o.opencode_account_dir or "-",
                                   "--model", o.opencode_model, "--opencode-bin", o.opencode_bin],
                                  prompt, os.path.join(rd, f"{step}.opencode"), SUMMARY_KIND[arm], o.opencode_model)
        elif arm == "A7g":
            scratch = os.path.join(rd, f"{step}.pi")
            r = llm.other_harness(key, "summarize", "pi_summarize.ts",
                                  ["--cockpit-root", o.cockpit_root, "--account-dir", o.pi_account_dir or "-",
                                   "--gpt-model", o.gpt_model],
                                  prompt, scratch, SUMMARY_KIND[arm], f"openai-codex/{o.gpt_model}",
                                  extra_env={"PI_CODING_AGENT_DIR": os.path.join(scratch, "agent")})
        else:
            r = llm.call(key, "summarize", system, prompt, MODEL[arm], o.summarizer_config_dir, SUMMARY_KIND[arm])
        raw, reqs = r["text"], r["requests"]
        summary = M.cc_extract(raw) if arm == "A5" else raw.strip()
        well_formed = M.well_formed({"A5": "cc", "A6": "factory"}.get(arm, "cawco"), raw)
        with open(os.path.join(rd, f"{step}.summary.md"), "w") as fh:
            fh.write(f"<!-- well-formed: {well_formed} -->\n{summary}")
    opening = M.cawco_opening(summary, ex).split("\n", 1)[1]
    header = (f'Continuing session "{cut.get("title") or "(untitled)"}" (instance {cut.get("instance_id") or "-"}, claude, '
              f'{cut["model"]}, in {header_cwd}).')
    return header + "\n" + opening, summary, reqs, raw


def _carried_whole(recs):
    """What a resumed session carries, as text, for key-string presence: its live scope's words and tool I/O."""
    prior, scope = common.live_scope(recs)
    return "\n".join(([prior] if prior else []) + [e["text"] for e in common.to_eval_entries(scope)])


def run_one(cut, arm, run, o):
    rd = os.path.join(o.out, "runs", cut["id"], arm, str(run))
    res_path = os.path.join(rd, "result.json")
    done = common.load(res_path)
    if done and done.get("status") in ("done", "stopped") and not (o.retry_stopped and done["status"] == "stopped"):
        return done
    if os.path.isdir(rd):
        shutil.rmtree(rd)
    os.makedirs(rd)
    cfg = o.session_config_dir
    sb = Sandbox(o.sandbox_root, f"{cut['id']}-{arm}-{run}", cut["cwd"], cut["cut_at"], cut.get("git_branch"),
                 o.tools, cut["role"])
    res = {"cut": cut["id"], "arm": arm, "run": run, "status": "running", "steps": [], "sessions": [],
           "chained": bool(cut.get("chained")), "dry": o.dry, "started": common.now_iso(),
           "accounts": {"session": cfg, "summarizer": o.summarizer_config_dir}}
    model, effort = cut["model"], cut.get("effort")
    all_recs = []

    def turn(sid, message, new, name, kind, context=0):
        r = claude_turn(sb, cfg, sid, message, model, effort, new, os.path.join(rd, f"{name}.stream.jsonl"), o.dry, context)
        res["steps"].append({"name": name, "kind": kind, "session": sid, "requests": r["requests"],
                             "records": len(r["records"]), "check": {k: v for k, v in r["check"].items() if k != "cmd"},
                             "cmd": r["check"]["cmd"]})
        common.write_jsonl(os.path.join(rd, f"{name}.records.jsonl"), r["records"])
        return r

    def resume_whole(recs, tag):
        sid = str(uuidlib.uuid4())
        sb.place(recs, sid, cfg, cut["cwd"])
        res["sessions"].append(sid)
        return sid

    def compact(sid, recs_before, name):
        r = turn(sid, f"/compact {o.focus}", False, name, "compact",
                 context=common.prompt_tokens(common.requests_of(recs_before)[-1]) if common.requests_of(recs_before) else 0)
        b = [x for x in r["records"] if common.is_boundary(x)]
        if not any((x.get("compactMetadata") or {}).get("trigger") == "manual" for x in b):
            tail = "\n".join(str(x)[:400] for x in common.read_jsonl(r["transcript"])[-5:])
            raise common.RunStopped(f"A1: /compact wrote no manual compact_boundary. JSONL tail:\n{tail}")
        summ = next((x for x in r["records"] if common.is_summary(x)), None)
        return "\n".join(bl.get("text", "") for bl in common.content_blocks(summ) if bl.get("type") == "text") if summ else ""

    def make_state(recs, step, prior_factory=None):
        """(session id, carried text, factory summary) for the arm at the end of `recs`."""
        if arm == "A0":
            return resume_whole(recs, step), _carried_whole(recs), None
        if arm == "A1":
            sid = resume_whole(recs, step)
            return sid, compact(sid, recs, f"{step}-compact"), None
        opening, summary, reqs, raw = summarize(arm, recs, cut, o, rd, step, prior_factory, sb.session_cwd)
        res["steps"].append({"name": f"{step}-summarize", "kind": "summarize", "requests": reqs,
                             "model": MODEL.get(arm) or (o.opencode_model if arm == "A7d" else f"openai-codex/{o.gpt_model}")})
        with open(os.path.join(rd, f"{step}.opening.md"), "w") as fh:
            fh.write(opening)
        sid = str(uuidlib.uuid4())
        res["sessions"].append(sid)
        turn(sid, opening, True, f"{step}-opening", "opening", context=len(opening) // 4)
        return sid, opening, summary

    try:
        # the drawn transcript wherever CawCo has moved it since, holding the cut as drawn (2026-10-25: c24's moved
        # from one account to another mid-run, and an empty placement resumed "No conversation found")
        all_recs[:] = common.read_transcript(cut["jsonl"], cut["second"]["cut_index"] if cut.get("chained")
                                             else cut["cut_index"], cut.get("cut_uuid"))
        sb.build()
        res["sandbox"] = {"base": sb.base, "session_cwd": sb.session_cwd, "commit": sb.commit}
        sb.envelope(cfg)
        res["probe"] = sb.probe(cfg)
        res["preflight"] = {k: v for k, v in sb.preflight(cfg).items() if k != "env"}
        if o.preflight_only:
            res["status"] = "preflight"
            return res
        if cut.get("chained") and arm != "A0":
            sid, carried, fsum = make_state(all_recs[:cut["cut_index"]], "make1")
            for k, text in enumerate(cut["replay_texts"]):
                turn(sid, text, False, f"replay{k:02d}", "replay")
            arm_recs = common.read_jsonl(sb.transcript_path(cfg, sid))
            if arm == "A1":
                carried = compact(sid, arm_recs, "make2-compact")
            else:
                if arm == "A6":
                    arm_recs = arm_recs[next(i for i, r in enumerate(arm_recs) if common.user_text(r)) + 1:]
                sid, carried, _ = make_state(arm_recs, "make2", prior_factory=fsum)
            nxt = cut["second"]
        else:
            upto = cut["second"]["cut_index"] if cut.get("chained") else cut["cut_index"]
            sid, carried, _ = make_state(all_recs[:upto], "make1")
            nxt = cut["second"] if cut.get("chained") else cut
        with open(os.path.join(rd, "carried.md"), "w") as fh:
            fh.write(carried or "")
        turn(sid, nxt["next_text"], False, "turn1", "turn1")
        res["status"] = "done"
    except common.RunStopped as e:
        res["status"], res["error"] = "stopped", str(e)
    except Exception as e:  # noqa: BLE001 — anything else stops this run too, with what it was
        res["status"], res["error"] = "stopped", f"{type(e).__name__}: {e}"
    finally:
        for sid in res["sessions"]:
            p = sb.transcript_path(cfg, sid) if sb.session_cwd else None
            if p and os.path.exists(p):
                shutil.copy(p, os.path.join(rd, f"transcript-{sid}.jsonl"))
        if os.path.exists(sb.calls):
            shutil.copy(sb.calls, os.path.join(rd, "calls.jsonl"))
        else:
            open(os.path.join(rd, "calls.jsonl"), "w").close()
        for name in ("probe.json", "srt.json", "preflight.sh", "preflight.json"):
            if os.path.exists(os.path.join(sb.base, name)):
                shutil.copy(os.path.join(sb.base, name), os.path.join(rd, name))
        if sb.session_cwd:
            sb.teardown(cfg, res["sessions"], keep_clone=o.keep_sandboxes)
        res["ended"] = common.now_iso()
        common.save(res_path, res)
    return res
