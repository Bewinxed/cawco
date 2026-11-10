/**
 * A session whose turn its account's limit cut carries on by itself once it
 * stands on an account with room, whatever its process was doing when it
 * moved; a session at rest is moved and starts nothing; and one held at its
 * limit moves once, however many looks reach it.
 *
 * 2026-11-05, obelisk, 12:40: accounts ran out and the hub moved the
 * sessions on them. A move whose session was at rest or `starting` went
 * through `relaunchOnAccount`, which returned before its carry-on ("isn't
 * relaunched: its process wasn't working (it is starting). Whatever wakes
 * it next starts it there."): the hold was dropped and nothing woke the
 * session until the person wrote. The same minute, one held session was
 * moved twice, 3 s apart, its 1,000k tokens re-read cold both times: two
 * looks at the holds ran side by side (the recheck at its account's reset
 * and a rebalance's pass), each over the holds it listed as it began, and
 * the later one moved the session off the account it had already left.
 *
 * - (a) On a scratch fleet (real hub, agent and sessiond; Claude Code
 *   against the mock model) with accounts R (the fleet's own, first in
 *   placement) and W, moving at the limit switched off so a cut session is
 *   held: a session's turn is refused on R (429 at its usage limit); it is
 *   held, then put to sleep; a person moves it to W. With no message from
 *   anyone, its carry-on reaches the model on W, its refused prompt in the
 *   conversation. (Fails on main: the carry-on is dropped.)
 * - (b) The same fleet: a session whose last turn ended as any turn does,
 *   asleep, moved to W: it makes no request on W and stays asleep, read once
 *   (a)'s carry-on has gone.
 * - (c) In process, the at-limit controller (at-limit.ts `createAtLimit`)
 *   over a scratch database: two sessions held on R, at its limit, with W
 *   and V free; two looks at the holds at once. Each session moves once.
 *   (Fails on main: one moves twice.)
 * - (d) The same controller: a session held on R past R's reset, two looks
 *   at once. It is told to carry on once.
 *
 * (a) and (b) run first: the in-process hub of (c) and (d) points this
 * process's HOME at its scratch.
 *
 *   bun scripts/probe-kit/run.ts limit-carry-on
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLAUDE_JSON_NAME } from "../../../packages/core/src/claude-dirs";
import { DAY_MS, HOUR_MS } from "../../../packages/core/src/time";
import type { LimitRow } from "../../../packages/hub/src/at-limit";
import {
  ACCOUNT,
  MACHINE,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import { answerText, hubAt } from "../hub";
import type { Kit, KitFleet, Spec } from "../spec";

/** The account the cut session moves to, beside the fleet's own (R). */
const W = "acct-carry-on-w";
const R_TOKEN = "sk-ant-oat01-fake-scratch-fleet";
const W_TOKEN = "sk-ant-oat01-fake-carry-on-w";
/** What the cut session's refused prompt says, so the mock knows its requests. */
const CUT = "PROBE-CARRY-CUT";
/** What the resting session's one turn says. */
const REST = "PROBE-CARRY-REST";
/** The hub's carry-on at a limit (server.ts `CARRY_ON.limit`), in part. */
const CARRY = "The usage limit that stopped your last turn no longer applies";

/** (c)'s session the first look moves, slowly. */
const FIRST = "Held first";

/** Whether R refuses every request at its limit now. */
const mock: { cut: boolean } = { cut: false };

const limitsNow = (): Reply["limits"] => ({
  fiveHour: { resetsAt: Date.now() + 3 * HOUR_MS, utilization: 0.1 },
  sevenDay: { resetsAt: Date.now() + 5 * DAY_MS, utilization: 0.1 },
});

/** The mock as Anthropic answers each account: R at its limit once cut. */
const respond = (request: Seen): Reply => {
  if (mock.cut && request.auth.includes(R_TOKEN)) {
    return {
      everyMs: 5,
      words: [],
      refuse: { resetsAt: Date.now() + 3 * HOUR_MS },
    };
  }
  return { everyMs: 5, words: ["ok"], limits: limitsNow() };
};

/** A store of `id` in the fleet's HOME: a fake login, `token` its credential. */
const furnish = async (
  home: string,
  id: string,
  token: string
): Promise<void> => {
  const dir = join(home, ".cawco", "accounts", id, "claude");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, ".credentials.json"),
    JSON.stringify({
      claudeAiOauth: {
        accessToken: token,
        refreshToken: "sk-ant-ort01-fake-carry-on-w",
        expiresAt: Date.now() + 365 * DAY_MS,
        scopes: ["user:inference", "user:profile"],
        subscriptionType: "max",
      },
    })
  );
  await writeFile(
    join(dir, CLAUDE_JSON_NAME),
    JSON.stringify({
      hasCompletedOnboarding: true,
      oauthAccount: {
        emailAddress: "w@scratch-fleet.test",
        organizationName: "W Organization",
        accountUuid: "00000000-0000-4000-8000-0000000000w1",
        organizationUuid: "00000000-0000-4000-8000-0000000000w2",
      },
    })
  );
};

/** A reading of `id` (one session window, 10% used), so a move may weigh it. */
const fileReading = (fleet: KitFleet, id: string): void => {
  fleet.write(
    "INSERT OR REPLACE INTO account_readings (account_id, subscription, window_kinds, last_seen_at) VALUES (?, 'Claude Max', '[\"session\"]', ?)",
    id,
    Date.now()
  );
  fleet.write(
    "INSERT OR REPLACE INTO account_windows (account_id, kind, scope_label, \"group\", is_active, percent, severity, resets_at) VALUES (?, 'session', '', 'session', 1, 10, 'normal', ?)",
    id,
    new Date(Date.now() + 3 * HOUR_MS).toISOString()
  );
};

const accountOfRow = (fleet: KitFleet, id: string) =>
  fleet.query<{ account_id: string | null }>(
    "SELECT account_id FROM instances WHERE id = ?",
    id
  )[0]?.account_id;

const holdOf = (fleet: KitFleet, id: string) =>
  fleet.query<{ account_id: string }>(
    "SELECT account_id FROM limit_holds WHERE instance_id = ?",
    id
  )[0];

/** The requests that reached the mock on `token` since `since`, a session's turns (not a side call). */
const turnsOn = (fleet: KitFleet, token: string, since: number) =>
  fleet.seen.filter(
    (one) => one.tools && one.auth.includes(token) && one.at >= since
  );

/** The person's sends to `id`. */
const personSends = (fleet: KitFleet, id: string) =>
  fleet
    .query<{ body: string }>(
      "SELECT body FROM sent_messages WHERE instance_id = ?",
      id
    )
    .filter((one) => one.body.includes('"kind":"human"')).length;

/** Puts `id` to sleep and waits until it is. */
const sleepOf = async (fleet: KitFleet, id: string): Promise<string> => {
  await fleet.control(id, "sleep");
  return (
    (await until(
      "the session asleep",
      () => fleet.instance(id)?.status,
      (status) => status === "sleeping",
      60_000
    ).catch(() => fleet.instance(id)?.status)) ?? "gone"
  );
};

const moveTo = (fleet: KitFleet, id: string, accountId: string) =>
  hubAt(fleet.base).api.instances({ id }).account.post({ accountId });

/** (a) and (b): the person's move of a cut session at rest, and of a resting one. */
const onTheFleet = async (kit: Kit): Promise<void> => {
  const fleet = await kit.fleet(respond);
  const home = fleet.env.HOME as string;
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.write(
    "INSERT OR IGNORE INTO accounts (id, provider, kind, label, hue, \"order\", never_backup, created_at) VALUES (?, 'anthropic', 'console', ?, 'green', 1, 0, ?)",
    W,
    W,
    Date.now()
  );
  // Moving at the limit off: a cut session is held where it is, until a
  // person moves it.
  const routed = await hubAt(fleet.base)
    .api.accounts.routing({ provider: "anthropic" })
    .put({
      yours: { strategy: "fill-first" },
      delegates: { strategy: "fill-first" },
      atLimit: { move: false, waitMinutes: 15, moveWholeUnderK: 200 },
    });
  kit.check(
    "setup: routing fills R first and holds a session at its limit",
    routed.error === null,
    `${routed.status} ${answerText(routed)}`
  );
  await furnish(home, W, W_TOKEN);
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  await until(
    "W signed in",
    () =>
      fleet.query<{ state: string }>(
        "SELECT state FROM account_signins WHERE account_id = ? AND machine_id = ?",
        W,
        MACHINE
      )[0]?.state,
    (state) => state === "signed-in",
    120_000
  );
  for (const id of [ACCOUNT, W]) {
    fileReading(fleet, id);
  }

  // (b)'s session: one turn on R, ended as any turn ends, then asleep.
  const resting = await fleet.spawn("claude", "Resting on R");
  const restSent = Date.now();
  await fleet.send(resting, `${REST}: say ok.`);
  const restAnswered = await until(
    "the resting session's turn answered on R",
    () =>
      turnsOn(fleet, R_TOKEN, restSent).filter((one) => one.all.includes(REST))
        .length,
    (n) => n > 0,
    120_000
  ).catch(() => 0);
  const restTurnEnded = await until(
    "the resting session's turn over",
    () => fleet.instance(resting)?.turn_open_at,
    (open) => open === null,
    120_000
  ).catch(() => "open");
  const restAsleep = await sleepOf(fleet, resting);
  kit.check(
    "setup (b): a session on R answers one turn there, ends it and sleeps",
    accountOfRow(fleet, resting) === ACCOUNT &&
      restAnswered > 0 &&
      restTurnEnded === null &&
      restAsleep === "sleeping",
    JSON.stringify({
      account: accountOfRow(fleet, resting),
      restAnswered,
      restTurnEnded,
      restAsleep,
    })
  );

  // (a)'s session: its turn refused at R's limit, held, then asleep.
  const cut = await fleet.spawn("claude", "Cut at its limit");
  mock.cut = true;
  const cutSent = Date.now();
  await fleet.send(cut, `${CUT}: say ok.`);
  const held = await until(
    "the cut session held on R",
    () => holdOf(fleet, cut),
    (hold) => hold?.account_id === ACCOUNT,
    120_000
  ).catch(() => holdOf(fleet, cut));
  const refusedOnR = turnsOn(fleet, R_TOKEN, cutSent).filter((one) =>
    one.all.includes(CUT)
  ).length;
  const cutAsleep = await sleepOf(fleet, cut);
  kit.check(
    "setup (a): a session's turn is refused at R's limit; it is held on R, and asleep",
    refusedOnR > 0 &&
      held?.account_id === ACCOUNT &&
      cutAsleep === "sleeping" &&
      holdOf(fleet, cut)?.account_id === ACCOUNT,
    JSON.stringify({ refusedOnR, held, cutAsleep, now: holdOf(fleet, cut) })
  );

  // (b): the resting session moved to W.
  const restMovedAt = Date.now();
  const restMove = await moveTo(fleet, resting, W);
  const restMoveSaid = answerText(restMove);

  // (a): the person moves the cut session to W, and writes nothing.
  const movedAt = Date.now();
  const cutMove = await moveTo(fleet, cut, W);
  const cutMoveSaid = answerText(cutMove);
  const carried = await until(
    "the cut session's carry-on reaches the model on W",
    () =>
      turnsOn(fleet, W_TOKEN, movedAt).filter(
        (one) => one.last.includes(CARRY) && one.all.includes(CUT)
      ).length,
    (n) => n > 0,
    120_000
  ).catch(() => 0);
  kit.check(
    "(a) a turn cut at R's limit, the session asleep and moved to W, carries on there by itself: its carry-on reaches the model on W with its refused prompt, and the person wrote once",
    cutMove.error === null &&
      accountOfRow(fleet, cut) === W &&
      holdOf(fleet, cut) === undefined &&
      carried > 0 &&
      personSends(fleet, cut) === 1,
    JSON.stringify({
      move: `${cutMove.status} ${cutMoveSaid}`,
      account: accountOfRow(fleet, cut),
      hold: holdOf(fleet, cut),
      carried,
      personSends: personSends(fleet, cut),
      status: fleet.instance(cut)?.status,
    })
  );
  // Read once (a)'s carry-on has gone: the moves were asked a moment apart.
  const restTurns = turnsOn(fleet, W_TOKEN, restMovedAt).filter((one) =>
    one.all.includes(REST)
  ).length;
  kit.check(
    "(b) a session at rest whose last turn ended as any turn does, moved to W, starts no turn there and stays asleep",
    restMove.error === null &&
      accountOfRow(fleet, resting) === W &&
      restTurns === 0 &&
      fleet.instance(resting)?.status === "sleeping",
    JSON.stringify({
      move: `${restMove.status} ${restMoveSaid}`,
      account: accountOfRow(fleet, resting),
      restTurns,
      status: fleet.instance(resting)?.status,
    })
  );
};

/** (c) and (d): the at-limit controller in process, two looks at the holds at once. */
const inProcess = async (kit: Kit): Promise<void> => {
  const scratch = await mkdtemp(
    join(process.env.TMPDIR ?? tmpdir(), "limit-carry-on-")
  );
  try {
    const { hubInProcess } =
      await import("../../../packages/hub/scripts/hub-in-process");
    const { db, lifetime } = await hubInProcess(
      join(scratch, "hub", "hub.db"),
      join(scratch, "home")
    );
    const { accountsRead, createAtLimit } =
      await import("../../../packages/hub/src/at-limit");
    const { createAdmission } =
      await import("../../../packages/hub/src/admission");
    const machineId = "machine-carry-on";
    const account = (email: string, org: string, percent: number) => {
      const made = db.accounts.create({
        provider: "anthropic",
        kind: "subscription",
        identity: { email, organization: org, orgId: org },
      });
      db.accounts.putReading(made.id, {
        windows: [
          {
            kind: "session",
            scopeLabel: null,
            group: "session",
            isActive: true,
            percent,
            severity: percent >= 100 ? "critical" : "normal",
            resetsAt: new Date(Date.now() + 3 * HOUR_MS).toISOString(),
          },
        ],
        windowKinds: ["session"],
        subscription: "Claude Max",
      });
      db.accounts.putSignin({
        accountId: made.id,
        machineId,
        state: "signed-in",
      });
      return made;
    };
    const r = account("r@example.com", "R's Organization", 100);
    // Two accounts with room: a move's charge fills one for the next
    // decision in the same look (admission.ts), so each held session has
    // one to go to.
    const free = [
      account("w@example.com", "W's Organization", 10).id,
      account("v@example.com", "V's Organization", 10).id,
    ];
    const routing = db.accounts.routing("anthropic");
    db.accounts.setRouting({
      ...routing,
      atLimit: { ...routing.atLimit, move: true, waitMinutes: 15 },
    });
    const session = (title: string): string => {
      const id = crypto.randomUUID();
      db.openInstance({
        id,
        machineId,
        cwd: scratch as never,
        sessionId: crypto.randomUUID(),
        harness: "claude",
        origin: "person",
        title,
        kind: "mainline",
        permissionMode: "bypassPermissions",
        model: "claude-opus-5-5",
      });
      db.patchInstance(id, { accountId: r.id });
      // A small context: a move re-reads little, so W takes both.
      db.updateKeepAlive(id, {
        contextTokens: 20_000,
        contextReadAt: new Date(),
      });
      return id;
    };

    const moves: { id: string; from: string | null; to: string }[] = [];
    const resumes: string[] = [];
    const admission = createAdmission(db);
    const controller = createAtLimit({
      db,
      lifetime,
      admission,
      accountOf: (row) => row.accountId ?? undefined,
      accountRows: (row, leaving) =>
        accountsRead(db, admission, row, leaving, {
          asks: { kind: "delegates" },
          machineName: machineId,
          owed: new Map(),
          provenSince: Date.now() - HOUR_MS,
          window: 1_000_000,
        }),
      cacheExpiresAt: () => null,
      carryHandMove: async () => undefined,
      changed: () => undefined,
      compactable: () => true,
      dropCompaction: () => undefined,
      handMove: () => undefined,
      idle: async () => {
        await Bun.sleep(50);
        return true;
      },
      machineName: (id) => id,
      // A carry takes a moment, as a machine's does, the first session's
      // longest: the second look skips it while the first look carries it,
      // moves the next one, and is done with it before the first look
      // reaches it on its own list.
      move: async (row: LimitRow, accountId: string) => {
        moves.push({ id: row.id, from: row.accountId, to: accountId });
        await Bun.sleep(row.title === FIRST ? 800 : 100);
        db.patchInstance(row.id, { accountId });
        return {};
      },
      moving: () => false,
      named: (row) => row.title ?? row.id,
      note: () => undefined,
      noticed: () => undefined,
      owe: () => undefined,
      owed: () => new Map(),
      refusedMove: () => undefined,
      resume: (row) => {
        resumes.push(row.id);
      },
      stale: () => undefined,
      startedBy: () => ({ origin: { kind: "human" } }),
      unnote: () => undefined,
      unstale: () => undefined,
      waitedOn: () => true,
    });

    // (c): two sessions held on R at its limit; W has room.
    const first = session(FIRST);
    const second = session("Held second");
    const until3h = Date.now() + 3 * HOUR_MS;
    for (const id of [first, second]) {
      db.atLimit.putHold({ instanceId: id, accountId: r.id, until: until3h });
    }
    await Promise.all([controller.look(), controller.look()]);
    const movesOf = (id: string) => moves.filter((one) => one.id === id);
    kit.check(
      "(c) two looks at the holds at once move each held session once, off R to an account with room",
      [first, second].every(
        (id) =>
          movesOf(id).length === 1 &&
          movesOf(id)[0]?.from === r.id &&
          free.includes(movesOf(id)[0]?.to ?? "")
      ),
      JSON.stringify(moves)
    );

    // (d): a session held on R past R's reset: R has room again.
    db.accounts.putReading(r.id, {
      windows: [
        {
          kind: "session",
          scopeLabel: null,
          group: "session",
          isActive: true,
          percent: 0,
          severity: "normal",
          resetsAt: new Date(Date.now() + 5 * HOUR_MS).toISOString(),
        },
      ],
      windowKinds: ["session"],
      subscription: "Claude Max",
    });
    const reset = session("Held past its reset");
    db.atLimit.putHold({
      instanceId: reset,
      accountId: r.id,
      until: Date.now() - 1000,
    });
    moves.length = 0;
    await Promise.all([controller.look(), controller.look()]);
    kit.check(
      "(d) two looks at once at a session held past its own account's reset tell it to carry on once, where it is",
      resumes.filter((id) => id === reset).length === 1 &&
        movesOf(reset).length === 0 &&
        db.atLimit.hold(reset) === undefined,
      JSON.stringify({ resumes, moves, hold: db.atLimit.hold(reset) })
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
};

const spec: Spec = {
  group: "The hub and machines",
  name: "limit-carry-on",
  ownProcess:
    "its in-process hub (hub-in-process.ts) reads CAWCO_DB_PATH and HOME once, as the hub's modules load: after a spec before it in a run had loaded them, it would open that spec's database",
  run: async (kit: Kit) => {
    await onTheFleet(kit);
    await inProcess(kit);
  },
};

export default spec;
