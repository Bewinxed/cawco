"""The driver: for each cut × arm × run, a sandbox, state X, the real next message → out/runs/<cut>/<arm>/<run>/.

Each run is written whole when it ends (result.json: done, or stopped with its error); a rerun skips both, so a stopped
measurement resumes from disk (--retry-stopped runs the stopped ones again). Exit 0 when every run is done, 75 when
some stopped, 2 when it refused to start.

Real runs (the orchestrator, on the host; see README for the order):
  python -I compaction-bench/run.py --cuts out/cuts.json --cockpit-root ~/cockpit --tools out/tools.json \
      --gpt-model <model> [--only-cut c03] [--arms A0,A1] [--cuts-subset floor] [--runs 3] [--add-cuts N --db … --accounts …]
  env: CLAUDE_CONFIG_DIR (the account the sessions continue on), BENCH_SUMMARIZER_CONFIG_DIR (the account the Claude
  summarisers run on), OPENCODE_ACCOUNT_DIR (A7d), PI_ACCOUNT_DIR (A7g)
Dry run (no model call; the plumbing real, the model simulated; then judge, cost, e5 and report on the fixture):
  python -I compaction-bench/run.py --dry --fixture
"""
import argparse
import concurrent.futures as cf
import json
import os
import subprocess
import sys
import tempfile
import threading

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import shutil  # noqa: E402

import arms  # noqa: E402
import common  # noqa: E402
import cuts as cuts_mod  # noqa: E402
import llm  # noqa: E402
import sandbox  # noqa: E402


def standin_tools_list(tools, role, out_path, calls):
    """One JSON-RPC exchange with the stand-in: initialize, then tools/list. Its reply is saved."""
    p = subprocess.Popen([sys.executable, "-I", os.path.join(common.HERE, "standin_mcp.py"), "--tools", tools,
                          "--role", role, "--calls", calls], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
    msgs = [{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18",
             "capabilities": {}, "clientInfo": {"name": "bench-dry", "version": "1"}}},
            {"jsonrpc": "2.0", "method": "notifications/initialized"},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "handoff",
             "arguments": {"target": "probe", "message": "dry-run probe"}}}]
    out, _ = p.communicate("".join(json.dumps(m) + "\n" for m in msgs), timeout=30)
    replies = [json.loads(x) for x in out.splitlines() if x.strip()]
    common.save(out_path, replies)
    return replies


def options():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cuts")
    ap.add_argument("--out", help="default: the folder cuts.json is in")
    ap.add_argument("--arms", help="comma list; default every arm the cut takes (chained: A0,A1,A2,A6)")
    ap.add_argument("--runs", type=int, default=None, help="runs per arm per cut (default 3; dry 1)")
    ap.add_argument("--only-cut")
    ap.add_argument("--cuts-subset", choices=["floor"])
    ap.add_argument("--parallel", type=int, default=4)
    ap.add_argument("--max-stopped", type=int, default=6, help="no new run starts once this many runs have stopped")
    ap.add_argument("--sandbox-root", default=os.path.expanduser("~/.worktrees/bench"))
    ap.add_argument("--session-config-dir", default=os.environ.get("CLAUDE_CONFIG_DIR"))
    ap.add_argument("--summarizer-config-dir", default=os.environ.get("BENCH_SUMMARIZER_CONFIG_DIR"))
    ap.add_argument("--cockpit-root")
    ap.add_argument("--tools", default=os.path.join(common.FIXTURES, "tools.json"))
    ap.add_argument("--opencode-account-dir", default=os.environ.get("OPENCODE_ACCOUNT_DIR"))
    ap.add_argument("--opencode-model", default="opencode-go/deepseek-v4-pro")
    ap.add_argument("--opencode-bin", default="opencode")
    ap.add_argument("--pi-account-dir", default=os.environ.get("PI_ACCOUNT_DIR"))
    ap.add_argument("--gpt-model", help="A7g's model on openai-codex")
    ap.add_argument("--srt", help="the sandbox runtime every tool-bearing process runs in (required for real runs)")
    ap.add_argument("--rg", help="a real ripgrep for srt (required for real runs)")
    ap.add_argument("--allow-domain", action="append", default=[], help="a host the sandbox may reach besides api.anthropic.com")
    ap.add_argument("--hub-url", help="the hub's tailnet URL the preflight must fail to reach (required for real runs)")
    ap.add_argument("--srt-tmp-root", default=f"/run/user/{os.getuid()}/bench-srt")
    ap.add_argument("--git-credential-socket", default=f"/run/user/{os.getuid()}/cawco/git-credential.sock")
    ap.add_argument("--preflight-only", action="store_true", help="build each run's envelope, run its preflight, stop")
    ap.add_argument("--keep-sandboxes", action="store_true")
    ap.add_argument("--retry-stopped", action="store_true")
    ap.add_argument("--add-cuts", type=int, default=0)
    ap.add_argument("--db")
    ap.add_argument("--accounts")
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--fixture", action="store_true")
    return ap.parse_args()


def main():
    o = options()
    if o.dry:
        o.out = o.out or os.path.join(common.DEFAULT_OUT, "dry")
        o.cuts = o.cuts or os.path.join(o.out, "cuts.json")
        o.runs = o.runs or 1
        o.sandbox_root = os.path.join(tempfile.gettempdir(), "compaction-bench-dry")
        o.session_config_dir = os.path.join(o.out, "claude-config")  # no sign-in: every turn stops before the API
        o.summarizer_config_dir = None
        o.gpt_model = o.gpt_model or "gpt-5.5"
        o.opencode_account_dir = o.opencode_account_dir or "$OPENCODE_ACCOUNT_DIR"
        o.pi_account_dir = o.pi_account_dir or "$PI_ACCOUNT_DIR"
        os.makedirs(o.session_config_dir, exist_ok=True)
    o.runs = o.runs or 3
    if not o.cuts:
        raise SystemExit("--cuts is required")
    o.out = os.path.abspath(o.out or os.path.dirname(os.path.abspath(o.cuts)))
    o.cockpit_root = o.cockpit_root or (subprocess.run(["git", "-C", common.HERE, "rev-parse", "--show-toplevel"],
                                                       capture_output=True, text=True).stdout.strip() if o.fixture else None)
    if not o.cockpit_root:
        raise SystemExit("--cockpit-root is required (the cockpit checkout whose pricing, open-items and agent code run)")
    if o.fixture and not os.path.exists(o.cuts):
        cuts_mod.main(["--fixture", "--out", o.cuts, "--cockpit-root", o.cockpit_root])
    if o.add_cuts:
        if not (o.db and o.accounts):
            raise SystemExit("--add-cuts needs --db and --accounts")
        more = cuts_mod.add_cuts(o.cuts, o.add_cuts, o.db, o.accounts, o.cockpit_root)
        print(f"added {len(more)} cuts: {', '.join(c['id'] for c in more)}")
    data = common.load(o.cuts)
    cut_list = [c for c in data["cuts"] if (not o.only_cut or c["id"] == o.only_cut)
                and (o.cuts_subset != "floor" or c.get("floor"))]
    want = o.arms.split(",") if o.arms else None
    jobs = []
    for c in cut_list:
        for arm in (common.ARMS_CHAINED if c.get("chained") else common.ARMS_SINGLE):
            if want is None or arm in want:
                jobs += [(c, arm, r) for r in range(1, o.runs + 1)]
    needs = {a for _, a, _ in jobs}
    if o.dry:
        o.srt = o.srt or shutil.which("srt") or "srt"
        o.rg = o.rg or shutil.which("rg") or "rg"
        o.hub_url = o.hub_url or "http://100.64.0.1:3456"
    sandbox.configure(sandbox_root=o.sandbox_root, srt=o.srt, rg=o.rg, allow_domains=o.allow_domain, hub_url=o.hub_url, tmp_root=o.srt_tmp_root,
                      git_socket=o.git_credential_socket, dry=o.dry)
    if not o.dry:
        missing = []
        if not (o.srt and os.access(o.srt, os.X_OK)):
            missing.append("--srt (an executable sandbox runtime)")
        if not (o.rg and os.access(o.rg, os.X_OK)):
            missing.append("--rg (an executable ripgrep)")
        if not o.hub_url:
            missing.append("--hub-url")
        if not o.session_config_dir:
            missing.append("CLAUDE_CONFIG_DIR (the account sessions continue on)")
        if needs & {"A2", "A3", "A4", "A5", "A6"} and not o.summarizer_config_dir:
            missing.append("BENCH_SUMMARIZER_CONFIG_DIR")
        if "A7d" in needs and not o.opencode_account_dir:
            missing.append("OPENCODE_ACCOUNT_DIR / --opencode-account-dir")
        if "A7g" in needs and not (o.pi_account_dir and o.gpt_model):
            missing.append("PI_ACCOUNT_DIR / --pi-account-dir and --gpt-model")
        if missing:
            print("NOT RUN: missing " + "; ".join(missing), flush=True)
            return 2
    llm.setup(o.out, o.dry)
    o.focus = common.cockpit("focus", o.cockpit_root)["focus"]
    if o.dry:
        replies = standin_tools_list(o.tools, "delegate", os.path.join(o.out, "standin-tools-list.json"),
                                     os.path.join(o.out, "standin-probe-calls.jsonl"))
        print(f"stand-in tools/list: {len(replies[1]['result']['tools'])} tools", flush=True)
    print(f"{len(jobs)} runs: {len(cut_list)} cuts, arms {sorted(needs)}, {o.runs} run(s) each; out {o.out}", flush=True)
    stopped, lock = [], threading.Lock()

    def one(job):
        c, arm, r = job
        with lock:
            if len(stopped) >= o.max_stopped:
                return None
        res = arms.run_one(c, arm, r, o)
        ok = res["status"] in ("done", "preflight")
        line = f"{c['id']} {arm} run {r}: {res['status']}" + (f" — {res.get('error', '')[:300]}" if not ok else "")
        with lock:
            if not ok:
                stopped.append(line)
        print(line, flush=True)
        return res

    with cf.ThreadPoolExecutor(o.parallel) as ex:
        results = [r for r in ex.map(one, jobs) if r]
    skipped = len(jobs) - len(results)
    if o.dry and not o.preflight_only:
        import cost
        import e5
        import judge
        import report
        judge.main(["--out", o.out, "--cuts", o.cuts, "--dry", "--cockpit-root", o.cockpit_root])
        cost.main(["--out", o.out, "--cuts", o.cuts, "--cockpit-root", o.cockpit_root,
                   "--db", os.path.join(o.out, "fixture", "cawco.db")])
        e5.main(["--db", os.path.join(o.out, "fixture", "cawco.db"), "--accounts", os.path.join(o.out, "fixture", "accounts"),
                 "--cockpit-root", o.cockpit_root, "--out", os.path.join(o.out, "e5.md")])
        import arith
        arith.main(["--out", o.out, "--cockpit-root", o.cockpit_root])
        # the paper's Results are written into a copy under out/dry: simulated numbers never reach the tracked PAPER.md
        paper = os.path.join(o.out, "PAPER.md")
        shutil.copy(os.path.join(common.HERE, "PAPER.md"), paper)
        report.main(["--out", o.out, "--cuts", o.cuts, "--paper", paper])
    print(f"done: {len(results) - len(stopped)} runs done, {len(stopped)} stopped, {skipped} not started", flush=True)
    return 75 if stopped or skipped else 0


if __name__ == "__main__":
    sys.exit(main())
