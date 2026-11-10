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
 * (b) A Claude start before that report, naming its permission mode as the
 *     dashboard's form does, is refused in the hub's sentence (placement.ts
 *     `unreportedHarnessRefusal`), and nothing is left of it. (A start that
 *     names none is refused for want of a mode first: the machine's modes
 *     are not known yet, launches.ts `settleMode`.)
 * (c) The first read waits 5 s for `--version` and gets no answer, so it
 *     runs no `auth status` (claude-version.ts `claudeToStart`): the agent
 *     says once that the account's dir was not read, naming the dir and
 *     why, and reports Claude refused for the version it hasn't said
 *     (`versionRefusal`). The hub keeps no sign-in for the account, and a
 *     Claude start is still refused, in the sentence the machine's row says
 *     (core harness-refusal.ts `harnessRefusal`): its version not said yet,
 *     clearing as it answers, not "no account" (hub
 *     spawns.ts `placeSpawn`). The machine's capabilities arrive as their
 *     own update.
 * (d) The stand-in answers at once from here, and the `--version` it was
 *     already asked goes on to its answer: Claude's report on the agent's
 *     next read carries that version and no refusal, the account reads
 *     signed in, and a Claude start is no longer refused for want of a
 *     report. The agent reads Claude again as that answer comes
 *     (claude-version.ts `onVersionAnswered`), so the hub has it within
 *     seconds, not at the next minute's read.
 * (e) The stand-in is slow again: the next read's `auth status` runs out of
 *     time, said once, naming the dir and how long it waited, and the
 *     account still reads signed in, the machine still authenticated.
 * (h) Claude Code's file changes and it is slow to say its version again:
 *     another session's hand-off to a sleeping session there is refused by
 *     the hub before it is taken, in the row's sentence, and nothing is
 *     launched for it (hub launch-accounts.ts `launchAccount`).
 * (f) Reconnect: the hub restarts, and the agent reads online within 3 s of
 *     the hub answering.
 * (g) A new agent process (what a binary update starts) reads online within
 *     3 s of starting.
 *
 *   bun scripts/probe-kit/run.ts slow-harness-cli
 */
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  authStatusNotRun,
  noAuthAnswer,
} from "../../../packages/agent/src/accounts";
import { versionRefusal } from "../../../packages/agent/src/claude-version";
import { type Bounded, readWithin } from "../../../packages/core/src/bounded";
import { harnessRefusal } from "../../../packages/core/src/harness-refusal";
import { machineLabel } from "../../../packages/core/src/machine-names";
import type { ToolState } from "../../../packages/core/src/tools";
import { unhandled } from "../../../packages/core/src/unhandled";
import { systemProgram } from "../../../packages/core/src/workspace-needs";
import { unreportedHarnessRefusal } from "../../../packages/hub/src/placement";
import { toolWords } from "../../lib/tool-call";
import { ACCOUNT, type Fleet, MACHINE, until } from "../../scratch-fleet";
import { atRest } from "../phone";
import type { KitFleet, Spec } from "../spec";

const SLOW_S = 30;
const ONLINE_MS = 3000;
/** How long a read waits for `claude --version` (claude-version.ts `VERSION_WAIT_MS`). */
const VERSION_WAIT_MS = 5000;
/** The machine's word on a Claude Code that hasn't said its version within the wait. */
const VERSION_UNSAID =
  versionRefusal({
    kind: "unanswered",
    after: VERSION_WAIT_MS,
    reason: "timeout",
  }) ?? "";

interface AgentRow {
  auth: string;
  custody?: { state: string };
  harnesses?: {
    harness: string;
    auth: string;
    authReason?: string;
    refused?: string;
    version?: string;
  }[];
  hostname: string;
  machineCapabilities?: { items: { id: string; available: boolean }[] };
  machineId: string;
  status: string;
  /** Each tool's cell, by its id (dashboard harness-block.svelte.ts reads `claude`'s). */
  tools?: Record<string, { state: ToolState; version?: string }>;
}

/** The stand-in `claude`: while `flag` exists, 30 s before `--version` and `auth status`; then the real one. */
const standIn = (
  real: string,
  log: string,
  flag: string
): string => `#!${systemProgram("bash")}
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

/** How soon after `claude --version` answers the hub reads Claude as answered, at most (claude-version.ts `onVersionAnswered`): the re-read of the sign-ins, not the next minute's. */
const ANSWER_SEEN_MS = 10_000;

/** A stand-in's log line for a held `--version` it answered. */
const VERSION_ANSWERED = / answered .*--version/u;

/** When (epoch ms) the stand-in first answered a `--version` it had held, as its log stamps it; undefined before any. */
const versionAnsweredAt = async (log: string): Promise<number | undefined> => {
  const stamps = (await readFile(log, "utf8").catch(() => ""))
    .split("\n")
    .filter((line) => VERSION_ANSWERED.test(line))
    .map((line) => Math.round(Number(line.split(" ")[0]) / 1000));
  return stamps[0];
};

/** The account's Claude dir, as the agent names it. */
const accountDir = (fleet: Fleet): string =>
  join(fleet.home, ".cawco", "accounts", ACCOUNT, "claude");

/** The agent's lines on its sign-in reads (accounts.ts `unreadAccount`). */
const signinLines = async (fleet: Fleet): Promise<string[]> =>
  (await fleet.logs("agent"))
    .split("\n")
    .filter((line) => line.includes("[accounts] "));

/** Every time the agent said the account's dir was not read because Claude Code hasn't said its version. */
const notRun = async (fleet: Fleet): Promise<string[]> => {
  const said = `[accounts] ${authStatusNotRun(accountDir(fleet), VERSION_UNSAID)}`;
  return (await signinLines(fleet)).filter((line) => line.endsWith(said));
};

/** Every time the agent said the account's dir gave no answer in time, with how long it waited. */
const unanswered = async (fleet: Fleet): Promise<{ ms: number }[]> =>
  (await signinLines(fleet)).flatMap((line) => {
    const waited = [...line.matchAll(/\d+/gu)]
      .map((digits) => Number(digits[0]))
      .find((ms) =>
        line.endsWith(
          `[accounts] ${noAuthAnswer(accountDir(fleet), { after: ms, reason: "timeout" })}`
        )
      );
    return waited === undefined ? [] : [{ ms: waited }];
  });

/** Polls every 100 ms until `read` answers something; undefined past `ms`. */
const poll = async <T>(
  read: () => Promise<T | undefined> | T | undefined,
  ms: number
): Promise<T | undefined> => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
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
    (await fleet.api((hub) => hub.api.agents.get())).find(
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
  /** A Claude start from the dashboard: the hub's error for it, or unanswered when none came in 10 s. */
  const startClaude = async (): Promise<{
    id: string;
    said: Bounded<string>;
  }> => {
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
        // The dashboard's form names a mode: one that names none is
        // refused for it before anything else (launches.ts `settleMode`).
        payload: {
          instanceId: id,
          cwd: fleet.workdir,
          harness: "claude",
          model: "claude-haiku-4-5",
          permissionMode: "bypassPermissions",
        },
      })
    );
    const said = await readWithin(10_000, () => refused);
    socket.close();
    return { id, said };
  };
  return { row, claudeReport, onlineAt, signin, startClaude };
};

/**
 * What the machine's row says of its Claude Code while it stands refused
 * (core harness-refusal.ts `harnessRefusal`, which dashboard
 * harness-block.svelte.ts says); undefined while it runs or has not reported.
 */
const rowSentence = (agent: AgentRow | undefined): string | undefined => {
  const report = agent?.harnesses?.find((one) => one.harness === "claude");
  if (!report) {
    return;
  }
  const { authReason, refused, version } = report;
  return harnessRefusal(
    {
      harness: "claude",
      installed: refused !== "not-installed",
      ...(authReason ? { authReason } : {}),
      ...(refused === "version" || refused === "not-installed"
        ? { refused }
        : {}),
      ...(version ? { version } : {}),
    },
    machineLabel(agent?.hostname ?? MACHINE),
    agent?.tools?.claude
  )?.why;
};

/** (d) The hub read Claude as answered (at `seenAt`) within {@link ANSWER_SEEN_MS} of the stand-in's held `--version` answering. */
const answeredSoon = async (
  check: Phase["check"],
  log: string,
  seenAt: number
): Promise<void> => {
  const saidAt = await versionAnsweredAt(log);
  check(
    `(d) the hub reads Claude as answered within ${ANSWER_SEEN_MS / 1000} s of the slow \`claude --version\` answering, not at the agent's next minute's read`,
    saidAt !== undefined && seenAt - saidAt <= ANSWER_SEEN_MS,
    `the stand-in answered at ${saidAt ?? "(never)"}; the hub's row read it ${saidAt === undefined ? "-" : seenAt - saidAt} ms after`
  );
};

/** Whether the hub refused a start in `expected`'s words; a start it did not answer was not. */
const refusedWith = (said: Bounded<string>, expected: string): boolean => {
  switch (said.kind) {
    case "answered":
      return said.value === expected;
    case "unanswered":
      return false;
    default:
      unhandled("read", said);
  }
};

/** What the hub said to a start, or that it said nothing. */
const heard = (said: Bounded<string>): string => {
  switch (said.kind) {
    case "answered":
      return said.value;
    case "unanswered":
      return `(nothing within ${said.after} ms)`;
    default:
      unhandled("read", said);
  }
};

const spec: Spec = {
  group: "The hub and machines",
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
      refusedWith(before.said, expected),
      `said: ${heard(before.said)}; expected: ${expected}`
    );
    const held = (await fleet.heldProcs()).filter(({ procId }) =>
      procId.includes(before.id)
    );
    check(
      "(b) the refused start has no row on the hub and nothing on the machine's keeper",
      fleet.instance(before.id) === undefined && held.length === 0,
      `row: ${JSON.stringify(fleet.instance(before.id))}; held: ${JSON.stringify(held)}`
    );

    const helper = await timeouts({
      check,
      fleet,
      flag,
      log,
      expected,
      calls: () => calls(started),
    });
    await stoppedSend({ check, fleet, helper, standIn: join(bin, "claude") });
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
  log,
  expected,
  calls,
}: Phase & {
  calls: () => Promise<string>;
  expected: string;
  flag: string;
  log: string;
}): Promise<string> => {
  const { row, claudeReport, signin, startClaude } = drive(fleet);
  {
    // (c) The first read: `--version` gives no answer within its wait, so
    // no `auth status` is run.
    const first = await poll(async () => {
      const said = await notRun(fleet);
      const report = claudeReport(await row());
      return said.length > 0 && report ? { said, report } : undefined;
    }, 45_000);
    await Bun.sleep(1000);
    const notRunOnce = await notRun(fleet);
    check(
      "(c) the first read runs no `auth status`: the agent says once that the account's dir was not read, naming the dir and the version Claude Code hasn't said",
      first !== undefined && notRunOnce.length === 1,
      `said: ${JSON.stringify(notRunOnce)}; the agent's sign-in lines: ${JSON.stringify(await signinLines(fleet))}; the stand-in: ${await calls()}`
    );
    const report = claudeReport(await row());
    check(
      "(c) the machine reports Claude refused for the version it hasn't said, and the hub keeps no sign-in for the account",
      report?.refused === "version" &&
        report.authReason === VERSION_UNSAID &&
        signin() === undefined,
      `report: ${JSON.stringify(report ?? null)}; sign-in: ${signin() ?? "none"}`
    );
    // The row's sentence, which the hub's refusal says too: the version
    // not said, not "no account".
    const why = rowSentence(await row());
    const afterCut = await startClaude();
    check(
      "(c) a Claude start is still refused, in the machine row's own sentence: Claude Code hasn't said its version yet, and it starts as it answers; nothing is left of it",
      why === VERSION_UNSAID &&
        refusedWith(afterCut.said, VERSION_UNSAID) &&
        fleet.instance(afterCut.id) === undefined,
      `said: ${heard(afterCut.said)}; the row's sentence: ${why ?? "(none)"}; row: ${JSON.stringify(fleet.instance(afterCut.id) ?? null)}`
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

    // (d) The stand-in answers at once from here; the `--version` already
    // asked runs on to its answer, 30 s after it was asked.
    await rm(flag);
    const quick = Date.now();
    const answered = await poll(async () => {
      const agent = await row();
      const claude = claudeReport(agent);
      return claude?.version !== undefined && signin() === "signed-in"
        ? agent
        : undefined;
    }, 150_000);
    await answeredSoon(check, log, Date.now());
    const claude = claudeReport(answered);
    check(
      "(d) on the agent's next read Claude's report carries the version it said and no refusal, and the account reads signed in",
      answered !== undefined &&
        answered.auth === "authenticated" &&
        claude?.version !== undefined &&
        claude.refused === undefined &&
        claude.authReason === undefined,
      `after ${Date.now() - quick} ms: report ${JSON.stringify(claude ?? claudeReport(await row()) ?? null)}; sign-in: ${signin() ?? "none"}; machine: ${answered?.auth ?? "-"}; the stand-in: ${await calls()}`
    );
    const after = await startClaude();
    switch (after.said.kind) {
      case "answered":
        check(
          "(d) a Claude start is no longer refused for want of a report",
          after.said.value !== expected,
          `said: ${after.said.value}`
        );
        break;
      case "unanswered":
        // No frame is not a yes: the start counts only once the hub holds its row.
        check(
          "(d) a Claude start is no longer refused for want of a report",
          fleet.instance(after.id) !== undefined,
          `no frame within ${after.said.after} ms; the hub's row: ${JSON.stringify(fleet.instance(after.id) ?? null)}`
        );
        break;
      default:
        unhandled("read", after.said);
    }

    // (e) Slow again: the next read's `auth status` runs out of time.
    await writeFile(flag, "");
    const cut = await poll(async () => {
      const said = await unanswered(fleet);
      return said.length > 0 ? said : undefined;
    }, 120_000);
    await Bun.sleep(2000);
    const cutOnce = await unanswered(fleet);
    const machine = await row();
    check(
      "(e) the next read's `auth status` runs out of time, said once, naming the dir and how long it waited; the account still reads signed in, the machine still authenticated",
      cut !== undefined &&
        cutOnce.length === 1 &&
        (cutOnce[0]?.ms ?? 0) >= 20_000 &&
        signin() === "signed-in" &&
        machine?.auth === "authenticated" &&
        claudeReport(machine)?.auth === "authenticated",
      `said: ${JSON.stringify(cutOnce)}; sign-in: ${signin() ?? "none"}; machine: ${machine?.auth}; report: ${JSON.stringify(claudeReport(machine) ?? null)}; the stand-in: ${await calls()}`
    );
    return after.id;
  }
};

/**
 * (h) The machine's Claude Code changes under it and is slow to say its
 * version again, so Claude stands refused once more, its account still
 * signed in. Another session's hand-off to a sleeping session there, which
 * would wake it, is refused by the hub before it is taken, in the sentence the machine's row
 * says (hub launch-accounts.ts `launchAccount`), and nothing is launched for it.
 */
const stoppedSend = async ({
  check,
  fleet,
  helper,
  standIn: path,
}: Pick<Phase, "check"> & {
  fleet: KitFleet;
  helper: string;
  standIn: string;
}): Promise<void> => {
  const { row } = drive(fleet);
  // Asleep, not stopped: another session's word to a stopped one is kept
  // until a person or its parent starts it, while one to a sleeping one
  // wakes it, which is the launch this leg holds the hub to.
  const target = await fleet.spawn("claude", "Asleep before the hand-off");
  // A turn first: a session with no conversation yet has nothing to sleep on.
  await fleet.send(target, "PROBE-FIRST-TURN");
  await until(
    "the target's first turn",
    () => fleet.seen.find((one) => one.last.includes("PROBE-FIRST-TURN")),
    (one) => one !== undefined,
    120_000
  );
  await atRest(fleet, target);
  // Asked again every 15 s: a machine refuses a sleep of one not at rest.
  let askedAt = 0;
  await until(
    "the target session asleep",
    async () => {
      const status = fleet.instance(target)?.status;
      if (status !== "sleeping" && Date.now() - askedAt > 15_000) {
        askedAt = Date.now();
        await fleet.control(target, "sleep");
      }
      return status;
    },
    (status) => status === "sleeping",
    90_000
  );
  // A new file where `claude` is (its mtime moved): its version is read
  // again, and the stand-in, still slow, takes 30 s to say it.
  await writeFile(path, await readFile(path, "utf8"));
  const why = await poll(async () => rowSentence(await row()), 120_000);
  const credential = await fleet.sessionCredential(helper);
  const door = { base: fleet.base, credential: credential ?? "", id: helper };
  // A hub that finds the target's cache cold refuses the first call; the
  // same call again is delivered, or refused for what stops it.
  let answer = await toolWords(
    door,
    "handoff",
    { target, message: "PROBE-STOPPED-HANDOFF" },
    { via: "mcp" }
  );
  if (!(why && answer.text.includes(why))) {
    answer = await toolWords(
      door,
      "handoff",
      { target, message: "PROBE-STOPPED-HANDOFF" },
      { via: "mcp" }
    );
  }
  check(
    "(h) with Claude Code's version unsaid again, a hand-off to a sleeping session there is refused by the hub in the machine row's sentence, and nothing is launched for it",
    why !== undefined &&
      answer.refused &&
      answer.text.includes(why) &&
      fleet.instance(target)?.status === "sleeping",
    `answer: ${answer.text}; the row's sentence: ${why ?? "(none within 120 s)"}; the target: ${JSON.stringify(fleet.instance(target) ?? null)}; helper credential: ${credential ? "yes" : "none"}`
  );
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
