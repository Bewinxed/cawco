/**
 * A machine's agent registers, and reads online, within seconds of starting,
 * however slowly its harness CLIs answer. Each harness's report and the
 * machine's capabilities reach the hub later, as their own updates. Until a
 * harness has reported, the hub refuses to start a session on it, and says
 * so. An account's sign-in moves only on an answer from Claude Code: a
 * `claude auth status` that runs out of time leaves the account as the hub
 * last had it, and the agent says once which dir did not answer.
 *
 * The machine's `claude` is a stand-in. While the spec holds it slow (a flag
 * file), it waits 30 s before answering `--version` and `auth status`; the
 * agent stops waiting at each probe's bound (5 s, 20 s). Otherwise it runs
 * the real Claude Code at once. Every call it gets goes to a log.
 *
 * (a) The agent reads online within 3 s of starting, before Claude's report.
 * (b) A Claude start before that report is refused in the hub's sentence
 *     (placement.ts `unreportedHarnessRefusal`), and nothing is left of it.
 * (c) The first read's `auth status` runs out of time: the agent says so
 *     once, naming the account's dir and how long it waited. The hub files
 *     no Claude report from it (it has no word on Claude yet), keeps no
 *     sign-in for the account, and still refuses a Claude start. The
 *     machine's capabilities arrive as their own update.
 * (d) The stand-in answers at once from here: Claude's report arrives on the
 *     agent's next read, the account reads signed in, and a Claude start is
 *     no longer refused for want of a report.
 * (e) The stand-in is slow again: the next read runs out of time, said once
 *     more, and the account still reads signed in, the machine still
 *     authenticated.
 * (f) Reconnect: the hub restarts, and the agent reads online within 3 s of
 *     the hub answering.
 * (g) A new agent process (what a binary update starts) reads online within
 *     3 s of starting.
 *
 *   bun scripts/probe-kit/run.ts slow-harness-cli
 */
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { unreportedHarnessRefusal } from "../../../packages/hub/src/placement";
import { ACCOUNT, type Fleet, MACHINE } from "../../scratch-fleet";
import type { Spec } from "../kit";

const SLOW_S = 30;
const ONLINE_MS = 3000;
/** The agent's word for a dir whose `auth status` gave no answer (accounts.ts `AuthStatusUnanswered`). */
const UNANSWERED =
  /Claude Code did not answer `claude auth status` for (\S+): no answer within 20 s after (\d+) ms\./g;

interface AgentRow {
  auth: string;
  custody?: { state: string };
  harnesses?: { harness: string; auth: string }[];
  hostname: string;
  machineCapabilities?: { items: { id: string; available: boolean }[] };
  machineId: string;
  status: string;
}

/** The stand-in `claude`: while `flag` exists, 30 s before `--version` and `auth status`; then the real one. */
const standIn = (
  real: string,
  log: string,
  flag: string
): string => `#!/bin/bash
stamp() { echo "\${EPOCHREALTIME/./} $1 $$ $ARGS" >> "${log}"; }
ARGS="$*"
case " $* " in
  *" --version "*|*" auth status "*)
    if [ -e "${flag}" ]; then
      stamp start
      trap 'stamp cut; kill "$nap" 2>/dev/null; exit 143' TERM INT
      sleep ${SLOW_S} & nap=$!
      wait "$nap"
      stamp answered
    else
      stamp at-once
    fi
    ;;
esac
exec "${real}" "$@"
`;

/** Every time the agent said the account's dir gave no answer: the dir and how long it waited. */
const unanswered = async (
  fleet: Fleet
): Promise<{ dir: string; ms: number }[]> =>
  [...(await fleet.logs("agent")).matchAll(UNANSWERED)]
    .filter(
      (match) =>
        match[1] === join(fleet.home, ".cawco", "accounts", ACCOUNT, "claude")
    )
    .map((match) => ({ dir: match[1] as string, ms: Number(match[2]) }));

/** Polls every 100 ms until `read` answers something; undefined past `ms`. */
const poll = async <T>(
  read: () => Promise<T | undefined> | T | undefined,
  ms: number
): Promise<T | undefined> => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // biome-ignore lint/performance/noAwaitInLoops: each look follows the fleet's last state
    const value = await Promise.resolve()
      .then(read)
      .catch(() => undefined);
    if (value !== undefined) {
      return value;
    }
    await Bun.sleep(100);
  }
};

/** What drives this spec's fleet: its machine's row, a Claude start, the account's sign-in. */
const drive = (fleet: Fleet) => {
  const row = async (): Promise<AgentRow | undefined> =>
    (await fleet.api<AgentRow[]>("/api/agents")).find(
      (agent) => agent.machineId === MACHINE
    );
  const claudeReport = (agent: AgentRow | undefined) =>
    agent?.harnesses?.find((one) => one.harness === "claude");
  /** When the machine's row first reads online, or undefined past `ms`. */
  const onlineAt = (ms: number) =>
    poll(
      async () => ((await row())?.status === "online" ? Date.now() : undefined),
      ms
    );
  /** The account's sign-in on the machine, as the hub holds it; undefined when it holds none. */
  const signin = () =>
    fleet.query<{ state: string }>(
      "SELECT state FROM account_signins WHERE account_id = ? AND machine_id = ?",
      ACCOUNT,
      MACHINE
    )[0]?.state;
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
  return { row, claudeReport, onlineAt, signin, startClaude };
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
    const flag = join(fleet.sandbox, "slow-claude.on");
    await mkdir(bin, { recursive: true });
    await writeFile(join(bin, "claude"), standIn(real, log, flag));
    await chmod(join(bin, "claude"), 0o755);
    await writeFile(flag, "");
    const slowPath = { PATH: `${bin}:${fleet.env.PATH}` };
    const calls = async (from: number) =>
      (await readFile(log, "utf8").catch(() => ""))
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [micros, how, , ...args] = line.split(" ");
          return `${Math.round(Number(micros) / 1000) - from} ms ${how} ${args.join(" ")}`;
        })
        .join("; ");
    const { row, claudeReport, onlineAt, startClaude } = drive(fleet);

    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();

    // (a) Started with the slow stand-in first on its PATH.
    const started = Date.now();
    fleet.launch("agent", [], slowPath);
    const up = await onlineAt(60_000);
    check(
      `(a) the agent reads online within ${ONLINE_MS / 1000} s of starting, with a claude that takes ${SLOW_S} s to answer`,
      up !== undefined && up - started <= ONLINE_MS,
      `online after ${up === undefined ? "more than 60000" : up - started} ms`
    );
    const first = await row();
    check(
      "(a) it read online before Claude's report arrived",
      claudeReport(first) === undefined,
      JSON.stringify(first?.harnesses ?? null)
    );

    // (b) A Claude start before Claude's report.
    const expected = unreportedHarnessRefusal(
      first?.hostname ?? MACHINE,
      "claude"
    );
    const before = await startClaude();
    check(
      "(b) a Claude start before Claude's report is refused in the hub's sentence",
      before.said === expected,
      `said: ${before.said || "(nothing in 10 s)"}; expected: ${expected}`
    );
    const held = (await fleet.heldProcs()).filter(({ procId }) =>
      procId.includes(before.id)
    );
    check(
      "(b) the refused start has no row on the hub and nothing on the machine's keeper",
      fleet.instance(before.id) === undefined && held.length === 0,
      `row: ${JSON.stringify(fleet.instance(before.id))}; held: ${JSON.stringify(held)}`
    );

    await timeouts({
      check,
      fleet,
      flag,
      expected,
      calls: () => calls(started),
    });
    await reconnects({ check, fleet, slowPath });
  },
};

interface Phase {
  check: (assertion: string, ok: boolean, detail?: string) => boolean;
  fleet: Fleet;
}

/** (c) to (e): a sign-in moves only on Claude Code's answer, and a read that runs out of time is said once. */
const timeouts = async ({
  check,
  fleet,
  flag,
  expected,
  calls,
}: Phase & {
  calls: () => Promise<string>;
  expected: string;
  flag: string;
}): Promise<void> => {
  const { row, claudeReport, signin, startClaude } = drive(fleet);
  {
    // (c) The first read's `auth status` runs out of time.
    const cut = await poll(async () => {
      const said = await unanswered(fleet);
      return said.length > 0 ? said : undefined;
    }, 45_000);
    await Bun.sleep(1000);
    const cutOnce = await unanswered(fleet);
    check(
      "(c) the agent says once that the account's dir did not answer, naming the dir and how long it waited",
      cut !== undefined &&
        cutOnce.length === 1 &&
        (cutOnce[0]?.ms ?? 0) >= 20_000,
      `said: ${JSON.stringify(cutOnce)}; the stand-in: ${await calls()}`
    );
    const afterCut = await startClaude();
    check(
      "(c) the hub files no Claude report from it, keeps no sign-in for the account, and still refuses a Claude start",
      claudeReport(await row()) === undefined &&
        signin() === undefined &&
        afterCut.said === expected,
      `report: ${JSON.stringify(claudeReport(await row()) ?? null)}; sign-in: ${signin() ?? "none"}; said: ${afterCut.said || "(nothing in 10 s)"}`
    );
    const caps = await poll(
      async () => (await row())?.machineCapabilities,
      30_000
    );
    check(
      "(c) the machine's capabilities arrive as their own update, listing claude",
      caps?.items.some((item) => item.id === "claude") === true,
      JSON.stringify(caps?.items.map((item) => item.id) ?? null)
    );

    // (d) The stand-in answers at once from here.
    await rm(flag);
    const quick = Date.now();
    const answered = await poll(async () => {
      const agent = await row();
      return claudeReport(agent) && signin() === "signed-in"
        ? agent
        : undefined;
    }, 120_000);
    check(
      "(d) Claude's report arrives on the agent's next read once the stand-in answers, and the account reads signed in",
      answered !== undefined && answered.auth === "authenticated",
      `after ${Date.now() - quick} ms: report ${JSON.stringify(claudeReport(answered) ?? null)}; sign-in: ${signin() ?? "none"}; machine: ${answered?.auth ?? "-"}`
    );
    const after = await startClaude();
    check(
      "(d) a Claude start is no longer refused for want of a report",
      after.said !== expected,
      `said: ${after.said || "(no refusal in 10 s)"}`
    );

    // (e) Slow again: the next read runs out of time.
    await writeFile(flag, "");
    const again = await poll(async () => {
      const said = await unanswered(fleet);
      return said.length > 1 ? said : undefined;
    }, 120_000);
    await Bun.sleep(2000);
    const machine = await row();
    check(
      "(e) the next read's timeout is said once more, and the account still reads signed in, the machine still authenticated",
      again?.length === 2 &&
        signin() === "signed-in" &&
        machine?.auth === "authenticated" &&
        claudeReport(machine)?.auth === "authenticated",
      `said: ${JSON.stringify(again ?? null)}; sign-in: ${signin() ?? "none"}; machine: ${machine?.auth}; report: ${JSON.stringify(claudeReport(machine) ?? null)}`
    );
  }
};

/** (f) and (g): a reconnect, and a new agent process, each online within seconds. */
const reconnects = async ({
  check,
  fleet,
  slowPath,
}: Phase & { slowPath: Record<string, string> }): Promise<void> => {
  const { row, onlineAt } = drive(fleet);
  {
    // (f) The hub restarts: the agent reconnects and registers again.
    await fleet.stop("hub");
    fleet.launch("hub");
    await fleet.hubUp();
    const hubBack = Date.now();
    const back = await onlineAt(60_000);
    check(
      `(f) after a hub restart the agent reads online within ${ONLINE_MS / 1000} s of the hub answering`,
      back !== undefined && back - hubBack <= ONLINE_MS,
      `online ${back === undefined ? "more than 60000" : back - hubBack} ms after the hub answered`
    );

    // (g) A new agent process, as a binary update starts one.
    await fleet.stop("agent");
    await poll(
      async () => ((await row())?.status === "online" ? undefined : true),
      10_000
    );
    const restarted = Date.now();
    fleet.launch("agent", [], slowPath);
    const relaunched = await onlineAt(60_000);
    check(
      `(g) a new agent process reads online within ${ONLINE_MS / 1000} s of starting`,
      relaunched !== undefined && relaunched - restarted <= ONLINE_MS,
      `online ${relaunched === undefined ? "more than 60000" : relaunched - restarted} ms after it started`
    );
  }
};

export default spec;
