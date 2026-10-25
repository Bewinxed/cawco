"""Paces the real run on a shared host: one run.py per (cut, arm) as a host systemd user unit, started only when the
machine and an account both have room.

The host is shared with the live fleet, so a unit starts only when all hold:
  - the 1-minute load is below --start-load (the brief: keep it under 40; a start adds a clone and a checkout);
  - fewer than --max-units bench units run;
  - a session account from --accounts has its 5-hour window below --cap percent and fewer than --per-account units in
    flight. The readings are the hub's own (`GET <hub>/api/usage/limits`, the fleet's live view); the account with the
    lowest reading plus --inflight-weight per unit already on it is chosen. An account whose weekly window is at or
    above --weekly-cap is never chosen.
The summariser account is the lowest other one by the same reading. Every launch is a line of out/pace.jsonl (unit,
cut, arm, runs, accounts, load, readings), so each run's account is on record. run.py resumes from disk, so a rerun of
pace.py skips what finished; --retry-stopped passes through.

Usage (on the host, from the bench dir):
  python3 -I pace.py --cuts out/cuts.json --accounts <id,id,...> --arms A0,A1,A2,A3,A4,A5,A6 -- <run.py flags: --cockpit-root … --srt …>
"""
import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402

ACCOUNTS = os.path.expanduser("~/.cawco/accounts")


def readings(hub):
    """{account id: {"session": %, "weekly": max weekly_all %}} from the hub's live limits."""
    with urllib.request.urlopen(f"{hub}/api/usage/limits", timeout=20) as r:
        d = json.load(r)
    out = {}
    for row in d.get("claude") or []:
        lim = row.get("limits") or {}
        if lim.get("error") or lim.get("stale"):
            continue
        ws = lim.get("windows") or []
        out[row["accountId"]] = {
            "session": max((w["percent"] for w in ws if w["kind"] == "session"), default=0),
            "weekly": max((w["percent"] for w in ws if w["kind"] == "weekly_all"), default=0)}
    return out


def unit_active(unit):
    return subprocess.run(["systemctl", "--user", "is-active", "-q", unit]).returncode == 0


def main():
    if "--" not in sys.argv:
        raise SystemExit("usage: pace.py [pace flags] -- <run.py flags>")
    split = sys.argv.index("--")
    ap = argparse.ArgumentParser()
    ap.add_argument("--cuts", required=True)
    ap.add_argument("--accounts", required=True, help="comma list of account ids the sessions and summarisers may use")
    ap.add_argument("--arms", default=",".join(common.ALL_ARMS))
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--floor-runs", type=int, default=5, help="A0's runs at the floor cuts")
    ap.add_argument("--only-cuts", help="comma list")
    ap.add_argument("--hub", default="http://127.0.0.1:3456")
    ap.add_argument("--start-load", type=float, default=30.0)
    ap.add_argument("--max-units", type=int, default=12)
    ap.add_argument("--per-account", type=int, default=3)
    ap.add_argument("--cap", type=float, default=70.0)
    ap.add_argument("--weekly-cap", type=float, default=80.0)
    ap.add_argument("--inflight-weight", type=float, default=8.0)
    ap.add_argument("--poll", type=int, default=30)
    ap.add_argument("--start-gap", type=int, default=60)
    ap.add_argument("--retry-stopped", action="store_true")
    a = ap.parse_args(sys.argv[1:split])
    run_flags = sys.argv[split + 1:]
    accounts = a.accounts.split(",")
    arms = a.arms.split(",")
    out = os.path.dirname(os.path.abspath(a.cuts))
    log = os.path.join(out, "pace.jsonl")
    cuts = common.load(a.cuts)["cuts"]
    if a.only_cuts:
        cuts = [c for c in cuts if c["id"] in a.only_cuts.split(",")]
    # longest first: chained cuts (their replays), then by context at the cut
    cuts.sort(key=lambda c: (not c.get("chained"), -c["pre_tokens"]))
    jobs = []
    for c in cuts:
        for arm in (common.ARMS_CHAINED if c.get("chained") else common.ARMS_SINGLE):
            if arm not in arms:
                continue
            runs = a.floor_runs if (arm == "A0" and c.get("floor")) else a.runs
            done = [common.load(os.path.join(out, "runs", c["id"], arm, str(r), "result.json")) or {} for r in range(1, runs + 1)]
            if all(d.get("status") == "done" or (d.get("status") == "stopped" and not a.retry_stopped) for d in done):
                continue
            jobs.append((c["id"], arm, runs))
    running = {}  # unit → (account, cut, arm)
    # a unit a previous pace started and that still runs is adopted, not started twice
    for cid, arm, runs in list(jobs):
        unit = f"bench-{cid}-{arm}"
        if unit_active(unit):
            show = subprocess.run(["systemctl", "--user", "show", unit, "-p", "Environment", "--value"],
                                  capture_output=True, text=True).stdout
            acct = next((x for x in accounts if f"/{x}/claude" in show.split("BENCH_SUMMARIZER")[0]), "?")
            running[unit] = (acct, cid, arm)
            jobs.remove((cid, arm, runs))
    print(f"pace: {len(jobs)} (cut, arm) units to run, {len(running)} adopted", flush=True)
    while jobs or running:
        for unit in [u for u in running if not unit_active(u)]:
            acct, cid, arm = running.pop(unit)
            common.append_jsonl(log, {"at": common.now_iso(), "ended": unit, "cut": cid, "arm": arm, "account": acct})
            print(f"{common.now_iso()} ended {unit}", flush=True)
        load = os.getloadavg()[0]
        if jobs and len(running) < a.max_units and load < a.start_load:
            try:
                rd = readings(a.hub)
            except OSError as e:
                print(f"pace: hub readings failed: {e}", flush=True)
                rd = {}
            inflight = {x: sum(1 for v in running.values() if v[0] == x) for x in accounts}
            score = {x: rd[x]["session"] + a.inflight_weight * inflight[x] for x in accounts
                     if x in rd and rd[x]["weekly"] < a.weekly_cap}
            ok = sorted((s, x) for x, s in score.items()
                        if rd[x]["session"] < a.cap and inflight[x] < a.per_account)
            if ok:
                acct = ok[0][1]
                summ = min((s, x) for x, s in score.items() if x != acct)[1] if len(score) > 1 else acct
                cid, arm, runs = jobs.pop(0)
                unit = f"bench-{cid}-{arm}"
                subprocess.run(["systemctl", "--user", "reset-failed", unit], capture_output=True)
                env = {"PATH": os.environ["PATH"], "CLAUDE_CONFIG_DIR": f"{ACCOUNTS}/{acct}/claude",
                       "BENCH_SUMMARIZER_CONFIG_DIR": f"{ACCOUNTS}/{summ}/claude"}
                for k in ("OPENCODE_ACCOUNT_DIR", "PI_ACCOUNT_DIR"):
                    if os.environ.get(k):
                        env[k] = os.environ[k]
                cmd = ["systemd-run", "--user", "--same-dir", "--unit", unit] + \
                    [x for k, v in env.items() for x in ("-E", f"{k}={v}")] + \
                    ["python3", "-I", "run.py", "--cuts", a.cuts, "--only-cut", cid, "--arms", arm, "--runs", str(runs),
                     "--parallel", str(runs)] + (["--retry-stopped"] if a.retry_stopped else []) + run_flags
                p = subprocess.run(cmd, capture_output=True, text=True)
                if p.returncode != 0:
                    print(f"pace: {unit} did not start: {p.stderr.strip()}", flush=True)
                    jobs.append((cid, arm, runs))
                else:
                    running[unit] = (acct, cid, arm)
                    common.append_jsonl(log, {"at": common.now_iso(), "started": unit, "cut": cid, "arm": arm,
                                              "runs": runs, "account": acct, "summarizer": summ, "load": load,
                                              "readings": {x: rd.get(x) for x in accounts}})
                    print(f"{common.now_iso()} started {unit} on {acct[:8]} (summariser {summ[:8]}), load {load:.1f}, "
                          f"{len(jobs)} left, {len(running)} running", flush=True)
                time.sleep(a.start_gap)  # the load average trails a start: let it show before the next
                continue
        time.sleep(a.poll)
    print("pace: every unit ended", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
