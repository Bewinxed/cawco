"""One model call = one `claude -p` process on claude-sonnet-5-5. No tools, no session saved.

- Every call: --model claude-sonnet-5-5 --effort medium --output-format json --safe-mode
  --tools "" --strict-mcp-config --disable-slash-commands --no-session-persistence,
  user text on stdin, cwd = out/cwd (empty), and --system-prompt-file <file> unless the
  caller asks for Claude Code's own default system prompt (system=None).
  --safe-mode leaves out CLAUDE.md, hooks, skills, plugins and MCP servers; auth and model
  selection work as usual (claude --help, 2.1.299).
- Effort medium is Claude Code 2.1.299's own default for this model (its model table:
  anthropic_aws:"claude-sonnet-5-5" … default_effort:"medium"), so it is what CawCo's
  summariser, which sets no effort, runs at in production. Pinned so host settings can't move it.
- Claude Code's small-model slot points at Sonnet too, so no Haiku call can happen.
- CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK=1: a refusal is never retried on another model
  (binary: `function M1(){return!a.CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK&&!CZ()}`). A call
  that ends with stop_reason "refusal" stops the run like any other failed call. Any other
  model in modelUsage is still recorded as off_model.
- Prompt cache per call (`cache=`): "off" sets DISABLE_PROMPT_CACHING=1 (binary:
  `function Tre(e){if(a.DISABLE_PROMPT_CACHING)return!1`), so a prompt nobody reuses is billed
  as plain input ($2/MTok) instead of a 1-hour cache write ($4/MTok; the first run wrote all
  14.3M of its cache tokens at 1h). "5m" sets FORCE_PROMPT_CACHING_5M=1 (binary:
  `if(a.FORCE_PROMPT_CACHING_5M)return{ttl:"5m",reason:"force_5m_env"}`): $2.50 a write,
  $0.10 a read, for prompts whose system part is shared by many calls (the answers' memory).
  Prices: https://platform.claude.com/docs/en/about-claude/pricing.
- At most 4 calls run at once (EVAL_PARALLEL lowers it, never raises it).
- Design A of the incremental tree passes session=(id, new): --session-id starts a Claude Code session,
  --resume continues it, instead of --no-session-persistence.
- A resumed session's total_cost_usd is the session's running total, not the call's (10-17 ledger:
  t0 0.1476, t1 0.2914 = 0.1476 + t1's own 0.1438 at list price). The ledger's cost_usd is the call's
  own cost (the total minus the session's previous total); session_cost_usd keeps the reported total.
- SPEND_LIMIT (set by pipeline.py from EVAL_BUDGET): no call starts once the reported cost reaches it.
- Every attempt appends one line to out/ledger.jsonl: key, phase, exit, seconds, usage
  (input, cache write, cache read, output, thinking), cost, models used.
- Every 25 calls the measured pace is logged with a projection of the rest (out/progress.json).
- A call that does not end in the model's answer (a login or usage-limit reply, a non-zero exit,
  a timeout, the network, an empty or error result, a refusal) sets STOP and raises Stopped: no
  new call starts, the caller stores nothing and advances nothing, and the run exits 75 so a
  rerun resumes from what is on disk. There is no retry: the 10-16 run's expired login failed
  1,168 attempts over nine hours while the run went on filing placeholders.
"""
import collections
import hashlib
import json
import os
import shutil
import subprocess
import threading
import time

MODEL = "claude-sonnet-5-5"
EFFORT = os.environ.get("EVAL_EFFORT", "medium")
MAX_PARALLEL = max(1, min(4, int(os.environ.get("EVAL_PARALLEL", "4"))))
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get("EVAL_OUT", os.path.join(HERE, "out"))
CWD = os.path.join(OUT, "cwd")
PROMPTS = os.path.join(OUT, "prompts")
LEDGER = os.path.join(OUT, "ledger.jsonl")
CALL_TIMEOUT = int(os.environ.get("EVAL_CALL_TIMEOUT", "2400"))
for d in (OUT, CWD, PROMPTS):
    os.makedirs(d, exist_ok=True)


def claude_bin():
    return os.environ.get("CLAUDE_BIN") or shutil.which("claude") or os.path.expanduser("~/.local/bin/claude")


ENV = dict(os.environ)
ENV.update({
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": MODEL,
    "ANTHROPIC_SMALL_FAST_MODEL": MODEL,
    "CLAUDE_CODE_SUBAGENT_MODEL": MODEL,
    "CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK": "1",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
    "DISABLE_AUTO_COMPACT": "1",
    "CLAUDE_CODE_MAX_OUTPUT_TOKENS": "64000",
})
for k in ("CLAUDE_CODE_DISABLE_1M_CONTEXT", "ANTHROPIC_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL",
          "DISABLE_PROMPT_CACHING", "FORCE_PROMPT_CACHING_5M", "ENABLE_PROMPT_CACHING_1H"):
    ENV.pop(k, None)
CACHE_ENV = {"off": {"DISABLE_PROMPT_CACHING": "1"}, "5m": {"FORCE_PROMPT_CACHING_5M": "1"}}

_slots = threading.Semaphore(MAX_PARALLEL)
_lock = threading.Lock()
STOP = threading.Event()
STOP_REASON = []
PLAN = {}            # phase -> calls the plan expects (set by pipeline.py before the run)
SPEND_LIMIT = None   # $ the measurement may spend (reported cost); set by pipeline.py before the run
_spent = [0.0]       # reported cost so far, including what earlier runs of the measurement spent
_session_total = {}  # session id -> the last total_cost_usd it reported (a session's total is cumulative)
on_progress = None   # set by pipeline.py: a function taking one log line
_prog = collections.defaultdict(collections.Counter)
_t_start = time.time()


class Stopped(RuntimeError):
    pass


def system_file(system):
    """Content-addressed, so identical system prompts are one file (and one cache prefix)."""
    h = hashlib.sha256(system.encode("utf-8")).hexdigest()[:20]
    p = os.path.join(PROMPTS, f"{h}.txt")
    if not os.path.exists(p):
        tmp = f"{p}.{os.getpid()}.{threading.get_ident()}"
        with open(tmp, "w") as fh:
            fh.write(system)
        os.replace(tmp, p)
    return p


def command(system_path, session=None):
    """session=(id, new): design A's resumed session. A new one is started with --session-id, a later
    turn continues it with --resume, so Claude Code resends the stored turns unchanged (byte-identical
    prefix) and its last-message cache marker makes every earlier turn a cache read."""
    cmd = [claude_bin(), "-p", "--model", MODEL, "--effort", EFFORT, "--output-format", "json",
           "--safe-mode", "--tools", "", "--strict-mcp-config", "--disable-slash-commands"]
    if session is None:
        cmd.append("--no-session-persistence")
    else:
        sid, new = session
        cmd += ["--session-id", sid] if new else ["--resume", sid]
    return cmd + (["--system-prompt-file", system_path] if system_path else [])


def _usage(res):
    u = (res or {}).get("usage") or {}
    cc = u.get("cache_creation") or {}
    return {
        "input": u.get("input_tokens", 0),
        "cache_write": u.get("cache_creation_input_tokens", 0),
        "cache_write_1h": cc.get("ephemeral_1h_input_tokens", 0),
        "cache_read": u.get("cache_read_input_tokens", 0),
        "output": u.get("output_tokens", 0),
        "thinking": (u.get("output_tokens_details") or {}).get("thinking_tokens", 0),
    }


def _ledger(rec):
    with _lock:
        with open(LEDGER, "a") as fh:
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")


def stop(reason):
    with _lock:
        if not STOP.is_set():
            STOP_REASON.append(reason)
            STOP.set()


def _fmt(secs):
    secs = int(secs)
    return f"{secs // 3600}h{secs % 3600 // 60:02d}m"


def _progress(phase, secs, usage, cost):
    """Measured pace, and the rest of the plan projected at that pace."""
    with _lock:
        p = _prog[phase]
        p["calls"] += 1
        p["seconds"] += secs
        p["cost_millicents"] += int((cost or 0) * 100_000)
        for k, v in usage.items():
            p[k] += v
        n = sum(x["calls"] for x in _prog.values())
        if n % 25:
            return
        snap = {ph: dict(x) for ph, x in _prog.items()}
    allc = collections.Counter()
    for x in snap.values():
        allc.update(x)
    rest_secs, rest_in, rest_out, parts = 0.0, 0, 0, []
    for ph, planned in PLAN.items():
        x = snap.get(ph, {})
        done = x.get("calls", 0)
        base = x if done >= 5 else allc
        per = lambda k: base.get(k, 0) / max(1, base.get("calls", 0))  # noqa: E731
        left = max(0, planned - done)
        rest_secs += left * per("seconds")
        rest_in += int(left * (per("input") + per("cache_write") + per("cache_read")))
        rest_out += int(left * per("output"))
        parts.append(f"{ph} {done}/{planned}")
    measured_in = allc["input"] + allc["cache_write"] + allc["cache_read"]
    line = (f"progress: {', '.join(parts)} calls; {allc['calls'] / max(1, time.time() - _t_start) * 3600:.0f} calls/h; "
            f"so far {measured_in:,} input tokens ({allc['cache_read'] / max(1, measured_in):.0%} from cache), "
            f"{allc['output']:,} output, ${allc['cost_millicents'] / 100_000:.2f} reported; "
            f"rest at this pace ≈ {_fmt(rest_secs / MAX_PARALLEL)}, {rest_in:,} input, {rest_out:,} output tokens")
    snap["projection"] = {"rest_seconds": round(rest_secs / MAX_PARALLEL), "rest_input": rest_in, "rest_output": rest_out}
    tmp = os.path.join(OUT, f"progress.json.{os.getpid()}.{threading.get_ident()}")
    with open(tmp, "w") as fh:
        json.dump(snap, fh, indent=1)
    os.replace(tmp, os.path.join(OUT, "progress.json"))
    if on_progress:
        on_progress(line)


def call(key, phase, system, user, cache, session=None, meta=None):
    """Returns {"text", "usage", "cost", "models", "off_model", "seconds", "key"}: the model's answer,
    or raises Stopped (see the module notes). system=None runs under Claude Code's own default system
    prompt; cache is "off" or "5m". session: see command(). meta: extra ledger fields."""
    sp = system_file(system) if system is not None else None
    cmd = command(sp, session)
    env = dict(ENV, **CACHE_ENV[cache])
    if SPEND_LIMIT is not None and _spent[0] >= SPEND_LIMIT:
        stop(f"budget: ${_spent[0]:.2f} spent by this measurement, the limit is ${SPEND_LIMIT:.2f}")
    if STOP.is_set():
        raise Stopped(STOP_REASON[0])
    with _slots:
        if STOP.is_set():
            raise Stopped(STOP_REASON[0])
        t0 = time.time()
        try:
            p = subprocess.run(cmd, input=user, capture_output=True, text=True,
                               timeout=CALL_TIMEOUT, cwd=CWD, env=env)
            out, err, code = p.stdout, p.stderr, p.returncode
        except subprocess.TimeoutExpired:
            out, err, code = "", f"timeout after {CALL_TIMEOUT}s", -1
        except OSError as e:
            out, err, code = "", f"could not start {cmd[0]}: {e}", -1
        secs = round(time.time() - t0, 1)
        res = None
        try:
            res = json.loads(out.strip().splitlines()[-1]) if out.strip() else None
        except (ValueError, IndexError):
            res = None
        if not isinstance(res, dict):
            res = None
        text = (res or {}).get("result") or ""
        refused = (res or {}).get("stop_reason") == "refusal"
        ok = not refused and code == 0 and res is not None and not res.get("is_error") and bool(text.strip())
        if not ok:  # set before the slot is released, so no waiting call starts after a failure
            stop(f"{key}: exit {code}: " + (("refusal: " if refused else "") + (text or err or out or f"exit {code}").strip())[:400])
    models = sorted(((res or {}).get("modelUsage") or {}).keys())
    off = [m for m in models if not m.startswith(MODEL)]
    usage = _usage(res)
    reported = (res or {}).get("total_cost_usd", 0) or 0
    with _lock:
        cost = reported
        if session is not None and reported:
            cost = max(0.0, reported - _session_total.get(session[0], 0.0))
            _session_total[session[0]] = reported
        _spent[0] += cost
    error = None if ok else (("refusal: " if refused else "") + (text or err or out or f"exit {code}").strip())
    _ledger({
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "key": key, "phase": phase, "cache": cache,
        "ok": ok, "refused": refused, "exit": code, "seconds": secs,
        "system_chars": len(system or ""), "user_chars": len(user), "usage": usage,
        "cost_usd": cost, "models": models, "off_model": off,
        **({"session_cost_usd": reported} if session else {}),
        "stop_reason": (res or {}).get("stop_reason"), "terminal_reason": (res or {}).get("terminal_reason"),
        "error": error and error[:600],
        **({"session": session[0], "session_new": session[1]} if session else {}), **(meta or {}),
    })
    if not ok:
        raise Stopped(STOP_REASON[0])
    _progress(phase, secs, usage, cost)
    return {"text": text, "usage": usage, "cost": cost, "models": models,
            "off_model": off, "seconds": secs, "key": key}
