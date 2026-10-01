# PLAN: The Ledger Protocol — canonical session streams + acknowledged commands

Root goal: the dashboard becomes a pure view of server-owned truth. Two pillars:
(1) every session has ONE ordered event stream (hub-assigned sequence numbers,
snapshot + gap-free deltas, late-join and reconnect resync), and (2) every
operator action is an acknowledged transaction (commandId, accepted → applied →
failed, surfaced in UI). Grounded in JOURNEY.md: "an empty surface must assert
that the connection is live before it is allowed to claim zero"; the anxiety
force ("misreports a blocked session — false confidence beats no confidence").

Constraint: the RUNNING hub and daemons serve the live fleet and cannot be
restarted by us. Full-stack runtime verification is therefore in-process
(real hub instance on an ephemeral port inside tests, real dashboard store);
the live cutover is restart-gated and stated honestly as such. Legacy paths
remain fully functional (feature-negotiated), so nothing regresses meanwhile.

## Contract (frozen — every leaf builds against this, none may change it)

### Wire types (packages/core/src/stream.ts — Leaf A owns the file)

```ts
/** Capability advertised by a hub that speaks this protocol. */
export const STREAM_V1 = 'stream.v1';

/** One event on a session's canonical stream. seq is hub-assigned,
 *  monotonic per session, starting at 1, NO GAPS ever delivered. */
export interface SessionStreamEvent {
  seq: number;
  sessionId: string;        // instance id, the dashboard's viewId
  frame: unknown;           // the existing relay frame payload, unchanged
}

/** Client -> hub. afterSeq present = resume; absent = join now (hub decides
 *  snapshot vs backlog). */
export interface StreamSubscribe {
  type: 'stream.subscribe';
  sessionId: string;
  afterSeq?: number;
}

/** Hub -> client when it can replay the gap from its ring. Events are
 *  contiguous ascending from afterSeq+1. */
export interface StreamBacklog {
  type: 'stream.backlog';
  sessionId: string;
  events: SessionStreamEvent[];
}

/** Hub -> client when the requested gap is unrecoverable from the ring:
 *  the client must re-read history through the existing read paths, then
 *  follow from `nextSeq`. */
export interface StreamReset {
  type: 'stream.reset';
  sessionId: string;
  nextSeq: number;
}

/** Hub -> client, live fan-out. */
export interface StreamDelta {
  type: 'stream.event';
  event: SessionStreamEvent;
}

/** Client -> hub. kind maps 1:1 onto existing relay operations. */
export interface CommandEnvelope {
  type: 'command';
  commandId: string;        // client-generated, unique per submission
  sessionId: string;
  machineId: string;
  kind: 'send' | 'permission.answer' | 'interrupt'
      | 'set-model' | 'set-permission-mode' | 'set-effort';
  payload: unknown;         // the exact payload today's relay op takes
}

/** Hub -> client. accepted = validated + daemon reachable, dispatched.
 *  applied = daemon confirmed (where the daemon protocol carries a
 *  confirmation today; otherwise the hub emits accepted only and the
 *  stream event that reflects the change is the proof of application).
 *  failed = terminal, with reason. */
export interface CommandAck {
  type: 'command.ack';
  commandId: string;
  stage: 'accepted' | 'applied' | 'failed';
  reason?: string;
}
```

### Behavioural contract

- Hub: per-session monotonic seq counter + ring buffer (RING_SIZE = 512
  events/session). Fan-out wraps the EXISTING per-frame relay — it does not
  re-plumb daemon ingestion. Subscribe with afterSeq within ring → backlog;
  older → reset. Capability handshake, decoupled: the hub adds an optional
  `capabilities?: string[]` (containing STREAM_V1) to whichever EXISTING
  hub→dashboard message a subscriber receives first (Leaf B picks and reports
  the exact message); the store feature-detects DEFENSIVELY — any inbound
  dashboard-socket message carrying a `capabilities` array that includes
  STREAM_V1 flips the flag, so neither leaf depends on the other's choice.
- Dashboard store: when hub advertises STREAM_V1, ingest exclusively via the
  stream (lastSeq tracked per session; on delta seq > lastSeq+1 → re-subscribe
  with afterSeq=lastSeq; on reset → existing history re-read, then follow).
  When the hub is legacy: today's paths byte-for-byte (absorbLive, echoes).
  ONE ingest chokepoint: both paths call the same ingestFrame(sessionId, frame).
- Commands: client generates commandId, sends CommandEnvelope when STREAM_V1,
  falls back to today's relay calls otherwise. Store keeps
  commands: Map<commandId, {kind, stage, at, reason?}>. UI reads stages:
  composer send button (submitted→accepted), settings rows (accepted =
  "Applying…" replacement, failed = failure note), permission cards
  ("Sent." → "Landed." on applied/reflected).
- Nothing in packages/agent changes in this build (daemon is restart-gated
  anyway and its queue/timestamp/ask changes are already pending); 'applied'
  stages derive from confirmations the daemon protocol already returns.

### File ownership (disjoint, per orchestration doctrine)

- Leaf A: packages/core/src/stream.ts (new), packages/core/src/index.ts (export line only)
- Leaf B: packages/hub/src/stream.ts (new), packages/hub/src/server.ts (wiring), packages/hub/src/stream.test.ts (new)
- Leaf C: apps/dashboard/src/lib/cawco/client.svelte.ts, apps/dashboard/src/lib/cawco/client-stream.test.ts (new)
- Leaf D: apps/dashboard/src/lib/cawco/transcript/{Composer,Prompt,SessionHeader}.svelte, SessionPane.svelte
- Leaf E: apps/dashboard/src/lib/cawco/stream-e2e.test.ts (new; may import hub)
- Root (driver): integration gates, commits

## Tree

```
Root: Ledger Protocol
├── A core: wire types                      gates/a-core.md
├── B hub: sequencer + ring + commands      gates/b-hub.md        (after A)
├── C store: stream consumer + tracker     gates/c-store.md      (after A, parallel with B)
├── D ui: command stages surfaced          gates/d-ui.md         (after C)
└── E e2e: in-process full-path proof      gates/e-e2e.md        (after B+C+D)
Root integration gates                      gates/root.md
```

## Status log

- [plan] PLAN.md + 6 gates files written. Fan-out BLOCKED on the in-flight
  queue-observability agent (owns core/hub/client/rows files right now);
  dispatch A when its completion lands.
- [queue-agent] Landed, verified (typecheck 6/6, agent 118/0, hub 50/0,
  dashboard 222/0), committed a1a526b, pushed.
- [leaf A] Done by driver (mechanical transcription of the frozen contract).
  Gates 5/5 with evidence. gate-check regex trap fixed ($-anchor vs trailing
  newline) in a-core G1 and root R4.
- [dispatch] Leaves B (hub) and C (store) fanned out in parallel, opus-5,
  disjoint files per contract.
- [leaf C] Done, parent-verified (ALL MET 6/6; 29/0 stream tests, 251/0 suite,
  typecheck 6/6). Chokepoint ingestFrame at client.svelte.ts:1157. C rewrote
  two unsatisfiable CHECKs (bun prints no per-test lines) onto the junit
  reporter, honesty-probed.
- [leaf B] Done, parent-verified (ALL MET 6/6; hub 78/0, typecheck 6/6).
  Capability rides the instances frame (server.ts:865, sent at socket open
  :2951). Per-kind ack ceilings: send stops at accepted (daemon #send returns
  void); the five control kinds reach applied via control_result. Four real
  defects found+fixed in pass 3 (unsubscribed commander acks, ring memory,
  duplicate permission answers, legacy reply races).
- [protocol gap, v2] No stream.unsubscribe in the frozen contract — closed
  tabs stream until socket close. Bounded; carried to the final report.
- [dispatch] Leaf D (ui) and Leaf E (e2e) running in parallel — disjoint
  files. E carries B's wire-shape notes (RAW stream messages, frame-kind-only
  stream, legacy subtraction semantics) as its primary integration risk.
- [post-root defect] Stream dialect skipped every command's local half (echo/busy/pending/optimistic-set). Found live by the operator minutes after cutover; fixed via StreamEffects on the tracker; 4 regression tests; live-verified on :3000. Root-cause of the gate miss: e2e proved ingestion, not rendering — the 'store consumes' boundary stopped short of the row layer.
