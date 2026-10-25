"""Writes the synthetic fixture the dry run reads (no real session, no real DB):

  session.jsonl       a 60-turn Claude Code transcript of a delegate, with two compact_boundary records: a manual one
                      after turn 20 (preTokens 150,000) and an auto one after turn 40 (preTokens 420,000), each followed
                      by its summary and the next turn's words; 20 turns after the second
  continued-a.jsonl   an orchestrator's 14-turn conversation that ended in a CawCo continuation (last prompt 130k
                      tokens), its last record carrying no timestamp (as Claude Code's `last-prompt` records do)
  continued-b.jsonl   the conversation that went on from it: the CawCo opening, the hub's resume nudge, then 11 owner
                      turns
  midturn.jsonl       a delegate's 30 turns with an auto compaction inside turn 12 (context ~640k)
  moved.jsonl         an orchestrator's 40 turns, moved to another account twice without a new conversation: a
                      same-org move before turn 11 (whose words are the hub's resume nudge) and a cross-org move before
                      turn 26 (the owner's words)
  cawco.sql           the DB rows the bench reads: instances, instance_aliases, instance_conversations, limit_events
                      (moved+compacted, continued, two moves, one under a folded former instance id), turn_usage,
                      usage_limit_history
"{REPO}" stands for the repo the sessions worked in; cuts.py --fixture puts the bench's own repo there.

Usage: python3 -I fixtures/make_fixture.py   (rewrites the files beside it)
"""
import datetime
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
T0 = datetime.datetime(2026, 10, 16, 8, 0, tzinfo=datetime.timezone.utc)
FILES = ["CLAUDE.md", "package.json", "packages/hub/src/continuation.ts", "packages/core/src/usage/pricing.ts"]
TOPICS = ["the continuation opening", "the tail budget TAIL_CHARS_16000", "the pricing snapshot refreshInterval",
          "the artifact index FILES_CHANGED_SHOWN", "the summariser prompt SUMMARY_CAP_TOKENS"]


class Writer:
    def __init__(self, session_id, cwd_role, cwd="{REPO}"):
        self.sid, self.recs, self.parent, self.n = session_id, [], None, 0
        self.ctx = 30_000
        self.cwd = cwd

    def ts(self, minutes):
        return (T0 + datetime.timedelta(minutes=minutes)).strftime("%Y-%m-%dT%H:%M:%S.000Z")

    def add(self, rec, minutes):
        self.n += 1
        uid = f"{self.sid[:8]}-0000-4000-8000-{self.n:012d}"
        base = {"sessionId": self.sid, "cwd": self.cwd, "version": "2.1.301", "gitBranch": "main",
                "userType": "external", "isSidechain": False, "parentUuid": self.parent, "uuid": uid,
                "timestamp": self.ts(minutes)}
        base.update(rec)
        self.recs.append(base)
        self.parent = uid
        return uid

    def usage(self, grow, out):
        u = {"input_tokens": 4, "cache_creation_input_tokens": grow, "cache_read_input_tokens": self.ctx,
             "output_tokens": out, "cache_creation": {"ephemeral_5m_input_tokens": 0, "ephemeral_1h_input_tokens": grow}}
        self.ctx += grow
        return u

    def turn(self, t, minutes, text):
        self.add({"type": "user", "message": {"role": "user", "content": text}}, minutes)
        f = FILES[t % len(FILES)]
        tid = f"toolu_fx_{self.sid[:4]}_{t:03d}"
        self.add({"type": "assistant", "requestId": f"req_{self.sid[:4]}_{t}a", "message": {
            "id": f"msg_{self.sid[:4]}_{t}a", "role": "assistant", "model": "claude-opus-5-5", "stop_reason": "tool_use",
            "content": [{"type": "tool_use", "id": tid, "name": "Read", "input": {"file_path": "{REPO}/" + f}}],
            "usage": self.usage(1500, 80)}}, minutes + 1)
        body = (f"// {f} (fixture excerpt)\n" + f"line about {TOPICS[t % len(TOPICS)]} in {f}\n" * 60)
        self.add({"type": "user", "message": {"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": tid, "content": body, "is_error": False}]}}, minutes + 1)
        cmd_id = f"toolu_fx_{self.sid[:4]}_{t:03d}b"
        content = [{"type": "tool_use", "id": cmd_id, "name": "Bash", "input": {"command": "git status --short"}}]
        if t % 3 == 0:
            content = [{"type": "tool_use", "id": cmd_id, "name": "Edit", "input": {
                "file_path": "{REPO}/compaction-bench/README.md", "old_string": "x", "new_string": "y"}}]
        self.add({"type": "assistant", "requestId": f"req_{self.sid[:4]}_{t}b", "message": {
            "id": f"msg_{self.sid[:4]}_{t}b", "role": "assistant", "model": "claude-opus-5-5", "stop_reason": "tool_use",
            "content": content, "usage": self.usage(900, 60)}}, minutes + 2)
        self.add({"type": "user", "message": {"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": cmd_id, "content": "ok", "is_error": False}]}}, minutes + 2)
        self.add({"type": "assistant", "requestId": f"req_{self.sid[:4]}_{t}c", "message": {
            "id": f"msg_{self.sid[:4]}_{t}c", "role": "assistant", "model": "claude-opus-5-5", "stop_reason": "end_turn",
            "content": [{"type": "text", "text": f"Turn {t}: read {f}; {TOPICS[t % len(TOPICS)]} stays as decided "
                                                 f"(decision D{t:02d}, keep FIXTURE_KEY_{t:02d})."}],
            "usage": self.usage(700, 300)}}, minutes + 3)

    def midturn(self, t, minutes, text, pre):
        """A turn the context overflowed in: a read, then an auto compaction, then the model goes on in the same turn."""
        self.add({"type": "user", "message": {"role": "user", "content": text}}, minutes)
        tid = f"toolu_fx_{self.sid[:4]}_{t:03d}m"
        self.add({"type": "assistant", "requestId": f"req_{self.sid[:4]}_{t}m1", "message": {
            "id": f"msg_{self.sid[:4]}_{t}m1", "role": "assistant", "model": "claude-opus-5-5", "stop_reason": "tool_use",
            "content": [{"type": "tool_use", "id": tid, "name": "Read", "input": {"file_path": "{REPO}/package.json"}}],
            "usage": self.usage(2000, 80)}}, minutes + 1)
        self.add({"type": "user", "message": {"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": tid, "content": "{\"name\": \"cockpit\"}", "is_error": False}]}}, minutes + 1)
        self.boundary(minutes + 2, "auto", pre)
        self.add({"type": "assistant", "requestId": f"req_{self.sid[:4]}_{t}m2", "message": {
            "id": f"msg_{self.sid[:4]}_{t}m2", "role": "assistant", "model": "claude-opus-5-5", "stop_reason": "end_turn",
            "content": [{"type": "text", "text": f"Turn {t}: carried on after the compaction (FIXTURE_KEY_{t:02d})."}],
            "usage": self.usage(900, 200)}}, minutes + 3)

    def boundary(self, minutes, trigger, pre):
        self.add({"type": "system", "subtype": "compact_boundary", "content": "Conversation compacted",
                  "compactMetadata": {"trigger": trigger, "preTokens": pre}, "parentUuid": None}, minutes)
        self.add({"type": "user", "isCompactSummary": True, "isVisibleInTranscriptOnly": True, "message": {
            "role": "user", "content": "This session is being continued from a previous conversation that ran out of "
            "context. The summary below covers the earlier portion of the conversation.\n\nSummary:\n1. Primary Request "
            f"and Intent: fixture work on compaction (summary at {minutes} min, FIXTURE_SUMMARY_{trigger}).\n" +
            "- a summary line long enough to read like a real one (fixture padding).\n" * 450}}, minutes)
        self.ctx = 25_000


# hub server.ts CARRY_ON.limit, verbatim
CARRY_ON = "The usage limit that stopped your last turn no longer applies. Carry on from where you stopped."


def owner(t):
    return (f"Turn {t}: look at {TOPICS[t % len(TOPICS)]} again and keep the decision; the owner's constraint "
            f"OWNER_RULE_{t:02d} holds (no fallbacks).")


def main():
    w = Writer("aaaaaaaa-1111-4111-8111-000000000001", "delegate")
    m = 0
    for t in range(1, 61):
        if t == 21:
            w.boundary(m, "manual", 150_000)
        if t == 41:
            w.boundary(m, "auto", 420_000)
        w.turn(t, m, owner(t))
        m += 6
    write(os.path.join(HERE, "session.jsonl"), w.recs)
    b1_at, b2_at = w.ts(20 * 6), w.ts(40 * 6)

    a = Writer("bbbbbbbb-2222-4222-8222-000000000002", "orchestrator")
    a.ctx = 100_000
    m = 400
    for t in range(1, 15):
        a.turn(t, m, owner(t) + " (orchestrator)")
        m += 6
    a.recs.append({"type": "last-prompt", "lastPrompt": owner(14), "sessionId": a.sid})  # no timestamp
    write(os.path.join(HERE, "continued-a.jsonl"), a.recs)
    a_ended = a.ts(m - 6 + 3)
    last_user = owner(14) + " (orchestrator)"
    b = Writer("cccccccc-3333-4333-8333-000000000003", "orchestrator")
    m += 10
    cont_at = b.ts(m - 2)
    opening = ("Continuing session \"Fixture orchestrator\" (instance inst-fixture-2, claude, claude-opus-5-5, in {REPO}).\n\n"
               "Before acting, run `git status` and `git diff --stat` to confirm the current state; the summary below may be stale.\n\n"
               "## Summary of the session before its last turns\n(fixture summary)\n\n## Artifact index\n- none\n\n"
               "## The last turns, verbatim\n## User\n" + last_user + "\n## Assistant\nTurn 14: done.")
    b.ctx = 20_000
    b.turn(0, m, opening)
    m += 6
    for t in range(15, 27):
        b.turn(t, m, CARRY_ON if t == 15 else owner(t) + " (after the continuation)")
        m += 6
    write(os.path.join(HERE, "continued-b.jsonl"), b.recs)

    # this session worked in a subfolder of its repo, as real ones do: the sandbox must file it under the
    # project dir of that subfolder
    mt = Writer("dddddddd-4444-4444-8444-000000000004", "delegate", cwd="{REPO}/packages/hub")
    mt.ctx = 640_000
    m = 1000
    for t in range(1, 31):
        if t == 12:
            mt.midturn(t, m, owner(t) + " (delegate)", 655_000)
        else:
            mt.turn(t, m, owner(t) + " (delegate)")
        m += 6
    write(os.path.join(HERE, "midturn.jsonl"), mt.recs)

    mv = Writer("eeeeeeee-5555-4555-8555-000000000005", "orchestrator")
    mv.ctx = 160_000
    m, starts = 1400, {}
    for t in range(1, 41):
        starts[t] = m
        mv.turn(t, m, CARRY_ON if t == 11 else owner(t) + " (moved)")
        m += 6
    write(os.path.join(HERE, "moved.jsonl"), mv.recs)
    move_same_at, move_cross_at = mv.ts(starts[11] - 1), mv.ts(starts[26] - 1)

    def ms(ts):
        return int(datetime.datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp() * 1000)
    acct = {"id": "acct-fixture", "name": "fixture", "hue": "blue"}
    other = {"id": "acct-fixture-b", "name": "fixture b", "hue": "green"}
    sql = ["CREATE TABLE instances (id TEXT PRIMARY KEY, machine_id TEXT, session_id TEXT, harness TEXT, account_id TEXT,"
           " parent_instance_id TEXT, cwd TEXT, title TEXT, model TEXT, effort TEXT, kind TEXT);",
           "CREATE TABLE limit_events (id TEXT PRIMARY KEY, instance_id TEXT, at INTEGER, move TEXT);",
           "CREATE TABLE turn_usage (instance_id TEXT, result_id TEXT, model TEXT, account_id TEXT, input_tokens INTEGER,"
           " cache_read_tokens INTEGER, cache_write_tokens INTEGER, cache_write_1h_tokens INTEGER, output_tokens INTEGER,"
           " cost_usd REAL, keep_alive INTEGER, at INTEGER);",
           "CREATE TABLE usage_limit_history (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT, kind TEXT,"
           " scope_label TEXT, percent INTEGER, severity TEXT, resets_at TEXT, fetched_at INTEGER);",
           "CREATE TABLE instance_aliases (id TEXT PRIMARY KEY, instance_id TEXT NOT NULL, folded INTEGER NOT NULL DEFAULT 0);",
           "CREATE TABLE instance_conversations (instance_id TEXT NOT NULL, ord INTEGER NOT NULL, session_id TEXT NOT NULL,"
           " harness TEXT NOT NULL, model TEXT, account_id TEXT, ended_at INTEGER NOT NULL, next_event_id TEXT,"
           " PRIMARY KEY (instance_id, ord));"]
    sql.append("INSERT INTO instances VALUES ('inst-fixture-3','m1','dddddddd-4444-4444-8444-000000000004','claude',"
               "'acct-fixture','inst-fixture-2','{REPO}/packages/hub','Fixture mid-turn delegate','claude-opus-5-5',NULL,'mainline');")
    sql.append("INSERT INTO instances VALUES ('inst-fixture-4','m1','eeeeeeee-5555-4555-8555-000000000005','claude',"
               "'acct-fixture-c',NULL,'{REPO}','Fixture moved orchestrator','claude-opus-5-5','high','mainline');")
    sql.append("INSERT INTO instance_aliases VALUES ('inst-fixture-4-former','inst-fixture-4',1);")
    sql.append(f"INSERT INTO instance_conversations VALUES ('inst-fixture-2',0,'bbbbbbbb-2222-4222-8222-000000000002',"
               f"'claude','claude-opus-5-5','acct-fixture-b',{ms(a_ended)},'ev2');")
    same = {"id": "acct-fixture-c", "name": "fixture c", "hue": "red"}
    for ev, at, frm, to, same_org, inst_id in (("ev3", move_same_at, acct, same, True, "inst-fixture-4"),
                                              ("ev4", move_cross_at, same, other, False, "inst-fixture-4-former")):
        mv_ev = {"kind": "moved", "from": frm, "to": to, "sameOrganization": same_org, "tokens": 180000,
                 "window": "5-hour", "resetsAt": None}
        sql.append(f"INSERT INTO limit_events VALUES ('{ev}','{inst_id}',{ms(at)},'{json.dumps(mv_ev)}');")
    # two events the draw must exclude, so --explain has reasons to show: a continuation no conversation row ends
    # at, and a move after its transcript's end
    orphan = {"kind": "continued", "from": acct, "to": other, "writtenOn": acct, "tokens": 1, "preparedAtPct": None}
    sql.append(f"INSERT INTO limit_events VALUES ('ev5','inst-fixture-1',{ms(b2_at)},'{json.dumps(orphan)}');")
    late = {"kind": "moved", "from": same, "to": acct, "sameOrganization": True, "tokens": 1, "window": None, "resetsAt": None}
    sql.append(f"INSERT INTO limit_events VALUES ('ev6','inst-fixture-4',{ms(mv.ts(m + 600))},'{json.dumps(late)}');")
    sql.append("INSERT INTO instances VALUES ('inst-fixture-1','m1','aaaaaaaa-1111-4111-8111-000000000001','claude',"
               "'acct-fixture','inst-fixture-2','{REPO}','Fixture delegate','claude-opus-5-5',NULL,'mainline');")
    sql.append("INSERT INTO instances VALUES ('inst-fixture-2','m1','cccccccc-3333-4333-8333-000000000003','claude',"
               "'acct-fixture-b',NULL,'{REPO}','Fixture orchestrator','claude-opus-5-5','high','mainline');")
    moved = {"kind": "moved", "compact": "compacted", "from": acct, "to": other, "sameOrganization": False,
             "tokens": 150000, "window": "5-hour", "resetsAt": None}
    sql.append(f"INSERT INTO limit_events VALUES ('ev1','inst-fixture-1',{ms(b1_at) - 60_000},'{json.dumps(moved)}');")
    cont = {"kind": "continued", "from": acct, "to": other, "writtenOn": acct, "tokens": 130000, "preparedAtPct": None}
    sql.append(f"INSERT INTO limit_events VALUES ('ev2','inst-fixture-2',{ms(cont_at)},'{json.dumps(cont)}');")
    # turns on the account (one a 6-minute turn of the delegate), and the manual compaction at b1, warm
    for k in range(40):
        at = ms(w.ts(k * 6 + 3))
        sql.append(f"INSERT INTO turn_usage VALUES ('inst-fixture-1','r{k}','claude-opus-5-5','acct-fixture',4,"
                   f"{60_000 + k * 3000},3100,3100,440,NULL,0,{at});")
    sql.append(f"INSERT INTO turn_usage VALUES ('inst-fixture-1','r-compact','claude-opus-5-5','acct-fixture',3,148000,"
               f"2100,2100,9000,NULL,0,{ms(b1_at) + 20_000});")
    resets = (T0 + datetime.timedelta(hours=5)).isoformat()
    for k, pct in enumerate([5, 9, 14, 20, 27]):
        sql.append(f"INSERT INTO usage_limit_history (account_id,kind,scope_label,percent,severity,resets_at,fetched_at)"
                   f" VALUES ('acct-fixture','session',NULL,{pct},'ok','{resets}',{ms(w.ts(k * 50))});")
    # the account the delegate moved to (ev1) has readings and turns of its own, so its window cost is measured
    for k, pct in enumerate([2, 6, 11]):
        sql.append(f"INSERT INTO usage_limit_history (account_id,kind,scope_label,percent,severity,resets_at,fetched_at)"
                   f" VALUES ('acct-fixture-b','session',NULL,{pct},'ok','{resets}',{ms(w.ts(130 + k * 50))});")
    for k in range(20):
        sql.append(f"INSERT INTO turn_usage VALUES ('inst-fixture-1','rb{k}','claude-opus-5-5','acct-fixture-b',4,"
                   f"{40_000 + k * 3000},3100,3100,440,NULL,0,{ms(w.ts(131 + k * 6))});")
    with open(os.path.join(HERE, "cawco.sql"), "w") as fh:
        fh.write("\n".join(sql) + "\n")


def write(path, recs):
    with open(path, "w") as fh:
        for r in recs:
            fh.write(json.dumps(r) + "\n")


if __name__ == "__main__":
    main()
