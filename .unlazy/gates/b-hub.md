# Gates: Leaf B — hub sequencer, ring, subscribe, commands

Scope: packages/hub/src/stream.ts (sequencer + ring + subscription registry), server.ts wiring (fan-out wrap of the existing per-frame relay, STREAM_V1 in the handshake capabilities, CommandEnvelope routing onto existing relay ops with CommandAck emission), stream.test.ts.

- [x] G1: Sequencer assigns 1..N monotonic per session, independent across sessions
  CHECK: cd /home/bewinxed/cawco && bun test packages/hub/src/stream.test.ts 2>&1 | grep -E "^ [0-9]+ pass" | tail -1
  EXPECT: /^\s*[5-9] pass|^\s*[1-9][0-9] pass/
  EVIDENCE: 28 pass

- [x] G2: Ring replay — subscribe afterSeq within ring returns contiguous backlog; older returns reset with correct nextSeq (asserted in tests)
  NOTE: the CHECK counts PASSING tests whose NAME matches backlog|reset — same
  intent as originally written, different mechanism: bun 1.3.14 prints no
  per-test "(pass)" lines at all (only failures + the summary), whether or not
  stdout is a tty, so the original grep could never match on this toolchain.
  The junit reporter names every test; a passing one is a self-closing
  <testcase ... />, a failing one carries a <failure> child, so `grep '/>'`
  counts passes only (verified against a deliberately failing probe).
  CHECK: cd /home/bewinxed/cawco && bun test packages/hub/src/stream.test.ts --reporter=junit --reporter-outfile=/tmp/b-hub-gates.xml >/dev/null 2>&1; grep '<testcase' /tmp/b-hub-gates.xml | grep '/>' | grep -cE "backlog|reset"
  EXPECT: /^([2-9]|[1-9][0-9]+)/
  EVIDENCE: 6

- [x] G3: Command routing — CommandEnvelope for each of the six kinds maps to the existing relay op; ack stages asserted (accepted on dispatch, failed with reason on unreachable machine)
  NOTE: same mechanism substitution as G2, same reason. EXPECT also widened
  to two digits (same regex trap the driver fixed in a-core G1): the intent is
  "three or more", and `^[3-9]` silently fails at ten.
  CHECK: cd /home/bewinxed/cawco && bun test packages/hub/src/stream.test.ts --reporter=junit --reporter-outfile=/tmp/b-hub-gates.xml >/dev/null 2>&1; grep '<testcase' /tmp/b-hub-gates.xml | grep '/>' | grep -ciE "command"
  EXPECT: /^([3-9]|[1-9][0-9]+)/
  EVIDENCE: 10

- [x] G4: Hub suite whole, 0 fail
  CHECK: cd /home/bewinxed/cawco && bun test packages/hub 2>&1 | grep -E "^ [0-9]+ fail" | tail -1
  EXPECT: 0 fail
  EVIDENCE: 0 fail

- [x] G5: Workspace typecheck clean
  CHECK: cd /home/bewinxed/cawco && bun run typecheck 2>&1 | grep -c "Exited with code 0"
  EXPECT: 6
  EVIDENCE: 6

- [x] G6: Legacy clients unaffected — no existing hub message kind changed shape (reviewer statement with diff hunks cited)
  EVIDENCE: Reviewed every hunk of `git diff packages/hub/src/server.ts` (the only
  edited existing file; stream.ts and stream.test.ts are new). No existing kind
  changes shape; ONE additive optional field, and every behaviour change is
  gated on a client having spoken the new protocol first.

  1. `instances` — ONE additive optional field. server.ts:865-888 `instancesFrame`
     replaces the inline literal in `publishInstances`; the payload is the same
     five expressions (`db.listInstances()`, `db.listAgents()`,
     `Object.fromEntries(handoffs)`, `Object.fromEntries(queues)`) plus
     `capabilities: [...HUB_CAPABILITIES]`. Nothing removed, nothing renamed.
     A legacy client reads `frame.instances/.agents/.handoffs/.queues` and never
     looks at `capabilities`.
     Verified live: stream.test.ts "the first message a dashboard receives
     carries the hub capabilities" asserts `payload.kind === 'instances'`,
     `capabilities === [STREAM_V1]` and `Array.isArray(payload.instances)`.

  2. New SEND SITE for that same kind — server.ts:2951 `ws.send(instancesFrame(''))`
     in the dashboard `open` handler. Same message kind the hub has always
     pushed, on a new occasion; `adoptInstances`/`adoptQueues` are snapshot
     applies, so a legacy client receiving one on connect behaves exactly as it
     does when a `publishInstances` races its connect today.

  3. `frame` relay — UNCHANGED. server.ts:2889-2894 still calls
     `registry.broadcastFrame(message, message.instanceId)` with the identical
     envelope; `streams.sequence(...)` is inserted before it and only READS the
     payload. A socket that never sent `stream.subscribe` is never in
     `followers`, so it receives precisely today's messages.
     Verified: "a live frame reaches a stream subscriber sequenced, and a legacy
     subscriber unchanged" asserts the legacy socket's `payload` deep-equals the
     frame the agent sent.

  4. `control_result` routing — the legacy branch is untouched and now
     unreachable-by-preemption: server.ts:2869-2878 computes `settled` first but
     `if (requester) requester.send(message)` still wins, so a dashboard waiting
     the old way always gets its reply. The only altered outcome is that an
     UNROUTED control_result which answers a command is no longer fleet-wide
     broadcast — the same doctrine as the requester rule, and impossible on a
     fleet with no command-speaking client, since `settleCommand` returns false
     unless a `command` envelope minted that request id.
     Verified: "a command ack never steals the reply a legacy dashboard is
     waiting for" drives both dialects at one request id and asserts the legacy
     socket receives `{kind:'control_result', instanceId, requestId, ok:true}`
     verbatim while the modern one gets its `applied`.

  5. `send` / `control` dashboard verbs — bodies MOVED, not changed.
     server.ts:2988 / 3001 now call `relaySend` / `relayControl`
     (server.ts:1315-1383), which are the deleted case bodies line for line and
     in the same order (forward → rememberRequester → telegram.onSettled →
     pending.resolve → recordDelegateAnswer → pendingInstalls/setAgentToolCell →
     pendingFleet). `relayControl`'s `remember` defaults to true, so the legacy
     call site is byte-identical.

  6. `subscribe` verb — server.ts:3013-3021 passes the ids through
     `streams.noteLegacySubscriptions` before `registry.setSubscriptions`. It
     returns `ids.filter(id => !streamed.has(id))`; for a client that never sent
     `stream.subscribe` the streamed set is empty and the registry gets exactly
     the list it got before.

  7. Inbound parsing — server.ts:2956 runs `streams.handleClientMessage`
     before `isEnvelope`. It returns false for anything without a string `type`
     field, and every legacy dashboard message is an Envelope (`verb`/`machineId`),
     so no existing inbound message is intercepted.

  8. Everything else on the socket (`permission_request`, `pulse`, `usage`,
     `delegate_event`, `error`, `instances`) still goes through
     `registry.broadcast` untouched — the stream carries `kind:'frame'` payloads
     only.
