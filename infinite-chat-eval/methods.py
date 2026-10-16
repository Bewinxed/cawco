"""The five memory methods, replayed on the normalised log (no model calls here).

Segments are the spans between the real resets (18:04 native, 20:32 native,
23:19 CawCo, 00:55 native) plus the final one ending at 02:49. Every method
resets at the same cut points and once more at the end; the tree never resets.
"""
import json
import os
import re
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
WORK = HERE  # prompts/ lives beside this file
REPO = os.path.dirname(HERE)  # the clone; its origin/main gives CawCo's git section

L = [json.loads(line) for line in open(os.path.join(DATA, "messages.jsonl"))]
RESETS = [e["i"] for e in L if e["kind"] == "reset"]
_bounds = [0] + RESETS + [len(L)]
SEGMENTS = []  # list of (start_i, end_i_exclusive) without the reset rows
for a, b in zip(_bounds, _bounds[1:]):
    start = a + 1 if L[a]["kind"] == "reset" else a
    SEGMENTS.append((start, b))
SEG_NAMES = ["S0", "S1", "S2", "S3", "S4"]
CUT_LABELS = ["18:04", "20:32", "23:19", "00:55", "02:49 (end)"]


def seg_msgs(k):
    a, b = SEGMENTS[k]
    return [e for e in L[a:b] if e["kind"] != "reset"]


def clip(text, n):
    if len(text) <= n:
        return text
    h = n // 2
    return text[:h] + f"\n…[{len(text) - n} chars clipped]…\n" + text[-h:]


# ---------------------------------------------------------------- rendering
LABEL = {"note": "user", "user": "user", "work": "user", "sys": "user", "unii": "assistant"}


def render_conv(msgs, echo_clip=4000, tool_clip=3000):
    """A conversation as a reader of the full history sees it (tool calls and results kept, clipped)."""
    out = []
    for e in msgs:
        k = e["kind"]
        if k in LABEL:
            out.append(f"[{LABEL[k]}]\n{e['text']}")
        elif k == "tool":
            out.append(f"[assistant → tool call]\n{clip(e['text'], tool_clip)}")
        elif k == "echo":
            tag = "tool result (error)" if e.get("is_error") else "tool result"
            out.append(f"[{tag}]\n{clip(e['text'], echo_clip)}")
    return "\n\n".join(out)


# ---------------------------------------------------------------- Claude Code style
CC_PROMPT = open(os.path.join(WORK, "prompts/cc_compact.txt")).read()
CC_CONTINUED = ("This session is being continued from a previous conversation that ran out of context. "
                "The summary below covers the earlier portion of the conversation.\n\nSummary:\n")


def cc_input(k, prior_summary):
    msgs = seg_msgs(k)
    head = ""
    if prior_summary is not None:
        head = f"[user]\n{CC_CONTINUED}{prior_summary}\n\n"
    return ("<conversation>\n" + head + render_conv(msgs) + "\n</conversation>\n\n" + CC_PROMPT)


def cc_extract(text):
    m = re.search(r"<summary>(.*?)(</summary>|$)", text, re.S)
    if m:
        return m.group(1).strip()
    k = text.find("1. Primary Request")
    return (text[k:] if k >= 0 else text).strip()


def well_formed(meth, raw):
    """Same structural bar for every method: its required sections, and over 2,000 chars."""
    if meth == "cc":
        body = cc_extract(raw)
        return len(body) > 2000 and "1. Primary Request" in body and ("8. Current Work" in body or "9. Optional Next Step" in body)
    if meth == "cawco":
        return len(raw) > 2000 and all(h in raw for h in ["## Goal and constraints", "## Decisions and reasons", "## Tried and rejected", "## Current state", "## Open items and next step"])
    if meth == "factory":
        return len(raw) > 2000 and all(h in raw for h in ["## Session intent", "## Decisions made", "## File modifications", "## Checks", "## Next steps"])
    return True


def cc_context(summary):
    return CC_CONTINUED + summary


# ---------------------------------------------------------------- CawCo (port of packages/hub/src/continuation.ts)
TAIL_USER_TURNS = 6
TAIL_CHARS = 16_000
ERROR_CHARS = 300
TOOL_ARGUMENT_CHARS = 300
CHANGE_TOOLS = {"write", "edit", "multiedit", "notebookedit", "patch", "apply_patch"}
READ_TOOLS = {"read"}
SHELL_TOOLS = {"bash", "shell"}
PATH_ARGUMENTS = ["file_path", "filePath", "notebook_path", "path"]
MAIN_ARGUMENTS = PATH_ARGUMENTS + ["command", "pattern", "url", "query", "skill", "target", "subject", "description", "prompt"]
SUMMARY_CAP_TOKENS = 8000
SECTIONS = ["## Goal and constraints", "(the user's stated requirements, quoted verbatim where short)",
            "## Decisions and reasons", "## Tried and rejected, and why", "## Current state", "## Open items and next step"]


def one_line(text, limit):
    t = re.sub(r"\s+", " ", text.strip())
    return t if len(t) <= limit else f"{t[:limit]}… [{len(t) - limit} more chars]"


def _tool(e):
    d = json.loads(e["text"])
    return d.get("name") or "", d.get("input") or {}


def _string_field(inp, keys):
    for k in keys:
        v = inp.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


def cawco_extract(entries, opener_text=None, since="2026-10-15T00:00"):
    """entries: the conversation (segment), optionally opened by the previous opening as a user turn."""
    scope = ([{"kind": "user", "text": opener_text}] if opener_text else []) + entries
    results = {e.get("tool_use_id"): e for e in scope if e["kind"] == "echo"}
    turns = []
    for e in scope:
        opens = (not turns) or (e["kind"] in ("note", "user", "work", "sys") and e["text"].strip())
        if opens:
            turns.append([e])
        else:
            turns[-1].append(e)

    def render_turn(turn, calls):
        lines, speaker = [], None

        def say(h, said):
            nonlocal speaker
            if not said:
                return
            if speaker != h:
                lines.append(h)
                speaker = h
            lines.extend(said)
        for e in turn:
            k = e["kind"]
            if k in ("note", "user", "work", "sys"):
                say("## User", [e["text"].strip()] if e["text"].strip() else [])
            elif k == "unii":
                say("## Assistant", [e["text"].strip()])
            elif k == "tool" and calls:
                name, inp = _tool(e)
                arg = _string_field(inp, MAIN_ARGUMENTS)
                arg = one_line(arg, TOOL_ARGUMENT_CHARS) if arg else ""
                said = [f"→ {name}{': ' + arg if arg else ''}"]
                r = results.get(e.get("tool_use_id"))
                if r and r.get("is_error"):
                    said.append(f"✗ {one_line(r['text'], ERROR_CHARS)}")
                say("## Assistant", said)
        return "\n".join(lines)

    said = [render_turn(t, False) for t in turns]
    split, size = len(said), 0
    while split > max(0, len(said) - TAIL_USER_TURNS):
        nxt = size + len(said[split - 1])
        if split < len(said) and nxt > TAIL_CHARS:
            break
        size = nxt
        split -= 1
    middle = [x for x in (render_turn(t, True) for t in turns[:split]) if x]
    tail = "\n\n".join(x for x in said[split:] if x)
    return {"middle": middle, "tail": tail, "artifacts": cawco_artifacts(entries, since)}


def cawco_artifacts(entries, since):
    results = {e.get("tool_use_id"): e for e in entries if e["kind"] == "echo"}
    changed, read, commands = {}, {}, []

    def touch(d, p):
        c = d.pop(p, 0) + 1
        d[p] = c
    for e in entries:
        if e["kind"] != "tool":
            continue
        name, inp = _tool(e)
        kind = name.lower()
        if kind in CHANGE_TOOLS:
            p = _string_field(inp, PATH_ARGUMENTS)
            if p:
                touch(changed, p)
            continue
        p = _string_field(inp, PATH_ARGUMENTS)
        if kind in READ_TOOLS and p:
            touch(read, p)
            continue
        cmd = _string_field(inp, ["command"])
        if kind in SHELL_TOOLS and cmd:
            r = results.get(e.get("tool_use_id"))
            outcome = f"failed: {one_line(r['text'], ERROR_CHARS)}" if r and r.get("is_error") else "ok"
            commands.append(f"- `{one_line(cmd, TOOL_ARGUMENT_CHARS)}` — {outcome}")

    def files(d, n):
        return [f"- {p} ({c}×)" for p, c in list(reversed(list(d.items())))[:n]]

    def section(title, lines):
        return [f"### {title}"] + (lines or ["- none"])
    until = entries[-1]["ts"][:19]
    try:
        log = subprocess.run(["git", "-C", REPO, "log", f"--since={since}", f"--until={until}Z", "--name-status",
                              "--format=%h %s", "origin/main"], capture_output=True, text=True, timeout=60).stdout
    except Exception as ex:  # noqa: BLE001
        log = f"(git log failed: {ex})"
    glines = ["$ git status --porcelain", "(clean)", "", f"$ git log --since={since} --name-status --format='%h %s'"] + \
        (log.rstrip().split("\n") if log.strip() else ["(no commits)"])
    shown = glines[:200]
    git = ["### Git changes since this session started", "```"] + shown + \
        ([f"… {len(glines) - len(shown)} more lines cut ({len(glines)} in total)"] if len(glines) > len(shown) else []) + ["```"]
    return "\n".join(section("Files changed by edit tools (30 most recent, with number of changes; the git section has the rest)", files(changed, 30)) + [""] +
                     section("Files read (30 most recent, with number of reads)", files(read, 30)) + [""] +
                     section("Commands run (last 40, oldest first)", commands[-40:]) + [""] + git)


def cawco_prompt(middle):
    return "\n".join([
        "Below is the transcript of a coding-agent session, up to its last few turns. Old tool output is hidden; failed calls keep the head of their error. A section labelled as compacted by the source session is that session's own earlier summary.",
        "", "<transcript>", "\n\n".join(middle), "</transcript>", "",
        "Use no tools. Reply only with the summary.", "",
        f"Write a summary under {SUMMARY_CAP_TOKENS:,} tokens with exactly these sections as markdown headings, in this order:",
        *SECTIONS, "",
        "Be literal and specific. Keep file paths, commands, ids, URLs and error text verbatim. Write no preamble and no closing remarks."])


def cawco_opening(summary, ex):
    return "\n".join([
        'Continuing session "Orchestrate cockpit fleet work" (instance 23cb5219-f410-4369-83d2-2e1d1fa3e6a7, claude, claude-opus-5-5, in /home/bewinxed/cockpit).',
        "", "Before acting, run `git status` and `git diff --stat` to confirm the current state; the summary below may be stale.",
        "", "## Summary of the session before its last turns", summary or "(the session is short: its last turns below are all of it)",
        "", "## Artifact index", ex["artifacts"], "", "## The last turns, verbatim", ex["tail"]])


# ---------------------------------------------------------------- Factory style (anchored iterative)
FACTORY_SECTIONS = """## Session intent
(the user's goals, requirements and constraints, in their own words where short)
## Decisions made
(each decision with what it was chosen over and why; approaches rejected or ruled out, and why; when a later decision or correction replaces an earlier one, keep only the current one and say it replaced the old)
## File modifications and artifacts
(files created or modified and what changed; commits, branches, item, task and workspace ids, paths, URLs)
## Checks
(tests, probes, builds and live checks run: passed or failed, on which commit; checks still owed)
## Next steps
(the next action; every open item, promise and question waiting on the user, with its state)"""


def factory_prompt(prior, k):
    span = render_conv(seg_msgs(k))
    return f"""You maintain the persistent, structured summary of a long coding-agent session (anchored iterative summarization). Below are the current summary, which covers everything before the new span, and the newly truncated span of the conversation.

Merge the new span into the summary. Keep every still-relevant item from the current summary. Update the items the new span changes, and add new ones. Do not drop an item because it is old: drop it only when it is finished and nothing depends on it, and then keep one line saying it was finished. Every section below is required, in this order; write "none" for an empty one.

{FACTORY_SECTIONS}

Be literal and specific: keep file paths, commands, ids, URLs, numbers and error text verbatim. Stay under {SUMMARY_CAP_TOKENS:,} tokens. Use no tools. Reply only with the updated summary.

<current_summary>
{prior or '(empty: this is the start of the session)'}
</current_summary>

<new_span>
{span}
</new_span>"""


def factory_context(summary):
    return "Summary of this session so far (structured, merged at each compaction):\n\n" + summary


# ---------------------------------------------------------------- open items from records (method 5, "C")
def ledger_open_items(variant):
    """variant 'existing': only rows a record already held at 02:49 (a running work item or a task id).
    variant 'filed': every thread still open at 02:49, as if the agent had filed each one as a record."""
    rows = json.load(open(os.path.join(DATA, f"open_items_{variant}.json")))
    lines = ["## Open items (built by code from task, to-do and work-item records; verbatim)"]
    for r in rows:
        lines.append(f"- [{r['state']}] {r['title']} — since {r['since']}" + (f" — record: {r['record']}" if r.get("record") else "") +
                     (f" — owner's words: {r['words']}" if r.get("words") else "") + (f" — next: {r['next']}" if r.get("next") else ""))
    return "\n".join(lines)
