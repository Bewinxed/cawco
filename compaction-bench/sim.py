"""The dry run's model: no call is made, and every reply has the shape the real one must have.

pipeline.SimCaller is the eval's simulator for the memory tree's labelled lines and fits nothing here, so the bench has
its own, on the same principle: deterministic replies, usage billed by the cache rules (a resumed context is written
once, then read), every row marked simulated. Claude Code itself still runs in a dry run (see arms.claude_turn): it
finds the placed transcript, loads the stand-in and stops at the missing sign-in; sim then writes the turn it would
have written.
"""
import hashlib
import json
import re
import uuid as uuidlib

import common

CPT = 0.3  # tokens a character, for simulated usage


def _h(s, n=100):
    return int(hashlib.sha256(s.encode()).hexdigest()[:8], 16) % n


def _words(text, n):
    seen, out = set(), []
    for w in re.findall(r"[A-Za-z0-9_./-]{9,}", text):
        if w not in seen:
            seen.add(w)
            out.append(w)
        if len(out) >= n:
            break
    return out


def request(model, in_chars, out_chars, cache_read=0):
    return {"id": f"sim_{uuidlib.uuid4().hex[:12]}", "model": model, "at": common.ts_ms(common.now_iso()),
            "input": 3, "cacheCreation": int(in_chars * CPT), "cacheWrite1h": 0, "cacheRead": cache_read,
            "output": int(out_chars * CPT)}


def reply(kind, user):
    words = _words(user, 40)
    filler = "\n".join(f"- {w}: carried verbatim from the transcript (simulated)." for w in words) or "- (empty)"
    pad = "\n" + "Simulated line kept long enough for the well-formed bar. " * 40
    if kind == "summary-cawco":
        return "\n".join(["## Goal and constraints", filler, "## Decisions and reasons", filler[:600],
                          "## Tried and rejected, and why", "- none (simulated)", "## Current state", filler[:400],
                          "## Open items and next step", "- continue (simulated)" + pad])
    if kind == "summary-cc":
        return ("<analysis>simulated</analysis>\n<summary>\n1. Primary Request and Intent:\n" + filler +
                "\n2. Key Technical Concepts:\n- simulated\n3. Files and Code Sections:\n- simulated\n4. Errors and fixes:\n"
                "- none\n5. Problem Solving:\n- simulated\n6. All user messages:\n- simulated\n7. Pending Tasks:\n- simulated\n"
                "8. Current Work:\n- simulated\n9. Optional Next Step:\n- continue" + pad + "\n</summary>")
    if kind == "summary-factory":
        return "\n".join(["## Session intent", filler, "## Decisions made", "- simulated",
                          "## File modifications and artifacts", "- simulated", "## Checks", "- none",
                          "## Next steps", "- continue" + pad])
    if kind == "anchors":
        return json.dumps([{"id": f"F{i + 1:02d}", "question": f"What do you know about {w}?",
                            "gold": f"The session used {w}.", "must": [w], "key": w} for i, w in enumerate(words[:10])])
    if kind == "pairwise":
        v = _h(user, 3)
        return json.dumps({"winner": ["X", "Y", "tie"][v], "asked_back": {"X": 0, "Y": 0}, "why": "simulated"})
    if kind == "absolute":
        v = _h(user, 6)
        return json.dumps({"decision_fidelity": v, "artifact_fidelity": max(0, v - 1), "continuation_fidelity": v,
                           "no_repetition": min(5, v + 1), "why": "simulated"})
    if kind == "rules":
        return json.dumps({"rule1": _h(user, 6), "rule2": _h(user + "2", 6), "why": "simulated"})
    if kind == "probe-answers":
        ids = re.findall(r'<question id="([^"]+)">', user)
        return json.dumps({i: "simulated answer" for i in ids})
    if kind == "probe-judge":
        ids = re.findall(r'<answer id="([^"]+)">', user)
        return json.dumps({i: {"score": _h(user + i, 3), "why": "simulated"} for i in ids})
    raise ValueError(f"no simulated reply for {kind}")


def _rec(base, **kw):
    d = dict(base)
    d.update(kw)
    return d


def write_turn(path, session_id, cwd, model, message, kind, context_tokens):
    """Appends the records Claude Code would have written for one turn. kind: turn | compact."""
    recs = common.read_jsonl(path)
    parent = next((r.get("uuid") for r in reversed(recs) if r.get("uuid")), None)
    base = {"sessionId": session_id, "cwd": cwd, "version": "sim", "gitBranch": "bench", "userType": "external",
            "isSidechain": False}
    ts = common.now_iso()
    out = []

    def add(rec):
        nonlocal parent
        rec = _rec(base, parentUuid=parent, uuid=str(uuidlib.uuid4()), timestamp=ts, **rec)
        parent = rec["uuid"]
        out.append(rec)

    if kind == "compact":
        add({"type": "user", "message": {"role": "user", "content": message}})
        add({"type": "system", "subtype": "compact_boundary", "content": "Conversation compacted",
             "compactMetadata": {"trigger": "manual", "preTokens": context_tokens}})
        add({"type": "user", "isCompactSummary": True, "message": {"role": "user", "content":
            "This session is being continued from a previous conversation that ran out of context. The summary below "
            "covers the earlier portion of the conversation.\n\nSummary:\n" + reply("summary-cc", message)}})
        common.write_jsonl(path, recs + out)
        return
    add({"type": "user", "message": {"role": "user", "content": message}})
    tid = f"toolu_sim_{uuidlib.uuid4().hex[:10]}"
    usage1 = {"input_tokens": 3, "cache_creation_input_tokens": context_tokens + int(len(message) * CPT),
              "cache_read_input_tokens": 0, "output_tokens": 60}
    add({"type": "assistant", "requestId": "req_sim1", "message": {
        "id": f"msg_sim_{uuidlib.uuid4().hex[:10]}", "role": "assistant", "model": model, "stop_reason": "tool_use",
        "content": [{"type": "tool_use", "id": tid, "name": "Bash", "input": {"command": "git status"}}],
        "usage": usage1}})
    add({"type": "user", "message": {"role": "user", "content": [
        {"type": "tool_result", "tool_use_id": tid, "content": "On branch bench\nnothing to commit", "is_error": False}]}})
    usage2 = {"input_tokens": 3, "cache_creation_input_tokens": 40,
              "cache_read_input_tokens": usage1["cache_creation_input_tokens"], "output_tokens": 120}
    add({"type": "assistant", "requestId": "req_sim2", "message": {
        "id": f"msg_sim_{uuidlib.uuid4().hex[:10]}", "role": "assistant", "model": model, "stop_reason": "end_turn",
        "content": [{"type": "text", "text": "Simulated reply: the tree is clean; continuing with the asked work."}],
        "usage": usage2}})
    common.write_jsonl(path, recs + out)
