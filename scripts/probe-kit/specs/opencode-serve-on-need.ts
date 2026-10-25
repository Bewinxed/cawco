/**
 * An OpenCode server starts for a session someone runs on OpenCode, and for
 * nothing else, one per session's need, and ends once no session is on it.
 * Read on a scratch fleet with OpenCode 2.0 on the mock, by the processes
 * themselves: every `opencode serve` whose HOME is the fleet's, the
 * machine's or an account's by its data dir (an account's is under
 * `opencode-accounts/`).
 *
 * (a) An agent that connects, reports, syncs the fleet and has its own
 *     stores read by the hub (everything an agent does with no session)
 *     runs no server, and its report carries OpenCode's model catalog, read
 *     by one-shot `opencode api --standalone` requests, whose private
 *     server is a child that ends with each request. Before, its catalog, its provider list, the fleet sync's MCP
 *     read and the hub's read of OpenCode's own sign-ins each started the
 *     machine's server, which ran on for good.
 * (b) A session on an account starts that account's server and no other.
 *     Before, every account's start started the machine's server first.
 * (c) A session on no account starts the machine's.
 * (d) Both stopped, each server is retired once idle (the adapter's
 *     `SERVER_IDLE_MS`, five minutes) and its process ends.
 *
 *   bun scripts/probe-kit/run.ts opencode-serve-on-need
 */
import {
  commandLines,
  processArgs,
} from "../../../packages/core/src/process-identity";
import { MACHINE, PRICED_OPENCODE_MODEL, until } from "../../scratch-fleet";
import type { Spec } from "../kit";

const PROMPT = "Start a server for me.";

/** The adapter's idle time, and the minute and a half of ticks and grace an end takes past it. */
const RETIRED_WITHIN_MS = 5 * 60_000 + 90_000;

/** The key the probe's OpenCode Zen account holds: the mock takes any. */
const KEY = "sk-probe-opencode-serve-on-need-0123456789";

interface Serve {
  /** Whether it is an account's server (its data dir an account's). */
  account: boolean;
  pid: number;
}

/**
 * Every `opencode serve` running with `home` as its HOME, but a one-shot
 * read's: `opencode api --standalone` runs its private server as a child,
 * `serve --stdio --port 0` (observed on 2.0.29), which answers the one
 * request over its pipes and ends with its parent within the read.
 */
const servesOf = async (home: string): Promise<Serve[]> => {
  const found: Serve[] = [];
  for (const { pid, command } of await commandLines()) {
    if (!command.includes(" serve")) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: only the few serve lines are read whole
    const read = await processArgs(pid);
    if (
      read?.argv.includes("serve") &&
      !read.argv.includes("--stdio") &&
      read.env.includes(`HOME=${home}`)
    ) {
      found.push({
        pid,
        account: read.env.some(
          (entry) =>
            entry.startsWith("XDG_DATA_HOME=") &&
            entry.includes("/opencode-accounts/")
        ),
      });
    }
  }
  return found;
};

const spec: Spec = {
  name: "opencode-serve-on-need",
  async run(kit) {
    const { check } = kit;
    const fleet = await kit.fleet((request) =>
      request.last.includes(PROMPT)
        ? { everyMs: 5, words: ["started"] }
        : { everyMs: 5, words: ["Title"] }
    );
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.launch("agent");
    await fleet.agentUp();

    // (a) Online with its reports. A further half-minute covers the fleet
    // sync and the hub's read of the machine's own stores, which follow the
    // register.
    const opencodeReport = async () =>
      (
        await fleet.api<
          {
            harnesses?: {
              harness: string;
              models?: unknown[];
              modelsUnread?: string;
            }[];
          }[]
        >("/api/agents")
      )
        .flatMap((row) => row.harnesses ?? [])
        .find((report) => report.harness === "opencode");
    const listed = await until(
      "the machine's report carrying OpenCode's catalog",
      opencodeReport,
      (report) =>
        (report?.models?.length ?? 0) > 0 || report?.modelsUnread !== undefined,
      90_000
    );
    await Bun.sleep(30_000);
    const idle = await servesOf(fleet.home);
    check(
      "(a) an agent with no OpenCode session runs no opencode serve",
      idle.length === 0,
      `serve pids ${JSON.stringify(idle)}`
    );
    check(
      "(a) its report carries OpenCode's model catalog with no server",
      (listed?.models?.length ?? 0) > 0,
      `${listed?.models?.length ?? 0} models${listed?.modelsUnread ? `; ${listed.modelsUnread}` : ""}`
    );

    // (b) A session on an account: that account's server, and no other.
    const choices = await fleet.api<
      { kind: string; provider: string; signin: string }[]
    >("/api/accounts/providers");
    const zen = choices.find(
      (one) => one.provider === "opencode" && one.signin === "api-key"
    );
    check(
      "(b) the hub offers an OpenCode Zen key account, from the providers the machine's OpenCode listed with no server",
      zen !== undefined,
      JSON.stringify(choices.map((one) => one.provider))
    );
    const account = await fleet.api<{ id: string }>("/api/accounts", {
      provider: "opencode",
      kind: "api_key",
    });
    await fleet.api(`/api/accounts/${account.id}/key`, {
      key: KEY,
      machineIds: [MACHINE],
    });
    const onAccount = await fleet.spawn(
      "opencode",
      "On an account",
      fleet.workdir,
      { account: account.id, model: PRICED_OPENCODE_MODEL }
    );
    const accountSend = await fleet.send(onAccount, PROMPT);
    await until(
      "the account session's send read",
      () => fleet.sendRow(accountSend),
      (row) => row?.state === "read",
      180_000
    );
    const accountServes = await servesOf(fleet.home);
    check(
      "(b) a session on an account runs exactly one opencode serve, the account's",
      accountServes.length === 1 && accountServes[0]?.account === true,
      JSON.stringify(accountServes)
    );

    // (c) A session on no account: the machine's.
    const onMachine = await fleet.spawn(
      "opencode",
      "On the machine",
      fleet.workdir
    );
    const machineSend = await fleet.send(onMachine, PROMPT);
    await until(
      "the machine session's send read",
      () => fleet.sendRow(machineSend),
      (row) => row?.state === "read",
      180_000
    );
    const bothServes = await servesOf(fleet.home);
    check(
      "(c) a session on no account adds the machine's server, one of each",
      bothServes.filter((one) => one.account).length === 1 &&
        bothServes.filter((one) => !one.account).length === 1,
      JSON.stringify(bothServes)
    );

    // (d) Their need ended: each server is retired once idle, and ends.
    await fleet.stopSession(onAccount);
    await fleet.stopSession(onMachine);
    const after = await until(
      "every server ended once idle",
      () => servesOf(fleet.home),
      (serves) => serves.length === 0,
      RETIRED_WITHIN_MS
    );
    check(
      "(d) both sessions stopped, every server ends once idle",
      after.length === 0,
      JSON.stringify(after)
    );
    const said = await fleet.logs("agent");
    check(
      "(d) the agent says why it retired each",
      said.includes("the machine's server: no session on it for 5 minutes") &&
        said.includes(`account ${account.id}: no session on it for 5 minutes`),
      "the retirement lines"
    );
  },
};

export default spec;
