"""The stand-in for CawCo's MCP server inside a benchmark sandbox: a stdio MCP server named "cawco".

It lists every tool the hub lists for the session's role (fixtures/tools.json, made from `cawco tools` by tools_dump.py),
each taking any arguments, so a resumed session finds the same `mcp__cawco__*` names its transcript used. Every call
answers {"recorded": true, "note": "benchmark stand-in"} and is appended to calls.jsonl; nothing reaches the hub.

Transport: MCP stdio, one JSON-RPC message per line.

Usage: python3 -I standin_mcp.py --tools fixtures/tools.json --role orchestrator|delegate --calls <run>/calls.jsonl
"""
import argparse
import json
import sys
import time

ANSWER = {"recorded": True, "note": "benchmark stand-in"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tools", required=True)
    ap.add_argument("--role", required=True)
    ap.add_argument("--calls", required=True)
    a = ap.parse_args()
    catalog = json.load(open(a.tools))
    if a.role not in catalog:
        sys.stderr.write(f"tools file has no role {a.role}\n")
        return 2
    tools = [{"name": t["name"], "description": t.get("description", ""),
              "inputSchema": {"type": "object", "additionalProperties": True}} for t in catalog[a.role]]

    def send(msg):
        sys.stdout.write(json.dumps(msg) + "\n")
        sys.stdout.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except ValueError:
            continue
        mid, method = msg.get("id"), msg.get("method")
        if mid is None:  # a notification
            continue
        if method == "initialize":
            pv = (msg.get("params") or {}).get("protocolVersion") or "2025-06-18"
            send({"jsonrpc": "2.0", "id": mid, "result": {
                "protocolVersion": pv, "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": "cawco", "version": "benchmark-stand-in"}}})
        elif method == "tools/list":
            send({"jsonrpc": "2.0", "id": mid, "result": {"tools": tools}})
        elif method == "tools/call":
            p = msg.get("params") or {}
            with open(a.calls, "a") as fh:
                fh.write(json.dumps({"ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "via": "stand-in mcp",
                                     "tool": p.get("name"), "arguments": p.get("arguments")}) + "\n")
            send({"jsonrpc": "2.0", "id": mid, "result": {
                "content": [{"type": "text", "text": json.dumps(ANSWER)}], "structuredContent": ANSWER}})
        elif method == "ping":
            send({"jsonrpc": "2.0", "id": mid, "result": {}})
        else:
            send({"jsonrpc": "2.0", "id": mid, "error": {"code": -32601, "message": f"no method {method}"}})
    return 0


if __name__ == "__main__":
    sys.exit(main())
