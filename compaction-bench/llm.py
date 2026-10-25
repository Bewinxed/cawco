"""One model call with no tools: a summary, an anchor list, a judgment, a probe answer.

Built on the eval's claude_call.py: its command (`claude -p --model M --effort … --safe-mode --tools "" --strict-mcp-config
--disable-slash-commands --no-session-persistence`), its environment (refusal fallback off, nonessential traffic off), its
4-call slots, its STOP flag and its ledger. Two things differ, and why:
- the model is the arm's or the judge's (claude_call pins Sonnet), passed to `command(..., model)`;
- `--output-format stream-json --verbose` in place of `json`: the stream carries each API request's own usage, which
  cost.py prices one request at a time. The last line is the same `result` object claude_call reads.
A call that does not end in the model's answer, or that any request answered on another model, stops the run
(claude_call.stop, then RunStopped): nothing is retried and no other model stands in.

In a dry run (`dry=True`) nothing is started: `sim` supplies the reply, and the ledger row says `simulated`.
"""
import json
import os
import subprocess
import time

import common
import sim

_ctx = {}


def setup(out_dir, dry):
    C, M, P = common.eval_modules(out_dir)
    _ctx.update(C=C, dry=dry)
    return C


def _requests(lines):
    by_id, order = {}, []
    for d in lines:
        if d.get("type") != "assistant":
            continue
        m = d.get("message") or {}
        u = m.get("usage") or {}
        mid = m.get("id") or d.get("uuid")
        if mid not in by_id:
            order.append(mid)
        cc = u.get("cache_creation") or {}
        by_id[mid] = {"id": mid, "model": m.get("model") or "", "at": int(time.time() * 1000),
                      "input": u.get("input_tokens", 0) or 0, "cacheCreation": u.get("cache_creation_input_tokens", 0) or 0,
                      "cacheWrite1h": cc.get("ephemeral_1h_input_tokens", 0) or 0,
                      "cacheRead": u.get("cache_read_input_tokens", 0) or 0, "output": u.get("output_tokens", 0) or 0}
    return [by_id[i] for i in order if by_id[i]["model"] != "<synthetic>"]


def call(key, phase, system, user, model, config_dir, sim_kind, cache="off", meta=None):
    """Returns {"text", "requests", "seconds", "cost_reported", "models"}; raises common.RunStopped."""
    C = _ctx["C"]
    meta = dict(meta or {}, model=model)
    if _ctx["dry"]:
        text = sim.reply(sim_kind, user)
        reqs = [sim.request(model, len((system or "")) + len(user), len(text))]
        C._ledger({"ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "key": key, "phase": phase, "ok": True,
                   "simulated": True, "requests": reqs, "user_chars": len(user), **meta})
        return {"text": text, "requests": reqs, "seconds": 0.0, "cost_reported": 0.0, "models": [model]}
    if not config_dir:
        raise common.RunStopped(f"{key}: no Claude config dir for {model} calls (BENCH_SUMMARIZER_CONFIG_DIR / BENCH_JUDGE_CONFIG_DIR)")
    if C.STOP.is_set():
        raise common.RunStopped(C.STOP_REASON[0])
    sp = C.system_file(system) if system is not None else None
    cmd = C.command(sp, None, model)
    i = cmd.index("--output-format")
    cmd[i + 1:i + 2] = ["stream-json", "--verbose"]
    env = dict(C.ENV, **C.CACHE_ENV[cache], CLAUDE_CONFIG_DIR=config_dir)
    if "haiku" in model:
        env.pop("ANTHROPIC_DEFAULT_HAIKU_MODEL", None)  # claude_call points the haiku alias at Sonnet; this call is Haiku
    with C._slots:
        t0 = time.time()
        try:
            p = subprocess.run(cmd, input=user, capture_output=True, text=True, timeout=C.CALL_TIMEOUT, cwd=C.CWD, env=env)
            out, err, code = p.stdout, p.stderr, p.returncode
        except subprocess.TimeoutExpired:
            out, err, code = "", f"timeout after {C.CALL_TIMEOUT}s", -1
        secs = round(time.time() - t0, 1)
    lines = []
    for ln in out.splitlines():
        try:
            d = json.loads(ln)
        except ValueError:
            continue
        if isinstance(d, dict):
            lines.append(d)
    res = next((d for d in reversed(lines) if d.get("type") == "result"), None)
    reqs = _requests(lines)
    # A stream-json assistant frame carries the usage of its message's start: its output count is the first few
    # tokens (7 or 8 on the first real smoke, against a 13,000-character summary). The result frame's `modelUsage` is
    # the call's own total per model (the call is fresh and not persisted, so nothing is restored into it); each
    # model's last request takes the output the frames before it do not account for.
    for m, u in ((res or {}).get("modelUsage") or {}).items():
        mine = [r for r in reqs if r["model"] == m or r["model"].startswith(m)]
        if mine:
            mine[-1]["output"] = max(mine[-1]["output"], (u.get("outputTokens") or 0) - sum(r["output"] for r in mine[:-1]))
    # Outside srt only because it has no tools: `--tools ""`, `--strict-mcp-config` with no config, `--safe-mode`.
    # Asserted from the stream: an init frame listing any tool or MCP server, or any tool_use, stops the run.
    init = next((d for d in lines if d.get("type") == "system" and d.get("subtype") == "init"), {})
    used = [b.get("name") for d in lines if d.get("type") == "assistant"
            for b in ((d.get("message") or {}).get("content") or []) if isinstance(b, dict) and b.get("type") == "tool_use"]
    if init.get("tools") or init.get("mcp_servers") or used:
        C._ledger({"ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "key": key, "phase": phase, "ok": False,
                   "error": f"tool-less call had tools: {init.get('tools')} {init.get('mcp_servers')} used {used}", **meta})
        raise common.RunStopped(f"{key}: a call outside the sandbox had tools: init tools {init.get('tools')}, "
                                f"MCP {init.get('mcp_servers')}, tool_use {used}")
    text = (res or {}).get("result") or ""
    refused = (res or {}).get("stop_reason") == "refusal"
    off = sorted({r["model"] for r in reqs if not r["model"].startswith(model)})
    ok = code == 0 and res is not None and not res.get("is_error") and not refused and bool(text.strip()) and not off
    error = None if ok else ("refusal: " if refused else "") + (
        f"answered on {off}, not {model}" if off else (text or err or out[-600:] or f"exit {code}").strip())
    C._ledger({"ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "key": key, "phase": phase, "ok": ok,
               "refused": refused, "exit": code, "seconds": secs, "system_chars": len(system or ""),
               "user_chars": len(user), "requests": reqs, "cost_usd": (res or {}).get("total_cost_usd", 0),
               "models": sorted(((res or {}).get("modelUsage") or {}).keys()), "off_model": off,
               "error": error and error[:600], **meta})
    if not ok:
        raise common.RunStopped(f"{key}: {error[:600]}")
    return {"text": text, "requests": reqs, "seconds": secs, "cost_reported": (res or {}).get("total_cost_usd", 0),
            "models": [model]}


def other_harness(key, phase, driver, argv, prompt, scratch, sim_kind, model, extra_env=None):
    """A7d/A7g: one summary by harness/<driver>, which prints {ok, text, requests, error, commands}."""
    C = _ctx["C"]
    os.makedirs(scratch, exist_ok=True)
    pf = os.path.join(scratch, "prompt.txt")
    with open(pf, "w") as fh:
        fh.write(prompt)
    cmd = ["bun", "run", os.path.join(common.HARNESS, driver)] + argv + ["--prompt-file", pf, "--scratch", scratch]
    if _ctx["dry"]:
        cmd.append("--dry")
    env = dict(os.environ, **(extra_env or {}))
    t0 = time.time()
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=C.CALL_TIMEOUT, env=env)
    secs = round(time.time() - t0, 1)
    try:
        res = json.loads(p.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        res = {"ok": False, "error": f"{driver} exited {p.returncode}: {(p.stderr or p.stdout)[-800:]}", "commands": []}
    common.save(os.path.join(scratch, "result.json"), res)
    if _ctx["dry"]:
        # the plumbing ran for real and stopped where no credential was given; the model's part is simulated
        text = sim.reply(sim_kind, prompt)
        reqs = [sim.request(model, len(prompt), len(text))]
        C._ledger({"ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "key": key, "phase": phase, "ok": True,
                   "simulated": True, "requests": reqs, "dry_plumbing": {"ok": res.get("ok"), "error": res.get("error")},
                   "commands": res.get("commands"), "model": model})
        return {"text": text, "requests": reqs, "seconds": secs, "commands": res.get("commands"), "dry_plumbing": res}
    C._ledger({"ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "key": key, "phase": phase, "ok": bool(res.get("ok")),
               "seconds": secs, "requests": res.get("requests", []), "error": res.get("error"), "model": model,
               "user_chars": len(prompt)})
    if not res.get("ok"):
        raise common.RunStopped(f"{key}: {res.get('error')}")
    off = sorted({r["model"] for r in res["requests"] if r["model"] != model})
    if off:
        raise common.RunStopped(f"{key}: answered on {off}, not {model}")
    return {"text": res["text"], "requests": res["requests"], "seconds": secs, "commands": res.get("commands")}
