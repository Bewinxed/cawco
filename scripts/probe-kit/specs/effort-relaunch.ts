/**
 * A session's effort is the one the operator chose, through every relaunch.
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model) with two fake accounts, A and B: one Claude session on an
 * effort model is spawned at `xhigh`, then set to `max` live (`setEffort`,
 * a dashboard's control). It is then brought back by each path in turn:
 *
 * 1. a crash: its CLI killed from outside, the hub resuming it;
 * 2. an agent restart: the agent reattaches to the CLI sessiond kept;
 * 3. a hub restart;
 * 4. an account move: the person's move to the other account, at rest (the
 *    relaunch a usage-limit move makes on its account);
 * 5. `continue_session` in place: the body that tool posts, naming no effort
 *    (the path an at-limit continuation takes too);
 * 6. a continuation into a new session, naming no effort.
 *
 * After each, a marked message is answered, and four readings all say `max`:
 * the CLI's argv `--effort`, the effort its request to the model carried, the
 * row's applied effort (`effort`, the CLI's `get_settings` read back) and the
 * row's chosen effort (`chosen_effort`, what every launch asks for).
 *
 *   bun scripts/probe-kit/run.ts effort-relaunch
 */
import { ACCOUNT, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";
import { B, furnishAccount } from "./account-move";

/** A model whose effort scale reaches `max`: the scratch fleet's Haiku sends none. */
const EFFORT_MODEL = "claude-opus-5-5";
const SPAWNED_AT = "xhigh";
const CHOSEN = "max";

const MARK = /EFFORT-MARK-\d+/;
const EFFORT_ARG = /--effort(?:=|\s+)(\w+)/;
const PS_LINE = /^(\d+)\s+(\d+)\s+(.*)$/;

const words = (text: string): Reply => ({ everyMs: 5, words: [text] });

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return words("Probe title");
  }
  const mark = MARK.exec(request.last);
  return words(mark ? `${mark[0]}-ANSWERED` : "ok");
};

interface EffortConfig {
  output_config?: { effort?: string };
}

/**
 * The effort a request runs its newest turn at. Claude Code sends effort per
 * message on a model with per-turn effort (beta `per-turn-control-2026-07-01`;
 * its errors read `messages.N: output_config.effort`), so a resumed
 * conversation's body holds every earlier turn at the level it was sent at:
 * the newest message's own effort is this turn's, else the request's.
 */
const turnEffort = (body: string): string | undefined => {
  const request = JSON.parse(body) as EffortConfig & {
    messages?: EffortConfig[];
  };
  return (
    request.messages?.at(-1)?.output_config?.effort ??
    request.output_config?.effort
  );
};

interface EffortRow {
  account_id: string | null;
  chosen_effort: string | null;
  effort: string | null;
}

/** Every process's pid, parent and command line, read once. */
const processTable = async () => {
  const listed = await new Response(
    Bun.spawn(["ps", "-A", "-o", "pid=,ppid=,args="]).stdout
  ).text();
  return listed
    .split("\n")
    .map((line) => PS_LINE.exec(line.trim()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map(([, pid, ppid, args]) => ({
      pid: Number(pid),
      ppid: Number(ppid),
      args: args ?? "",
    }));
};

/** The `--effort` on the command line of `pid` or the first process under it that has one. */
const argvEffort = async (pid: number): Promise<string | undefined> => {
  const table = await processTable();
  const queue = [pid];
  let found: string | undefined;
  while (queue.length > 0 && found === undefined) {
    const at = queue.shift();
    found = EFFORT_ARG.exec(
      table.find((one) => one.pid === at)?.args ?? ""
    )?.[1];
    queue.push(...table.filter((one) => one.ppid === at).map((one) => one.pid));
  }
  return found;
};

type Fleet = Awaited<ReturnType<Kit["fleet"]>>;

/** The fleet with account B signed in beside A, every service up. */
const fleetOfTwo = async (kit: Kit): Promise<Fleet> => {
  const fleet = await kit.fleet(respond);
  await furnishAccount(fleet.home, B);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.write(
    "INSERT OR IGNORE INTO accounts (id, provider, kind, label, hue, \"order\", never_backup, created_at) VALUES (?, 'anthropic', 'console', 'Probe B', 'green', 1, 0, ?)",
    B,
    Date.now()
  );
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  await until(
    "account B signed in",
    () =>
      fleet.query<{ state: string }>(
        "SELECT state FROM account_signins WHERE account_id = ?",
        B
      )[0],
    (row) => row?.state === "signed-in"
  );
  return fleet;
};

const run = async (kit: Kit) => {
  const fleet = await fleetOfTwo(kit);

  const rowOf = (instanceId: string) =>
    fleet.query<EffortRow>(
      "SELECT effort, chosen_effort, account_id FROM instances WHERE id = ?",
      instanceId
    )[0];
  /** Waits for the session's CLI to be a process other than `old`. */
  const relaunched = (
    instanceId: string,
    old: number | undefined,
    label: string
  ) =>
    until(
      label,
      () => fleet.sessionPid(instanceId),
      (pid) => pid !== undefined && pid !== old,
      180_000
    ).catch(() => undefined);

  let marks = 0;
  /** A marked message answered, then the four readings, each `expected`. */
  const reads = async (name: string, instanceId: string, expected: string) => {
    marks += 1;
    const mark = `EFFORT-MARK-${marks}`;
    await fleet.send(instanceId, `${mark} carry on`);
    const asked = await until(
      `${name}: the marked message reaches the model`,
      () => fleet.seen.find((one) => one.tools && one.last.includes(mark)),
      Boolean,
      180_000
    ).catch(() => undefined);
    const sent = asked ? turnEffort(asked.body) : undefined;
    kit.check(
      `${name}: the request to the model carries effort ${expected}`,
      sent === expected,
      asked ? `sent ${sent ?? "none"}` : "no request seen"
    );
    const pid = await fleet.sessionPid(instanceId);
    const argv = pid ? await argvEffort(pid) : undefined;
    kit.check(
      `${name}: the CLI's argv says --effort=${expected}`,
      argv === expected,
      `pid ${pid}: --effort=${argv ?? "none"}`
    );
    const row = await until(
      `${name}: the row's applied effort reads ${expected}`,
      () => rowOf(instanceId),
      (one) => one?.effort === expected,
      30_000
    ).catch(() => rowOf(instanceId));
    kit.check(
      `${name}: the row's applied effort (the CLI's reading) is ${expected}`,
      row?.effort === expected,
      `effort ${row?.effort}`
    );
    kit.check(
      `${name}: the row's chosen effort is ${expected}`,
      row?.chosen_effort === expected,
      `chosen_effort ${row?.chosen_effort}`
    );
  };

  // 0. Spawned at xhigh, then set to max live.
  const id = await fleet.spawn("claude", "Effort probe", fleet.workdir, {
    model: EFFORT_MODEL,
    effort: SPAWNED_AT,
  });
  await reads("spawned at xhigh", id, SPAWNED_AT);
  await fleet.control(id, "setEffort", [CHOSEN]);
  const set = await until(
    "set to max: the CLI reads it back",
    () => rowOf(id),
    (one) => one?.effort === CHOSEN,
    30_000
  ).catch(() => rowOf(id));
  kit.check(
    "set to max live: the row's chosen and applied effort are max",
    set?.effort === CHOSEN && set.chosen_effort === CHOSEN,
    `effort ${set?.effort}, chosen_effort ${set?.chosen_effort}`
  );

  // 1. A crash: the CLI killed from outside, the hub resuming it.
  const crashed = await fleet.sessionPid(id);
  if (crashed) {
    await fleet.killTree(crashed, "SIGKILL");
  }
  await relaunched(id, crashed, "crash: the session is resumed");
  await reads("crash", id, CHOSEN);

  // 2. An agent restart: the CLI sessiond kept is reattached.
  await fleet.stop("agent");
  fleet.launch("agent");
  await fleet.agentUp();
  await reads("agent restart", id, CHOSEN);

  // 3. A hub restart.
  await fleet.stop("hub");
  fleet.launch("hub");
  await fleet.hubUp();
  await reads("hub restart", id, CHOSEN);

  // 4. An account move, at rest.
  const beforeMove = await fleet.sessionPid(id);
  const to = rowOf(id)?.account_id === B ? ACCOUNT : B;
  const moved = await fleet.api<{ state: string; why: string }>(
    `/api/instances/${id}/account`,
    { accountId: to }
  );
  kit.note(`account move: ${moved.state} (${moved.why})`);
  await until(
    "account move: lands on the other account",
    () => rowOf(id)?.account_id ?? undefined,
    (one) => one === to,
    180_000
  ).catch(() => undefined);
  await relaunched(id, beforeMove, "account move: relaunched");
  await reads("account move", id, CHOSEN);

  // 5. continue_session in place: what that tool posts for its own session,
  // a harness and a model and no effort (delegation-actions `continueSession`).
  const beforeContinue = await fleet.sessionPid(id);
  await fleet.api(`/api/instances/${id}/continue`, {
    asksOnly: true,
    target: {
      harness: "claude",
      model: EFFORT_MODEL,
      fallbackPermissionMode: "bypassPermissions",
    },
    inPlace: true,
    askedBy: id,
  });
  await relaunched(
    id,
    beforeContinue,
    "continue_session in place: a fresh conversation"
  );
  await reads("continue_session in place", id, CHOSEN);

  // 6. A continuation into a new session, naming no effort.
  const { continuationId } = await fleet.api<{ continuationId: string }>(
    `/api/instances/${id}/continue`,
    { asksOnly: true, target: { harness: "claude", model: EFFORT_MODEL } }
  );
  const outcome = await fetch(
    `${fleet.base}/api/continuations/${continuationId}/outcome`,
    { signal: AbortSignal.timeout(300_000) }
  );
  const { targetInstanceId } = (await outcome.json()) as {
    targetInstanceId: string;
  };
  await reads("continued in a new session", targetInstanceId, CHOSEN);
};

export default { name: "effort-relaunch", run } satisfies Spec;
