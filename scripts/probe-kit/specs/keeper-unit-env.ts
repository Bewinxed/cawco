/**
 * Nothing a session starts is told it is CawCo's unit. On a scratch fleet
 * (real hub, agent and sessiond; Claude Code against the mock model), with no
 * workspace: it runs inside one.
 *
 * systemd sets `INVOCATION_ID` for every process of a unit, and the keeper's
 * children inherited it. Podman, run with it set, leaves conmon in its
 * caller's cgroup rather than a `libpod-conmon-<id>.scope` of its own
 * (libpod/oci_conmon_linux.go `moveConmonToCgroupAndSignal`), so a container
 * a session's shell started had its conmon inside the keeper's unit, and the
 * keeper's stop reached it: an agent update that retired a keeper stopped
 * every such container on obelisk (2026-10-19 09:28:30; core session-env.ts).
 *
 * The keeper is started with `INVOCATION_ID` set, as its unit's manager sets
 * it; the agent is not (a scratch agent that reads itself as service-managed
 * runs a watchdog that restarts keepers through the service manager).
 *
 * - (a) A Claude session's Bash tool reads no `INVOCATION_ID`.
 * - (b) A child the keeper starts as a session (`inherit: "session"`) reads
 *   none.
 * - (c) A child the keeper starts as a harness server (`inherit: "server"`)
 *   reads none.
 *
 * On main each reads the keeper's own id.
 *
 *   bun scripts/probe-kit/run.ts keeper-unit-env
 */
import { SessiondClient } from "../../../packages/agent/src/sessiond-client";
import { readWithin } from "../../../packages/core/src/bounded";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

/** The id the keeper is started under: what systemd's would look like, 32 hex. */
const UNIT_ID = "c0ffee00c0ffee00c0ffee00c0ffee00";
/** Words the session's prompt carries, so the mock knows which request to answer with the command. */
const TAG = "PROBE-UNIT-ENV";
/** What each probe prints, its prefix spelled apart in the command so only its output carries it whole. */
const ANSWER = /UE\|([a-z]+)=([^|"\\]*)\|end/;
const echo = (key: string): string =>
  `echo "U""E|${key}=\${INVOCATION_ID:-none}|end"`;

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

let ran = false;
/** The tagged session runs its one command, then says it is done. */
const respond = (request: Seen): Reply => {
  if (!(request.tools && request.all.includes(TAG))) {
    return text(request.tools ? "ok" : "Probe title");
  }
  if (!(ran || request.afterTool) && request.toolNames.includes("Bash")) {
    ran = true;
    return {
      everyMs: 5,
      words: [],
      tool: {
        name: "Bash",
        input: { command: echo("bash"), description: "Read the environment" },
      },
    };
  }
  return text("Done.");
};

/** What one keeper child of `inherit` printed: its line, or why none came. */
const childReads = async (
  socket: string,
  inherit: "session" | "server"
): Promise<string> => {
  const dialled = await SessiondClient.connect(socket);
  if (dialled.kind !== "answered") {
    return `the keeper did not answer: ${dialled.reason}`;
  }
  const client = dialled.value;
  const procId = `probe-unit-env-${inherit}-${crypto.randomUUID().slice(0, 8)}`;
  try {
    const lines: string[] = [];
    const exited = new Promise<void>((resolve) => {
      client.subscribe(procId, {
        line: (event) => {
          lines.push(event.data);
        },
        exit: () => resolve(),
      });
    });
    await client.spawnProc(procId, {
      command: "/bin/sh",
      args: ["-c", echo(inherit)],
      inherit,
    });
    const ended = await readWithin(30_000, () => exited);
    const said = lines.join("\n") || "no line";
    return ended.kind === "answered"
      ? said
      : `${said}; it did not exit within ${ended.after} ms`;
  } finally {
    client.close();
  }
};

const spec: Spec = {
  name: "keeper-unit-env",
  run: async (kit: Kit) => {
    const { check } = kit;
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond", [], { INVOCATION_ID: UNIT_ID });
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();

    // ── (a) a Claude session's Bash tool ─────────────────────────────────
    const id = await fleet.spawn("claude", "Unit env");
    await fleet.send(id, `${TAG}: read the environment.`);
    const carried = await until(
      "the session's command output",
      () =>
        fleet.seen.find((one) => one.afterTool && ANSWER.test(one.body))?.body,
      Boolean,
      120_000
    ).catch(() => undefined);
    const bash = carried ? ANSWER.exec(carried)?.[2] : undefined;
    check(
      "(a) a Claude session's Bash tool reads no INVOCATION_ID",
      bash === "none",
      bash === undefined
        ? `no output came; ran: ${ran}`
        : `INVOCATION_ID=${bash}`
    );

    // ── (b), (c) the keeper's own children ───────────────────────────────
    for (const [leg, inherit] of [
      ["(b)", "session"],
      ["(c)", "server"],
    ] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one child at a time, each its own line
      const said = await childReads(fleet.sessiondSocket, inherit);
      const read = ANSWER.exec(said)?.[2];
      check(
        `${leg} a child the keeper starts as a ${inherit} reads no INVOCATION_ID`,
        read === "none",
        read === undefined ? said : `INVOCATION_ID=${read}`
      );
    }
  },
};

export default spec;
