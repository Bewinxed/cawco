/**
 * Right after a machine's agent starts again (an update, a reboot), a person
 * starts a session on the Claude Code installed there, and it runs: the hub
 * admits a start by the machine's Claude report (core harness-refusal.ts
 * `harnessRefusal`), which the agent reads with the tools row's own lookup
 * (agent auth.ts `claudeExecutable`, tools.ts `toolBinary`), and never waits
 * on the machine's tools read. The tools read itself answers in seconds.
 *
 * On a scratch fleet (real hub, agent and sessiond; the real Claude Code CLI
 * against the mock model), its machine laid out as two hosts were:
 * - its Claude Code where `npm install -g` under nvm puts it: npm's global
 *   bin, off the agent's PATH. The tools row found it there and Claude's
 *   report did not, so every start was refused as "Claude Code isn't
 *   installed" until the tools read landed, and then failed at the agent's
 *   own gate, which looked where the report did.
 * - its Antigravity CLI signed out, as a HOME with no sign-in is: it says
 *   so, then waits 60 s for a login (fake-agy.ts, as agy 1.5.2 does), which
 *   held the machine's whole tools read, Claude Code's cell with it, for
 *   that minute.
 *
 * - a. The agent's tools read lands within a few seconds of its start.
 * - b. Claude's report says Claude Code is installed, and the account signs in.
 * - c. The agent restarts with no tool cell at the hub (cleared, as on a hub
 *   that never had one): a Claude start sent as soon as it is online is not
 *   refused, and runs.
 *
 *   bun scripts/probe-kit/run.ts start-after-restart
 */
import { existsSync } from "node:fs";
import {
  chmod,
  mkdir,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { delimiter, join, resolve } from "node:path";
import { readWithin } from "../../../packages/core/src/bounded";
import { systemProgram } from "../../../packages/core/src/workspace-needs";
import {
  type Fleet,
  MACHINE,
  MODEL,
  type Reply,
  until,
} from "../../scratch-fleet";
import { putFakeAgy } from "../fake-agy";
import type { Kit, Spec } from "../kit";

/** How soon after the agent starts its tools read must land. */
const TOOLS_READ_MS = 5000;

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

interface AgentRow {
  harnesses?: { harness: string; installed: boolean; refused?: string }[];
  machineId: string;
  status: string;
  tools?: Record<string, { state: string; version?: string }>;
}

/**
 * An `npm` that answers where its global packages are, `prefix`, and its
 * version: what the agent asks of it to find a CLI `npm install -g` put
 * there (tools.ts `npmGlobalBin`), and nothing else.
 */
const npmStub = (prefix: string): string => `#!${systemProgram("sh")}
case "$*" in
  "prefix -g") echo "${prefix}" ;;
  "root -g") echo "${prefix}/lib/node_modules" ;;
  "--version") echo "10.9.2" ;;
  *) echo "npm stub: no answer for $*" >&2; exit 1 ;;
esac
`;

/**
 * Lays the fleet's machine out as above: its Claude Code only in a stub
 * npm's global bin, a signed-out fake agy, and a PATH with no dir that
 * holds a `claude`. Answers the agent's PATH.
 */
const layOut = async (fleet: Fleet): Promise<string> => {
  // The fleet links the host's Claude Code into its HOME's ~/.local/bin,
  // which the agent searches whatever its PATH: it moves to npm's bin.
  const linked = join(fleet.home, ".local", "bin", "claude");
  const claude = resolve(
    join(fleet.home, ".local", "bin"),
    await readlink(linked)
  );
  await rm(linked);
  const prefix = join(fleet.sandbox, "nvm-node");
  await mkdir(join(prefix, "bin"), { recursive: true });
  await mkdir(join(prefix, "lib", "node_modules"), { recursive: true });
  await symlink(claude, join(prefix, "bin", "claude"));
  const stubs = join(fleet.sandbox, "stub-bin");
  await mkdir(stubs, { recursive: true });
  await writeFile(join(stubs, "npm"), npmStub(prefix));
  await chmod(join(stubs, "npm"), 0o755);
  await putFakeAgy(stubs);
  // Ours come first: the agent takes the first npm and agy on its PATH.
  const host = (fleet.env.PATH ?? "")
    .split(delimiter)
    .filter((dir) => dir !== "" && !existsSync(join(dir, "claude")));
  return [stubs, ...host].join(delimiter);
};

/** The machine's row at the hub. */
const rowOf = async (fleet: Fleet): Promise<AgentRow | undefined> =>
  (await fleet.api((hub) => hub.api.agents.get())).find(
    (row) => row.machineId === MACHINE
  );

/** A Claude start from the dashboard's socket: the hub's refusal, or none in `ms`. */
const startClaude = async (
  fleet: Fleet,
  ms: number
): Promise<{ id: string; refused: string | undefined }> => {
  const id = crypto.randomUUID();
  const socket = new WebSocket(
    `${fleet.base.replace("http", "ws")}/ws/dashboard`
  );
  const refused = new Promise<string>((done) => {
    socket.onmessage = (event) => {
      const frame = JSON.parse(String(event.data)) as {
        instanceId?: string;
        payload?: { kind?: string; message?: string };
      };
      if (frame.instanceId === id && frame.payload?.kind === "error") {
        done(frame.payload.message ?? "");
      }
    };
  });
  await new Promise<void>((done, fail) => {
    socket.onopen = () => done();
    socket.onerror = () => fail(new Error("the dashboard socket did not open"));
  });
  socket.send(
    JSON.stringify({
      verb: "spawn",
      machineId: MACHINE,
      instanceId: id,
      requestId: crypto.randomUUID(),
      payload: {
        instanceId: id,
        cwd: fleet.workdir,
        harness: "claude",
        model: MODEL.claude,
        title: "Start after restart",
        permissionMode: "bypassPermissions",
      },
    })
  );
  const said = await readWithin(ms, () => refused);
  socket.close();
  return { id, refused: said.kind === "answered" ? said.value : undefined };
};

/** `wait`, or what it threw, as a check's detail. */
const settled = async (
  wait: () => Promise<unknown>
): Promise<string | undefined> => {
  try {
    await wait();
    return undefined;
  } catch (error) {
    return error instanceof Error
      ? error.message.split("\n")[0]
      : String(error);
  }
};

const spec: Spec = {
  group: "The hub and machines",
  name: "start-after-restart",
  run: async (kit: Kit) => {
    const { check } = kit;
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    const PATH = await layOut(fleet);

    const started = Date.now();
    fleet.launch("agent", [], { PATH });
    await fleet.agentUp();
    let toolsAt: number | undefined;
    await settled(() =>
      until(
        "the machine's tools read",
        async () =>
          (await rowOf(fleet))?.tools?.claude ? Date.now() : undefined,
        Boolean,
        90_000
      ).then((at) => {
        toolsAt = at;
      })
    );
    const row = await rowOf(fleet);
    const took = toolsAt === undefined ? undefined : toolsAt - started;
    kit.note(
      `tools read: ${took === undefined ? "none in 90 s" : `${(took / 1000).toFixed(2)} s`} after the agent started; cells ${JSON.stringify(row?.tools ?? {})}`
    );
    check(
      `a. the agent's tools read lands within ${TOOLS_READ_MS / 1000} s of its start`,
      took !== undefined && took < TOOLS_READ_MS,
      took === undefined ? "none in 90 s" : `${(took / 1000).toFixed(2)} s`
    );

    const claude = row?.harnesses?.find((one) => one.harness === "claude");
    check(
      "b. Claude's report says Claude Code is installed, found in npm's global bin",
      claude?.installed === true && claude.refused === undefined,
      JSON.stringify(claude)
    );
    const signedIn = await settled(() => fleet.accountSignedIn());
    check("b. the account signs in", signedIn === undefined, signedIn);

    // The restart, with no tool cell for the hub to read: what a start
    // right after it is admitted by is the report alone.
    await fleet.stop("agent");
    fleet.write("DELETE FROM agent_tools WHERE machine_id = ?", MACHINE);
    fleet.launch("agent", [], { PATH });
    await fleet.agentUp();
    const cell = (await rowOf(fleet))?.tools?.claude;
    const start = await startClaude(fleet, 10_000);
    kit.note(
      `c: started ${start.id}; the hub held ${cell ? `the cell ${JSON.stringify(cell)}` : "no Claude Code cell"} as it was sent`
    );
    check(
      "c. restarted, a Claude start sent as soon as the agent is online is not refused",
      start.refused === undefined,
      start.refused
    );
    const ran = await settled(() =>
      until(
        "the session running",
        () => fleet.instance(start.id),
        (instance) => instance?.status === "running",
        180_000
      )
    );
    check("c. and it runs", ran === undefined, ran ?? "running");
  },
};

export default spec;
