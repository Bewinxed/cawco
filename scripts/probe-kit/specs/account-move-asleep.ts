/**
 * The account a session bills is chosen from its card whatever the session's
 * state: it is the session's, not its process's. On a scratch fleet (real
 * hub, agent and sessiond; the real Claude Code CLI against the mock model)
 * with two Claude accounts signed in on its machine, told apart by the token
 * each request carries.
 *
 * - A sleeping session's card: its account chip opens; picking the other
 *   account moves it, and the hub's row names that account; the card says
 *   it is moved and wakes there, and that model, effort and permission
 *   unlock while it runs.
 * - The session's next wake (a message to it) runs on the new account: the
 *   turn's requests carry that account's token.
 * - A running session's card is as it was: its live controls take changes,
 *   no line says they are locked, and its account chip opens.
 * - A move asked mid-turn waits for the turn's end; the hub restarted
 *   before that end, it is still carried there (the hub's `owed_moves`),
 *   and the next turn runs on the new account.
 * - Its machine disconnected, the sleeping session's card says why its live
 *   controls are locked (until the machine is connected again); its account
 *   chip still opens, and a move picked there says it moves once the machine
 *   is connected again. The hub restarted meanwhile, a reloaded card still
 *   says so (the row's `owedMove`). Connected again, the hub carries the
 *   move out once: the machine's log has one carry of it and no refused
 *   second, and its next wake runs on that account.
 *
 *   bun scripts/probe-kit/run.ts account-move-asleep
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { CLAUDE_JSON_NAME } from "../../../packages/core/src/claude-dirs";
import { ACCOUNT, type Seen, until } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec } from "../kit";

/** The fleet's own account ("Probe"). */
const FIRST = ACCOUNT;
/** A second account signed in on the same machine ("Other"). */
const SECOND = "acct-move-other";
const TOKEN = {
  [FIRST]: "sk-ant-oat01-fake-scratch-fleet",
  [SECOND]: "sk-ant-oat01-fake-scratch-fleet-move-other",
} as const;
const NAME = { [FIRST]: "Probe", [SECOND]: "Other" } as const;
type Id = keyof typeof TOKEN;

/** The account a model request ran on, by its token's end (the first token is the other's prefix). */
const accountOf = (request: Seen): Id | undefined =>
  ([SECOND, FIRST] as const).find((id) => request.auth.endsWith(TOKEN[id]));

/** A turn asked with this word streams for {@link SLOW_WORDS} × 100 ms: long enough to restart the hub inside it. */
const SLOW = "PROBE-SLOW";
const SLOW_WORDS = 250;

const standUp = async (kit: Kit): Promise<KitFleet> => {
  const fleet = await kit.fleet((request) =>
    request.last.includes(SLOW)
      ? {
          everyMs: 100,
          words: Array.from({ length: SLOW_WORDS }, (_, n) => `w${n}`),
        }
      : { everyMs: 5, words: ["ok"] }
  );
  const dir = join(fleet.home, ".cawco", "accounts", SECOND, "claude");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, ".credentials.json"),
    JSON.stringify({
      claudeAiOauth: {
        accessToken: TOKEN[SECOND],
        expiresAt: Date.now() + 365 * 24 * 3_600_000,
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
        emailAddress: "other@scratch-fleet.test",
        organizationName: "Other Org",
        accountUuid: "00000000-0000-4000-8000-000000000091",
        organizationUuid: "00000000-0000-4000-8000-000000000092",
      },
    })
  );
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.write(
    "INSERT OR IGNORE INTO accounts (id, provider, kind, label, hue, \"order\", never_backup, created_at) VALUES (?, 'anthropic', 'subscription', ?, 'green', 1, 0, ?)",
    SECOND,
    NAME[SECOND],
    Date.now()
  );
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  await until(
    `${SECOND} signed in`,
    () =>
      fleet.query<{ state: string }>(
        "SELECT state FROM account_signins WHERE account_id = ?",
        SECOND
      )[0],
    (row) => row?.state === "signed-in",
    120_000
  );
  return fleet;
};

/** The account the hub's row names for session `id`. */
const rowAccount = (fleet: KitFleet, id: string) =>
  fleet.query<{ account_id: string | null }>(
    "SELECT account_id FROM instances WHERE id = ?",
    id
  )[0]?.account_id ?? null;

/** A session on `account`, one turn answered and closed. */
const atRest = async (fleet: KitFleet, title: string, account: Id) => {
  const id = await fleet.spawn("claude", title, fleet.repo, { account });
  const sent = Date.now();
  await fleet.send(id, "Say ok.");
  await until(
    `${title}'s first turn answered and closed`,
    () =>
      fleet.seen.some((one) => one.at >= sent) &&
      fleet.instance(id)?.turn_open_at === null
        ? true
        : undefined,
    Boolean,
    120_000
  );
  return id;
};

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
  ).catch(() => fleet.instance(id)?.status);
};

const CARD = "[data-session-details-popover]";

/** Opens session `id`'s card from its tab: its page, then a hover on the tab. */
const openCard = async (page: Page, base: string, id: string) => {
  await open(page, `${base}/session/${id}`, `[data-session-tab="${id}"]`);
  await page
    .locator(`[data-session-tab="${id}"]`)
    .filter({ visible: true })
    .first()
    .hover();
  await page.waitForSelector(`${CARD} [data-slot="settings"]`, {
    timeout: 15_000,
  });
};

/** What the card says now: its account chip (a trigger, or static), its held line, its host. */
const cardState = (page: Page) =>
  page.evaluate((card) => {
    const root = document.querySelector(card);
    const chip = root?.querySelector<HTMLElement>(
      '[data-slot="settings"] [data-account-chip][data-tool]'
    );
    const lines = [
      ...(root?.querySelectorAll<HTMLElement>(
        '[data-slot="feedback"], [data-slot="done"], [data-slot="failure"]'
      ) ?? []),
    ].map((one) => one.textContent?.replace(/\s+/g, " ").trim() ?? "");
    return {
      chip: chip
        ? {
            opens: chip.dataset.variant !== "static",
            name:
              chip
                .querySelector('[data-slot="chip-label"]')
                ?.textContent?.trim() ?? "",
          }
        : null,
      lines,
      locked:
        root
          ?.querySelector<HTMLElement>("[data-locked]")
          ?.textContent?.replace(/\s+/g, " ")
          .trim() ?? null,
      host:
        root?.querySelector('[data-slot="host"]')?.textContent?.trim() ?? "",
      effortOpens: Boolean(
        root?.querySelector(
          '[data-slot="settings"] button[aria-haspopup]:not([data-account-chip]):not([data-model-chip])'
        )
      ),
    };
  }, CARD);

/** Picks `account` from the card's account chip. */
const pick = async (page: Page, account: Id) => {
  await page
    .locator(`${CARD} [data-slot="settings"] [data-account-chip][data-tool]`)
    .first()
    .click();
  await page
    .locator(`[data-account-option="${account}"]`)
    .filter({ visible: true })
    .first()
    .click({ timeout: 10_000 });
};

/** Waits for the card's held line to say `line` and nothing else, then what it says. */
const cardSays = async (page: Page, label: string, line: string) =>
  await until(
    label,
    () => cardState(page),
    (state) => saysOnly(state, line),
    30_000
  ).catch(() => cardState(page));

/** The card's held line says `line` alone: a change's line outranks the lock line. */
const saysOnly = (state: Awaited<ReturnType<typeof cardState>>, line: string) =>
  state.lines.length === 1 && state.lines[0] === line;

const run = async (kit: Kit) => {
  const fleet = await standUp(kit);
  const sleeper = await atRest(fleet, "Move asleep", FIRST);
  const runner = await atRest(fleet, "Move running", FIRST);
  const slept = await asleep(fleet, sleeper);
  kit.check(
    "the session on the first account sleeps",
    slept === "sleeping" && rowAccount(fleet, sleeper) === FIRST,
    JSON.stringify({ status: slept, account: rowAccount(fleet, sleeper) })
  );

  const base = await fleet.dashboard();
  const page = await kit.page("desk");

  // 1. The sleeping session's card: the account chip opens and moves it.
  await openCard(page, base, sleeper);
  const before = await cardState(page);
  kit.check(
    "a sleeping session's account chip opens",
    before.chip?.opens === true && before.chip.name === NAME[FIRST],
    JSON.stringify(before)
  );
  kit.check(
    "a sleeping session's card says model, effort and permission unlock while it runs",
    before.locked ===
      "Model, effort and permission unlock while the session is running.",
    JSON.stringify(before.locked)
  );
  await pick(page, SECOND);
  const moved = await until(
    "the hub's row names the second account",
    () => rowAccount(fleet, sleeper),
    (account) => account === SECOND,
    60_000
  ).catch(() => rowAccount(fleet, sleeper));
  kit.check(
    "picking the other account on a sleeping session's card moves it on the hub",
    moved === SECOND && fleet.instance(sleeper)?.status === "sleeping",
    JSON.stringify({ account: moved, status: fleet.instance(sleeper)?.status })
  );
  const done = await cardSays(
    page,
    "the card says the move landed",
    `Moved to ${NAME[SECOND]}. It wakes there.`
  );
  kit.check(
    "the card says the sleeping session moved and wakes on the new account",
    saysOnly(done, `Moved to ${NAME[SECOND]}. It wakes there.`) &&
      done.chip?.name === NAME[SECOND],
    JSON.stringify(done)
  );

  // 2. Its next wake runs on the new account.
  const woke = Date.now();
  await fleet.send(sleeper, "Say ok again.");
  const ranOn = await until(
    "the woken session's turn reaches the model",
    () => fleet.seen.find((one) => one.at >= woke && accountOf(one)),
    Boolean,
    120_000
  ).catch(() => undefined);
  const ranOnAll = fleet.seen
    .filter((one) => one.at >= woke)
    .map((one) => accountOf(one) ?? "none");
  kit.check(
    "the session's next wake runs on the account it was moved to",
    ranOn !== undefined && ranOnAll.every((one) => one === SECOND),
    JSON.stringify({ ranOn: ranOnAll, account: rowAccount(fleet, sleeper) })
  );

  // 3. A running session's card is as it was.
  await openCard(page, base, runner);
  const running = await until(
    "the running session's card takes changes",
    () => cardState(page),
    (state) => state.locked === null && state.effortOpens,
    30_000
  ).catch(() => cardState(page));
  kit.check(
    "a running session's card: live controls open, no lock line, account chip opens",
    running.locked === null &&
      running.effortOpens &&
      running.chip?.opens === true &&
      rowAccount(fleet, runner) === FIRST,
    JSON.stringify(running)
  );

  // 3b. A move asked mid-turn, the hub restarted before the turn ends: it
  // is carried at the turn's end (or at once, had the restart ended it).
  await fleet.send(runner, `${SLOW} talk at length`);
  const midTurn = await until(
    "the running session is inside its slow turn",
    () => fleet.instance(runner)?.turn_open_at ?? undefined,
    (openedAt) => openedAt !== null,
    60_000
  ).catch(() => null);
  const asked = await fleet
    .api<{ state: string }>(`/api/instances/${runner}/account`, {
      accountId: SECOND,
    })
    .catch((error: unknown) => ({ state: `refused: ${String(error)}` }));
  kit.check(
    "a move asked mid-turn waits for the turn's end",
    midTurn !== null &&
      asked.state === "pending" &&
      rowAccount(fleet, runner) === FIRST,
    JSON.stringify({ midTurn, asked, account: rowAccount(fleet, runner) })
  );
  await fleet.stop("hub");
  fleet.launch("hub");
  await fleet.hubUp();
  const turnMoved = await until(
    "the mid-turn move carried after the hub's restart",
    () => rowAccount(fleet, runner),
    (account) => account === SECOND,
    SLOW_WORDS * 100 + 120_000
  ).catch(() => rowAccount(fleet, runner));
  await until(
    "the slow turn closed",
    () => (fleet.instance(runner)?.turn_open_at === null ? true : undefined),
    Boolean,
    120_000
  ).catch(() => undefined);
  const turnSent = Date.now();
  await fleet.send(runner, "Say ok after the move.");
  await until(
    "the moved session's next turn reaches the model",
    () => fleet.seen.find((one) => one.at >= turnSent && accountOf(one)),
    Boolean,
    120_000
  ).catch(() => undefined);
  const turnRanOn = fleet.seen
    .filter((one) => one.at >= turnSent)
    .map((one) => accountOf(one) ?? "none");
  kit.check(
    "a move owed at a turn's end survives a hub restart: carried, and the next turn runs on the new account",
    turnMoved === SECOND &&
      turnRanOn.length > 0 &&
      turnRanOn.every((one) => one === SECOND),
    JSON.stringify({ account: turnMoved, ranOn: turnRanOn })
  );

  // 4. Its machine disconnected: the card says why, and a move waits for it.
  const again = await asleep(fleet, sleeper);
  await fleet.stop("agent");
  await openCard(page, base, sleeper);
  const away = await until(
    "the card reads the machine away",
    () => cardState(page),
    (state) => (state.locked ?? "").includes("is connected again"),
    60_000
  ).catch(() => cardState(page));
  kit.check(
    "a disconnected machine's card says its live controls unlock once the machine is connected again",
    again === "sleeping" &&
      away.locked ===
        `Model, effort and permission unlock once ${away.host} is connected again.`,
    JSON.stringify({ status: again, ...away })
  );
  kit.check(
    "a disconnected machine's sleeping session's account chip still opens",
    away.chip?.opens === true,
    JSON.stringify(away.chip)
  );
  await pick(page, FIRST);
  const owedLine = `Moves to ${NAME[FIRST]} when ${away.host} is connected again`;
  const owed = await cardSays(page, "the card says the move waits", owedLine);
  kit.check(
    "a move on a disconnected machine says it moves once the machine is connected again",
    saysOnly(owed, owedLine) && rowAccount(fleet, sleeper) === SECOND,
    JSON.stringify({ ...owed, account: rowAccount(fleet, sleeper) })
  );
  // 4a. The hub restarts while the move waits: a reloaded card still says it.
  await fleet.stop("hub");
  fleet.launch("hub");
  await fleet.hubUp();
  await openCard(page, base, sleeper);
  const reloaded = await cardSays(
    page,
    "the reloaded card says the move waits",
    owedLine
  );
  kit.check(
    "after a hub restart, a reloaded card still says the move waits for the machine",
    saysOnly(reloaded, owedLine) && rowAccount(fleet, sleeper) === SECOND,
    JSON.stringify({ ...reloaded, account: rowAccount(fleet, sleeper) })
  );

  // 4b. Connected again: carried once, and the next wake runs there.
  const agentLog = await fleet.logMark("agent");
  fleet.launch("agent");
  await fleet.agentUp();
  const carried = await until(
    "the owed move carried out once the machine is back",
    () => rowAccount(fleet, sleeper),
    (account) => account === FIRST,
    120_000
  ).catch(() => rowAccount(fleet, sleeper));
  kit.check(
    "connected again, the hub carries out the move the card asked, across its restart",
    carried === FIRST,
    JSON.stringify({ account: carried })
  );
  const carries = (await agentLog.since())
    .split("\n")
    .filter((line) => line.includes("[carry]") && line.includes(sleeper));
  const started = carries.filter((line) => line.includes("[carry] started"));
  kit.check(
    "the machine carried the moved conversation once, with no second carry",
    started.length === 1 &&
      !carries.some((line) => line.includes("not carried")),
    JSON.stringify(carries)
  );
  const wokeAgain = Date.now();
  await fleet.send(sleeper, "Say ok once more.");
  await until(
    "the session's wake after reconnect reaches the model",
    () => fleet.seen.find((one) => one.at >= wokeAgain && accountOf(one)),
    Boolean,
    120_000
  ).catch(() => undefined);
  const wokeOn = fleet.seen
    .filter((one) => one.at >= wokeAgain)
    .map((one) => accountOf(one) ?? "none");
  kit.check(
    "its next wake runs on the account the move carried it to",
    wokeOn.length > 0 && wokeOn.every((one) => one === FIRST),
    JSON.stringify({ ranOn: wokeOn, account: rowAccount(fleet, sleeper) })
  );
};

export default {
  name: "account-move-asleep",
  run,
} satisfies Spec;
