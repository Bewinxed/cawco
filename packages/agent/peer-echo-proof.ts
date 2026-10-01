/**
 * Measurement proof for the peer-frame double-render hypothesis. Drives the real
 * claude harness in isolation — its own scratch git dir, its own session, no
 * hub/daemon/dashboard involved — and records every neutral frame the harness
 * emits, then counts the frames that would map to a `user.peer` bubble in the
 * dashboard (type==='user' AND origin?.kind==='peer' AND non-empty text) and
 * dumps the full frame stream so an SDK replay (a `user` frame with a uuid /
 * `isReplay`) would be visible if it existed.
 *
 * Scenarios, in order:
 *   A  querying opening prompt (peer origin, no shouldQuery) — the delegate spawn.
 *   B  queued hand-off (shouldQuery:false) sent while the session is IDLE —
 *      the supervisor's "wake" path, which converts it back to a querying turn.
 *   C  urgent peer message injected mid-turn via streamInput (the A2 probe).
 *   D  queued hand-off (shouldQuery:false) sent while the session is BUSY.
 *
 * Measured result (SDK 0.3.220): every scenario emits exactly ONE peer frame —
 * the daemon echo in `claude.ts send()` (uuid=<none>). The SDK replays nothing:
 * no `user` frame with a uuid and no `isReplay` frame appears for any send, so
 * the "rely on the SDK replay" reading of the hand-off echo is false.
 *
 * Run with `bun peer-echo-proof.ts`. Prints a DIAG line per peer-mappable frame.
 */

import type { NeutralMessage } from "@cawco/core";
import type { HarnessContext, HarnessSession } from "./src/harness";
import { claudeHarness } from "./src/harnesses/claude";

const PROOF_DIR = "/tmp/peer-echo-proof";

await Bun.$`rm -rf ${PROOF_DIR}`.quiet().nothrow();
await Bun.$`mkdir -p ${PROOF_DIR}`.quiet();
await Bun.$`git -C ${PROOF_DIR} init`.quiet().nothrow();

const frames: NeutralMessage[] = [];
let session: HarnessSession | null = null;
const failures: string[] = [];

const ctx: HarnessContext = {
  instanceId: "peer-echo-proof",
  cwd: PROOF_DIR,
  frame: (message) => {
    frames.push(message);
  },
  permission: (request) => {
    setTimeout(() => {
      session?.resolvePermission(request.requestId, { behavior: "allow" });
    }, 100);
  },
  busy: () => {
    // no-op: this proof doesn't assert on busy transitions
  },
  session: () => {
    // no-op: this proof doesn't assert on the session callback
  },
  failed: (error) => {
    failures.push(`failed(): ${String(error)}`);
  },
  emit: () => {
    // no-op: this proof doesn't assert on raw frame emission
  },
  closed: () => {
    // no-op: this proof doesn't assert on close
  },
};

const PEER = {
  kind: "peer",
  from: "parent-1",
  name: "parent",
  fromSession: "parent-1",
} as const;

const peerMessage = (
  content: string,
  extra: { shouldQuery?: boolean } = {}
) => ({
  type: "user" as const,
  message: { role: "user" as const, content },
  parent_tool_use_id: null,
  origin: { ...PEER },
  ...extra,
});

/** The dashboard's structural peer test, mirrored here. */
function peerText(m: NeutralMessage): string | null {
  if (m.type !== "user") {
    return null;
  }
  const { origin } = m as { origin?: { kind?: string } };
  if (origin?.kind !== "peer") {
    return null;
  }
  const { content } = m.message;
  let text: string;
  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content)) {
    text = content
      .filter((b) => (b as { type?: string }).type === "text")
      .map((b) => String((b as { text?: unknown }).text ?? ""))
      .join("\n");
  } else {
    text = "";
  }
  return text.trim() ? text : null;
}

function peerFrames(from: number): NeutralMessage[] {
  return frames.slice(from).filter((f) => peerText(f) !== null);
}

function diag(label: string, from: number): number {
  const peers = peerFrames(from);
  console.log(`DIAG ${label}: ${peers.length} peer-mappable frame(s)`);
  for (const f of peers) {
    const shape = f as unknown as {
      uuid?: string;
      isReplay?: boolean;
      origin?: { kind?: string; from?: string; name?: string };
    };
    console.log(
      `DIAG ${label} frame: uuid=${shape.uuid ?? "<none>"} isReplay=${shape.isReplay ?? false} ` +
        `origin=${JSON.stringify(shape.origin)} text=${JSON.stringify((peerText(f) ?? "").slice(0, 50))}`
    );
  }
  return peers.length;
}

/** Every frame in the slice, with its type/subtype — the full-stream probe. */
function dumpAll(label: string, from: number): void {
  for (const f of frames.slice(from)) {
    const shape = f as unknown as {
      type?: string;
      subtype?: string;
      uuid?: string;
      isReplay?: boolean;
      origin?: { kind?: string };
      message?: { type?: string; role?: string };
    };
    const inner =
      shape.type === "raw"
        ? ` raw.inner.type=${shape.message?.type ?? "?"}`
        : "";
    console.log(
      `DIAG ${label} frame: type=${shape.type} subtype=${shape.subtype ?? "-"} ` +
        `uuid=${shape.uuid ?? "<none>"} isReplay=${shape.isReplay ?? false} ` +
        `origin=${JSON.stringify(shape.origin)}${inner}`
    );
  }
}

function waitForResult(
  sinceIndex: number,
  timeoutMs: number
): Promise<boolean> {
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      if (frames.slice(sinceIndex).some((f) => f.type === "result")) {
        return resolve(true);
      }
      if (Date.now() - started >= timeoutMs) {
        return resolve(false);
      }
      setTimeout(tick, 200);
    };
    tick();
  });
}

function waitForFrame(
  sinceIndex: number,
  predicate: (slice: NeutralMessage[]) => boolean,
  timeoutMs: number
): Promise<boolean> {
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      if (predicate(frames.slice(sinceIndex))) {
        return resolve(true);
      }
      if (Date.now() - started >= timeoutMs) {
        return resolve(false);
      }
      setTimeout(tick, 200);
    };
    tick();
  });
}

const TIMEOUT = 180_000;

const spawned = await claudeHarness.spawn(
  { instanceId: "peer-echo-proof", cwd: PROOF_DIR, persistSession: false },
  ctx
);
if (!spawned) {
  console.error("spawn returned no session");
  process.exit(2);
}
session = spawned;

const counts: Record<string, number> = {};

// ---- A: querying opening prompt (delegate spawn) ----
{
  const start = frames.length;
  session.send(
    peerMessage(
      "PEER-OPENING: reply with exactly OPENING-ACK and nothing else."
    ),
    {}
  );
  const got = await waitForResult(start, TIMEOUT);
  console.log(`DIAG A: result frame arrived = ${got}`);
  dumpAll("A", start);
  counts.A = diag("A-querying-opening", start);
  if (failures.length) {
    console.log(`DIAG A failed(): ${failures.join(" | ")}`);
  }
}

// ---- B: queued hand-off while IDLE (wake path) ----
{
  const start = frames.length;
  session.send(
    peerMessage(
      "PEER-QUEUED-IDLE: reply with exactly QUEUED-ACK and nothing else.",
      {
        shouldQuery: false,
      }
    ),
    {}
  );
  const got = await waitForResult(start, TIMEOUT);
  console.log(`DIAG B: result frame arrived = ${got}`);
  dumpAll("B", start);
  counts.B = diag("B-queued-idle", start);
}

// ---- C: urgent peer message injected mid-turn (A2 probe) ----
{
  const start = frames.length;
  session.send(
    {
      type: "user",
      message: {
        role: "user",
        content: "Count from 1 to 400 in English words, one per line.",
      },
    },
    {}
  );
  const busy = await waitForFrame(
    start,
    (slice) => slice.some((f) => f.type === "stream_event"),
    60_000
  );
  console.log(`DIAG C: busy turn streaming = ${busy}`);
  const startU = frames.length;
  session.send(
    peerMessage(
      "PEER-URGENT: stop counting and reply with exactly URGENT-ACK."
    ),
    { urgent: true }
  );
  const got = await waitForResult(startU, TIMEOUT);
  console.log(`DIAG C: result frame arrived = ${got}`);
  dumpAll("C", startU);
  counts.C = diag("C-urgent", startU);
}

// ---- D: queued hand-off while BUSY (the case the daemon echo is for) ----
{
  const start = frames.length;
  session.send(
    {
      type: "user",
      message: {
        role: "user",
        content: "Count from 1 to 400 in English words, one per line.",
      },
    },
    {}
  );
  const busy = await waitForFrame(
    start,
    (slice) => slice.some((f) => f.type === "stream_event"),
    60_000
  );
  console.log(`DIAG D: busy turn streaming = ${busy}`);
  const startQ = frames.length;
  session.send(
    peerMessage("PEER-QUEUED-BUSY: this must not start a turn of its own.", {
      shouldQuery: false,
    }),
    {}
  );
  // The queued append is silent on the SDK side; wait briefly for any echo frame.
  const echoed = await waitForFrame(
    startQ,
    (_slice) => peerFrames(startQ).length > 0,
    10_000
  );
  console.log(`DIAG D: queued echo observed = ${echoed}`);
  dumpAll("D", startQ);
  counts.D = diag("D-queued-busy", startQ);
  await session.interrupt().catch(() => {
    // best effort: the test proceeds either way
  });
  await waitForResult(startQ, 60_000);
}

console.log(`COUNTS ${JSON.stringify(counts)}`);

const assertCount = (label: string, expected: number): void => {
  const actual = counts[label];
  const ok = actual === expected;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${label}: expected ${expected}, got ${actual}`
  );
  if (!ok) {
    console.log(
      `DIAG ${JSON.stringify({ assertion: label, expected, actual })}`
    );
    failures.push(`${label}: expected ${expected}, got ${actual}`);
  }
};

// The opening prompt, the idle queued hand-off, and the busy queued hand-off
// each produce exactly one peer bubble (the daemon echo). Gating the echo on
// "SDK stays silent" would drop the frame for A and B — there is no SDK replay
// to fall back on — so the invariant asserted here is one, not zero.
assertCount("A", 1);
assertCount("B", 1);
assertCount("D", 1);
// C is reported, not gated: its expectation follows from the A2 measurement.
console.log(`DIAG ${JSON.stringify({ urgentCount: counts.C })}`);

await session.stop().catch(() => {
  // best effort: the process exits either way
});

if (failures.length) {
  console.log(`peer-echo-proof: FAIL ${failures.join("; ")}`);
  process.exit(1);
}
console.log("peer-echo-proof: all PASS");
process.exit(0);
