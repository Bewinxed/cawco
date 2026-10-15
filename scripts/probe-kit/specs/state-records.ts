/**
 * A damaged record stops only what it belongs to, says so with its file,
 * and the existing way out removes it. On a scratch fleet (real hub, agent
 * and sessiond; Claude Code against the mock model), boundaries included:
 * run it where a workspace boundary can start (not inside another one).
 *
 * Two delegates cut workspaces A and B; a third session, Quiet, is stopped;
 * a notice is acknowledged, so the hub keeps its notices record. Then
 * everything stops as a crash stops it (sessiond and its sessions killed,
 * the agent and the hub killed), and A's `create.json` and `accounts.json`,
 * Quiet's wake-ups record and the hub's `notices-seen.json` are zeroed (NUL
 * bytes of their own length, as obelisk's reset left them on 2026-10-14).
 * The machine starts again:
 *
 * (a) The agent's start-up sweep names each damaged file of its own.
 * (b) A's session row says it is damaged, naming a file of A's, with
 *     archive as the way out; Quiet's row names its zeroed wake-ups, the
 *     way out being to stop it.
 * (c) Other sessions still spawn: a plain session, and a new delegate in a
 *     new workspace C (both read every workspace's records on the way).
 * (d) B's records and clone are as they were, and its row says nothing.
 * (e) Archiving A (its session stopped first, so its item is not live)
 *     removes its state dir and clone, and its row stops saying it.
 * (f) The hub started with its notices record damaged: the board says so
 *     with the file, an acknowledgement is refused with the same words,
 *     Reset writes a fresh record (a list again) and the board's word
 *     clears, and acknowledging works again.
 * (g) Wake-ups: a live session's record outlives an agent restart that
 *     reattaches to it; Quiet's stale record is gone once a fresh process
 *     is started for it, and its row stops saying it.
 *
 *   bun scripts/probe-kit/run.ts state-records
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  DamagedHubRecord,
  DamagedRow,
} from "../../../packages/core/src/index";
import { clientLine } from "../../../packages/core/src/wire";
import { MACHINE, MODEL, type Reply, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

interface Row {
  damaged?: DamagedRow;
  id: string;
  lastError?: string | null;
  status: string;
}

interface Board {
  kind: string;
  noticesDamaged?: DamagedHubRecord | null;
  noticesSeen: string[];
}

/** Zeroes `file` as a crash leaves it: NUL bytes, as many as it held. */
const zero = async (file: string): Promise<number> => {
  const size = Math.max((await stat(file)).size, 1);
  await writeFile(file, Buffer.alloc(size));
  return size;
};

/** The board a dashboard is handed as its socket opens. */
const board = (base: string): Promise<Board> =>
  new Promise((done, fail) => {
    const socket = new WebSocket(`${base.replace("http", "ws")}/ws/dashboard`);
    const timer = setTimeout(() => {
      socket.close();
      fail(new Error("no board within 20s"));
    }, 20_000);
    // Read as the dashboard reads it: through the wire's own line, which
    // puts a message sent in parts back together.
    const line = clientLine(socket);
    line.listen((message) => {
      // Every dashboard frame rides a `frames` envelope.
      const frame = (message as { payload?: Board } | undefined)?.payload;
      if (frame?.kind === "instances") {
        clearTimeout(timer);
        socket.close();
        done(frame);
      }
    });
    socket.onmessage = (event) => line.receive(String(event.data));
    socket.onerror = () => fail(new Error("the dashboard socket failed"));
  });

const delegate = async (
  fleet: KitFleet,
  parent: string,
  cwd: string,
  tag: string
): Promise<{ instanceId: string; workspaceId: string }> => {
  const started = await fleet.api<{
    instanceId: string;
    workItemId: string;
    workspaceId: string;
  }>("/api/work-items", {
    parentInstanceId: parent,
    title: `Hold workspace ${tag}`,
    prompt: `PROBE-${tag}: say ok.`,
    harness: "claude",
    cwd,
    checks: [{ name: "Nothing to check", command: "true" }],
  });
  await until(
    `delegate ${tag} running`,
    () => fleet.instance(started.instanceId),
    (row) => row?.status === "running",
    180_000
  );
  return started;
};

/** A POST whose refusal is an answer too: its status and text. */
const posted = async (
  base: string,
  path: string,
  body?: unknown
): Promise<{ status: number; text: string }> => {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  return { status: response.status, text: await response.text() };
};

/** (f) The hub's notices record, damaged at its start: said, refused, Reset, whole again. */
const noticesPhase = async (
  kit: Kit,
  base: string,
  noticesFile: string
): Promise<void> => {
  const { check } = kit;
  const damagedBoard = await board(base);
  check(
    "(f) the board says the notices record is damaged, naming its file",
    damagedBoard.noticesDamaged?.file === noticesFile,
    JSON.stringify(damagedBoard.noticesDamaged)
  );
  const refusedAck = await posted(base, "/api/notices/seen", {
    ids: ["probe:while-damaged"],
  });
  check(
    "(f) an acknowledgement is refused, saying the record is damaged",
    refusedAck.status === 409 &&
      refusedAck.text.startsWith(
        `This hub's notices record is damaged: ${noticesFile}`
      ),
    `${refusedAck.status} ${refusedAck.text}`
  );
  const reset = await posted(base, "/api/notices/reset");
  check(
    "(f) Reset answers with a fresh record",
    reset.status === 200 && reset.text === JSON.stringify({ seen: [] }),
    `${reset.status} ${reset.text}`
  );
  const written = await readFile(noticesFile, "utf8");
  check(
    "(f) the record on disk is a whole list again",
    JSON.stringify(JSON.parse(written)) === "[]",
    JSON.stringify(written)
  );
  const healedBoard = await board(base);
  check(
    "(f) the board's word on the damage clears",
    healedBoard.noticesDamaged === null,
    JSON.stringify(healedBoard.noticesDamaged)
  );
  const ack = await posted(base, "/api/notices/seen", {
    ids: ["probe:after-reset"],
  });
  check(
    "(f) acknowledging works again",
    ack.status === 200 && ack.text.includes("probe:after-reset"),
    `${ack.status} ${ack.text}`
  );
};

const spec: Spec = {
  name: "state-records",
  run: async (kit: Kit) => {
    const fleet = await kit.fleet(respond);
    const { check } = kit;
    const home = fleet.env.HOME as string;
    const workspacesDir = join(home, ".cawco", "workspaces");
    const wakeupsDir = join(
      home,
      ".local",
      "share",
      "cawco",
      "session-wakeups"
    );
    const noticesFile = join(fleet.sandbox, "hub", "notices-seen.json");
    const rows = () => fleet.api<Row[]>("/api/instances");
    const rowOf = async (id: string) =>
      (await rows()).find((row) => row.id === id);

    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();

    const src = join(fleet.sandbox, "src");
    await mkdir(src, { recursive: true });
    await writeFile(
      join(home, ".gitconfig"),
      "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
    );
    await Bun.$`sh -c ${"git init -q -b main && echo records > README.md && git add -A && git commit -qm 'First commit'"}`
      .cwd(src)
      .env({ ...process.env, HOME: home })
      .quiet();
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "Records",
      machineId: MACHINE,
      cwd: src,
    });
    const parent = await fleet.spawn("claude", "Parent", src, {
      projectId: project.id,
    });
    const a = await delegate(fleet, parent, src, "A");
    const b = await delegate(fleet, parent, src, "B");
    const quiet = await fleet.spawn("claude", "Quiet", src);
    await fleet.stopSession(quiet);
    await until(
      "Quiet stopped",
      () => fleet.instance(quiet),
      (row) => row?.status === "stopped",
      60_000
    );
    await fleet.api("/api/notices/seen", { ids: ["probe:before-the-crash"] });
    const pathOf = (id: string) =>
      fleet.query<{ path: string }>(
        "SELECT path FROM workspaces WHERE id = ?",
        id
      )[0]?.path as string;
    const aState = join(workspacesDir, a.workspaceId);
    const bState = join(workspacesDir, b.workspaceId);
    const bCreate = await readFile(join(bState, "create.json"), "utf8");

    // ── the crash ─────────────────────────────────────────────────────────
    await fleet.stop("agent", "SIGKILL");
    await fleet.stop("hub", "SIGKILL");
    await fleet.killSessiond();
    const aCreate = join(aState, "create.json");
    const aAccounts = join(aState, "accounts.json");
    const wakeups = join(wakeupsDir, quiet);
    await mkdir(wakeupsDir, { recursive: true });
    await writeFile(wakeups, JSON.stringify({ all: 3, once: 0 }));
    const zeroed = await Promise.all(
      [aCreate, aAccounts, wakeups, noticesFile].map(zero)
    );
    kit.note(
      `zeroed ${[aCreate, aAccounts, wakeups, noticesFile].map((file, i) => `${file} (${zeroed[i]} B)`).join(", ")}`
    );

    // ── the machine starts again ──────────────────────────────────────────
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    const hubStarted = await fleet
      .hubUp()
      .then(() => "up")
      .catch((error: unknown) => String(error));
    check(
      "(f) the hub starts with its notices record damaged",
      hubStarted === "up",
      hubStarted
    );
    fleet.launch("agent");
    await fleet.agentUp();

    // (a)
    const swept = await until(
      "the sweep's lines",
      () => fleet.logs("agent"),
      (log) => log.includes("damaged record(s) on this machine"),
      60_000
    );
    for (const file of [aCreate, aAccounts, wakeups]) {
      check(
        `(a) the start-up sweep names ${file.slice(home.length)}`,
        swept.includes(`[records] ${file} is damaged (`),
        swept
          .split("\n")
          .filter((line) => line.includes("[records]"))
          .join(" | ")
      );
    }

    // (b)
    const aRow = await until(
      "A's row marked damaged",
      () => rowOf(a.instanceId),
      (row) => Boolean(row?.damaged),
      60_000
    ).catch(() => undefined);
    check(
      "(b) A's session row names a damaged file of A's, archive its way out",
      Boolean(
        aRow?.damaged?.file.startsWith(aState) &&
        aRow.damaged.remedy === "archive" &&
        aRow.damaged.workspaceId === a.workspaceId
      ),
      JSON.stringify(aRow?.damaged ?? aRow?.status)
    );
    check(
      "(b) A's session is not running, and says why in words",
      aRow?.status === "error" &&
        (aRow.lastError ?? "").startsWith(
          "This workspace's record is damaged: "
        ),
      `${aRow?.status}: ${aRow?.lastError}`
    );
    const quietRow = await until(
      "Quiet's row marked damaged",
      () => rowOf(quiet),
      (row) => Boolean(row?.damaged),
      60_000
    ).catch(() => undefined);
    check(
      "(b) Quiet's zeroed wake-ups name its row, stopping it the way out",
      quietRow?.damaged?.file === wakeups && quietRow.damaged.remedy === "end",
      JSON.stringify(quietRow?.damaged)
    );

    await noticesPhase(kit, fleet.base, noticesFile);

    // (c)
    const plain = await fleet
      .spawn("claude", "Plain after the crash", src)
      .catch((error: unknown) => String(error));
    check(
      "(c) a plain session spawns",
      (await fleet.instance(plain))?.status === "running",
      plain
    );
    const parent2 = await fleet.spawn("claude", "Parent after", src, {
      projectId: project.id,
    });
    const c = await delegate(fleet, parent2, src, "C").catch((error: unknown) =>
      String(error)
    );
    check(
      "(c) a new delegate cuts workspace C and runs",
      typeof c === "object" && existsSync(pathOf(c.workspaceId)),
      typeof c === "object" ? c.workspaceId : c
    );

    // (d)
    check(
      "(d) B's create.json is as it was, and its clone is there",
      (await readFile(join(bState, "create.json"), "utf8")) === bCreate &&
        existsSync(pathOf(b.workspaceId)),
      bState
    );
    check(
      "(d) B's row says nothing of damage",
      !(await rowOf(b.instanceId))?.damaged,
      JSON.stringify((await rowOf(b.instanceId))?.damaged)
    );

    // (g) a live session's record outlives an agent restart that reattaches
    const liveRecord = join(wakeupsDir, plain);
    const kept = JSON.stringify({ all: 2, once: 1 });
    await writeFile(liveRecord, kept);
    await fleet.stop("agent", "SIGKILL");
    // Read through the board: with its machine gone the row is `unknown`,
    // and `running` again only once the new agent has attached to it.
    await until(
      "the plain session's machine gone",
      () => rowOf(plain),
      (row) => row?.status !== "running",
      60_000
    ).catch(() => undefined);
    fleet.launch("agent");
    await fleet.agentUp();
    await until(
      "the plain session reattached",
      () => rowOf(plain),
      (row) => row?.status === "running",
      120_000
    ).catch(() => undefined);
    const afterAttach = await readFile(liveRecord, "utf8").catch(
      () => "(gone)"
    );
    check(
      "(g) an attach to a live process keeps its wake-ups record",
      afterAttach === kept,
      afterAttach
    );

    // (g) a fresh process for Quiet: its stale (damaged) record goes first
    const sessionKey = fleet.query<{ session_id: string | null }>(
      "SELECT session_id FROM instances WHERE id = ?",
      quiet
    )[0]?.session_id;
    await fleet.post({
      verb: "spawn",
      machineId: MACHINE,
      instanceId: quiet,
      requestId: crypto.randomUUID(),
      payload: {
        instanceId: quiet,
        cwd: src,
        harness: "claude",
        model: MODEL.claude,
        permissionMode: "bypassPermissions",
        ...(sessionKey ? { resume: { sessionKey } } : {}),
      },
    });
    const revived = await until(
      "Quiet running again",
      () => fleet.instance(quiet),
      (row) => row?.status === "running",
      180_000
    ).catch(() => undefined);
    const afterSpawn = await readFile(wakeups).catch(() => undefined);
    check(
      "(g) a fresh process for Quiet: its stale record is gone (or written whole by the new process)",
      revived !== undefined &&
        (afterSpawn === undefined ||
          (!afterSpawn.includes(0) &&
            afterSpawn.toString() !== JSON.stringify({ all: 3, once: 0 }))),
      `${revived?.status} ${afterSpawn ? JSON.stringify(afterSpawn.toString()) : "(gone)"}`
    );
    const quietCleared = await until(
      "Quiet's row no longer damaged",
      () => rowOf(quiet),
      (row) => !row?.damaged,
      60_000
    ).catch(() => undefined);
    check(
      "(g) Quiet's row stops saying it",
      quietCleared !== undefined && !quietCleared.damaged,
      JSON.stringify(quietCleared?.damaged)
    );

    // (e)
    await fleet.stopSession(a.instanceId);
    const aPath = pathOf(a.workspaceId);
    // Asked again until its stop has cancelled the item (a live item refuses it).
    const archiveA = async (): Promise<{ state: string }> => {
      try {
        return await fleet.api<{ state: string }>(
          `/api/workspaces/${a.workspaceId}/archive`,
          {}
        );
      } catch (error) {
        return { state: String(error) };
      }
    };
    let archived: { state: string } = { state: "not asked" };
    try {
      archived = await until(
        "A archived",
        archiveA,
        (answer) => answer.state === "archived",
        60_000
      );
    } catch (error) {
      archived = {
        state: `${String(error)}; last: ${(await archiveA()).state}`,
      };
    }
    check(
      "(e) archiving A succeeds",
      archived.state === "archived",
      archived.state
    );
    check(
      "(e) A's state dir and clone are gone",
      !(existsSync(aState) || existsSync(aPath)),
      `${aState} ${existsSync(aState)}, ${aPath} ${existsSync(aPath)}`
    );
    const cleared = await until(
      "A's row no longer damaged",
      () => rowOf(a.instanceId),
      (row) => !row?.damaged,
      60_000
    ).catch(() => undefined);
    check(
      "(e) A's row stops saying it once the machine's list drops it",
      cleared !== undefined && !cleared.damaged,
      JSON.stringify(cleared?.damaged)
    );
    check(
      "(e) B's records are untouched by A's archive",
      (await readFile(join(bState, "create.json"), "utf8")) === bCreate,
      bState
    );
  },
};

export default spec;
