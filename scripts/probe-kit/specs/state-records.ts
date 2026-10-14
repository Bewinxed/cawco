/**
 * A damaged record stops only what it belongs to, says so with its file,
 * and the existing way out removes it. On a scratch fleet (real hub, agent
 * and sessiond; Claude Code against the mock model), boundaries included:
 * run it where a workspace boundary can start (not inside another one).
 *
 * Two delegates cut workspaces A and B. Then everything stops as a crash
 * stops it (sessiond and its sessions killed, the agent killed), and A's
 * `create.json` and `accounts.json` and one session's wake-ups record are
 * zeroed (NUL bytes of their own length, as obelisk's reset left them on
 * 2026-10-14). The machine starts again:
 *
 * (a) The agent's start-up sweep names each damaged file in its log.
 * (b) A's session row says it is damaged, naming a file of A's, with
 *     archive as the way out; the session whose wake-ups were zeroed says
 *     so with that file, the way out being to stop it.
 * (c) Other sessions still spawn: a plain session, and a new delegate in a
 *     new workspace C (both read every workspace's records on the way).
 * (d) B's records and clone are as they were, and its row says nothing.
 * (e) Archiving A (its session stopped first, so its item is not live)
 *     removes its state dir and clone, and its row stops saying it.
 *
 *   bun scripts/probe-kit/run.ts state-records
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DamagedRow } from "../../../packages/core/src/index";
import { MACHINE, type Reply, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

interface Row {
  damaged?: DamagedRow;
  id: string;
  lastError?: string | null;
  status: string;
}

/** Zeroes `file` as a crash leaves it: NUL bytes, as many as it held. */
const zero = async (file: string): Promise<number> => {
  const size = Math.max((await stat(file)).size, 1);
  await writeFile(file, Buffer.alloc(size));
  return size;
};

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
    await fleet.killSessiond();
    const aCreate = join(aState, "create.json");
    const aAccounts = join(aState, "accounts.json");
    const wakeups = join(wakeupsDir, parent);
    await mkdir(wakeupsDir, { recursive: true });
    if (!existsSync(wakeups)) {
      await writeFile(wakeups, JSON.stringify({ all: 0, once: 0 }));
    }
    const zeroed = await Promise.all([aCreate, aAccounts, wakeups].map(zero));
    kit.note(
      `zeroed ${aCreate} (${zeroed[0]} B), ${aAccounts} (${zeroed[1]} B), ${wakeups} (${zeroed[2]} B)`
    );

    // ── the machine starts again ──────────────────────────────────────────
    fleet.launch("sessiond");
    await fleet.sessiondUp();
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
    const rows = () => fleet.api<Row[]>("/api/instances");
    const rowOf = async (id: string) =>
      (await rows()).find((row) => row.id === id);
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
    const parentRow = await until(
      "the parent's row marked damaged",
      () => rowOf(parent),
      (row) => Boolean(row?.damaged),
      60_000
    ).catch(() => undefined);
    check(
      "(b) the zeroed wake-ups name their session's row, stopping it the way out",
      parentRow?.damaged?.file === wakeups &&
        parentRow.damaged.remedy === "end",
      JSON.stringify(parentRow?.damaged)
    );

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

    // (e)
    fleet.stopSession(a.instanceId);
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
