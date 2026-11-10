/**
 * Removing an account never asks the person to stop sessions: every session
 * on it moves to an account that can take it, and the removal goes
 * through (owner, 2026-11-04: Remove account on a cancelled Max plan was
 * refused, telling him to stop its 220 sessions first).
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model) with three Claude accounts, A, B and C, each with its own
 * fake login and token, so the mock says which account a request ran on.
 * New sessions fill A first, then B, then C. On A: one session asleep (at rest), one stopped
 * three days ago (archived: no listing names it any more), and one in a
 * turn the mock holds open. Then:
 * - (a) the confirm's read says 3 sessions move and none stays, and Remove
 *   account's question says so under the machines, at 1440 and at 390
 *   (where Remove is the header's More menu's), its words inside the card;
 * - (b) `DELETE /api/accounts/A` answers 200 and A is gone; each of the
 *   three owes a move to B; the one asleep was not woken for it;
 * - (c) the turn is not cut off: while it runs, A's store on the machine
 *   stays, and its sign-out waits (`account_leaves`); released, the turn
 *   ends with its answer and no error, on A's token;
 * - (d) at that turn's end it moves to B, and A's store goes from the
 *   machine; its next turn runs on B's token;
 * - (e) the one asleep, sent a message, wakes on B and answers there;
 * - (g) one machine's sign-out (`DELETE /api/accounts/B/machines/<it>`),
 *   with a third account C signed in there: 200 with one session asleep
 *   and one in a held turn on B; B stays an account, its sign-in there
 *   goes at once and no report brings it back, its store waits
 *   (`account_leaves`); released, the turn ends on B's token, then the
 *   session moves to C and B's store goes; the one asleep wakes on C;
 * - (f) B, then C, the last Claude account, are removed too: 200, C's
 *   sessions have none to go to, the one at rest says it stopped
 *   (`stalled.removed`), and a message to it is refused with the way back
 *   (`no-account`).
 *
 *   bun scripts/probe-kit/run.ts account-removal
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import { CLAUDE_JSON_NAME } from "../../../packages/core/src/claude-dirs";
import { DAY_MS } from "../../../packages/core/src/time";
import { accountsWords } from "../../../packages/core/src/words/accounts";
import { configureWords } from "../../../packages/core/src/words/configure";
import { noAccountRefusal } from "../../../packages/hub/src/placement";
import {
  ACCOUNT,
  MACHINE,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import { answerText, hubAt } from "../hub";
import type { Kit, KitFleet, Spec } from "../spec";

const A = ACCOUNT;
const B = "acct-removal-b";
const C = "acct-removal-c";
const A_TOKEN = "sk-ant-oat01-fake-scratch-fleet";
const B_TOKEN = "sk-ant-oat01-fake-removal-b";
const C_TOKEN = "sk-ant-oat01-fake-removal-c";
/** The words that open a turn the mock holds: the removal's, then the one machine's sign-out's. */
const HOLD = "PROBE-REMOVAL-HOLD";
const HOLD_MACHINE = "PROBE-SIGNOUT-HOLD";

/** Each held turn's answer waits on its own promise; {@link release} lets it go. */
let held = new Map<string, PromiseWithResolvers<void>>();
const release = (words: string) => held.get(words)?.resolve();

const respond = async (request: Seen): Promise<Reply> => {
  for (const [words, hold] of held) {
    if (request.tools && request.last.includes(words)) {
      await hold.promise;
      return { everyMs: 5, words: ["held turn answered"] };
    }
  }
  return { everyMs: 5, words: ["ok"] };
};

/** An account's store on the fleet's machine: a fake login of its own, its own token and organization. */
const furnish = async (home: string, id: string, token: string, n: string) => {
  const dir = join(home, ".cawco", "accounts", id, "claude");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, ".credentials.json"),
    JSON.stringify({
      claudeAiOauth: {
        accessToken: token,
        refreshToken: `sk-ant-ort01-fake-removal-${n}`,
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
        emailAddress: `${n}@scratch-fleet.test`,
        organizationName: `Organization ${n}`,
        accountUuid: `00000000-0000-4000-8000-0000000000${n}1`,
        organizationUuid: `00000000-0000-4000-8000-0000000000${n}2`,
      },
    })
  );
};

const signinOf = (fleet: KitFleet, id: string) =>
  fleet.query<{ state: string }>(
    "SELECT state FROM account_signins WHERE account_id = ?",
    id
  )[0]?.state;

const accountOf = (fleet: KitFleet, id: string) =>
  fleet.query<{ account_id: string | null }>(
    "SELECT account_id FROM instances WHERE id = ?",
    id
  )[0]?.account_id;

const owedTo = (fleet: KitFleet, id: string) =>
  fleet.query<{ to_account_id: string | null; waits: string }>(
    "SELECT to_account_id, waits FROM owed_moves WHERE instance_id = ?",
    id
  )[0];

/** The requests of `id`'s turns that started with `words`, newest last. */
const turnsWith = (fleet: KitFleet, words: string) =>
  fleet.seen.filter((one) => one.tools && one.last.includes(words));

/** Waits for `id`'s turn to be over: no turn open, its row running. */
const turnOver = (fleet: KitFleet, id: string) =>
  until(
    `${id.slice(0, 8)}'s turn over`,
    () => fleet.instance(id),
    (row) => row?.turn_open_at === null && row.status === "running",
    120_000
  );

/** Asks `id` to sleep (again every 15 s: a machine refuses one not at rest) until its row reads sleeping. */
const asleep = async (fleet: KitFleet, id: string) => {
  let askedAt = 0;
  return await until(
    `${id.slice(0, 8)} asleep`,
    async () => {
      const status = fleet.instance(id)?.status;
      if (status !== "sleeping" && Date.now() - askedAt > 15_000) {
        askedAt = Date.now();
        await fleet.control(id, "sleep");
      }
      return status;
    },
    (status) => status === "sleeping",
    90_000
  );
};

const removeAccount = async (fleet: KitFleet, id: string, machine = "") => {
  const response = await (machine
    ? hubAt(fleet.base)
        .api.accounts({ id })
        .machines({ machineId: machine })
        .delete()
    : hubAt(fleet.base).api.accounts({ id }).delete());
  const text = answerText(response);
  return { status: response.status, text };
};

const spec: Spec = {
  group: "The hub and machines",
  name: "account-removal",
  run: async (kit: Kit) => {
    held = new Map([
      [HOLD, Promise.withResolvers<void>()],
      [HOLD_MACHINE, Promise.withResolvers<void>()],
    ]);
    const fleet = await kit.fleet(respond);
    const home = fleet.env.HOME as string;
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.write(
      "INSERT OR IGNORE INTO accounts (id, provider, kind, label, hue, \"order\", never_backup, created_at) VALUES (?, 'anthropic', 'console', 'Second', 'green', 1, 0, ?), (?, 'anthropic', 'console', 'Third', 'violet', 2, 0, ?)",
      B,
      Date.now(),
      C,
      Date.now()
    );
    // New sessions fill A first: B is where they move.
    const routed = await hubAt(fleet.base)
      .api.accounts.routing({ provider: "anthropic" })
      .put({
        yours: { strategy: "fill-first" },
        delegates: { strategy: "fill-first" },
        atLimit: { move: true, waitMinutes: 15, moveWholeUnderK: 200 },
      });
    kit.check(
      "setup: routing fills A first",
      routed.error === null,
      `${routed.status} ${answerText(routed)}`
    );
    await furnish(home, B, B_TOKEN, "b");
    await furnish(home, C, C_TOKEN, "c");
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    for (const id of [B, C]) {
      await until(
        `${id} signed in`,
        () => signinOf(fleet, id),
        (state) => state === "signed-in",
        120_000
      );
    }

    // On A: one asleep, one stopped three days ago, one in a held turn.
    const resting = await fleet.spawn("claude", "Resting");
    const archived = await fleet.spawn("claude", "Archived");
    const running = await fleet.spawn("claude", "Running");
    for (const id of [resting, archived, running]) {
      await fleet.send(id, `hello from ${id.slice(0, 8)}`);
      await turnOver(fleet, id);
    }
    kit.check(
      "setup: the three sessions run on A",
      [resting, archived, running].every((id) => accountOf(fleet, id) === A),
      JSON.stringify(
        [resting, archived, running].map((id) => accountOf(fleet, id))
      )
    );
    await asleep(fleet, resting);
    await fleet.stopSession(archived);
    await until(
      "archived stopped",
      () => fleet.instance(archived)?.status,
      (status) => status === "stopped",
      60_000
    );
    fleet.write(
      "UPDATE instances SET updated_at = ?, seen_at = ? WHERE id = ?",
      Date.now() - 3 * DAY_MS,
      Date.now() - 3 * DAY_MS,
      archived
    );
    const restingSpawned = fleet.instance(resting)?.spawned_at;
    await fleet.send(running, `${HOLD} work on`);
    await until(
      "the held turn reaches the mock",
      () => turnsWith(fleet, HOLD).length,
      (n) => n > 0,
      60_000
    );

    // (a) The confirm's read.
    const removal = await fleet.api((hub) =>
      hub.api.accounts({ id: A }).removal.get()
    );
    kit.check(
      "(a) the confirm reads 3 sessions moving to another account, none staying",
      removal.moving === 3 && removal.staying === 0,
      JSON.stringify(removal)
    );

    const said = accountsWords.editor.removeSessions(3, 0);
    for (const view of ["desk", "phone"] as const) {
      const page = await kit.page(view);
      await page.goto(`${await fleet.dashboard()}/config/accounts/${A}`);
      if (view === "desk") {
        await page.locator("[data-delete]").first().click();
      } else {
        await page
          .locator('header[data-slot="head"]')
          .getByRole("button", { name: configureWords.more, exact: true })
          .click();
        await page
          .getByRole("menuitem", { name: accountsWords.editor.remove })
          .click();
      }
      const body = page.locator('[data-ask="editor"] [data-slot="body"]');
      await body
        .nth(1)
        .waitFor({ timeout: 30_000 })
        .catch(() => undefined);
      const paragraphs = await body.allTextContents();
      const fits = await page
        .locator('[data-ask="editor"] [data-slot="tile"]')
        .evaluate(
          (tile) =>
            tile.scrollWidth <= tile.clientWidth &&
            tile.getBoundingClientRect().right <= window.innerWidth
        )
        .catch(() => false);
      kit.check(
        `(a) at ${view}, Remove account's question says the machines, then that 3 sessions move to another account, inside its card`,
        paragraphs.length === 2 && paragraphs[1]?.trim() === said && fits,
        JSON.stringify({ paragraphs, fits })
      );
      await page.locator("[data-ask-cancel]").click();
      await page.close();
    }

    // (b) The removal goes through.
    const removed = await removeAccount(fleet, A);
    kit.check(
      "(b) removing A with a session asleep, one archived and one in a turn answers 200, no stop asked",
      removed.status === 200,
      `${removed.status} ${removed.text}`
    );
    kit.check(
      "(b) A is gone from the accounts",
      fleet.query("SELECT id FROM accounts WHERE id = ?", A).length === 0
    );
    const owed = [resting, archived, running].map((id) => owedTo(fleet, id));
    kit.check(
      "(b) each of the three owes a move to B",
      owed.every((one) => one?.to_account_id === B),
      JSON.stringify(owed)
    );
    kit.check(
      "(b) the one asleep is not woken to move",
      fleet.instance(resting)?.status === "sleeping" &&
        fleet.instance(resting)?.spawned_at === restingSpawned,
      JSON.stringify(fleet.instance(resting))
    );

    // (c) The running turn is not cut off.
    const aStore = join(home, ".cawco", "accounts", A);
    kit.check(
      "(c) while the turn runs, A's store stays on the machine and its sign-out waits",
      existsSync(aStore) &&
        fleet.query(
          "SELECT account_id FROM account_leaves WHERE account_id = ?",
          A
        ).length === 1 &&
        accountOf(fleet, running) === A,
      JSON.stringify({
        store: existsSync(aStore),
        leaves: fleet.query("SELECT * FROM account_leaves"),
        account: accountOf(fleet, running),
      })
    );
    release(HOLD);
    await turnOver(fleet, running).catch(() => undefined);
    const [heldTurn] = turnsWith(fleet, HOLD);
    kit.check(
      "(c) released, the held turn ends with its answer and no error, on A's token",
      fleet.instance(running)?.last_error === null &&
        heldTurn?.auth.includes(A_TOKEN) === true,
      JSON.stringify({ row: fleet.instance(running), auth: heldTurn?.auth })
    );

    // (d) At its end it moves to B, and A's store goes.
    await until(
      "the running session moved to B",
      () => accountOf(fleet, running),
      (account) => account === B,
      120_000
    ).catch(() => undefined);
    await until(
      "A signed out on the machine",
      () =>
        existsSync(aStore) ||
        fleet.query("SELECT * FROM account_leaves").length > 0,
      (still) => !still,
      120_000
    ).catch(() => undefined);
    kit.check(
      "(d) at the turn's end the session runs on B, and A's store is gone from the machine",
      accountOf(fleet, running) === B &&
        !existsSync(aStore) &&
        fleet.query("SELECT * FROM account_leaves").length === 0,
      JSON.stringify({
        account: accountOf(fleet, running),
        store: existsSync(aStore),
        leaves: fleet.query("SELECT * FROM account_leaves"),
      })
    );
    await until(
      "the moved session up",
      () => fleet.instance(running),
      (row) => row?.status === "running" && row.turn_open_at === null,
      120_000
    ).catch(() => undefined);
    await fleet.send(running, "PROBE-REMOVAL-AFTER next");
    await until(
      "its next turn at the mock",
      () => turnsWith(fleet, "PROBE-REMOVAL-AFTER").length,
      (n) => n > 0,
      120_000
    ).catch(() => undefined);
    const [after] = turnsWith(fleet, "PROBE-REMOVAL-AFTER");
    kit.check(
      "(d) its next turn runs on B's token",
      after?.auth.includes(B_TOKEN) === true,
      JSON.stringify({ auth: after?.auth })
    );

    // (e) The one asleep wakes on B.
    await fleet.send(resting, "PROBE-REMOVAL-WAKE now");
    await until(
      "the rested session's turn at the mock",
      () => turnsWith(fleet, "PROBE-REMOVAL-WAKE").length,
      (n) => n > 0,
      180_000
    ).catch(() => undefined);
    const [woke] = turnsWith(fleet, "PROBE-REMOVAL-WAKE");
    await turnOver(fleet, resting).catch(() => undefined);
    kit.check(
      "(e) the session that was asleep wakes on B and answers there",
      woke?.auth.includes(B_TOKEN) === true &&
        accountOf(fleet, resting) === B &&
        fleet.instance(resting)?.last_error === null,
      JSON.stringify({
        auth: woke?.auth,
        account: accountOf(fleet, resting),
        row: fleet.instance(resting),
      })
    );

    // (g) One machine's sign-out: B on the fleet's machine, C signed in there.
    await asleep(fleet, resting);
    await fleet.send(running, `${HOLD_MACHINE} work on`);
    await until(
      "the second held turn reaches the mock",
      () => turnsWith(fleet, HOLD_MACHINE).length,
      (n) => n > 0,
      60_000
    );
    const bStore = join(home, ".cawco", "accounts", B);
    const signedOut = await removeAccount(fleet, B, MACHINE);
    kit.check(
      "(g) signing B out on the machine with a session asleep and one in a turn answers 200: both move",
      signedOut.status === 200 &&
        JSON.parse(signedOut.text).moving === 2 &&
        JSON.parse(signedOut.text).staying === 0,
      `${signedOut.status} ${signedOut.text}`
    );
    const owedC = [resting, running].map((id) => owedTo(fleet, id));
    kit.check(
      "(g) B stays an account; its sign-in there goes at once, its store waits on the turn, and both sessions owe a move to C",
      fleet.query("SELECT id FROM accounts WHERE id = ?", B).length === 1 &&
        signinOf(fleet, B) === undefined &&
        existsSync(bStore) &&
        fleet.query(
          "SELECT account_id FROM account_leaves WHERE account_id = ?",
          B
        ).length === 1 &&
        accountOf(fleet, running) === B &&
        owedC.every((one) => one?.to_account_id === C),
      JSON.stringify({
        signin: signinOf(fleet, B),
        store: existsSync(bStore),
        leaves: fleet.query("SELECT * FROM account_leaves"),
        owed: owedC,
      })
    );
    release(HOLD_MACHINE);
    await turnOver(fleet, running).catch(() => undefined);
    const [machineTurn] = turnsWith(fleet, HOLD_MACHINE);
    kit.check(
      "(g) released, the held turn ends with its answer and no error, on B's token",
      fleet.instance(running)?.last_error === null &&
        machineTurn?.auth.includes(B_TOKEN) === true,
      JSON.stringify({ row: fleet.instance(running), auth: machineTurn?.auth })
    );
    await until(
      "the running session moved to C",
      () => accountOf(fleet, running),
      (account) => account === C,
      120_000
    ).catch(() => undefined);
    await until(
      "B signed out on the machine",
      () =>
        existsSync(bStore) ||
        fleet.query("SELECT * FROM account_leaves").length > 0,
      (still) => !still,
      120_000
    ).catch(() => undefined);
    kit.check(
      "(g) at the turn's end the session runs on C, B's store is gone from the machine, and no report brought its sign-in back",
      accountOf(fleet, running) === C &&
        !existsSync(bStore) &&
        fleet.query("SELECT * FROM account_leaves").length === 0 &&
        signinOf(fleet, B) === undefined,
      JSON.stringify({
        account: accountOf(fleet, running),
        store: existsSync(bStore),
        leaves: fleet.query("SELECT * FROM account_leaves"),
        signin: signinOf(fleet, B),
      })
    );
    await until(
      "the moved session up on C",
      () => fleet.instance(running),
      (row) => row?.status === "running" && row.turn_open_at === null,
      120_000
    ).catch(() => undefined);
    await fleet.send(running, "PROBE-SIGNOUT-AFTER next");
    await until(
      "its next turn on C at the mock",
      () => turnsWith(fleet, "PROBE-SIGNOUT-AFTER").length,
      (n) => n > 0,
      120_000
    ).catch(() => undefined);
    await turnOver(fleet, running).catch(() => undefined);
    const [afterC] = turnsWith(fleet, "PROBE-SIGNOUT-AFTER");
    kit.check(
      "(g) its next turn runs on C's token",
      afterC?.auth.includes(C_TOKEN) === true,
      JSON.stringify({ auth: afterC?.auth })
    );
    await fleet.send(resting, "PROBE-SIGNOUT-WAKE now");
    await until(
      "the rested session's turn on C at the mock",
      () => turnsWith(fleet, "PROBE-SIGNOUT-WAKE").length,
      (n) => n > 0,
      180_000
    ).catch(() => undefined);
    const [wokeOnC] = turnsWith(fleet, "PROBE-SIGNOUT-WAKE");
    await turnOver(fleet, resting).catch(() => undefined);
    kit.check(
      "(g) the session that was asleep wakes on C and answers there",
      wokeOnC?.auth.includes(C_TOKEN) === true &&
        accountOf(fleet, resting) === C,
      JSON.stringify({
        auth: wokeOnC?.auth,
        account: accountOf(fleet, resting),
      })
    );

    // (f) B goes, then C, the last Claude account.
    await asleep(fleet, resting);
    await asleep(fleet, running);
    const bGone = await removeAccount(fleet, B);
    const lastRead = await fleet.api((hub) =>
      hub.api.accounts({ id: C }).removal.get()
    );
    const last = await removeAccount(fleet, C);
    kit.check(
      "(f) B is removed, then C, the last Claude account: 200, and its sessions have none to go to",
      bGone.status === 200 &&
        last.status === 200 &&
        lastRead.moving === 0 &&
        lastRead.staying === 2 &&
        fleet.query("SELECT id FROM accounts").length === 0,
      JSON.stringify({ bGone, last, lastRead })
    );
    const boardRow = await until(
      "the stranded session's line on the board",
      async () =>
        (await fleet.api((hub) => hub.api.instances.get())).find(
          (one) => one.id === resting
        ),
      (one) => one?.stalled !== undefined,
      30_000
    ).catch(() => undefined);
    kit.check(
      "(f) the session at rest that no account can take says it stopped, and why",
      boardRow?.stalled?.words === accountsWords.stalled.removed("Third"),
      JSON.stringify(boardRow?.stalled)
    );
    const refused = await fleet.send(resting, "PROBE-REMOVAL-NONE hello");
    const settled = await until(
      "the send after the last removal settled",
      () => fleet.sendRow(refused),
      (one) => one?.state === "failed",
      60_000
    ).catch(() => fleet.sendRow(refused));
    kit.check(
      "(f) a message to one of them is refused with the way back: sign an account in",
      settled?.state === "failed" &&
        settled.reason === noAccountRefusal(hostname()),
      JSON.stringify(settled)
    );
  },
};

export default spec;
