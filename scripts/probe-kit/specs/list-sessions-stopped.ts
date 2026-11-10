/**
 * `list_sessions` answers "which of the owner's main sessions stopped at a
 * usage limit, most recently touched first, across every machine" in one
 * call, from what the hub stores (session-list.ts), so a machine that is
 * offline is answered the same.
 *
 * In process, over a scratch database (hub-in-process.ts), through the tool
 * itself (delegation-tools.ts `handoffTools`, its input parsed and its words
 * presented) and the hub's own reads (session-list.ts `sessionReads`). The
 * caller C is a running main session. Its fleet:
 * - M1, main, asleep: the person asked it for work, and its turn stopped at
 *   a usage limit yesterday, on account A.
 * - M2, main, asleep: its latest turn was CawCo's recap for the person, and
 *   a usage limit stopped it, on the machine's own sign-in. A stop is a
 *   stop: it is listed, its last read the recap.
 * - D1, a delegate of C: stopped at a limit last of all, on A.
 * - M3, main: stopped, then a turn under way since (carried on): not listed.
 * - M4, main: stopped, then a turn ended another way (its stop dropped).
 * - R1, main, starting: nothing stopped it.
 *
 * - (role) stopped: limit with role main lists M1 and M2; delegate, D1; all,
 *   the three; never C, M3 or M4.
 * - (stopped) M2's recap-only stop reads as stopped: its row's stop is the
 *   limit, its last read CawCo's recap line, and its words say when. Without
 *   `stopped`, the live sessions only: R1, none asleep.
 * - (sort) active: D1, M2, M1; interacted (the person's last message): M1,
 *   M2, D1 (never written to); created: newest first, D1, M2, M1.
 * - (since) a day after M1's stop leaves M1 out.
 * - (page) limit 2: two rows, has_more, and its cursor gives the third.
 *
 *   bun scripts/probe-kit/run.ts list-sessions-stopped
 */
import { Database } from "bun:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BACK_MESSAGE } from "../../../packages/core/src/injected";
import { DAY_MS, HOUR_MS, MINUTE_MS } from "../../../packages/core/src/time";
import { noticeWords } from "../../../packages/core/src/words/notices";
import type { Kit, Spec } from "../spec";

const MACHINE = "machine-list-sessions";

const run = async (kit: Kit): Promise<void> => {
  const scratch = await mkdtemp(
    join(process.env.TMPDIR ?? tmpdir(), "list-sessions-")
  );
  try {
    const dbPath = join(scratch, "hub", "hub.db");
    const { hubInProcess } =
      await import("../../../packages/hub/scripts/hub-in-process");
    const { db } = await hubInProcess(dbPath, join(scratch, "home"));
    const { handoffTools } =
      await import("../../../packages/hub/src/delegation-tools");
    const { handoffActions } =
      await import("../../../packages/hub/src/delegation-actions");
    const { bindTool } = await import("../../../packages/hub/src/mcp-tool");
    const { sessionReads } =
      await import("../../../packages/hub/src/session-list");
    const now = Date.now();
    const account = db.accounts.create({
      provider: "anthropic",
      kind: "subscription",
      identity: {
        email: "a@example.com",
        organization: "A's Organization",
        orgId: "org-a",
      },
    });
    const raw = new Database(dbPath);
    /** Sets a row's times as a past fleet would have left them. */
    const times = (
      id: string,
      at: { created: number; active: number; ended?: number }
    ) => {
      raw
        .query(
          "UPDATE instances SET created_at = ?, updated_at = ?, turn_ended_at = ? WHERE id = ?"
        )
        .run(at.created, at.active, at.ended ?? null, id);
    };
    const session = (
      title: string,
      how: { parent?: string; item?: string; account?: string } = {}
    ): string => {
      const id = crypto.randomUUID();
      db.openInstance({
        id,
        machineId: MACHINE,
        cwd: join(scratch, title) as never,
        sessionId: crypto.randomUUID(),
        harness: "claude",
        origin: how.parent ? "delegate" : "person",
        title,
        kind: "mainline",
        permissionMode: "bypassPermissions",
        model: "claude-opus-5-5",
        ...(how.parent ? { parentInstanceId: how.parent } : {}),
        ...(how.item ? { workItemId: how.item } : {}),
      });
      if (how.account) {
        db.patchInstance(id, { accountId: how.account });
      }
      return id;
    };
    const send = (
      instanceId: string,
      at: number,
      said: string,
      origin: { kind: "human" } | { kind: "system"; name: string; line: string }
    ) =>
      db.recordSend({
        uuid: crypto.randomUUID(),
        instanceId,
        acceptedAt: new Date(at),
        readAt: new Date(at),
        mode: "turn",
        state: "read",
        body: {
          type: "user",
          message: { role: "user", content: said },
          origin,
        },
      });

    const caller = session("Caller");
    const m1 = session("M1 importer", { account: account.id });
    const m2 = session("M2 recap");
    const d1 = session("D1 delegate", {
      parent: caller,
      item: "item-d1",
      account: account.id,
    });
    const m3 = session("M3 carried on");
    const m4 = session("M4 ended again");
    const r1 = session("R1 running");
    for (const id of [m1, m2, d1, m3, m4]) {
      db.sleepInstance(id);
    }
    const yesterday = now - 30 * HOUR_MS;
    times(m1, {
      created: now - 3 * DAY_MS,
      active: yesterday - MINUTE_MS,
      ended: yesterday - 2 * MINUTE_MS,
    });
    times(m2, { created: now - 2 * DAY_MS, active: now - 20 * MINUTE_MS });
    times(d1, { created: now - DAY_MS, active: now - 15 * MINUTE_MS });
    times(m3, { created: now - DAY_MS, active: now - 15 * MINUTE_MS });
    times(m4, { created: now - DAY_MS, active: now - 15 * MINUTE_MS });
    times(r1, { created: now - HOUR_MS, active: now - 30 * MINUTE_MS });
    times(caller, { created: now - HOUR_MS, active: now });

    // M1: the person's work, stopped yesterday. M2: the person wrote to it
    // before M1, then CawCo's recap was its latest turn, stopped today.
    send(m2, now - 2 * DAY_MS, "tidy the notes", { kind: "human" });
    send(m1, yesterday - 10 * MINUTE_MS, "build the importer", {
      kind: "human",
    });
    // The recap's send as the hub sends it (sends.ts `tellBack`).
    send(m2, now - 11 * MINUTE_MS, BACK_MESSAGE, {
      kind: "system",
      name: "back",
      line: noticeWords.back,
    });
    db.atLimit.putStop({
      instanceId: m1,
      accountId: account.id,
      at: yesterday,
    });
    db.atLimit.putStop({
      instanceId: m2,
      accountId: null,
      at: now - 10 * MINUTE_MS,
    });
    db.atLimit.putStop({
      instanceId: d1,
      accountId: account.id,
      at: now - 5 * MINUTE_MS,
    });
    db.atLimit.putStop({
      instanceId: m3,
      accountId: null,
      at: now - 9 * MINUTE_MS,
    });
    db.openTurn(m3, now - 8 * MINUTE_MS);
    db.atLimit.putStop({
      instanceId: m4,
      accountId: null,
      at: now - 9 * MINUTE_MS,
    });
    db.atLimit.dropStop(m4);

    const all = [caller, m1, m2, d1, m3, m4, r1];
    const name = new Map([
      [caller, "C"],
      [m1, "M1"],
      [m2, "M2"],
      [d1, "D1"],
      [m3, "M3"],
      [m4, "M4"],
      [r1, "R1"],
    ]);
    const reads = sessionReads(db, (rows) => rows);
    const deps = {
      instanceId: caller,
      instanceById: (id: string) => db.getInstancesByIds([id])[0],
      formerIds: () => ({}),
      cwd: scratch,
      harness: "claude",
      fleet: {
        instances: () =>
          db
            .getInstancesByIds(all)
            .filter((row) => row.status !== "sleeping") as never,
        machines: () => [
          { machineId: MACHINE, hostname: "probe-box", status: "online" },
        ],
        ...reads,
      },
      deliver: () => Promise.reject(new Error("lists only")),
      emit: () => undefined,
      handOff: () => Promise.reject(new Error("lists only")),
      spawn: () => Promise.reject(new Error("lists only")),
      personOwed: () => false,
      sendToUser: () => undefined,
    } as never as Parameters<typeof handoffActions>[0];
    const definition = handoffTools({ harness: "claude" }).find(
      (one) => one.name === "list_sessions"
    );
    if (!definition) {
      kit.check("handoffTools lists list_sessions", false);
      return;
    }
    const tool = bindTool(definition, {
      actions: handoffActions(deps),
      personOwed: deps.personOwed,
    });
    const call = async (args: Record<string, unknown>) => {
      const answer = await tool.call({ ...args, response_format: "detailed" });
      const { text } = answer.content[0] as { text: string };
      return JSON.parse(text) as {
        has_more: boolean;
        next_cursor: string | null;
        sessions: {
          id: string;
          stop: { kind: string } | null;
          lastRead: { from: string; words: string } | null;
          account: string | null;
          resumes: unknown;
        }[];
      };
    };
    const order = async (args: Record<string, unknown>) =>
      (await call(args)).sessions.map((row) => name.get(row.id)).join(",");

    const main = await order({ stopped: "limit", role: "main" });
    const delegates = await order({ stopped: "limit", role: "delegate" });
    const every = await order({ stopped: "limit" });
    kit.check(
      "(role) stopped limit: main lists M1 and M2, delegate D1, all the three, never the caller, a carried-on or a re-ended session",
      main === "M2,M1" && delegates === "D1" && every === "D1,M2,M1",
      JSON.stringify({ main, delegates, every })
    );

    const listed = await call({ stopped: "limit", role: "main" });
    const recap = listed.sessions.find((row) => row.id === m2);
    const words = (
      (await tool.call({ stopped: "limit", role: "main" })).content[0] as {
        text: string;
      }
    ).text;
    // Its words say when the limit stopped it, to the minute.
    const stopMinute = new Date(now - 10 * MINUTE_MS)
      .toISOString()
      .slice(0, 16)
      .replace("T", " ");
    const live = await order({});
    kit.check(
      "(stopped) a recap-only limit stop is listed as stopped, its last read CawCo's recap; without stopped only the live sessions",
      recap?.stop?.kind === "limit" &&
        recap.lastRead?.from === "CawCo (back)" &&
        recap.lastRead.words === noticeWords.back &&
        recap.account === null &&
        words.includes(stopMinute) &&
        words.includes(noticeWords.back) &&
        live === "R1",
      JSON.stringify({ recap, live, words })
    );

    const active = await order({ stopped: "limit", sort: "active" });
    const interacted = await order({ stopped: "limit", sort: "interacted" });
    const created = await order({ stopped: "limit", sort: "created" });
    kit.check(
      "(sort) active D1,M2,M1; interacted M1,M2,D1; created D1,M2,M1",
      active === "D1,M2,M1" &&
        interacted === "M1,M2,D1" &&
        created === "D1,M2,M1",
      JSON.stringify({ active, interacted, created })
    );

    const day = new Date(now - 2 * HOUR_MS).toISOString().slice(0, 10);
    const since = await order({ stopped: "limit", since: day });
    kit.check(
      "(since) a day after M1's stop leaves M1 out",
      since === "D1,M2",
      JSON.stringify({ day, since })
    );

    const first = await call({ stopped: "limit", limit: 2 });
    const second = first.next_cursor
      ? await call({ stopped: "limit", limit: 2, cursor: first.next_cursor })
      : undefined;
    kit.check(
      "(page) limit 2 gives two rows and a cursor to the third",
      first.sessions.length === 2 &&
        first.has_more &&
        second?.sessions.length === 1 &&
        second.sessions[0]?.id === m1 &&
        !second.has_more,
      JSON.stringify({ first, second })
    );
    raw.close();
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
};

const spec: Spec = {
  group: "The hub and machines",
  name: "list-sessions-stopped",
  ownProcess:
    "its in-process hub (hub-in-process.ts) reads CAWCO_DB_PATH and HOME once, as the hub's modules load: after a spec before it in a run had loaded them, it would open that spec's database",
  run,
};

export default spec;
