/**
 * A machine's agent registers, and reads online, within seconds of starting,
 * however slowly its harness CLIs answer. Each harness's report and the
 * machine's capabilities reach the hub later, as their own updates, once
 * their probes have finished (each one bounded). Until a harness has
 * reported, the hub refuses to start a session on it, and says so.
 *
 * The machine's `claude` is a stand-in that waits 30 s before answering
 * `--version` and `auth status`, then runs the real Claude Code. Every call
 * it gets, and how each one ended, goes to a log the spec reads.
 *
 * (a) The agent reads online within 3 s of starting, before Claude's report.
 * (b) A Claude start before that report is refused in the hub's sentence
 *     (placement.ts `unreportedHarnessRefusal`), and nothing is left of it
 *     on the hub or the machine's keeper.
 * (c) Claude's report arrives once its probes have finished. The stand-in
 *     takes 30 s, but the agent stops waiting at each probe's bound (5 s for
 *     `--version`, 20 s for `auth status`), so the report arrives within 2 s
 *     of the last probe ending. The capabilities arrive as an update too,
 *     listing claude.
 * (d) Once that report is in, a Claude start is no longer refused for want
 *     of one.
 * (e) Reconnect: the hub restarts, and the agent reads online within 3 s
 *     of the hub answering.
 * (f) A new agent process (what a binary update starts) reads online within
 *     3 s of starting.
 *
 *   bun scripts/probe-kit/run.ts slow-harness-cli
 */
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { unreportedHarnessRefusal } from "../../../packages/hub/src/placement";
import { MACHINE } from "../../scratch-fleet";
import type { Spec } from "../kit";

const SLOW_S = 30;
const ONLINE_MS = 3000;

interface AgentRow {
  custody?: { state: string };
  harnesses?: { harness: string; installed: boolean; version?: string }[];
  hostname: string;
  machineCapabilities?: { items: { id: string; available: boolean }[] };
  machineId: string;
  status: string;
}

/** The stand-in `claude`: 30 s before `--version` and `auth status`, then the real one. */
const standIn = (real: string, log: string): string => `#!/bin/bash
stamp() { echo "\${EPOCHREALTIME/./} $1 $$ $ARGS" >> "${log}"; }
ARGS="$*"
case " $* " in
  *" --version "*|*" auth status "*)
    stamp start
    trap 'stamp cut; kill "$nap" 2>/dev/null; exit 143' TERM INT
    sleep ${SLOW_S} & nap=$!
    wait "$nap"
    stamp answered
    ;;
esac
exec "${real}" "$@"
`;

/**
 * Whether every stand-in call begun before the report (at `reportedAt`) had
 * ended by then, answered or cut at its bound, with the report within 2 s of
 * the last of them; and the stand-in's log as times since `started`.
 */
const settledBefore = (
  log: string,
  reportedAt: number | undefined,
  started: number
): { ok: boolean; detail: string } => {
  const calls = log
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      // Microseconds, as bash's EPOCHREALTIME says them.
      const [micros, how, , ...args] = line.split(" ");
      return {
        at: Math.round(Number(micros) / 1000),
        how,
        args: args.join(" "),
      };
    });
  const detail = `report after ${reportedAt === undefined ? "more than 90000" : reportedAt - started} ms; the stand-in: ${calls
    .map((call) => `${call.at - started} ms ${call.how} ${call.args}`)
    .join("; ")}`;
  if (reportedAt === undefined) {
    return { ok: false, detail };
  }
  const before = calls.filter((call) => call.at <= reportedAt);
  const begun = before.filter((call) => call.how === "start");
  const ended = before.filter((call) => call.how !== "start");
  const lastEnd = Math.max(...ended.map((call) => call.at));
  return {
    ok:
      begun.length > 0 &&
      ended.length >= begun.length &&
      reportedAt - lastEnd <= 2000,
    detail,
  };
};

const spec: Spec = {
  name: "slow-harness-cli",
  async run(kit) {
    const { check } = kit;
    const real = Bun.which("claude");
    if (!real) {
      check(
        "a real claude is on this host's PATH for the stand-in to run",
        false
      );
      return;
    }
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
    const bin = join(fleet.sandbox, "slow-claude-bin");
    const log = join(fleet.sandbox, "slow-claude.log");
    await mkdir(bin, { recursive: true });
    await writeFile(join(bin, "claude"), standIn(real, log));
    await chmod(join(bin, "claude"), 0o755);
    const slowPath = { PATH: `${bin}:${fleet.env.PATH}` };

    const row = async (): Promise<AgentRow | undefined> =>
      (await fleet.api<AgentRow[]>("/api/agents")).find(
        (agent) => agent.machineId === MACHINE
      );
    /** Polls every 50 ms until `ok`; how long it took, or undefined past `ms`. */
    const within = async (
      ok: (agent: AgentRow) => boolean,
      ms: number
    ): Promise<{ agent: AgentRow; at: number } | undefined> => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        // biome-ignore lint/performance/noAwaitInLoops: each look follows the hub's last state
        const agent = await row().catch(() => undefined);
        if (agent && ok(agent)) {
          return { agent, at: Date.now() };
        }
        await Bun.sleep(50);
      }
    };
    const online = (agent: AgentRow) => agent.status === "online";
    const claudeReport = (agent: AgentRow) =>
      agent.harnesses?.find((one) => one.harness === "claude");
    /** A Claude start from the dashboard: the hub's error for it, or "" when none came in 10 s. */
    const startClaude = async (): Promise<{ id: string; said: string }> => {
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
        socket.onerror = () =>
          fail(new Error("the dashboard socket did not open"));
      });
      socket.send(
        JSON.stringify({
          verb: "spawn",
          machineId: MACHINE,
          instanceId: id,
          payload: {
            instanceId: id,
            cwd: fleet.workdir,
            harness: "claude",
            model: "claude-haiku-4-5",
          },
        })
      );
      const said = await Promise.race([
        refused,
        Bun.sleep(10_000).then(() => ""),
      ]);
      socket.close();
      return { id, said };
    };

    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();

    // (a) Started with the slow stand-in first on its PATH.
    const started = Date.now();
    fleet.launch("agent", [], slowPath);
    const up = await within(online, 60_000);
    const upMs = up ? up.at - started : undefined;
    check(
      `(a) the agent reads online within ${ONLINE_MS / 1000} s of starting, with a claude that takes ${SLOW_S} s to answer`,
      upMs !== undefined && upMs <= ONLINE_MS,
      `online after ${upMs ?? "more than 60000"} ms`
    );
    check(
      "(a) it read online before Claude's report arrived",
      up !== undefined && claudeReport(up.agent) === undefined,
      JSON.stringify(up?.agent.harnesses ?? null)
    );

    // (b) A Claude start before Claude's report.
    const before = await startClaude();
    const machine = up?.agent.hostname ?? MACHINE;
    const expected = unreportedHarnessRefusal(machine, "claude");
    const stillUnreported =
      (await row().then((agent) => agent && claudeReport(agent))) === undefined;
    check(
      "(b) a Claude start before Claude's report is refused in the hub's sentence",
      before.said === expected && stillUnreported,
      `said: ${before.said || "(nothing in 10 s)"}; expected: ${expected}; report still out: ${stillUnreported}`
    );
    const held = (await fleet.heldProcs()).filter(({ procId }) =>
      procId.includes(before.id)
    );
    check(
      "(b) the refused start has no row on the hub and nothing on the machine's keeper",
      fleet.instance(before.id) === undefined && held.length === 0,
      `row: ${JSON.stringify(fleet.instance(before.id))}; held: ${JSON.stringify(held)}`
    );

    // (c) Claude's report, once its probes have ended.
    const reported = await within(
      (agent) => claudeReport(agent) !== undefined,
      90_000
    );
    const settled = settledBefore(
      await readFile(log, "utf8").catch(() => ""),
      reported?.at,
      started
    );
    check(
      "(c) Claude's report arrives once its probes have ended, within 2 s of the last one ending",
      settled.ok,
      settled.detail
    );
    const caps = await within(
      (agent) =>
        agent.machineCapabilities?.items.some(
          (item) => item.id === "claude"
        ) === true,
      30_000
    );
    check(
      "(c) the machine's capabilities arrive as their own update, listing claude",
      caps !== undefined,
      JSON.stringify(
        caps?.agent.machineCapabilities?.items.map((item) => item.id) ?? null
      )
    );

    // (d) After the report.
    const after = await startClaude();
    check(
      "(d) once Claude's report is in, a Claude start is not refused for want of it",
      after.said !== expected,
      `said: ${after.said || "(no refusal in 10 s)"}`
    );

    // (e) The hub restarts: the agent reconnects and registers again.
    await fleet.stop("hub");
    fleet.launch("hub");
    await fleet.hubUp();
    const hubBack = Date.now();
    const back = await within(online, 60_000);
    check(
      `(e) after a hub restart the agent reads online within ${ONLINE_MS / 1000} s of the hub answering`,
      back !== undefined && back.at - hubBack <= ONLINE_MS,
      `online ${back ? back.at - hubBack : "more than 60000"} ms after the hub answered`
    );

    // (f) A new agent process, as a binary update starts one.
    await fleet.stop("agent");
    await within((agent) => agent.status !== "online", 10_000);
    const restarted = Date.now();
    fleet.launch("agent", [], slowPath);
    const again = await within(online, 60_000);
    check(
      `(f) a new agent process reads online within ${ONLINE_MS / 1000} s of starting`,
      again !== undefined && again.at - restarted <= ONLINE_MS,
      `online ${again ? again.at - restarted : "more than 60000"} ms after it started`
    );
  },
};

export default spec;
