/**
 * A work item follows its session's life (work-items.ts `followSessions`):
 * a session that cannot go on fails its item with its reason, at once, and
 * its parent is told once; a dismissed item leaves every live view. On a
 * scratch fleet (real hub, agent and sessiond; Claude Code against the mock
 * model), with every delegate held in a long turn so its item stays live
 * until something ends it. Each delegate's item is filed in the database
 * under a workspace with no row (`delegate`, below): the rule reads only a
 * session's row and its item, and a work item's boundary cannot start
 * inside another one, so the spec runs in a workspace too.
 *
 * (a) The hub is killed, then the agent and two delegates' processes while
 *     it is down; D1's conversation (its transcript) is deleted. The hub and
 *     the agent start again: D1's row is in error, "conversation gone"; its
 *     item failed with those words within {@link FOLLOWS_MS} of the agent's
 *     register; its parent has its failure report.
 * (b) D2, killed the same way with its conversation kept, is restored by the
 *     same register, and its item runs on: a restart is not an end.
 * (c) D3's process is killed from outside while it runs, with its transcript
 *     deleted: the hub hands its cut turn back, the resume finds the
 *     conversation gone, and the item fails with that, its parent told.
 * (d) D4's process is killed while its agent is frozen, so the hub still
 *     calls it running. Dismissing its item cancels it, takes it off
 *     delegate_list's live read, and ends the session.
 * (e) Past the hub's 30 s sweep, each failure was reported exactly once.
 *
 *   bun scripts/probe-kit/run.ts session-ends
 */
import { Database } from "bun:sqlite";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CLAUDE_CONVERSATION_GONE } from "../../../packages/core/src/index";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

/** How soon after the agent's register an item follows its session's failure: one publish, not the sweep. */
const FOLLOWS_MS = 15_000;
/** The hub's work-item sweep (work-items.ts `BUDGET_SWEEP_MS`) and a margin. */
const PAST_SWEEP_MS = 35_000;
const HOLD = "PROBE-HOLD";
const NUMERIC = /INT|REAL|NUM/i;

/** A delegate's every turn lasts ten minutes; anything else answers at once. */
const respond = (request: Seen): Reply =>
  request.all.includes(HOLD)
    ? { everyMs: 3000, words: Array.from({ length: 200 }, () => "… ") }
    : { everyMs: 5, words: ["ok"] };

interface Item {
  dismissed_at: number | null;
  error: string | null;
  state: string;
}

interface DelegateEvent {
  kind: string;
  payload: { body?: string; failed?: boolean };
}

const spec: Spec = {
  name: "session-ends",
  run: async (kit: Kit) => {
    const { check } = kit;
    const fleet = await kit.fleet(respond);
    const home = fleet.env.HOME as string;

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
    await Bun.$`sh -c ${"git init -q -b main && echo ends > README.md && git add -A && git commit -qm 'First commit'"}`
      .cwd(src)
      .env({ ...process.env, HOME: home })
      .quiet();
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "Ends",
      machineId: MACHINE,
      cwd: src,
    });
    const parent = await fleet.spawn("claude", "Parent", src, {
      projectId: project.id,
    });

    /**
     * One write beside the running hub's, waiting for its lock. Foreign keys
     * unenforced on this connection only: an item's workspace id names no row.
     */
    const write = (sql: string, ...params: (string | number)[]) => {
      const db = new Database(fleet.env.CAWCO_DB_PATH as string);
      try {
        db.exec("PRAGMA busy_timeout = 15000");
        db.exec("PRAGMA foreign_keys = OFF");
        db.query(sql).run(...params);
      } finally {
        db.close();
      }
    };
    /** A row of `table`: each column the schema requires and gives no default filled (as ios-seen files its items). */
    const fileRow = (table: string, given: Record<string, string | number>) => {
      const columns = fleet.query<{
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | null;
      }>(`PRAGMA table_info(${table})`);
      const row = Object.fromEntries(
        Object.entries(given).filter(([name]) =>
          columns.some((column) => column.name === name)
        )
      );
      for (const column of columns) {
        if (
          column.notnull &&
          column.dflt_value === null &&
          !(column.name in row)
        ) {
          row[column.name] = NUMERIC.test(column.type)
            ? Date.now()
            : `probe-${column.name}`;
        }
      }
      const names = Object.keys(row);
      write(
        `INSERT INTO ${table} (${names.map((name) => `"${name}"`).join(", ")}) VALUES (${names.map(() => "?").join(", ")})`,
        ...names.map((name) => row[name] as string | number)
      );
    };
    const item = (id: string) =>
      fleet.query<Item>(
        "SELECT state, error, dismissed_at FROM work_items WHERE id = ?",
        id
      )[0];
    const reports = async (instanceId: string) =>
      (
        await fleet.api<DelegateEvent[]>(
          `/api/delegate-events?instance=${instanceId}`
        )
      ).filter((event) => event.kind === "report" && event.payload.failed);
    /**
     * A delegate as the rule reads one: a session spawned under the parent,
     * in a long turn, and a live work item filed as its own — straight into
     * the database, under a workspace id with no row, so no spawn of it
     * (a restore, a resume) is bounded. A work item's own workspace boundary
     * cannot start inside another one, and the rule reads only the session's
     * row and its item.
     */
    const delegate = async (tag: string) => {
      const instanceId = await fleet.spawn("claude", `Hold ${tag}`, src, {
        projectId: project.id,
        parent: { instanceId: parent },
      });
      await fleet.send(instanceId, `${HOLD} ${tag}: take your time.`);
      // Its turn is open: its process has said its init, and its
      // conversation is on disk.
      await until(
        `${tag}'s conversation recorded`,
        () =>
          fleet.query<{ session_id: string | null }>(
            "SELECT session_id FROM instances WHERE id = ?",
            instanceId
          )[0]?.session_id ?? undefined,
        Boolean,
        60_000
      );
      const workItemId = `probe-item-${tag}-${crypto.randomUUID().slice(0, 8)}`;
      fileRow("work_items", {
        id: workItemId,
        workspace_id: `probe-ws-${tag}`,
        parent_instance_id: parent,
        instance_id: instanceId,
        harness: "claude",
        title: `Hold ${tag}`,
        brief: `${HOLD} ${tag}: take your time.`,
        state: "running",
        created_at: Date.now(),
      });
      write(
        "UPDATE instances SET work_item_id = ? WHERE id = ?",
        workItemId,
        instanceId
      );
      return { instanceId, workItemId };
    };
    /** Every file of a Claude conversation under the fleet's HOME, by its key. */
    const transcripts = async (instanceId: string): Promise<string[]> => {
      const key = fleet.query<{ session_id: string }>(
        "SELECT session_id FROM instances WHERE id = ?",
        instanceId
      )[0]?.session_id;
      if (!key) {
        return [];
      }
      const files = await readdir(home, { recursive: true }).catch(
        () => [] as string[]
      );
      return files
        .filter((file) => file.endsWith(`${key}.jsonl`))
        .map((file) => join(home, file));
    };
    const deleteConversation = async (instanceId: string): Promise<number> => {
      const files = await transcripts(instanceId);
      await Promise.all(files.map((file) => rm(file, { force: true })));
      return files.length;
    };
    const killProcess = async (instanceId: string): Promise<number> => {
      const pid = await fleet.sessionPid(instanceId);
      if (pid === undefined) {
        throw new Error(`no process held for ${instanceId}`);
      }
      await fleet.killTree(pid, "SIGKILL");
      return pid;
    };

    const d1 = await delegate("D1");
    const d2 = await delegate("D2");

    // ── (a)/(b) the crash ──────────────────────────────────────────────
    await fleet.stop("hub", "SIGKILL");
    await fleet.stop("agent", "SIGKILL");
    const killed = [await killProcess(d1.instanceId)];
    killed.push(await killProcess(d2.instanceId));
    const deleted = await deleteConversation(d1.instanceId);
    kit.note(
      `hub and agent killed; D1 and D2 processes (${killed.join(", ")}) killed; ${deleted} D1 transcript file(s) deleted`
    );
    check("(a) D1's conversation was on disk to delete", deleted > 0);
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.launch("agent");
    await fleet.agentUp();
    const registered = Date.now();

    const failedD1 = await until(
      "D1's item failed",
      () => item(d1.workItemId),
      (row) => row?.state === "failed",
      FOLLOWS_MS
    ).catch(() => item(d1.workItemId));
    const tookD1 = Date.now() - registered;
    const rowD1 = fleet.instance(d1.instanceId);
    check(
      "(a) D1's row is in error: its conversation is gone",
      rowD1?.status === "error" &&
        rowD1.last_error === CLAUDE_CONVERSATION_GONE,
      JSON.stringify(rowD1)
    );
    check(
      `(a) D1's item failed with those words within ${FOLLOWS_MS / 1000} s of the register`,
      failedD1?.state === "failed" &&
        failedD1.error === CLAUDE_CONVERSATION_GONE,
      `${failedD1?.state} after ${tookD1} ms: ${failedD1?.error}`
    );
    const toldD1 = await until(
      "D1's parent told",
      () => reports(d1.instanceId),
      (events) => events.length > 0,
      FOLLOWS_MS
    ).catch(() => [] as DelegateEvent[]);
    check(
      "(a) its parent has its failure report, with the reason",
      toldD1.some((event) =>
        (event.payload.body ?? "").startsWith(CLAUDE_CONVERSATION_GONE)
      ),
      toldD1.map((event) => event.payload.body).join(" | ")
    );

    const rowD2 = await until(
      "D2 restored",
      () => fleet.instance(d2.instanceId),
      (row) => row?.status === "running",
      120_000
    ).catch(() => fleet.instance(d2.instanceId));
    check(
      "(b) D2, its conversation kept, is restored and its item runs on",
      rowD2?.status === "running" && item(d2.workItemId)?.state === "running",
      `${rowD2?.status}; item ${item(d2.workItemId)?.state}`
    );

    // ── (c) a resume that finds the conversation gone ──────────────────
    const d3 = await delegate("D3");
    fleet.freeze("agent", true);
    const deletedD3 = await deleteConversation(d3.instanceId);
    await killProcess(d3.instanceId);
    fleet.freeze("agent", false);
    kit.note(
      `D3's process killed with its agent frozen; ${deletedD3} transcript file(s) deleted`
    );
    const failedD3 = await until(
      "D3's item failed",
      () => item(d3.workItemId),
      (row) => row?.state === "failed",
      60_000
    ).catch(() => item(d3.workItemId));
    const rowD3 = fleet.instance(d3.instanceId);
    check(
      "(c) D3's resume found its conversation gone: row in error, item failed with it",
      rowD3?.status === "error" &&
        rowD3.last_error === CLAUDE_CONVERSATION_GONE &&
        failedD3?.state === "failed" &&
        failedD3.error === CLAUDE_CONVERSATION_GONE,
      `${rowD3?.status} “${rowD3?.last_error}”; item ${failedD3?.state} “${failedD3?.error}”`
    );
    const toldD3 = await until(
      "D3's parent told",
      () => reports(d3.instanceId),
      (events) => events.length > 0,
      FOLLOWS_MS
    ).catch(() => [] as DelegateEvent[]);
    check("(c) its parent has its failure report", toldD3.length > 0);

    // ── (d) dismiss on a running item whose process is gone ───────────
    const d4 = await delegate("D4");
    const credential = await Bun.file(
      `/proc/${await fleet.sessionPid(parent)}/environ`
    )
      .text()
      .then(
        (environ) =>
          environ
            .split("\0")
            .find((line) => line.startsWith("CAWCO_SESSION_CREDENTIAL="))
            ?.slice("CAWCO_SESSION_CREDENTIAL=".length) ?? ""
      );
    const delegateList = async (): Promise<string> => {
      const response = await fetch(
        `${fleet.base}/api/delegation/call/${parent}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${credential}`,
          },
          body: JSON.stringify({ name: "delegate_list", arguments: {} }),
        }
      );
      return `${response.status} ${await response.text()}`;
    };
    const before = await delegateList();
    check(
      "(d) delegate_list lists D4 while it runs",
      before.startsWith("200") && before.includes(d4.instanceId),
      before.slice(0, 300)
    );
    fleet.freeze("agent", true);
    await killProcess(d4.instanceId);
    const stillRunning = fleet.instance(d4.instanceId)?.status;
    const dismissed = await fleet.api<{ state: string; dismissedAt: number }>(
      `/api/work-items/${d4.workItemId}/dismiss`,
      {}
    );
    fleet.freeze("agent", false);
    check(
      "(d) dismissing the running item whose process is gone cancels it",
      stillRunning === "running" &&
        dismissed.state === "cancelled" &&
        dismissed.dismissedAt !== null &&
        item(d4.workItemId)?.state === "cancelled",
      `row ${stillRunning} at dismiss; answer ${JSON.stringify(dismissed)}`
    );
    const after = await delegateList();
    check(
      "(d) it is gone from delegate_list's live read",
      after.startsWith("200") && !after.includes(d4.instanceId),
      after.slice(0, 300)
    );
    const endedD4 = await until(
      "D4's session ended",
      () => fleet.instance(d4.instanceId),
      (row) => row?.status === "stopped",
      60_000
    ).catch(() => fleet.instance(d4.instanceId));
    check(
      "(d) and its session is ended",
      endedD4?.status === "stopped",
      endedD4?.status
    );

    // ── (e) once ───────────────────────────────────────────────────────
    await Bun.sleep(PAST_SWEEP_MS);
    const once = await Promise.all(
      [d1, d3].map(async ({ instanceId }) => (await reports(instanceId)).length)
    );
    check(
      "(e) past the sweep, each failure was reported exactly once",
      once.every((count) => count === 1),
      `D1 ${once[0]}, D3 ${once[1]}`
    );
    check(
      "(e) D2 still runs, D4 stays cancelled",
      item(d2.workItemId)?.state === "running" &&
        item(d4.workItemId)?.state === "cancelled",
      `D2 ${item(d2.workItemId)?.state}, D4 ${item(d4.workItemId)?.state}`
    );
  },
};

export default spec;
