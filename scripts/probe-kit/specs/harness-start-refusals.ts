/**
 * A session CawCo starts either starts, or fails with the real reason in its
 * words on its row; and the permission modes CawCo offers are the ones the
 * machine's harnesses have.
 *
 * - s1. A harness that exits on start saying why on stderr: a real keeper
 *   (sessiond's `SessiondServer`, in this process, on a scratch socket)
 *   starts a child that says Claude Code's root refusal on stderr and exits
 *   1, as Claude Code 2.1.302 does as root in bypass. The agent's own bridge
 *   (`sessiondBridge` over a real `SessiondClient`) hands its end on with
 *   that line, and the adapter (claude.ts `processEnded`) fails the session
 *   in those words (core `harnessWords.claudeExited`), which the agent sends
 *   the hub as the row's error. Main said `claudeCrashed`, "said nothing
 *   about why": the keeper drained stderr unread.
 * - s2. A listing after that death (the welcome an agent reads when it was
 *   away as the child died) carries the same line.
 * - s3. A child that writes far more on stderr is held to its last
 *   `STDERR_TAIL_BYTES`, and its row quotes the last of it.
 * - r1. Claude Code's root rule, decided before any process is made
 *   (claude.ts `claudeRootRefusal`): as root on the host, Bypass and Full
 *   Send are refused in words that name root and the mode; every other mode
 *   starts; in a workspace's boundary every mode starts; not as root,
 *   nothing is refused.
 * - m1. Every tool a session of any role is listed that takes a permission
 *   mode offers exactly the modes one session may start another in
 *   (core `SESSION_CHOSEN_MODES`): no `auto`, no `dontAsk`.
 * - m2. Each machine reports, for each harness that has modes, core's
 *   `PERMISSION_MODES` (agent `CLAUDE_CAPABILITIES`, `OPENCODE_CAPABILITIES`);
 *   pi reports none; and the dashboard's picker offers exactly the machine's
 *   list for each (`permissionModesFor`).
 *
 *   bun scripts/probe-kit/run.ts harness-start-refusals
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { permissionModesFor } from "../../../apps/dashboard/src/lib/cawco/permission-modes";
import {
  CLAUDE_CAPABILITIES,
  claudeRootRefusal,
  processEnded,
} from "../../../packages/agent/src/harnesses/claude";
import { OPENCODE_CAPABILITIES } from "../../../packages/agent/src/harnesses/opencode";
import { PI_CAPABILITIES } from "../../../packages/agent/src/harnesses/pi-services";
import {
  type ProcessExit,
  SessiondClient,
  sessiondBridge,
} from "../../../packages/agent/src/sessiond-client";
import {
  harnessWords,
  PERMISSION_MODES,
  SESSION_CHOSEN_MODES,
  spawnWords,
} from "../../../packages/core/src/index";
import { listRoleTools } from "../../../packages/hub/src/role-budgets";
import {
  SessiondServer,
  STDERR_TAIL_BYTES,
} from "../../../packages/sessiond/src/server";
import { until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

/** What Claude Code 2.1.302 says on stderr as root, launched with bypass allowed, before it exits 1. */
const ROOT_LINE =
  "--dangerously-skip-permissions cannot be used with root/sudo privileges for security reasons";

/** Same members, any order. */
const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((one) => b.includes(one));

/**
 * Starts `script` under `server` through the agent's bridge, as a Claude
 * Code child is started, and answers how it ended as the bridge handed it on.
 */
const endOf = async (
  client: SessiondClient,
  procId: string,
  script: string
): Promise<ProcessExit | undefined> => {
  let ended: { exit: ProcessExit | undefined } | undefined;
  sessiondBridge(
    client,
    procId,
    { command: "/bin/sh", args: ["-c", script], env: {} },
    { seqs: new Map(), attach: undefined },
    () => undefined,
    (exit) => {
      ended = { exit };
    }
  );
  const settled = await until("the child's end", () => ended, Boolean, 15_000);
  return settled?.exit;
};

/** The words a session that ended so is failed in (claude.ts `processEnded`). */
const failureOf = async (
  exit: ProcessExit | undefined
): Promise<string | undefined> => {
  let failed: unknown;
  await processEnded(
    {
      failed: (error: unknown) => {
        failed = error;
      },
    },
    new Error("Claude Code process exited with code 1"),
    exit,
    undefined
  );
  return failed instanceof Error ? failed.message : undefined;
};

const stderrLegs = async (kit: Kit, scratch: string): Promise<void> => {
  const endpoint = join(scratch, "keeper", "sessiond.sock");
  const server = new SessiondServer();
  await server.listen(endpoint);
  const client = await SessiondClient.dial(endpoint);
  try {
    const exit = await endOf(
      client,
      "probe-root-refusal",
      `echo '${ROOT_LINE}' >&2; exit 1`
    );
    const said = await failureOf(exit);
    const want = harnessWords.claudeExited(1, ROOT_LINE);
    kit.check(
      "s1: a harness that exits 1 on start saying why on stderr fails its session in that line, through a real keeper and the agent's bridge",
      said === want,
      `exit ${JSON.stringify(exit)}; failed "${said}"; want "${want}"`
    );
    // Started with no follower, as a child whose agent was away: its end
    // is learned from the keeper's listing.
    await client.spawnProc("probe-root-refusal-away", {
      command: "/bin/sh",
      args: ["-c", `echo '${ROOT_LINE}' >&2; exit 1`],
    });
    const listed = await until(
      "the dead child listed",
      async () =>
        (await client.list()).procs.find(
          (proc) => proc.procId === "probe-root-refusal-away" && !proc.alive
        ),
      Boolean,
      15_000
    ).catch(() => undefined);
    kit.check(
      "s2: a listing of a child that died so, with no agent following it, carries the same line",
      listed?.alive === false && listed.stderr?.trim() === ROOT_LINE,
      JSON.stringify(listed)
    );
    const long = await endOf(
      client,
      "probe-long-stderr",
      "i=0; while [ $i -lt 400 ]; do echo \"line $i of what a chatty child says\"; i=$((i+1)); done >&2; echo 'the last thing it said' >&2; exit 3"
    );
    const longSaid = await failureOf(long);
    kit.check(
      `s3: a child that wrote ${400 * 34} bytes on stderr is held to its last ${STDERR_TAIL_BYTES}, and its row quotes the last of it`,
      (long?.stderr?.length ?? 0) <= STDERR_TAIL_BYTES &&
        (long?.stderr?.length ?? 0) > 0 &&
        longSaid?.startsWith("Claude Code stopped on its own (exit 3)") ===
          true &&
        longSaid.includes("the last thing it said"),
      `kept ${long?.stderr?.length} bytes; failed "${longSaid}"`
    );
  } finally {
    client.close();
    await server.drain(0);
    await server.close();
  }
};

const rootLeg = (kit: Kit): void => {
  const cases = [
    ["bypassPermissions", false, true, "refused"],
    ["fullSend", false, true, "refused"],
    ["default", false, true, "starts"],
    ["acceptEdits", false, true, "starts"],
    ["plan", false, true, "starts"],
    [undefined, false, true, "starts"],
    ["bypassPermissions", true, true, "starts"],
    ["fullSend", true, true, "starts"],
    ["bypassPermissions", false, false, "starts"],
    ["fullSend", false, false, "starts"],
  ] as const;
  const read = cases.map(([mode, bounded, root, want]) => {
    const refusal = claudeRootRefusal(mode, bounded, root);
    const named =
      mode === "bypassPermissions" || mode === "fullSend"
        ? harnessWords.claudeRootBypass(spawnWords.modes[mode])
        : undefined;
    const ok = want === "refused" ? refusal === named : refusal === undefined;
    return {
      ok,
      line: `${mode ?? "none"} ${bounded ? "in a boundary" : "on the host"}${root ? " as root" : ""}: ${refusal ?? "starts"}`,
    };
  });
  kit.check(
    "r1: as root on the host Bypass and Full Send are refused before any process, in words naming root and the mode; every other start goes ahead",
    read.every((one) => one.ok),
    read.map((one) => one.line).join(" | ")
  );
};

const modeLegs = (kit: Kit): void => {
  const enums: string[] = [];
  const off: string[] = [];
  const visit = (where: string, schema: unknown): void => {
    if (Array.isArray(schema)) {
      for (const [index, item] of schema.entries()) {
        visit(`${where}[${index}]`, item);
      }
      return;
    }
    if (!schema || typeof schema !== "object") {
      return;
    }
    const node = schema as Record<string, unknown>;
    const values = node.enum;
    if (
      Array.isArray(values) &&
      values.some((value) => value === "acceptEdits" || value === "default")
    ) {
      enums.push(`${where}: ${values.join(", ")}`);
      if (!sameSet(values as string[], SESSION_CHOSEN_MODES)) {
        off.push(`${where}: ${values.join(", ")}`);
      }
    }
    for (const [key, value] of Object.entries(node)) {
      visit(`${where}.${key}`, value);
    }
  };
  for (const { role, tools } of listRoleTools()) {
    for (const tool of tools) {
      visit(`${role}/${tool.name}`, tool.inputSchema);
    }
  }
  kit.check(
    `m1: every tool that takes a permission mode offers exactly ${SESSION_CHOSEN_MODES.join(", ")} (${enums.length} lists, across every role)`,
    enums.length > 0 && off.length === 0,
    off.length > 0 ? off.join(" | ") : enums.join(" | ")
  );
  const machine = {
    claude: CLAUDE_CAPABILITIES.permissionModes,
    opencode: OPENCODE_CAPABILITIES.permissionModes,
    pi: PI_CAPABILITIES.permissionModes,
  };
  const picker = {
    claude: permissionModesFor("claude").map((one) => one.value),
    opencode: permissionModesFor("opencode").map((one) => one.value),
    pi: permissionModesFor("pi").map((one) => one.value),
  };
  kit.check(
    "m2: each machine reports core's modes for Claude Code and OpenCode and none for pi, and the dashboard's picker offers the machine's list for each",
    sameSet(machine.claude, PERMISSION_MODES) &&
      sameSet(machine.opencode, PERMISSION_MODES) &&
      machine.pi.length === 0 &&
      sameSet(picker.claude, machine.claude) &&
      sameSet(picker.opencode, machine.opencode) &&
      picker.pi.length === 0,
    `machine ${JSON.stringify(machine)}; picker ${JSON.stringify(picker)}`
  );
};

const spec: Spec = {
  name: "harness-start-refusals",
  run: async (kit: Kit) => {
    const scratch = await mkdtemp(
      join(process.env.TMPDIR ?? tmpdir(), "harness-start-refusals-")
    );
    try {
      await stderrLegs(kit, scratch);
      rootLeg(kit);
      modeLegs(kit);
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  },
};

export default spec;
