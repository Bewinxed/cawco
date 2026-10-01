/**
 * Proof for the sandbox auto-deny bug fix. Under `permissionMode:
 * 'bypassPermissions'` the SDK auto-denies a Bash call that carries
 * `dangerouslyDisableSandbox` (`decision_reason_type: 'sandboxOverride'`) unless
 * the sandbox is explicitly told `allowUnsandboxedCommands: true`. The claude
 * harness now passes that option in bypass mode; this drives a real claude
 * session in isolation — scratch git dir, no hub/daemon/dashboard — and asserts
 * that a Bash call with `dangerouslyDisableSandbox` executes (no permission_denied
 * system message, no is_error tool_result) instead of being auto-denied.
 *
 * Run with `bun sandbox-proof.ts`.
 */

import type { NeutralMessage } from "@cawco/core";
import type { HarnessContext, HarnessSession } from "./src/harness";
import { claudeHarness } from "./src/harnesses/claude";

const PROOF_DIR = "/tmp/sandbox-proof";

await Bun.$`rm -rf ${PROOF_DIR}`.quiet().nothrow();
await Bun.$`mkdir -p ${PROOF_DIR}`.quiet();
await Bun.$`git -C ${PROOF_DIR} init`.quiet().nothrow();

const frames: NeutralMessage[] = [];
let session: HarnessSession | null = null;
const failures: string[] = [];

const ctx: HarnessContext = {
  instanceId: "sandbox-proof",
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

let assertions = 0;
let failuresCount = 0;
const record = (name: string, pass: boolean, detail?: string) => {
  assertions += 1;
  if (pass) {
    console.log(`PASS ${name}`);
  } else {
    failuresCount += 1;
    console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
};

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

const TIMEOUT = 180_000;

// Sandbox enabled so the model has a sandbox to step outside of; degrade
// gracefully if the runtime is missing rather than erroring the whole query.
const spawned = await claudeHarness.spawn(
  {
    instanceId: "sandbox-proof",
    cwd: PROOF_DIR,
    permissionMode: "bypassPermissions",
    persistSession: false,
    options: { sandbox: { enabled: true, failIfUnavailable: false } },
  },
  ctx
);
if (!spawned) {
  console.error("spawn returned no session");
  process.exit(2);
}
session = spawned;

const start = frames.length;
session.send(
  {
    type: "user",
    message: {
      role: "user",
      content:
        "Use the Bash tool to run the command `echo sandbox-proof-ok`. You MUST set " +
        "the dangerouslyDisableSandbox parameter to true in that Bash tool call. " +
        "Then tell me exactly what the command printed.",
    },
  } as unknown as NeutralMessage,
  {}
);

const got = await waitForResult(start, TIMEOUT);
const slice = frames.slice(start);

// DIAG: did the model actually set dangerouslyDisableSandbox, and what came back?
for (const f of slice) {
  if (f.type !== "assistant") {
    continue;
  }
  const content =
    (f as unknown as { message?: { content?: unknown[] } }).message?.content ??
    [];
  for (const block of content) {
    if ((block as { type?: string }).type !== "tool_use") {
      continue;
    }
    const tu = block as { name?: string; input?: Record<string, unknown> };
    console.log(
      `DIAG tool_use: ${JSON.stringify({
        name: tu.name ?? null,
        dangerouslyDisableSandbox: tu.input?.dangerouslyDisableSandbox ?? null,
        command: tu.input?.command ?? null,
      })}`
    );
  }
}
for (const f of slice) {
  if (f.type !== "user") {
    continue;
  }
  const content = (f as unknown as { message?: { content?: unknown } }).message
    ?.content;
  if (typeof content === "string") {
    continue;
  }
  // biome-ignore lint/suspicious/noUnnecessaryConditions: content is cast, not narrowed — the field is genuinely optional at runtime
  for (const block of (content as unknown[]) ?? []) {
    if ((block as { type?: string }).type !== "tool_result") {
      continue;
    }
    const tr = block as { is_error?: boolean; content?: unknown };
    console.log(
      `DIAG tool_result: ${JSON.stringify({
        is_error: tr.is_error === true,
        content:
          typeof tr.content === "string"
            ? tr.content.slice(0, 200)
            : tr.content,
      })}`
    );
  }
}

record("result frame arrived", got);

const denied = slice.filter(
  (f) =>
    f.type === "system" &&
    (f as { subtype?: string }).subtype === "permission_denied"
);
record(
  "no permission_denied system message",
  denied.length === 0,
  `denied=${denied.length}`
);

const erroredResult = slice
  .filter((f) => f.type === "user")
  .flatMap((f) => {
    const content = (f as unknown as { message?: { content?: unknown } })
      .message?.content;
    // biome-ignore lint/suspicious/noUnnecessaryConditions: content is cast, not narrowed — the field is genuinely optional at runtime
    return typeof content === "string" ? [] : ((content as unknown[]) ?? []);
  })
  .filter((block) => (block as { type?: string }).type === "tool_result")
  .some((block) => (block as { is_error?: boolean }).is_error === true);
record("no tool_result is_error (the command executed)", !erroredResult);

if (failures.length) {
  console.log(`DIAG failed(): ${failures.join(" | ")}`);
}

await session.stop().catch(() => {
  // best effort: the process exits either way
});

console.log(
  `sandbox-proof: ${assertions - failuresCount}/${assertions} assertions passed`
);
process.exit(failuresCount === 0 && failures.length === 0 ? 0 : 1);
