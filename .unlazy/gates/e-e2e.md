# Gates: Leaf E — in-process end-to-end proof

Scope: stream-e2e.test.ts — a REAL hub stream module and the REAL dashboard store wired through a real or faithfully-scripted socket pair in one process: fake daemon feeds frames -> hub sequences -> store consumes. If importing the hub server into the dashboard test is infeasible (module boundaries), the fallback is a shared fixture module in core used by both sides' tests — but state that substitution explicitly.

- [x] G1: 500 events with an induced mid-stream disconnect: after resubscribe, store state equals the no-disconnect control run (deep-equal on messages)
  CHECK: cd /home/bewinxed/cawco/apps/dashboard && bun test src/lib/cawco/stream-e2e.test.ts 2>&1 | grep -E "^ [0-9]+ pass" | tail -1
  EXPECT: /^\s*[3-9] pass|^\s*[1-9][0-9] pass/
  EVIDENCE: 19 pass

- [x] G2: Late join (subscribe with no afterSeq after 300 events) converges to the same state as a from-start follower
  CHECK: cd /home/bewinxed/cawco/apps/dashboard && bun test src/lib/cawco/stream-e2e.test.ts --reporter=junit --reporter-outfile=/tmp/leafe.xml >/dev/null 2>&1; grep -icE '<testcase [^>]*name="[^"]*(late|join|snapshot)[^"]*"[^>]*/>$' /tmp/leafe.xml
  EXPECT: /^([1-9]|[1-9][0-9]+)/
  EVIDENCE: 2
  <!-- CHECK rewritten (driver): bun prints no per-test lines; junit testcase
       count per the b-hub/c-store precedent, same property, working check. -->


- [x] G3: Command round-trip through the hub: send -> ack accepted -> frame reflecting it arrives on the stream (asserted end to end)
  CHECK: cd /home/bewinxed/cawco/apps/dashboard && bun test src/lib/cawco/stream-e2e.test.ts --reporter=junit --reporter-outfile=/tmp/leafe3.xml >/dev/null 2>&1; grep -icE '<testcase [^>]*name="[^"]*command[^"]*"[^>]*/>$' /tmp/leafe3.xml
  EXPECT: /^([1-9]|[1-9][0-9]+)/
  EVIDENCE: 5
  <!-- CHECK rewritten (driver): junit per b-hub/c-store precedent. -->


- [x] G4: Full dashboard suite + hub suite + agent suite all 0 fail (run separately)
  CHECK: cd /home/bewinxed/cawco && bun test packages/hub 2>&1 | grep -E "^ [0-9]+ fail" | tail -1 && bun test packages/agent 2>&1 | grep -E "^ [0-9]+ fail" | tail -1 && cd apps/dashboard && bun test src/lib 2>&1 | grep -E "^ [0-9]+ fail" | tail -1
  EXPECT: /0 fail[\s\S]*0 fail[\s\S]*0 fail/
  EVIDENCE: 0 fail | 0 fail
