/**
 * Proof that packages/agent/src/harnesses/opencode.ts drives a real opencode
 * server. Boots its own server on a random port (never 3456, never a live
 * service), runs nine turns against the Flash test model, and asserts the
 * neutral frames the harness folds. Run with `bun opencode-proof.ts`.
 */

import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NeutralMessage, SpawnPayload } from "@cawco/core";
import type { Harness, HarnessContext, HarnessSession } from "./src/harness";
import { OpencodeHarness } from "./src/harnesses/opencode";

const PROOF_DIR = join(tmpdir(), "opencode-proof-dir");

// --- setup: a scratch git dir, so opencode's bash tool has a cwd to touch ---
await Bun.$`mkdir -p ${PROOF_DIR}`.quiet();
const init = await Bun.$`git -C ${PROOF_DIR} init`.quiet().nothrow();
if (init.exitCode !== 0) {
  console.warn(`git init exited ${init.exitCode}`);
}

const harness: Harness = new OpencodeHarness();

// --- the fake HarnessContext ---
const frames: NeutralMessage[] = [];
const permissionRequests: { requestId: string; toolName: string }[] = [];
const busyTransitions: boolean[] = [];
const failedCalls: unknown[] = [];
const sessionIds: string[] = [];
let session: HarnessSession | null = null;
/** tool_use callIDs seen in Test B, shared with the transcript check. */
let callIdsB: string[] = [];

const ctx: HarnessContext = {
  instanceId: "proof",
  cwd: PROOF_DIR,
  frame: (message) => {
    frames.push(message);
  },
  permission: (request) => {
    permissionRequests.push({
      requestId: request.requestId,
      toolName: request.toolName,
    });
    // Auto-answer, off the caller's stack, so the turn proceeds: plain allow for
    // tool permissions, a fixed answer for a question the model is prompted to ask.
    const result =
      request.requestKind === "question"
        ? {
            behavior: "allow" as const,
            updatedInput: { answers: { "Which color?": ["Blue"] } },
          }
        : { behavior: "allow" as const };
    setTimeout(
      () => session?.resolvePermission(request.requestId, result),
      100
    );
  },
  busy: (active) => {
    busyTransitions.push(active);
  },
  session: (sessionId) => {
    sessionIds.push(sessionId);
  },
  failed: (error) => {
    failedCalls.push(error);
  },
  emit: () => {
    // no-op: this proof doesn't assert on raw frame emission
  },
  closed: () => {
    // no-op: this proof doesn't assert on close
  },
};

// --- helpers ---
let assertions = 0;
let failures = 0;

function record(name: string, pass: boolean, detail?: string): void {
  assertions += 1;
  if (pass) {
    console.log(`PASS ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
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

/** Waits until some frame in the slice satisfies `predicate`. */
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

/** Waits for a result frame in a caller-supplied frame array (Tests I/J). */
function waitForResultIn(
  own: NeutralMessage[],
  sinceIndex: number,
  timeoutMs: number
): Promise<boolean> {
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      if (own.slice(sinceIndex).some((f) => f.type === "result")) {
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

/** A second, isolated fake ctx for the extra-session tests (I/J). */
function makeCtx(cwd: string, instanceId: string) {
  const ownFrames: NeutralMessage[] = [];
  const holder: { session: HarnessSession | null } = { session: null };
  const isolatedCtx: HarnessContext = {
    instanceId,
    cwd,
    frame: (message) => {
      ownFrames.push(message);
    },
    permission: (request) => {
      setTimeout(
        () =>
          holder.session?.resolvePermission(request.requestId, {
            behavior: "allow",
          }),
        100
      );
    },
    busy: () => {
      // no-op: tests I/J don't assert on busy transitions
    },
    session: () => {
      // no-op: tests I/J don't assert on the session callback
    },
    failed: () => {
      // no-op: tests I/J don't assert on failed calls
    },
    emit: () => {
      // no-op: this proof doesn't assert on raw frame emission
    },
    closed: () => {
      // no-op: this proof doesn't assert on close
    },
  };
  return { ctx: isolatedCtx, frames: ownFrames, holder };
}

/** Flattened text of an assistant frame's `text` blocks. */
function textOf(frame: NeutralMessage): string {
  if (frame.type !== "assistant") {
    return "";
  }
  return frame.message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

/** Every `tool_use` id across a frame slice, in order. */
function toolUseIds(slice: NeutralMessage[]): string[] {
  const ids: string[] = [];
  for (const frame of slice) {
    if (frame.type !== "assistant") {
      continue;
    }
    for (const block of frame.message.content) {
      if (block.type === "tool_use") {
        ids.push(block.id);
      }
    }
  }
  return ids;
}

/** Every `tool_result` tool_use_id across a frame slice. */
function toolResultIds(slice: NeutralMessage[]): string[] {
  const ids: string[] = [];
  for (const frame of slice) {
    if (frame.type !== "user") {
      continue;
    }
    const { content } = frame.message;
    if (typeof content === "string") {
      continue;
    }
    for (const block of content) {
      if (block.type === "tool_result") {
        ids.push(block.tool_use_id);
      }
    }
  }
  return ids;
}

// --- spawn ---
session = await harness.spawn(
  {
    instanceId: "proof",
    cwd: PROOF_DIR,
    model: "opencode-go/deepseek-v4-flash",
  } as SpawnPayload,
  ctx
);
if (!session) {
  console.error("spawn returned no session");
  process.exit(1);
}

// ============================== Test A (text) ==============================
{
  const startA = frames.length;
  session.send(
    {
      type: "user",
      message: {
        role: "user",
        content: "Reply with exactly PROOF-OK and nothing else.",
      },
    },
    {}
  );
  const gotA = await waitForResult(startA, 120_000);
  const sliceA = frames.slice(startA);

  record("A: got a result frame", gotA);

  record(
    "A: at least one stream_event frame",
    sliceA.some((f) => f.type === "stream_event")
  );

  const finalWithProof = sliceA.filter(
    (f) =>
      f.type === "assistant" &&
      typeof f.uuid === "string" &&
      textOf(f).includes("PROOF-OK")
  );
  record(
    "A: exactly one final assistant frame with PROOF-OK",
    finalWithProof.length === 1,
    `found ${finalWithProof.length}`
  );

  record(
    "A: no user-text leak into an assistant frame",
    !sliceA.some(
      (f) =>
        f.type === "assistant" &&
        textOf(f).includes("Reply with exactly PROOF-OK")
    )
  );

  const firstTrue = busyTransitions.indexOf(true);
  const lastFalse = busyTransitions.lastIndexOf(false);
  record(
    "A: busy went true then false",
    firstTrue !== -1 && lastFalse !== -1 && firstTrue < lastFalse
  );
}

// ======================= Test B (tool + permission) ========================
{
  const startB = frames.length;
  const permBefore = permissionRequests.length;
  session.send(
    {
      type: "user",
      message: {
        role: "user",
        content:
          "Run the shell command `ls` with your bash tool and tell me one filename.",
      },
    },
    {}
  );
  const gotB = await waitForResult(startB, 120_000);
  const sliceB = frames.slice(startB);

  record("B: got a result frame", gotB);

  record(
    "B: at least one permission request arrived",
    permissionRequests.length > permBefore,
    `got ${permissionRequests.length - permBefore}`
  );

  const idsB = toolUseIds(sliceB);
  callIdsB = idsB;
  record(
    "B: exactly one tool_use frame per callID",
    idsB.length === new Set(idsB).size,
    `ids ${JSON.stringify(idsB)}`
  );

  const resultIdsB = new Set(toolResultIds(sliceB));
  record(
    "B: a matching tool_result exists",
    idsB.every((id) => resultIdsB.has(id)),
    `missing ${JSON.stringify(idsB.filter((id) => !resultIdsB.has(id)))}`
  );

  record(
    "B: a final assistant text frame exists",
    sliceB.some(
      (f) =>
        f.type === "assistant" &&
        typeof f.uuid === "string" &&
        textOf(f).trim().length > 0
    )
  );
}

// =========================== Test C (interrupt) ============================
{
  const startC = frames.length;
  const failedBefore = failedCalls.length;
  session.send(
    {
      type: "user",
      message: {
        role: "user",
        content: "Count from 1 to 500 in English words, one per line.",
      },
    },
    {}
  );
  await Bun.sleep(3000);
  await session.interrupt();
  const gotC = await waitForResult(startC, 30_000);

  record("C: result frame arrived within 30s after interrupt", gotC);

  record(
    "C: failed() was never called during this test",
    failedCalls.length === failedBefore
  );

  record(
    "C: busy ended false",
    busyTransitions.length > 0 && busyTransitions.at(-1) === false
  );
}

// ============================ Test D (transcript) ===========================
{
  const transcript = await harness.getSessionMessages(
    // biome-ignore lint/style/noNonNullAssertion: a spawn that reached this point always carries a sessionId
    session.sessionId!,
    PROOF_DIR
  );
  const callIds = new Set(callIdsB);

  let foundUse = false;
  let foundResult = false;
  for (const entry of transcript) {
    const message = entry.message as { content?: unknown[] };
    if (!Array.isArray(message.content)) {
      continue;
    }
    for (const raw of message.content) {
      const block = raw as { type?: string; id?: string; tool_use_id?: string };
      if (block.type === "tool_use" && block.id && callIds.has(block.id)) {
        foundUse = true;
      }
      if (
        block.type === "tool_result" &&
        block.tool_use_id &&
        callIds.has(block.tool_use_id)
      ) {
        foundResult = true;
      }
    }
  }

  record("D: transcript contains Test B's tool_use", foundUse);
  record("D: transcript contains a matching tool_result", foundResult);
}

// ============================ Test F (question) ============================
{
  const startF = frames.length;
  const permBefore = permissionRequests.length;
  session.send(
    {
      type: "user",
      message: {
        role: "user",
        content:
          "Use your question tool to ask me one question: 'Which color?' with options Red and Blue. " +
          "Wait for my answer, then reply with exactly the chosen color.",
      },
    },
    {}
  );
  const gotF = await waitForResult(startF, 120_000);
  const sliceF = frames.slice(startF);

  record("F: got a result frame", gotF);

  const questionReqs = permissionRequests
    .slice(permBefore)
    .filter((r) => r.toolName === "AskUserQuestion");
  record(
    "F: a question-kind permission request arrived",
    questionReqs.length > 0
  );

  record(
    "F: final assistant text contains Blue",
    sliceF.some(
      (f) =>
        f.type === "assistant" &&
        typeof f.uuid === "string" &&
        textOf(f).includes("Blue")
    )
  );
}

// ============================ Test G (urgent) ============================
{
  const startG = frames.length;
  const failedBefore = failedCalls.length;

  session.send(
    {
      type: "user",
      message: {
        role: "user",
        content: "Count from 1 to 300 in English words, one per line.",
      },
    },
    {}
  );

  // The counting turn must be streaming before the urgent message lands.
  await waitForFrame(
    startG,
    (slice) => slice.some((f) => f.type === "stream_event"),
    60_000
  );

  const startUrgent = frames.length;
  session.send(
    {
      type: "user",
      message: {
        role: "user",
        content: "URGENT-PING: stop counting and reply with exactly URGENT-ACK",
      },
      parent_tool_use_id: null,
    } as never,
    { urgent: true }
  );

  // Poll, not a fixed evaluation point: after the aborted result, wait for a
  // non-empty final assistant frame at a higher index.
  let reply: NeutralMessage | undefined;
  {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline && !reply) {
      const abortedIdx = frames
        .slice(startUrgent)
        .findIndex(
          (f) =>
            f.type === "result" &&
            (f as { subtype?: string }).subtype === "aborted"
        );
      if (abortedIdx >= 0) {
        reply = frames
          .slice(startUrgent + abortedIdx + 1)
          .find(
            (f) =>
              f.type === "assistant" &&
              typeof f.uuid === "string" &&
              textOf(f).trim().length > 0
          );
      }
      if (!reply) {
        // biome-ignore lint/performance/noAwaitInLoops: polls in order until the reply appears, no concurrent work to parallelize
        await Bun.sleep(500);
      }
    }
  }

  const sliceG = frames.slice(startUrgent);

  record(
    "G: the counting turn closed with an aborted result",
    sliceG.some(
      (f) =>
        f.type === "result" && (f as { subtype?: string }).subtype === "aborted"
    )
  );

  record("G: a final assistant reply arrives after the abort", !!reply);

  // Obedience to the exact token is logged, not gated: the model may paraphrase.
  console.log(
    `G: post-abort text contained URGENT-ACK: ${reply ? textOf(reply).includes("URGENT-ACK") : false}`
  );

  record(
    "G: busy is false at the end",
    busyTransitions.length > 0 && busyTransitions.at(-1) === false
  );

  record("G: failed() never fired", failedCalls.length === failedBefore);
}

// =========================== Test H (subagent) ============================
{
  const startH = frames.length;
  session.send(
    {
      type: "user",
      message: {
        role: "user",
        content:
          "Use your task tool to delegate to the general subagent: it must reply with exactly the word DELEGATED and nothing else.",
      },
    },
    {}
  );
  const gotH = await waitForResult(startH, 120_000);
  const sliceH = frames.slice(startH);

  record("H: the turn closed with a result frame", gotH);

  const started = sliceH.find(
    (f) => f.type === "system" && f.subtype === "task_started"
  ) as { tool_use_id?: string } | undefined;
  record(
    "H: a task_started frame arrived with a tool_use_id",
    !!started && typeof started.tool_use_id === "string"
  );

  const toolUseId =
    started && typeof started.tool_use_id === "string"
      ? started.tool_use_id
      : undefined;
  record(
    "H: a child frame carries parent_tool_use_id",
    !!toolUseId &&
      sliceH.some(
        (f) =>
          (f as { parent_tool_use_id?: string | null }).parent_tool_use_id ===
          toolUseId
      )
  );

  record(
    "H: the parent final assistant text contains DELEGATED",
    sliceH.some(
      (f) =>
        f.type === "assistant" &&
        typeof f.uuid === "string" &&
        textOf(f).includes("DELEGATED")
    )
  );
}

// ============================ Test I (revert) ============================
{
  const {
    ctx: ctxI,
    frames: framesI,
    holder: holderI,
  } = makeCtx(PROOF_DIR, "proof-i");
  const sessionI = await harness.spawn(
    {
      instanceId: "proof-i",
      cwd: PROOF_DIR,
      model: "opencode-go/deepseek-v4-flash",
    } as SpawnPayload,
    ctxI
  );
  holderI.session = sessionI;
  if (sessionI) {
    // Turn 1: ALPHA.
    const start1 = framesI.length;
    sessionI.send(
      {
        type: "user",
        message: { role: "user", content: "Reply with exactly ALPHA." },
      },
      {}
    );
    await waitForResultIn(framesI, start1, 120_000);

    // Turn 2: BETA.
    const start2 = framesI.length;
    sessionI.send(
      {
        type: "user",
        message: { role: "user", content: "Reply with exactly BETA." },
      },
      {}
    );
    await waitForResultIn(framesI, start2, 120_000);

    const alphaMsgId = framesI
      .slice(start1)
      .find((f) => f.type === "assistant" && typeof f.uuid === "string")?.uuid;

    // Re-open the same session anchored at the ALPHA message (rewind).
    await harness.spawn(
      {
        instanceId: "proof-i",
        cwd: PROOF_DIR,
        // biome-ignore lint/style/noNonNullAssertion: a spawn that reached this point always carries a sessionId
        resume: { sessionKey: sessionI.sessionId!, atMessage: alphaMsgId },
      } as SpawnPayload,
      ctxI
    );

    const transcript = await harness.getSessionMessages(
      // biome-ignore lint/style/noNonNullAssertion: a spawn that reached this point always carries a sessionId
      sessionI.sessionId!,
      PROOF_DIR
    );
    record(
      "I: transcript no longer contains BETA after rewind",
      !JSON.stringify(transcript).includes("BETA")
    );
  } else {
    record(
      "I: transcript no longer contains BETA after rewind",
      false,
      "spawn failed"
    );
  }
}

// ============================ Test J (command) ============================
{
  const cmdDir = join(tmpdir(), "opencode-proof-cmd");
  await Bun.$`rm -rf ${cmdDir}`.quiet().nothrow();
  await Bun.$`mkdir -p ${cmdDir}`.quiet();
  await Bun.$`git -C ${cmdDir} init`.quiet().nothrow();
  // Seed a minimal project so `/init` has something real to document (an empty
  // repo makes the model decline to write AGENTS.md).
  await Bun.write(
    `${cmdDir}/package.json`,
    JSON.stringify(
      {
        name: "proof-cmd",
        scripts: { build: "echo built", test: "echo tested" },
      },
      null,
      2
    )
  );

  const {
    ctx: ctxJ,
    frames: framesJ,
    holder: holderJ,
  } = makeCtx(cmdDir, "proof-j");
  const sessionJ = await harness.spawn(
    {
      instanceId: "proof-j",
      cwd: cmdDir,
      model: "opencode-go/deepseek-v4-flash",
    } as SpawnPayload,
    ctxJ
  );
  holderJ.session = sessionJ;
  if (sessionJ) {
    const pollAgents = async (ms: number): Promise<boolean> => {
      const deadline = Date.now() + ms;
      let exists = false;
      while (Date.now() < deadline && !exists) {
        // biome-ignore lint/performance/noAwaitInLoops: polls in order until the file appears, no concurrent work to parallelize
        exists = await Bun.file(`${cmdDir}/AGENTS.md`).exists();
        if (!exists) {
          await Bun.sleep(2000);
        }
      }
      return exists;
    };

    const startJ = framesJ.length;
    sessionJ.send(
      { type: "user", message: { role: "user", content: "/init" } },
      {}
    );
    const gotJ = await waitForResultIn(framesJ, startJ, 120_000);
    record("J: the /init turn closed with a result frame", gotJ);

    // Flash sometimes declines; the command routing is what the test proves.
    let agentsExists = await pollAgents(60_000);
    if (!agentsExists) {
      sessionJ.send(
        { type: "user", message: { role: "user", content: "/init" } },
        {}
      );
      agentsExists = await pollAgents(60_000);
    }
    if (!agentsExists) {
      console.log(
        `J DIAG: command turn completed=${gotJ}, AGENTS.md present=${agentsExists}`
      );
    }
    record("J: AGENTS.md now exists in the command dir", agentsExists);
  } else {
    record(
      "J: the /init turn closed with a result frame",
      false,
      "spawn failed"
    );
    record("J: AGENTS.md now exists in the command dir", false, "spawn failed");
  }
}

// ------------------------------- summary ----------------------------------
record(
  "global: failed() was never called",
  failedCalls.length === 0,
  `calls ${failedCalls.length}`
);

console.log(`${assertions - failures}/${assertions} assertions passed`);
await harness.dispose?.();
process.exit(failures === 0 ? 0 : 1);
