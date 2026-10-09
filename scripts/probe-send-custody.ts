#!/usr/bin/env bun
/**
 * Send custody probe: a send to a session is read by the process that next
 * runs that session, exactly once, through every way its process can go
 * away; it fails only when the session is stopped by its person.
 *
 *   bun scripts/probe-send-custody.ts [--harness claude|opencode|pi]...
 *
 * On a scratch fleet (scratch-fleet.ts): a real hub, agent and sessiond
 * against a mock model. Each case runs on a session of its own:
 *
 *   sleep    — a send that crosses the agent putting the session to sleep;
 *   exit     — the session's process killed while idle, a send right behind;
 *   crash    — its process killed mid-turn with a send queued behind the turn;
 *   relaunch — the dashboard starting it again with a send queued;
 *   restart  — the agent and sessiond killed with a send queued, both back;
 *   stop     — a person stopping it with a send queued: that send fails;
 *   predeploy — a send handed to its machine by a hub from before sends were
 *              kept whole (its record written so), the hub started again,
 *              then the session's process killed;
 *   killed   — a delegate's Claude Code CLI SIGKILLed mid-turn with a send
 *              queued: its item keeps running, its turn is handed back once
 *              and the send read once; then killed twice in quick
 *              succession, and its item fails.
 *
 * Claude runs every case; opencode and pi run exit and restart. A case whose
 * session is left failed rather than asleep is woken by a person's next
 * message, as a failed session is, and both sends must then be read once
 * each.
 *
 * Prints `send custody: <harness> <case> <outcome>` per case that passed,
 * and exits 0 only if every one did.
 */
import {
  HARNESSES,
  type Harness,
  MACHINE,
  scratchFleet,
  until,
} from "./scratch-fleet";

type Case =
  | "sleep"
  | "exit"
  | "crash"
  | "relaunch"
  | "restart"
  | "stop"
  | "predeploy"
  | "killed";
const CASES: Record<Harness, Case[]> = {
  claude: [
    "sleep",
    "exit",
    "crash",
    "relaunch",
    "stop",
    "restart",
    "predeploy",
    "killed",
  ],
  opencode: ["exit", "restart"],
  pi: ["exit", "restart"],
};

/** `--harness` and `--case` narrow the run; neither runs every one. */
const named = (flag: string): string[] => {
  const argv = process.argv.slice(2);
  return argv.flatMap((arg, at) =>
    arg === flag && argv[at + 1] ? [argv[at + 1] as string] : []
  );
};
const wanted = named("--harness").length
  ? (named("--harness") as Harness[])
  : HARNESSES;
const casesWanted = new Set(named("--case"));

/** A slow turn: long enough for a send to queue behind it and its process to go. */
const SLOW = "CUSTODY-SLOW";
/** A conversation whose turn a kill's hand-back starts is slow too. */
const SLOW_AGAIN = "CUSTODY-SLOW-AGAIN";
/** The text of the hand-back of a turn a kill cut (server.ts `killedWords`). */
const KILLED = "Your process was killed (SIGKILL)";
const fleet = await scratchFleet({
  name: "send-custody-probe",
  respond: (request) =>
    request.tools &&
    (request.last.includes(SLOW) ||
      (request.last.includes(KILLED) && request.all.includes(SLOW_AGAIN)))
      ? {
          words: Array.from({ length: 120 }, (_, i) => `w${i} `),
          everyMs: 500,
        }
      : { words: ["custody-ok"], everyMs: 5 },
});

/** Requests a session's turn started with `marker` in the message that started it. */
const turnsOf = (marker: string) =>
  fleet.seen.filter((one) => one.tools && one.last.includes(marker)).length;

const results: { name: string; ok: boolean }[] = [];
const report = (name: string, ok: boolean, detail: unknown, line: string) => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(detail)}`);
  if (ok) {
    console.log(`send custody: ${name} ${line}`);
  }
};

/** A marker unique to one send of one case. */
const mark = (harness: Harness, name: string, what: string) =>
  `CUSTODY-${harness}-${name}-${what}-${crypto.randomUUID().slice(0, 6)}`;

/** Starts a slow turn in `id` and waits until the mock is streaming it. */
const slowTurn = async (id: string, marker: string) => {
  const before = turnsOf(marker);
  await fleet.send(id, `${SLOW} ${marker}: count slowly.`);
  await until(
    `${marker} streaming`,
    () => turnsOf(marker),
    (n) => n > before,
    120_000
  );
};

/** Waits until `marker` started exactly one turn and its send is read; what was seen. */
const readOnce = async (uuid: string, marker: string) => {
  await until(
    `${marker} read`,
    () => fleet.sendRow(uuid),
    (row) => row?.state === "read",
    240_000
  ).catch(() => undefined);
  // Room for a second delivery, which would be the bug.
  await Bun.sleep(8000);
  return { turns: turnsOf(marker), send: fleet.sendRow(uuid) };
};

/** When a case left the session failed, a person's message wakes it, as it wakes any failed session. */
const wakeIfFailed = async (harness: Harness, name: string, id: string) => {
  const row = fleet.instance(id);
  if (row?.status !== "error") {
    return;
  }
  const marker = mark(harness, name, "wake");
  const uuid = await fleet.send(id, `${marker}: say ok.`);
  return { marker, uuid, failedWith: row.last_error };
};

/**
 * A person stops the session with `queued` waiting behind its turn. Its
 * record says what became of it: failed as stopped and never read, or — when
 * the process took its queue up as the stop cut its turn (Claude Code does)
 * — read, once.
 */
const stopCase = async (
  label: string,
  id: string,
  slow: string,
  queued: string
) => {
  await slowTurn(id, slow);
  const uuid = await fleet.send(id, `${queued}: say ok.`);
  await Bun.sleep(1500);
  await fleet.stopSession(id);
  await until(
    `${queued} settled`,
    () => fleet.sendRow(uuid),
    (one) => one?.state !== "pending",
    60_000
  ).catch(() => undefined);
  await Bun.sleep(5000);
  const row = fleet.sendRow(uuid);
  const turns = turnsOf(queued);
  const failedUnread =
    row?.state === "failed" &&
    (row.reason ?? "").includes("stopped") &&
    turns === 0;
  const readOnceByStop = row?.state === "read" && turns === 1;
  report(
    label,
    failedUnread || readOnceByStop,
    { send: row, turns },
    failedUnread
      ? "failed as stopped, never read"
      : "read once as the stop cut its turn, and its record says so"
  );
};

/** Kills the session's own process and what runs under it, the way a process dies on its own. */
const killOwn = async (label: string, id: string) => {
  const pid = await fleet.sessionPid(id);
  if (!pid) {
    throw new Error(
      `${label}: no process of its own to kill; sessiond holds ${JSON.stringify(await fleet.heldProcs())}`
    );
  }
  await fleet.killTree(pid, "SIGKILL");
};

/** The dashboard starting a running session again on its conversation. */
const relaunch = async (harness: Harness, id: string) => {
  const [row] = fleet.query<{ session_id: string; cwd: string }>(
    "SELECT session_id, cwd FROM instances WHERE id = ?",
    id
  );
  await fleet.post({
    verb: "spawn",
    machineId: MACHINE,
    instanceId: id,
    requestId: crypto.randomUUID(),
    payload: {
      instanceId: id,
      cwd: row?.cwd,
      harness,
      resume: { sessionKey: row?.session_id },
      ...(harness === "pi" ? {} : { permissionMode: "bypassPermissions" }),
    },
  });
};

/** The agent and sessiond killed, then both back. */
const restartMachine = async () => {
  await fleet.stop("agent", "SIGKILL");
  await fleet.killSessiond();
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("agent");
  await fleet.agentUp();
};

/**
 * A send handed to the session's machine by a hub from before sends were
 * kept whole: pending, handed, its record keeping only its body. The hub
 * starts again (a deploy), which keeps it whole; then the session's process
 * goes. Its uuid.
 */
const predeploy = async (
  label: string,
  id: string,
  queued: string
): Promise<string> => {
  const uuid = crypto.randomUUID();
  fleet.write(
    "INSERT INTO sent_messages (uuid, instance_id, accepted_at, body, mode, state, held) VALUES (?, ?, ?, ?, 'turn', 'pending', 0)",
    uuid,
    id,
    Date.now(),
    JSON.stringify({
      type: "user",
      uuid,
      message: { role: "user", content: `${queued}: say ok.` },
      parent_tool_use_id: null,
      origin: { kind: "human" },
    })
  );
  await fleet.stop("hub");
  fleet.launch("hub");
  await fleet.hubUp();
  await fleet.agentUp();
  const [kept] = fleet.query<{ envelope: string | null }>(
    "SELECT envelope FROM sent_messages WHERE uuid = ?",
    uuid
  );
  if (!kept?.envelope) {
    throw new Error(`${label}: the hub start did not keep the send whole`);
  }
  await killOwn(label, id);
  return uuid;
};

/** The case's process goes away, with `queued` on its way or waiting; that send's uuid. */
const tearDown = async (
  harness: Harness,
  name: Case,
  id: string,
  slow: string,
  queued: string
): Promise<string> => {
  const label = `${harness} ${name}`;
  if (name === "sleep" || (name === "exit" && harness === "opencode")) {
    // The sleep runs on the session's own queue ahead of the send. An
    // opencode session's process is the server every session shares: its
    // own goes as the agent puts it to sleep.
    await fleet.control(id, "sleep");
    return await fleet.send(id, `${queued}: say ok.`);
  }
  if (name === "exit") {
    await killOwn(label, id);
    return await fleet.send(id, `${queued}: say ok.`);
  }
  if (name === "predeploy") {
    return await predeploy(label, id, queued);
  }
  await slowTurn(id, slow);
  const uuid = await fleet.send(id, `${queued}: say ok.`);
  await Bun.sleep(1500);
  if (name === "crash") {
    await killOwn(label, id);
  } else if (name === "relaunch") {
    await relaunch(harness, id);
  } else {
    await restartMachine();
  }
  return uuid;
};

/** Requests whose turn a kill's hand-back started, in the conversation tagged `marker`. */
const handBacksIn = (marker: string) =>
  fleet.seen.filter(
    (one) => one.tools && one.last.includes(KILLED) && one.all.includes(marker)
  ).length;
const itemOf = (workItemId: string) =>
  fleet.query<{ state: string; error: string | null }>(
    "SELECT state, error FROM work_items WHERE id = ?",
    workItemId
  )[0];

/** A delegate of `parent` whose first turn is slow, streaming; its item and session. */
const startDelegate = async (parent: string, prompt: string, slow: string) => {
  const started = await fleet.api<{ workItemId: string; instanceId: string }>(
    "/api/work-items",
    {
      parentInstanceId: parent,
      title: `Count slowly ${slow.slice(-6)}`,
      prompt,
      harness: "claude",
      model: "claude-haiku-4-5",
      cwd: fleet.repo,
      checks: [{ name: "Probe check", command: "true" }],
    }
  );
  await until(
    `${slow} streaming`,
    () => turnsOf(slow),
    (n) => n >= 1,
    180_000
  );
  return started;
};

/**
 * A delegate's Claude Code CLI killed by SIGKILL mid-turn, with a person's
 * send queued behind its turn: the kill does not fail its item, the turn the
 * kill cut is handed back once, and the send is read once. The mock's
 * one-word answers never call finish_item, so the item's own rule may end it
 * later for that; what counts is that the kill did not.
 */
const killedOnce = async (label: string, parent: string) => {
  const slow = mark("claude", "killed", "slow");
  const started = await startDelegate(
    parent,
    `${SLOW} ${slow}: count slowly.`,
    slow
  );
  const delegate = started.instanceId;
  const queued = mark("claude", "killed", "queued");
  const uuid = await fleet.send(delegate, `${queued}: say ok.`);
  await Bun.sleep(1500);
  await killOwn(label, delegate);
  await until(
    "the cut turn handed back",
    () => handBacksIn(slow),
    (n) => n >= 1,
    120_000
  ).catch(() => undefined);
  const atHandBack = itemOf(started.workItemId);
  const queuedOutcome = await readOnce(uuid, queued);
  const after = itemOf(started.workItemId);
  const outcome = {
    handBacks: handBacksIn(slow),
    queued: queuedOutcome,
    itemAtHandBack: atHandBack,
    itemAfter: after,
  };
  const ok =
    outcome.handBacks === 1 &&
    queuedOutcome.turns === 1 &&
    queuedOutcome.send?.state === "read" &&
    atHandBack?.state === "running" &&
    !(after?.error ?? "").includes("SIGKILL");
  return { ok, outcome };
};

/**
 * A delegate killed, then the process its restart started killed in its
 * turn, within the two minutes the hub allows between kills (server.ts
 * `SIGNAL_REPEAT_MS`): its item fails with the kill's own words, and its row
 * is filed failed. Its restarted turn streams slowly, so the second kill
 * lands while that process runs.
 */
const killedTwice = async (label: string, parent: string) => {
  const slow = mark("claude", "killed", "again");
  const started = await startDelegate(
    parent,
    `${SLOW} ${SLOW_AGAIN} ${slow}: count slowly.`,
    slow
  );
  const delegate = started.instanceId;
  await killOwn(label, delegate);
  await until(
    "the first kill's turn handed back",
    () => handBacksIn(slow),
    (n) => n >= 1,
    120_000
  );
  await Bun.sleep(2000);
  await killOwn(label, delegate);
  const item = await until(
    "the item failed",
    () => itemOf(started.workItemId),
    (one) => one?.state === "failed",
    90_000
  ).catch(() => itemOf(started.workItemId));
  const outcome = { item, row: fleet.instance(delegate) };
  const ok =
    item?.state === "failed" &&
    (item.error ?? "").includes("SIGKILL") &&
    outcome.row?.status === "error";
  return { ok, outcome };
};

const killedCase = async (label: string) => {
  const parent = await fleet.spawn("claude", "Custody parent", fleet.repo);
  const hello = mark("claude", "killed", "parent");
  await fleet.send(parent, `${hello}: say ok.`);
  await until(
    `${hello} answered`,
    () => turnsOf(hello),
    (n) => n >= 1
  );
  const once = await killedOnce(label, parent);
  const twice = await killedTwice(label, parent);
  report(
    label,
    once.ok && twice.ok,
    { killedOnce: once.outcome, killedTwice: twice.outcome },
    "carried on once after a kill; failed when killed again within two minutes"
  );
};

const runCase = async (harness: Harness, name: Case) => {
  if (name === "killed") {
    await killedCase(`${harness} ${name}`);
    return;
  }
  const id = await fleet.spawn(harness, `Custody ${harness} ${name}`);
  // A first turn, so the session has a conversation to come back on.
  const first = mark(harness, name, "first");
  await fleet.send(id, `${first}: say ok.`);
  await until(
    `${first} answered`,
    () => turnsOf(first),
    (n) => n >= 1
  );
  await Bun.sleep(3000);
  const queued = mark(harness, name, "queued");
  const slow = mark(harness, name, "slow");
  const label = `${harness} ${name}`;
  if (name === "stop") {
    await stopCase(label, id, slow, queued);
    return;
  }
  const uuid = await tearDown(harness, name, id, slow, queued);
  await Bun.sleep(10_000);
  const woke = await wakeIfFailed(harness, name, id);
  const queuedOutcome = await readOnce(uuid, queued);
  const wakeOutcome = woke ? await readOnce(woke.uuid, woke.marker) : undefined;
  // Only the cases that went with a turn running started a slow one.
  const slowTurns = ["crash", "relaunch", "restart"].includes(name)
    ? turnsOf(slow)
    : 1;
  const ok =
    queuedOutcome.turns === 1 &&
    queuedOutcome.send?.state === "read" &&
    (!wakeOutcome ||
      (wakeOutcome.turns === 1 && wakeOutcome.send?.state === "read")) &&
    // The turn its process was running when it went is never started again
    // by the send that started it.
    slowTurns === 1;
  report(
    label,
    ok,
    {
      queued: queuedOutcome,
      ...(woke
        ? { leftFailed: woke.failedWith, wakeMessage: wakeOutcome }
        : {}),
      slowTurns,
      row: fleet.instance(id),
    },
    woke
      ? "read once by the process a person's next message started"
      : "read once by its next process"
  );
};

try {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  if (wanted.includes("claude")) {
    await fleet.accountSignedIn();
  }
  for (const harness of wanted) {
    for (const name of CASES[harness].filter(
      (one) => casesWanted.size === 0 || casesWanted.has(one)
    )) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: one case at a time, each on its own session
        await runCase(harness, name);
      } catch (error) {
        report(
          `${harness} ${name}`,
          false,
          { error: error instanceof Error ? error.message : String(error) },
          ""
        );
      }
    }
  }
} catch (error) {
  report(
    "probe",
    false,
    { error: error instanceof Error ? error.stack : String(error) },
    ""
  );
} finally {
  await fleet.close();
}

const failed = results.filter((one) => !one.ok);
await fleet.clean(
  failed.length > 0 || Boolean(process.env.SEND_CUSTODY_PROBE_KEEP)
);
console.log(`${results.length - failed.length}/${results.length} cases passed`);
process.exit(failed.length === 0 ? 0 : 1);
