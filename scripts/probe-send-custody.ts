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
 *   stale-credential — a wake held at the agent's door (the agent frozen):
 *              the dashboard starting it again meanwhile is refused and mints
 *              nothing, so the held wake starts on its own credential and the
 *              send is read once; with its credential revoked instead, the
 *              start fails once with its reason, no start follows on its own,
 *              the send stays owed, and a person's next message runs it;
 *   held-restart — the agent killed and started again while a wake is held
 *              at its door: the session runs after the restart, once;
 *   stuck-opencode — the agent restarts beside an OpenCode server generation
 *              that answers every request with HTTP 500, holding three
 *              OpenCode sessions: a held Claude session's send is read
 *              within seconds; each OpenCode session is settled unattached,
 *              the custody log naming that generation, and a send to one is
 *              failed with its reason or owed.
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
import { SessiondClient } from "../packages/agent/src/sessiond-client";
import { processStart } from "../packages/core/src/process-identity";
import {
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
  | "stuck-opencode";
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

/**
 * A wake held at the agent's door while its credential is revoked: its start
 * fails once with the reason, nothing starts it again on its own for a
 * minute, its send stays owed, and a person's next message runs both.
 */
const revokedLaunch = async () => {
  const id = await asleepSession("revoked");
  const queued = mark("claude", "revoked", "queued");
  fleet.freeze("agent", true);
  let uuid: string;
  try {
    uuid = await wakeWhileFrozen(id, queued);
    fleet.write(
      "UPDATE session_identities SET pending_hash = ? WHERE instance_id = ?",
      createHash("sha256").update(crypto.randomUUID()).digest("hex"),
      id
    );
  } finally {
    fleet.freeze("agent", false);
  }
  const failed = await until(
    "the held start failed",
    () => fleet.instance(id),
    (row) => row?.status === "error",
    120_000
  );
  const failedAt = Date.now();
  // A minute in which nothing may start it again on its own.
  await Bun.sleep(60_000);
  const quiet = {
    row: fleet.instance(id),
    starts: await agentSaid(id, INSTALLED),
    failures: await agentSaid(id, START_FAILED),
    send: fleet.sendRow(uuid),
    quietForMs: Date.now() - failedAt,
  };
  const next = mark("claude", "revoked", "next");
  const nextUuid = await fleet.send(id, `${next}: say ok.`);
  const nextRead = await readOnce(nextUuid, next);
  const queuedRead = await readOnce(uuid, queued);
  const outcome = {
    failedWith: failed?.last_error,
    quiet,
    nextRead,
    queuedRead,
  };
  return {
    ok:
      (failed?.last_error ?? "").includes(REFUSED) &&
      quiet.row?.spawned_at === failed?.spawned_at &&
      quiet.row?.status === "error" &&
      quiet.failures === 1 &&
      quiet.send?.state === "pending" &&
      quiet.send.owed !== null &&
      nextRead.turns === 1 &&
      nextRead.send?.state === "read" &&
      queuedRead.turns === 1 &&
      queuedRead.send?.state === "read",
    outcome,
  };
};

const staleCredentialCase = async (label: string) => {
  const second = await secondLaunchWhileHeld();
  const revoked = await revokedLaunch();
  report(
    label,
    second.ok && revoked.ok,
    { secondLaunch: second.outcome, revoked: revoked.outcome },
    "a second launch while one was held minted nothing and the held one ran once on its own credential; a revoked one failed once, stayed failed, and its send was owed and then read once"
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

const runCase = async (harness: Harness, name: Case) => {
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
