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
 * 7. An OpenCode `high` delegate (its own workspace, on the mock's OpenCode
 *    model) is compacted by a plain `/compact` send, as the dashboard sends
 *    it, and its next marked send is answered on the same work item, which
 *    is still running, with no error on its row.
 *
 * Its delegate cuts a workspace, so it runs as a `host` check (README, "A
 * spec that delegates is a `host` check").
 *
 *   bun scripts/probe-kit/run.ts effort-relaunch
 */
import {
  ACCOUNT,
  MODEL,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
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

/** What every turn of the OpenCode delegate carries (its brief, then each send): the mock knows its requests by it. */
const OC_DELEGATE = "RELAUNCH-OC-DELEGATE";
const OC_MARK = /RELAUNCH-OC-DELEGATE-\w+/;
/** OpenCode's instruction to summarize, which only its summarizing request carries (its binary; document-scope). */
const OC_SUMMARIZING =
  "Summarize only what the user and the assistant said and did";
/** What the hub tells a work item's session whose turn ended without `finish_item` (work-items.ts `quietTurn`). */
const STILL_OPEN = "Your work item is still open";
/** OpenCode's Code Mode tool, which runs MCP tools from a script. */
const CODE_MODE = "execute";
const HEADING = /^##\s.+$/gm;

/**
 * OpenCode's summary: each `##` heading its template names, filled. OpenCode
 * takes a summary only when it fills its template (document-scope
 * `templateHeadings`). The summary names the delegate, as its brief did.
 */
const summary = (body: string): Reply => {
  const texts: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === "string") {
      texts.push(value);
    } else if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value && typeof value === "object") {
      Object.values(value).forEach(walk);
    }
  };
  walk(JSON.parse(body));
  const said = `${OC_DELEGATE}-SUMMARY`;
  const headings = [
    ...new Set(texts.flatMap((text) => text.match(HEADING) ?? [])),
  ];
  return words(
    [...headings.map((heading) => `${heading}\n\n${said}`), said].join("\n\n")
  );
};

/**
 * A turn of the OpenCode delegate: its `wait_item` through Code Mode, then
 * its words. A work item whose session ends three turns in a row without
 * `finish_item` fails (hub work-items.ts `QUIET_TURNS`); a declared wait keeps
 * it running, so the leg's own turns never fail it.
 */
const delegateTurn = (request: Seen): Reply => {
  if (request.afterTool || !request.toolNames.includes(CODE_MODE)) {
    const mark = OC_MARK.exec(request.last);
    return words(mark ? `${mark[0]}-ANSWERED` : "Waiting for the probe.");
  }
  const wait = { minutes: 60, reason: "The probe drives this delegate." };
  return {
    everyMs: 5,
    words: [],
    tool: {
      name: CODE_MODE,
      input: {
        code: `return await tools.cawco.wait_item(${JSON.stringify(wait)});`,
      },
    },
  };
};

const respond = (request: Seen): Reply => {
  if (request.body.includes(OC_SUMMARIZING)) {
    return summary(request.body);
  }
  if (!request.tools) {
    return words("Probe title");
  }
  if (request.all.includes(OC_DELEGATE) || request.all.includes(STILL_OPEN)) {
    return delegateTurn(request);
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

  await compactedDelegate(kit, fleet, id);
};

/** A turn of session `session` ended: its row holds no open turn. */
const turnEnded = (fleet: Fleet, session: string, label: string) =>
  until(
    label,
    () => !fleet.instance(session)?.turn_open_at,
    Boolean,
    180_000
  ).catch(() => undefined);

/** The compactions session `session`'s transcript shows: its `compact_boundary` blocks. */
const compactions = async (fleet: Fleet, session: string): Promise<number> => {
  const response = await fetch(
    `${fleet.base}/api/instances/${session}/transcript?limit=1000`,
    { signal: AbortSignal.timeout(30_000) }
  ).catch(() => undefined);
  const text = response?.ok ? await response.text() : "";
  return text.split('"system.compact_boundary"').length - 1;
};

/**
 * 7. An OpenCode `high` delegate of `parent`'s, compacted by a plain
 * `/compact` send, answers its next send on the same work item.
 */
const compactedDelegate = async (kit: Kit, fleet: Fleet, parent: string) => {
  const delegated = await fleet.api<{
    instanceId: string;
    workItemId: string;
    workspaceId: string;
  }>("/api/work-items", {
    parentInstanceId: parent,
    title: "OpenCode relaunch probe",
    prompt: `${OC_DELEGATE}: say ok.`,
    type: "high",
    harness: "opencode",
    model: MODEL.opencode,
    cwd: fleet.repo,
    checks: [{ name: "Nothing to check", command: "true" }],
    lands: "none",
  });
  const high = delegated.instanceId;
  const first = await until(
    "OpenCode delegate: its first request",
    () => fleet.seen.find((one) => one.tools && one.all.includes(OC_DELEGATE)),
    Boolean,
    180_000
  ).catch(() => undefined);
  kit.check(
    "OpenCode delegate: its first turn reaches the model",
    first !== undefined,
    first ? "asked" : "no request seen"
  );
  await turnEnded(fleet, high, "OpenCode delegate: its first turn ended");

  const before = await compactions(fleet, high);
  await fleet.send(high, "/compact");
  const compacted = await until(
    "OpenCode delegate: the compaction's boundary in its transcript",
    () => compactions(fleet, high),
    (count) => count > before,
    180_000
  ).catch(() => before);
  kit.check(
    "OpenCode delegate: a /compact send compacts it (its transcript shows the boundary)",
    compacted > before,
    `${compacted - before} new compact_boundary`
  );
  await turnEnded(
    fleet,
    high,
    "OpenCode delegate: the compaction's turn ended"
  );

  const mark = `${OC_DELEGATE}-AFTER`;
  const from = fleet.seen.length;
  await fleet.send(high, `${mark} carry on`);
  const after = await until(
    "OpenCode delegate: its send after the compaction at the model",
    () =>
      fleet.seen
        .slice(from)
        .find((one) => one.tools && one.last.includes(mark)),
    Boolean,
    180_000
  ).catch(() => undefined);
  await turnEnded(
    fleet,
    high,
    "OpenCode delegate: its turn after the compaction ended"
  );
  const [row] = fleet.query<{
    status: string;
    last_error: string | null;
    turn_open_at: number | null;
  }>(
    "SELECT status, last_error, turn_open_at FROM instances WHERE id = ?",
    high
  );
  const [item] = fleet.query<{ state: string; error: string | null }>(
    "SELECT state, error FROM work_items WHERE id = ?",
    delegated.workItemId
  );
  const answered =
    after !== undefined && item?.state === "running" && !row?.last_error;
  kit.check(
    "OpenCode delegate after compaction: its next send reaches the model, its item still running, no error on its row",
    answered,
    JSON.stringify({ asked: after !== undefined, row, item })
  );
  if (!answered) {
    // What the agent and its keeper said of the delegate's workspace and
    // session: the one record of a boundary start that failed.
    const ws = delegated.workspaceId.slice(0, 8);
    const said = (await fleet.logs("agent"))
      .split("\n")
      .filter(
        (line) =>
          line.includes(ws) ||
          line.includes(high) ||
          line.includes("[sessiond]")
      )
      .slice(-120);
    kit.note(`agent log, workspace ${ws} and the keeper:\n${said.join("\n")}`);
    const keeper = (await fleet.logs("sessiond")).split("\n").slice(-60);
    kit.note(`sessiond log, last lines:\n${keeper.join("\n")}`);
  }
};

export default { name: "effort-relaunch", run } satisfies Spec;
