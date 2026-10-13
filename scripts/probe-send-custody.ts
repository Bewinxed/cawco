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
 *              succession, and its item fails;
 *   stale-credential — a wake held at the agent's door (the agent frozen),
 *              which asks the hub for its credential as it starts: a second
 *              launch from the dashboard meanwhile is refused and mints
 *              nothing; with the session's credential revoked meanwhile, the
 *              wake runs once on a fresh one and its send is read once; with
 *              its account signed out meanwhile, the hub refuses it as it
 *              starts, it fails once with the hub's sentence, no start
 *              follows on its own, its send is failed in that sentence (the
 *              hub's rule for a session whose account cannot run there), and
 *              signed in again a person's next message runs;
 *   held-restart — the agent killed and started again while a wake is held
 *              at its door: the session runs after the restart, once;
 *   stuck-opencode — the agent restarts beside an OpenCode server generation
 *              that answers every request with HTTP 500, holding three
 *              OpenCode sessions: a held Claude session's send is read
 *              within seconds; each OpenCode session is settled unattached,
 *              the custody log naming that generation, and a send to one is
 *              failed with its reason or owed;
 *   stopped  — a Claude session mid-tool (a long `sleep` in a Bash call), its
 *              Claude Code frozen (SIGSTOP: it answers no control request),
 *              the agent restarted, kept frozen past the custody bound, then
 *              thawed: the agent attached it at once and it read running
 *              while frozen, its stored mode was applied once it answered, a
 *              send made while it was frozen is read once, and the hub said
 *              that send came back at most once;
 *   stopped-dies — the same, its process killed while frozen: the send made
 *              meanwhile starts it afresh and is read once;
 *   needs-auth — a running Claude session whose credential the hub stops
 *              knowing, the hub and agent restarted: its slot reads
 *              `needs-auth`, and the session is stopped, the reason said in
 *              its transcript, the agent's log and its row;
 *   mcp-late — a Claude session mid-tool whose CawCo MCP slot reaches the hub
 *              through a proxy; the hub and the agent restarted while the
 *              proxy holds every new MCP connection, for 50 s past the
 *              attach: the session is attached anyway (never refused), its
 *              turn runs on to its end, and its slot connects once let
 *              through.
 *
 * Claude runs every case; opencode and pi run exit and restart. A case whose
 * session is left failed rather than asleep is woken by a person's next
 * message, as a failed session is, and both sends must then be read once
 * each.
 *
 * Prints `send custody: <harness> <case> <outcome>` per case that passed,
 * and exits 0 only if every one did.
 */
import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Socket, SocketHandler } from "bun";
import { SessiondClient } from "../packages/agent/src/sessiond-client";
import { processStart } from "../packages/core/src/process-identity";
import {
  ACCOUNT,
  HARNESSES,
  type Harness,
  MACHINE,
  MODEL,
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
  | "killed"
  | "stale-credential"
  | "held-restart"
  | "stuck-opencode"
  | "stopped"
  | "stopped-dies"
  | "needs-auth"
  | "mcp-late";
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
    "stale-credential",
    "held-restart",
    "stuck-opencode",
    "stopped",
    "stopped-dies",
    "needs-auth",
    "mcp-late",
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
/** A turn that runs one long Bash `sleep`, then answers. */
const TOOL_SLEEP = "CUSTODY-TOOL-SLEEP";
/** How long that `sleep` runs, in seconds: past the custody bound and the restart around it. */
const TOOL_SLEEP_S = 240;
/** A turn whose Bash `sleep` outlasts up to three hub outages ({@link mcpLateCase}). */
const LONG_TOOL = "CUSTODY-LONG-TOOL";
const LONG_TOOL_S = 480;
/** The seconds a turn's Bash `sleep` runs, when the message that started it asks for one. */
const sleepAsked = (last: string): number | undefined => {
  if (last.includes(LONG_TOOL)) {
    return LONG_TOOL_S;
  }
  return last.includes(TOOL_SLEEP) ? TOOL_SLEEP_S : undefined;
};
const fleet = await scratchFleet({
  name: "send-custody-probe",
  respond: (request) => {
    const seconds = sleepAsked(request.last);
    if (request.tools && seconds !== undefined && !request.afterTool) {
      return {
        words: [],
        everyMs: 5,
        tool: {
          name: "Bash",
          input: {
            command: `sleep ${seconds}`,
            description: "Wait",
            timeout: 600_000,
          },
        },
      };
    }
    return request.tools &&
      (request.last.includes(SLOW) ||
        (request.last.includes(KILLED) && request.all.includes(SLOW_AGAIN)))
      ? {
          words: Array.from({ length: 120 }, (_, i) => `w${i} `),
          everyMs: 500,
        }
      : { words: ["custody-ok"], everyMs: 5 };
  },
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

/** A Claude session with one turn answered, put to sleep by its agent and filed asleep. */
const asleepSession = async (name: string): Promise<string> => {
  const id = await fleet.spawn("claude", `Custody claude ${name}`);
  const first = mark("claude", name, "first");
  await fleet.send(id, `${first}: say ok.`);
  await until(
    `${first} answered`,
    () => turnsOf(first),
    (n) => n >= 1
  );
  await Bun.sleep(3000);
  await fleet.control(id, "sleep");
  await until(
    `${name} asleep`,
    () => fleet.instance(id),
    (row) => row?.status === "sleeping",
    60_000
  );
  return id;
};

/** How many lines of every agent log so far name `instanceId` and say `words`. */
const agentSaid = async (instanceId: string, words: string) =>
  (await fleet.logs("agent"))
    .split("\n")
    .filter((line) => line.includes(instanceId) && line.includes(words)).length;

/** What an agent says when a launch it was handed starts and installs its credential. */
const INSTALLED = "launch credential installed";
/** What it says when a start fails. */
const START_FAILED = "failed:";
/** What it says when a start's credential is not the hub's. */
const REFUSED = "credential could not be installed";

/** A person's send to a sleeping session while the agent is frozen: the wake's spawn waits at its door. */
const wakeWhileFrozen = async (id: string, marker: string) => {
  const uuid = await fleet.send(id, `${marker}: say ok.`);
  await until(
    `${marker}'s wake launched`,
    () => fleet.instance(id),
    (row) => row?.status === "starting",
    20_000
  );
  return uuid;
};

/**
 * A wake held at the agent's door, and the dashboard asking to start the
 * session again meanwhile: that launch is refused and mints nothing, so the
 * held wake starts on the credential it carries, once; its send is read once.
 */
const secondLaunchWhileHeld = async () => {
  const id = await asleepSession("second-launch");
  const queued = mark("claude", "second-launch", "queued");
  fleet.freeze("agent", true);
  let uuid: string;
  let woken: number | null | undefined;
  let hash: string | undefined;
  try {
    uuid = await wakeWhileFrozen(id, queued);
    woken = fleet.instance(id)?.spawned_at;
    const pendingHash = () =>
      fleet.query<{ pending_hash: string | null }>(
        "SELECT pending_hash FROM session_identities WHERE instance_id = ?",
        id
      )[0]?.pending_hash ?? undefined;
    hash = pendingHash();
    await relaunch("claude", id);
    // Room for a second launch to go out, which would be the bug.
    await Bun.sleep(5000);
    hash = hash === pendingHash() ? hash : `replaced by ${pendingHash()}`;
  } finally {
    fleet.freeze("agent", false);
  }
  const read = await readOnce(uuid, queued);
  const row = fleet.instance(id);
  const outcome = {
    read,
    sameLaunch: row?.spawned_at === woken,
    credential: hash,
    starts: await agentSaid(id, INSTALLED),
    refused: await agentSaid(id, REFUSED),
    row,
  };
  return {
    ok:
      read.turns === 1 &&
      read.send?.state === "read" &&
      outcome.sameLaunch &&
      !hash?.startsWith("replaced") &&
      outcome.refused === 0,
    outcome,
  };
};

/** The session's credential as the hub keeps it: installed and pending, by hash. */
const identityOf = (id: string) =>
  fleet.query<{ credential_hash: string | null; pending_hash: string | null }>(
    "SELECT credential_hash, pending_hash FROM session_identities WHERE instance_id = ?",
    id
  )[0];

/**
 * A wake held at the agent's door while the session's credential is revoked
 * (a hash the hub would take replaced by one nobody holds): its start asks
 * the hub for a credential as it starts, runs on that fresh one, once, and
 * its send is read once.
 */
const revokedLaunch = async () => {
  const id = await asleepSession("revoked");
  const queued = mark("claude", "revoked", "queued");
  const startsBefore = await agentSaid(id, INSTALLED);
  const revoked = createHash("sha256")
    .update(crypto.randomUUID())
    .digest("hex");
  fleet.freeze("agent", true);
  let uuid: string;
  try {
    uuid = await wakeWhileFrozen(id, queued);
    fleet.write(
      "UPDATE session_identities SET credential_hash = NULL, pending_hash = ? WHERE instance_id = ?",
      revoked,
      id
    );
  } finally {
    fleet.freeze("agent", false);
  }
  const read = await readOnce(uuid, queued);
  const identity = identityOf(id);
  const outcome = {
    read,
    startsSinceHeld: (await agentSaid(id, INSTALLED)) - startsBefore,
    refused: await agentSaid(id, REFUSED),
    ranOnFresh:
      identity?.credential_hash !== null &&
      identity?.credential_hash !== revoked &&
      identity?.pending_hash === null,
    row: fleet.instance(id),
  };
  return {
    ok:
      read.turns === 1 &&
      read.send?.state === "read" &&
      outcome.startsSinceHeld === 1 &&
      outcome.refused === 0 &&
      outcome.ranOnFresh &&
      outcome.row?.status === "running",
    outcome,
  };
};

/**
 * A wake held at the agent's door while the account it runs on is signed
 * out on its machine: the hub refuses it as it starts, so it fails once with
 * the hub's sentence, and nothing starts it again on its own for a minute.
 * Its send is owed again, and then failed with that same sentence by the
 * hub's rule for a session whose account cannot run there (server.ts
 * `inputRefusal`): said, never left queued. Signed in again, a person's next
 * message runs it.
 */
const refusedLaunch = async () => {
  const id = await asleepSession("refused");
  const queued = mark("claude", "refused", "queued");
  fleet.freeze("agent", true);
  let uuid: string;
  try {
    uuid = await wakeWhileFrozen(id, queued);
    fleet.write(
      "UPDATE account_signins SET state = 'signed-out' WHERE account_id = ?",
      ACCOUNT
    );
  } finally {
    fleet.freeze("agent", false);
  }
  const failed = await until(
    "the held start refused",
    () => fleet.instance(id),
    (row) => row?.status === "error",
    120_000
  ).catch(() => fleet.instance(id));
  const failedAt = Date.now();
  // A minute in which nothing may start it again on its own.
  await Bun.sleep(60_000);
  const quiet = {
    row: fleet.instance(id),
    failures: await agentSaid(id, START_FAILED),
    send: fleet.sendRow(uuid),
    quietForMs: Date.now() - failedAt,
  };
  fleet.write(
    "UPDATE account_signins SET state = 'signed-in' WHERE account_id = ?",
    ACCOUNT
  );
  const next = mark("claude", "refused", "next");
  const nextUuid = await fleet.send(id, `${next}: say ok.`);
  const nextRead = await readOnce(nextUuid, next);
  const outcome = {
    failedWith: failed?.last_error,
    quiet,
    nextRead,
    queuedTurns: turnsOf(queued),
  };
  return {
    ok:
      failed?.status === "error" &&
      Boolean(failed.last_error) &&
      !(failed.last_error ?? "").includes(REFUSED) &&
      quiet.row?.spawned_at === failed?.spawned_at &&
      quiet.row?.status === "error" &&
      quiet.failures === 1 &&
      quiet.send?.state === "failed" &&
      quiet.send.reason === failed?.last_error &&
      outcome.queuedTurns === 0 &&
      nextRead.turns === 1 &&
      nextRead.send?.state === "read",
    outcome,
  };
};

const staleCredentialCase = async (label: string) => {
  const second = await secondLaunchWhileHeld();
  const revoked = await revokedLaunch();
  const refused = await refusedLaunch();
  report(
    label,
    second.ok && revoked.ok && refused.ok,
    {
      secondLaunch: second.outcome,
      revoked: revoked.outcome,
      refused: refused.outcome,
    },
    "a second launch while one was held minted nothing; a held wake whose credential was revoked ran once on a fresh one; one the hub refused as it started failed once with the hub's sentence, its send said failed in that sentence, and the next message ran once signed in again"
  );
};

/** The agent killed and started again while a wake is held at its door: the session runs after the restart, once. */
const heldRestartCase = async (label: string) => {
  const id = await asleepSession("held-restart");
  const startsBefore = await agentSaid(id, INSTALLED);
  const queued = mark("claude", "held-restart", "queued");
  fleet.freeze("agent", true);
  const uuid = await wakeWhileFrozen(id, queued);
  // Killed where it stands: the held spawn goes with it.
  await fleet.stop("agent", "SIGKILL");
  fleet.launch("agent");
  await fleet.agentUp();
  const read = await readOnce(uuid, queued);
  const outcome = {
    read,
    startsAfterRestart: (await agentSaid(id, INSTALLED)) - startsBefore,
    failures: await agentSaid(id, START_FAILED),
    row: fleet.instance(id),
  };
  report(
    label,
    read.turns === 1 &&
      read.send?.state === "read" &&
      outcome.startsAfterRestart === 1 &&
      outcome.failures === 0,
    outcome,
    "ran once after the restart, its send read once"
  );
};

/**
 * An OpenCode server generation that answers every request with HTTP 500,
 * held by sessiond and recorded as OpenCode's active generation, as the
 * agent records the servers it starts (opencode-server.ts).
 */
const opencodeStandIn = async () => {
  const script = join(fleet.sandbox, "opencode-500.ts");
  await writeFile(
    script,
    `const port = Number(process.argv[2]);
Bun.serve({
  hostname: "127.0.0.1",
  port,
  fetch: () => new Response("ENOTDIR: not a directory (stand-in)", { status: 500 }),
});
console.log("opencode server listening on http://127.0.0.1:" + port);
setInterval(() => undefined, 1 << 30);
`
  );
  const lease = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(null),
  });
  const port = lease.port as number;
  await lease.stop(true);
  const url = `http://127.0.0.1:${port}`;
  const procId = `opencode-server-${crypto.randomUUID()}`;
  const client = await SessiondClient.connect(fleet.sessiondSocket);
  try {
    await client.spawnProc(procId, {
      command: process.execPath,
      args: [script, String(port)],
      cwd: fleet.sandbox,
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: fleet.home },
    });
    await until(
      "the stand-in answering 500",
      () =>
        fetch(url)
          .then((response) => response.status)
          .catch(() => 0),
      (status) => status === 500,
      30_000
    );
    const listed = await client.list();
    const proc = listed.procs.find((one) => one.procId === procId && one.alive);
    if (!proc) {
      throw new Error("sessiond does not hold the stand-in");
    }
    const record = join(
      fleet.home,
      ".cawco",
      `opencode-server-${createHash("sha256").update(fleet.sessiondSocket).digest("hex").slice(0, 16)}.json`
    );
    await mkdir(join(fleet.home, ".cawco"), { recursive: true });
    await writeFile(
      record,
      JSON.stringify({
        active: {
          epoch: listed.epoch,
          pid: proc.pid,
          procId,
          startedAt: await processStart(proc.pid),
          url,
        },
        retired: [],
      })
    );
    return { procId, pid: proc.pid, url, record };
  } finally {
    client.close();
  }
};

/** OpenCode sessions the hub has as running on the stand-in, each with a conversation. */
const opencodeRows = (count: number): string[] =>
  Array.from({ length: count }, () => {
    const id = crypto.randomUUID();
    const now = Date.now();
    fleet.write(
      "INSERT INTO instances (id, machine_id, cwd, harness, session_id, status, address_protocol, model, permission_mode, spawned_at, created_at, updated_at) VALUES (?, ?, ?, 'opencode', ?, 'running', 1, ?, 'bypassPermissions', ?, ?, ?)",
      id,
      MACHINE,
      fleet.workdir,
      `ses_${crypto.randomUUID().replaceAll("-", "").slice(0, 26)}`,
      MODEL.opencode,
      now,
      now,
      now
    );
    return id;
  });

const stuckOpencodeCase = async (label: string) => {
  const claude = await fleet.spawn("claude", "Custody beside a stuck OpenCode");
  const first = mark("claude", "stuck-opencode", "first");
  await fleet.send(claude, `${first}: say ok.`);
  await until(
    `${first} answered`,
    () => turnsOf(first),
    (n) => n >= 1
  );
  await Bun.sleep(3000);
  const standIn = await opencodeStandIn();
  const held = opencodeRows(3);
  const linesSaying = async (words: string) =>
    (await fleet.logs("agent"))
      .split("\n")
      .filter((line) => line.includes(words)).length;
  const recoveredBefore = await linesSaying("custody recovered");
  const settledBefore = await linesSaying("settled without being taken back");
  // The agent alone restarts: sessiond keeps the Claude session and the stand-in.
  await fleet.stop("agent", "SIGKILL");
  fleet.launch("agent");
  await fleet.agentUp();
  const queued = mark("claude", "stuck-opencode", "queued");
  const sentAt = Date.now();
  const uuid = await fleet.send(claude, `${queued}: say ok.`);
  const opencodeQueued = mark("opencode", "stuck-opencode", "queued");
  const opencodeUuid = await fleet.send(
    held[0] as string,
    `${opencodeQueued}: say ok.`
  );
  await until(
    `${queued} read`,
    () => fleet.sendRow(uuid),
    (row) => row?.state === "read",
    60_000
  ).catch(() => undefined);
  const readAfterMs = Date.now() - sentAt;
  const settledByThen =
    (await linesSaying("settled without being taken back")) > settledBefore;
  const read = await readOnce(uuid, queued);
  // OpenCode's custody settles on its own bound, naming the generation.
  const custodyLines = await until(
    "the custody log naming the stand-in",
    async () =>
      (await fleet.logs("agent"))
        .split("\n")
        .filter(
          (line) =>
            line.includes(standIn.procId) && line.includes("settled unattached")
        ),
    (lines) => lines.length >= held.length,
    180_000
  ).catch(() => [] as string[]);
  const recovered = await until(
    "custody complete",
    () => linesSaying("custody recovered"),
    (n) => n > recoveredBefore,
    60_000
  ).catch(() => recoveredBefore);
  // The send to a stuck session ends failed with its reason, or owed; never read, never lost.
  const opencodeSend = await until(
    "the stuck session's send decided",
    () => fleet.sendRow(opencodeUuid),
    (row) =>
      (row?.state === "failed" && Boolean(row.reason)) ||
      (row?.state === "pending" && row.owed !== null),
    240_000
  ).catch(() => fleet.sendRow(opencodeUuid));
  const rows = held.map((id) => fleet.instance(id));
  const outcome = {
    claude: { readAfterMs, settledByThen, read },
    custodyLog: custodyLines.slice(0, 1),
    custodyLogLines: custodyLines.length,
    custodyCompleted: recovered > recoveredBefore,
    opencodeSend,
    opencodeRows: rows.map((row) => ({
      status: row?.status,
      error: row?.last_error,
    })),
  };
  // The stand-in goes, so later cases meet no stuck generation.
  const client = await SessiondClient.connect(fleet.sessiondSocket);
  await client.signal(standIn.procId, "SIGKILL").catch(() => undefined);
  client.close();
  await rm(standIn.record, { force: true });
  report(
    label,
    read.turns === 1 &&
      read.send?.state === "read" &&
      readAfterMs < 20_000 &&
      custodyLines.length >= held.length &&
      recovered > recoveredBefore &&
      ((opencodeSend?.state === "failed" && Boolean(opencodeSend.reason)) ||
        (opencodeSend?.state === "pending" && opencodeSend.owed !== null)) &&
      rows.every(
        (row) => row?.status !== "running" && row?.status !== "starting"
      ),
    outcome,
    `a held Claude session's send was read in ${Math.round(readAfterMs / 1000)} s beside the stuck generation; each OpenCode session was settled unattached, the custody log naming ${standIn.procId}`
  );
};

/** How many lines of every hub log so far name `uuid` and say `words`. */
const hubSaid = async (uuid: string, words: string) =>
  (await fleet.logs("hub"))
    .split("\n")
    .filter((line) => line.includes(uuid) && line.includes(words)).length;

/**
 * The agent restarted while the session's Claude Code is frozen mid-tool,
 * so it answers no control request, kept frozen past the custody bound
 * (90 s), then thawed, or killed when `dies`. It is attached at once and
 * reads running while frozen; its stored mode is applied once it answers.
 * A send made while it is frozen is read once either way.
 */
const frozenCase = async (label: string, dies: boolean) => {
  const name = dies ? "stopped-dies" : "stopped";
  const id = await fleet.spawn("claude", `Custody claude ${name}`);
  const first = mark("claude", name, "first");
  await fleet.send(id, `${first}: say ok.`);
  await until(
    `${first} answered`,
    () => turnsOf(first),
    (n) => n >= 1
  );
  await Bun.sleep(3000);
  const tool = mark("claude", name, "tool");
  await fleet.send(id, `${TOOL_SLEEP} ${tool}: wait in a tool.`);
  await until(
    `${tool} asked`,
    () => turnsOf(tool),
    (n) => n >= 1,
    120_000
  );
  // Its Bash call is running.
  await Bun.sleep(3000);
  const pid = await fleet.sessionPid(id);
  if (!pid) {
    throw new Error(`${label}: sessiond holds no process for ${id}`);
  }
  process.kill(pid, "SIGSTOP");
  const frozenAt = Date.now();
  let frozen = true;
  try {
    await fleet.stop("agent", "SIGKILL");
    fleet.launch("agent");
    await fleet.agentUp();
    const queued = mark("claude", name, "queued");
    const uuid = await fleet.send(id, `${queued}: say ok.`);
    // Frozen past the custody bound, from the restart on.
    await Bun.sleep(Math.max(0, frozenAt + 100_000 - Date.now()));
    const whileFrozen = {
      frozenForMs: Date.now() - frozenAt,
      row: fleet.instance(id),
      send: fleet.sendRow(uuid),
      letGo:
        (await agentSaid(id, "let go undecided")) +
        (await agentSaid(id, "left for the hub to attach again")),
      taken: await agentSaid(id, "took custody of"),
      attached: await agentSaid(id, "attached to its live process"),
      answered: await agentSaid(id, "answered after its attach"),
      stoppedWaiting: await agentSaid(id, "stopped waiting"),
    };
    if (dies) {
      await fleet.killTree(pid, "SIGKILL");
    } else {
      process.kill(pid, "SIGCONT");
    }
    frozen = false;
    const answered = dies
      ? 0
      : await until(
          "its stored mode applied once it answers",
          () => agentSaid(id, "in its stored mode (bypassPermissions)"),
          (n) => n >= 1,
          120_000
        ).catch(() => 0);
    const read = await readOnce(uuid, queued);
    const outcome = {
      whileFrozen,
      answered,
      read,
      row: fleet.instance(id),
      cameBack: await hubSaid(uuid, "came back"),
      toolTurns: turnsOf(tool),
    };
    const ok =
      whileFrozen.letGo === 0 &&
      whileFrozen.taken >= 1 &&
      whileFrozen.attached >= 1 &&
      whileFrozen.answered === 0 &&
      whileFrozen.row?.status === "running" &&
      whileFrozen.stoppedWaiting === 0 &&
      read.turns === 1 &&
      read.send?.state === "read" &&
      outcome.row?.status === "running" &&
      outcome.cameBack <= (dies ? 2 : 1) &&
      (dies
        ? outcome.row?.spawned_at !== whileFrozen.row?.spawned_at
        : answered >= 1);
    report(
      label,
      ok,
      outcome,
      dies
        ? `attached and running while frozen; its process killed ${Math.round(whileFrozen.frozenForMs / 1000)} s into the freeze, the send made meanwhile started it afresh and was read once (hub: ${outcome.cameBack} hand-back line)`
        : `attached and running through a ${Math.round(whileFrozen.frozenForMs / 1000)} s freeze; its stored mode applied once thawed, and the send made meanwhile read once after it (hub: ${outcome.cameBack} hand-back lines)`
    );
  } finally {
    if (frozen) {
      process.kill(pid, "SIGCONT");
    }
  }
};

/**
 * The hub and the agent down for 45 s, then back. Claude Code's cawco slot
 * reads `connected` through the first hub outage after its launch, its
 * dropped connection unnoticed until it next uses it, and `failed` or
 * `needs-auth` through the next (2.1.296, measured on this rig): a case
 * whose session must meet a slot that knows it lost the hub has it through
 * one of these first.
 */
const outage = async () => {
  await fleet.stop("agent", "SIGKILL");
  await fleet.stop("hub", "SIGKILL");
  await Bun.sleep(45_000);
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.launch("agent");
  await fleet.agentUp();
};

/** What the agent says, in the transcript, its log and the row, when it stops a session the hub no longer knows. */
const CREDENTIAL_GONE = "the hub no longer knows the credential";

/**
 * A running Claude session whose credential the hub stops knowing (its
 * hash replaced while the hub and the agent are down), both back: its
 * slot's reconnect is refused (401, `needs-auth`), and the session is
 * stopped, the reason said in its transcript, the agent's log and its row.
 */
const needsAuthCase = async (label: string) => {
  const id = await fleet.spawn("claude", "Custody claude needs-auth");
  const first = mark("claude", "needs-auth", "first");
  await fleet.send(id, `${first}: say ok.`);
  await until(
    `${first} answered`,
    () => turnsOf(first),
    (n) => n >= 1
  );
  await Bun.sleep(3000);
  await outage();
  const pidBefore = await fleet.sessionPid(id);
  await fleet.stop("agent", "SIGKILL");
  await fleet.stop("hub", "SIGKILL");
  await Bun.sleep(45_000);
  fleet.write(
    "UPDATE session_identities SET credential_hash = NULL, pending_hash = ? WHERE instance_id = ?",
    createHash("sha256").update(crypto.randomUUID()).digest("hex"),
    id
  );
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.launch("agent");
  await fleet.agentUp();
  const said = await until(
    "stopped for its credential",
    () => agentSaid(id, CREDENTIAL_GONE),
    (n) => n >= 1,
    240_000
  ).catch(() => 0);
  const row = await until(
    "its row failed",
    () => fleet.instance(id),
    (one) => one?.status === "error",
    60_000
  ).catch(() => fleet.instance(id));
  const transcript = JSON.stringify(
    await fleet
      .api<unknown>(`/api/instances/${id}/transcript`)
      .catch((error: unknown) => String(error))
  );
  await Bun.sleep(8000);
  const outcome = {
    said,
    row,
    inTranscript: transcript.includes(CREDENTIAL_GONE),
    pidBefore,
    pidAfter: (await fleet.sessionPid(id)) ?? null,
    attachedConnecting: await agentSaid(id, "attached while its CawCo MCP is"),
  };
  report(
    label,
    said >= 1 &&
      row?.status === "error" &&
      (row.last_error ?? "").includes(CREDENTIAL_GONE) &&
      outcome.inTranscript &&
      outcome.pidAfter === null,
    outcome,
    "stopped once its slot read needs-auth; the reason is in its transcript, the agent's log and its row, and its process is gone"
  );
};

/**
 * Requests that answered a tool's result in the turn `marker` started: on
 * Anthropic messages the last user message is then the result itself, so
 * the prompt is read from the whole conversation.
 */
const toolResults = (marker: string) =>
  fleet.seen.filter(
    (one) => one.tools && one.afterTool && one.all.includes(marker)
  ).length;

/** One side of a proxied connection: its peer, and what waits to be written to it. */
interface Side {
  closed?: boolean;
  decided?: boolean;
  peer?: Socket<Side>;
  queue: Uint8Array[];
  waiting: Uint8Array[];
}

/** Writes `chunk` to `sock` behind what already waits there. */
const sendTo = (sock: Socket<Side>, chunk: Uint8Array) => {
  if (sock.data.queue.length > 0) {
    sock.data.queue.push(chunk);
    return;
  }
  const written = sock.write(chunk);
  if (written < chunk.byteLength) {
    sock.data.queue.push(chunk.subarray(Math.max(written, 0)));
  }
};
const flush = (sock: Socket<Side>) => {
  const { queue } = sock.data;
  while (queue.length > 0) {
    const chunk = queue[0] as Uint8Array;
    const written = sock.write(chunk);
    if (written < chunk.byteLength) {
      queue[0] = chunk.subarray(Math.max(written, 0));
      return;
    }
    queue.shift();
  }
};
const endSide = (sock: Socket<Side> | undefined) => {
  if (sock && !sock.data.closed) {
    sock.data.closed = true;
    sock.end();
  }
};

/**
 * A TCP proxy on `listenPort`, the address the hub had, in front of the hub
 * now on `hubPort`: every connection goes through as it is, but while `hold`
 * is on (it starts on), a new one that asks for `/mcp/cawco` is taken and
 * left unanswered, as a hub out of reach leaves a connect, until `hold` goes
 * off and it goes through. `down` and `up` stop and start its listening.
 */
const hubProxy = (listenPort: number, hubPort: number) => {
  let holding = true;
  let heldEver = 0;
  const held = new Set<Socket<Side>>();
  const through = async (client: Socket<Side>) => {
    held.delete(client);
    const up = await Bun.connect<Side>({
      hostname: "127.0.0.1",
      port: hubPort,
      data: { queue: [], waiting: [] },
      socket: {
        data: (side, chunk) => {
          if (side.data.peer) {
            sendTo(side.data.peer, chunk.slice());
          }
        },
        drain: flush,
        close: (side) => endSide(side.data.peer),
        error: (side) => endSide(side.data.peer),
      },
    }).catch(() => undefined);
    if (!up || client.data.closed) {
      endSide(client);
      up?.end();
      return;
    }
    up.data.peer = client;
    client.data.peer = up;
    for (const chunk of client.data.waiting) {
      sendTo(up, chunk);
    }
    client.data.waiting = [];
  };
  const listening: SocketHandler<Side> = {
    open: (sock) => {
      sock.data = { queue: [], waiting: [] };
    },
    data: (sock, chunk) => {
      if (sock.data.peer) {
        sendTo(sock.data.peer, chunk.slice());
        return;
      }
      sock.data.waiting.push(chunk.slice());
      if (sock.data.decided) {
        return;
      }
      sock.data.decided = true;
      const head = new TextDecoder().decode(chunk.subarray(0, 512));
      if (holding && head.includes("/mcp/cawco")) {
        heldEver += 1;
        held.add(sock);
        return;
      }
      // biome-ignore lint/complexity/noVoid: the connection goes through when its upstream opens
      void through(sock);
    },
    drain: flush,
    close: (sock) => {
      sock.data.closed = true;
      held.delete(sock);
      endSide(sock.data.peer);
    },
    error: (sock) => {
      sock.data.closed = true;
      held.delete(sock);
      endSide(sock.data.peer);
    },
  };
  const listen = () =>
    Bun.listen<Side>({
      hostname: "127.0.0.1",
      port: listenPort,
      socket: listening,
    });
  let server = listen();
  return {
    /** Stops listening and drops what it carries: a connect is refused, as a hub that is down refuses it. */
    down: () => server.stop(true),
    up: () => {
      server = listen();
    },
    hold: (on: boolean) => {
      holding = on;
      if (!on) {
        for (const sock of [...held]) {
          // biome-ignore lint/complexity/noVoid: each held connection goes through on its own
          void through(sock);
        }
      }
    },
    heldNow: () => held.size,
    heldSoFar: () => heldEver,
  };
};

/** Each session's count of agent lines that name it and say `words`. */
const eachSaid = async (ids: string[], words: string) =>
  new Map(
    await Promise.all(
      ids.map(async (id) => [id, await agentSaid(id, words)] as const)
    )
  );

/** What the agent says of a child it attached while its cawco slot was not connected. */
const ATTACHED_CONNECTING = "attached while its CawCo MCP is";

/**
 * Three Claude sessions mid-tool while the hub and the agent go down for
 * 45 s (their CawCo MCP slots' connects refused), then come back, the hub on
 * a new port behind {@link hubProxy} on its old one, every new MCP
 * connection held for 50 s past the agent's return (past the 30 s a
 * launch's slot is given). Whether Claude Code notices its slot dropped
 * varies from one session and outage to the next (2.1.296 on this rig), so
 * the outage runs up to three times until at least one session is attached
 * while its slot is not connected. Each one that was is attached anyway,
 * never refused, its turn runs to its end, and its slot connects once let
 * through.
 */
const mcpLateCase = async (label: string) => {
  let proxy: ReturnType<typeof hubProxy> | undefined;
  try {
    const ids: string[] = [];
    const tools = new Map<string, string>();
    for (const n of [1, 2, 3]) {
      // biome-ignore lint/performance/noAwaitInLoops: one session at a time, each with its first turn answered
      const id = await fleet.spawn("claude", `Custody claude mcp-late ${n}`);
      const first = mark("claude", "mcp-late", `first${n}`);
      await fleet.send(id, `${first}: say ok.`);
      await until(
        `${first} answered`,
        () => turnsOf(first),
        (count) => count >= 1
      );
      const tool = mark("claude", "mcp-late", `tool${n}`);
      await fleet.send(id, `${LONG_TOOL} ${tool}: wait in a tool.`);
      await until(
        `${tool} asked`,
        () => turnsOf(tool),
        (count) => count >= 1,
        120_000
      );
      ids.push(id);
      tools.set(id, tool);
    }
    await Bun.sleep(3000);
    let taken: string[] = [];
    let upAt = 0;
    let outages = 0;
    while (taken.length === 0 && outages < 3) {
      outages += 1;
      // biome-ignore lint/performance/noAwaitInLoops: each outage follows the one before it
      const before = await eachSaid(ids, ATTACHED_CONNECTING);
      // The hub, and the address the slots dial, go down; it comes back
      // on a port of its own, behind the proxy on the one they dial.
      proxy?.down();
      await fleet.stop("agent", "SIGKILL");
      await fleet.stop("hub", "SIGKILL");
      await Bun.sleep(45_000);
      if (proxy) {
        proxy.hold(true);
        proxy.up();
      } else {
        const lease = Bun.serve({
          hostname: "127.0.0.1",
          port: 0,
          fetch: () => new Response(null),
        });
        const movedTo = lease.port as number;
        await lease.stop(true);
        proxy = hubProxy(Number(new URL(fleet.base).port), movedTo);
        fleet.env.CAWCO_HUB_PORT = String(movedTo);
      }
      fleet.launch("hub");
      await fleet.hubUp();
      fleet.launch("agent");
      await fleet.agentUp();
      upAt = Date.now();
      await Bun.sleep(20_000);
      const after = await eachSaid(ids, ATTACHED_CONNECTING);
      taken = ids.filter((id) => (after.get(id) ?? 0) > (before.get(id) ?? 0));
      if (taken.length === 0) {
        proxy.hold(false);
      }
    }
    const holding = proxy;
    if (!holding) {
      throw new Error(`${label}: no outage ran`);
    }
    await Bun.sleep(Math.max(0, upAt + 50_000 - Date.now()));
    const connectedBefore = await eachSaid(
      taken,
      "connected after it was attached"
    );
    const whileHeld = {
      heldForMs: Date.now() - upAt,
      outages,
      taken,
      dialsHeld: holding.heldSoFar(),
      refused: await Promise.all(
        taken.map(
          async (id) =>
            (await agentSaid(id, "did not connect within")) +
            (await agentSaid(id, "could not be verified")) +
            (await agentSaid(id, CREDENTIAL_GONE))
        )
      ),
      rows: taken.map((id) => fleet.instance(id)?.status),
      toolsFinishedYet: taken.map((id) => toolResults(tools.get(id) ?? "")),
    };
    holding.hold(false);
    const connected = await Promise.all(
      taken.map((id) =>
        until(
          `${id} slot connected`,
          () => agentSaid(id, "connected after it was attached"),
          (n) => n > (connectedBefore.get(id) ?? 0),
          180_000
        ).catch(() => 0)
      )
    );
    const toolsFinished = await Promise.all(
      taken.map((id) =>
        until(
          `${id} tool ran to its end`,
          () => toolResults(tools.get(id) ?? ""),
          (n) => n >= 1,
          (LONG_TOOL_S + 60) * 1000
        ).catch(() => 0)
      )
    );
    const reads = await Promise.all(
      taken.map(async (id) => {
        const next = mark("claude", "mcp-late", "next");
        return await readOnce(await fleet.send(id, `${next}: say ok.`), next);
      })
    );
    const outcome = {
      whileHeld,
      connected,
      toolsFinished,
      reads,
      rows: taken.map((id) => fleet.instance(id)?.status),
    };
    report(
      label,
      taken.length >= 1 &&
        whileHeld.dialsHeld >= 1 &&
        whileHeld.refused.every((n) => n === 0) &&
        whileHeld.rows.every((status) => status === "running") &&
        whileHeld.toolsFinishedYet.every((n) => n === 0) &&
        connected.every((n) => n >= 1) &&
        toolsFinished.every((n) => n >= 1) &&
        reads.every(
          (read) => read.turns === 1 && read.send?.state === "read"
        ) &&
        outcome.rows.every((status) => status === "running"),
      outcome,
      `${taken.length} session(s) attached while their MCP slot was held ${Math.round(whileHeld.heldForMs / 1000)} s past the agent's return (outage ${outages}); each tool turn ran to its end and each slot connected once let through`
    );
  } finally {
    // The hub stays on its new port behind the proxy, which lets all through.
    proxy?.hold(false);
  }
};

const runCase = async (harness: Harness, name: Case) => {
  if (name === "needs-auth") {
    await needsAuthCase(`${harness} ${name}`);
    return;
  }
  if (name === "mcp-late") {
    await mcpLateCase(`${harness} ${name}`);
    return;
  }
  if (name === "stopped" || name === "stopped-dies") {
    await frozenCase(`${harness} ${name}`, name === "stopped-dies");
    return;
  }
  if (name === "killed") {
    await killedCase(`${harness} ${name}`);
    return;
  }
  if (name === "stale-credential") {
    await staleCredentialCase(`${harness} ${name}`);
    return;
  }
  if (name === "held-restart") {
    await heldRestartCase(`${harness} ${name}`);
    return;
  }
  if (name === "stuck-opencode") {
    await stuckOpencodeCase(`${harness} ${name}`);
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
