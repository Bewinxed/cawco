# Gates: Leaf C — dashboard store stream consumer + command tracker

Scope: client.svelte.ts — capability-negotiated stream ingestion (lastSeq per session, gap detection -> resubscribe, reset -> existing re-read path), single ingestFrame chokepoint for BOTH stream and legacy paths, command tracker map keyed by commandId with stages, command submission path that wraps the existing relay calls. client-stream.test.ts proves it against a scripted socket.

- [x] G1: Ordered delivery applies frames exactly once; a 500-event scripted stream yields no dupes and no holes (assert message count and seq continuity)
  CHECK: cd /home/bewinxed/cawco/apps/dashboard && bun test src/lib/cawco/client-stream.test.ts 2>&1 | grep -E "^ [0-9]+ pass" | tail -1
  EXPECT: /^\s*[6-9] pass|^\s*[1-9][0-9] pass/
  EVIDENCE: 29 pass

  NOTE (G2/G3 CHECK rewritten, same property): the original checks grepped bun's console
  output for a per-test "(pass)" line. bun 1.3.14 prints no per-test lines at all — only
  failures and the summary — verified both piped and under a TTY (`script -qc`), so those
  checks could never match. They now assert the same thing through bun's junit reporter,
  where a PASSING testcase is a self-closing `<testcase ... />` and a failing one wraps a
  `<failure>` child. Probed for honesty: a scratch file with one passing and one failing
  test both named "gap …" counts 1, not 2.

- [x] G2: Gap handling — delta with seq gap triggers a resubscribe carrying afterSeq=lastSeq; backlog heals; reset falls back to re-read then follows (all asserted)
  CHECK: cd /home/bewinxed/cawco/apps/dashboard && bun test src/lib/cawco/client-stream.test.ts --reporter=junit --reporter-outfile=/tmp/leafc.xml >/dev/null 2>&1; grep -icE '<testcase [^>]*name="[^"]*(gap|resubscribe|reset)[^"]*"[^>]*/>$' /tmp/leafc.xml
  EXPECT: /^([2-9]|[1-9][0-9]+)/
  EVIDENCE: 9
  DETAIL: gap applies nothing and resubscribes at afterSeq=lastSeq; a 36-delta burst past
  one gap sends exactly ONE resubscribe and buffers nothing; a backlog heals in order and
  live deltas follow; a replayed backlog after a retried resume does not double a turn; a
  non-contiguous backlog warns once, keeps its contiguous prefix and re-asks from there;
  three failed heals escalate to a history re-read instead of looping; reset re-reads and
  follows from nextSeq with deltas racing it; a second reset re-reads again.

- [x] G3: Command tracker — submitted command reaches accepted/applied/failed stages from acks; stages readable from the store (asserted)
  CHECK: cd /home/bewinxed/cawco/apps/dashboard && bun test src/lib/cawco/client-stream.test.ts --reporter=junit --reporter-outfile=/tmp/leafc.xml >/dev/null 2>&1; grep -icE '<testcase [^>]*name="[^"]*(command|ack)[^"]*"[^>]*/>$' /tmp/leafc.xml
  EXPECT: /^([2-9]|[1-9][0-9]+)/
  EVIDENCE: 14
  DETAIL: envelope on the wire and stage 'submitted'; acks walk submitted -> accepted ->
  applied, read back through latestCommand(); a failed ack carries its reason and no later
  ack resurrects it; an ack for another tab's command is not recorded; on a legacy hub the
  existing call's own promise IS the stage (sync -> accepted, resolved -> applied,
  throw/reject -> failed); an unsendable command fails at once; a dropped socket calls
  unanswered commands off; an unacknowledged command times out; the tracker is capped.

- [x] G4: Legacy path byte-compatible — with no STREAM_V1 capability, ingestion, absorbLive and echoes behave exactly as today (existing suite is the proof)
  CHECK: cd /home/bewinxed/cawco/apps/dashboard && bun test src/lib 2>&1 | grep -E "^ [0-9]+ fail" | tail -1
  EXPECT: 0 fail
  EVIDENCE: 0 fail

- [x] G5: Workspace typecheck clean
  CHECK: cd /home/bewinxed/cawco && bun run typecheck 2>&1 | grep -c "Exited with code 0"
  EXPECT: 6
  EVIDENCE: 6

- [x] G6: One chokepoint — stream and legacy ingestion converge on one shared frame-apply function (name it; cite the two call sites by line)
  EVIDENCE: chokepoint = ingestFrame(sessionId, frame, source) at client.svelte.ts:1157, delegating to the existing apply handleFrame(frame) at :1163. STREAM call site client.svelte.ts:1171 (streamHost.applyFrame, unwrapped SessionStreamEvent.frame). LEGACY call site client.svelte.ts:1544 (bind() socket.onmessage, verb:'frames' envelope.payload).
  DETAIL: handleFrame (client.svelte.ts:791) remains the single place a frame becomes
  state, so the two internal replay paths — the /api/pending replay at :720 and replayHeld
  at :2577 — share it too. The only asymmetry between the two socket paths is the
  duplicate guard: a legacy frame is dropped when the stream has already been observed
  carrying that kind for that session (streamCarries), which is what stops a hub that
  sends both copies from doubling every turn.
