"""The stand-in's tool list for one role, from the hub's own `cawco tools` (one `name<TAB>description` line per tool).

Usage (on the host, once per role, against a live session of that role):
  python3 -I compaction-bench/tools_dump.py --role orchestrator --session <orchestrator instance id> --out out/tools.json
  python3 -I compaction-bench/tools_dump.py --role delegate --session <delegate instance id> --out out/tools.json
Each run replaces its role's list in --out and keeps the other's.
"""
import argparse
import json
import os
import subprocess
import sys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--role", required=True, choices=["orchestrator", "delegate"])
    ap.add_argument("--session", help="the instance whose role's tools are listed (default: CAWCO_INSTANCE_ID)")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    cmd = ["cawco", "tools"] + (["--session", a.session] if a.session else [])
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if p.returncode != 0:
        sys.stderr.write(f"{' '.join(cmd)} exited {p.returncode}: {p.stderr.strip()}\n")
        return 1
    tools = [{"name": n, "description": d} for n, _, d in (ln.partition("\t") for ln in p.stdout.splitlines()) if n.strip()]
    if not tools:
        sys.stderr.write("cawco tools listed nothing\n")
        return 1
    current = json.load(open(a.out)) if os.path.exists(a.out) else {}
    current[a.role] = tools
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, "w") as fh:
        json.dump(current, fh, indent=1)
    print(f"{a.role}: {len(tools)} tools → {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
