/**
 * Every Claude account's usage reading is its own, current, and named with
 * the account it belongs to; one that nothing refreshes says so, and since
 * when. On a scratch fleet (real hub, agent and sessiond; the real Claude
 * Code CLI against the mock model) with three fake accounts: two on one
 * email in two organizations (a personal plan and a Team seat, as the
 * owner's bewinxed@petralab.ai), and one on a second email. The mock answers
 * each account's requests with that account's own usage headers
 * (`Reply.limits`), told apart by the token the request carries.
 *
 * - Each account's session runs one turn: `/api/usage/limits` carries each
 *   account's own windows by account id, current; the Usage page's tile for
 *   each shows its own numbers, the two on one email named with their
 *   organizations, and placement's words name the account the same way.
 * - A window an older reading held past its reset (the live hub's jude's
 *   weekly from 10-09) is gone once the account reports again.
 * - The other email's session sits idle, still running, while its reading
 *   goes unrefreshed for two hours (its time set back: an hour cannot pass
 *   in a probe): it reads stale with that time, on the hub and on its tile.
 * - The other email's session details (its tab's card) show its own
 *   account's limit, never another account's on the same machine.
 * - The Team seat's reading, set back the same, runs a turn whose usage
 *   moved nothing (no `rate_limit_event`): the turn confirms it, current
 *   again as of that turn.
 * - A new session on the other email reports its plan at start (Claude
 *   Code's initialize): the reading's time stays where it was, since no
 *   window was read.
 * - Benched at its limit, the other email's dial says when it last
 *   reported, not only when it is back.
 * - The Team seat refused at its limit, moving on (the other email still
 *   benched): its session moves to the personal plan on its email, and the
 *   line the hub writes into its transcript names both with their
 *   organizations, as placement does (core `accountNames`).
 * - The personal plan's overage-included weekly window (Claude Code's
 *   `seven_day_overage_included`, the `7d_oi` headers; its "Fable limit")
 *   reads as its weekly Fable window. A Fable session refused on it benches
 *   the plan for Fable alone until that window resets; an Opus session then
 *   refused on its usage credits (the `overage` claim), its 5-hour and week
 *   short of their limits, benches it for Opus too, until the credits
 *   refill. Placement still puts a session on another model (Haiku) there,
 *   and the Haiku session running there takes its turn there, not held or
 *   moved.
 *
 *   bun scripts/probe-kit/run.ts usage-accounts
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import {
  type AccountMove,
  accountMoveWords,
  type PlacementPreview,
  type ProviderForecast,
  type UsageLimitsResponse,
} from "../../../packages/core/src";
import { CLAUDE_JSON_NAME } from "../../../packages/core/src/claude-dirs";
import {
  ACCOUNT,
  MACHINE,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec } from "../kit";

/** The personal plan: the fleet's own account, probe@scratch-fleet.test in "Scratch Fleet". */
export const PERSONAL = ACCOUNT;
/** The Team seat: the same email, in "Scratch Team". */
export const TEAM = "acct-usage-team";
/** A second email: other@scratch-fleet.test in "Other Org". */
export const OTHER = "acct-usage-other";
export const ACCOUNTS = [PERSONAL, TEAM, OTHER] as const;
export type Id = (typeof ACCOUNTS)[number];

const TOKEN: Record<Id, string> = {
  [PERSONAL]: "sk-ant-oat01-fake-scratch-fleet",
  [TEAM]: "sk-ant-oat01-fake-scratch-fleet-team",
  [OTHER]: "sk-ant-oat01-fake-scratch-fleet-other",
};

const HOUR_MS = 3_600_000;
const STARTED = Date.now();
/** Each account's 5-hour and weekly share used: fractions whose percents are exact. */
const USED: Record<Id, { fiveHour: number; sevenDay: number }> = {
  [PERSONAL]: { fiveHour: 0.25, sevenDay: 0.5 },
  [TEAM]: { fiveHour: 0.5, sevenDay: 0.25 },
  [OTHER]: { fiveHour: 0.75, sevenDay: 0.75 },
};
/** Each account's resets, its own: an hour and a day out, a minute apart per account. */
const resetsOf = (id: Id) => {
  const step = ACCOUNTS.indexOf(id) * 60_000;
  return {
    fiveHour: STARTED + HOUR_MS + step,
    sevenDay: STARTED + 24 * HOUR_MS + step,
  };
};
/** What each tile says is left, 5-hour then week. */
const LEFT: Record<Id, string[]> = {
  [PERSONAL]: ["75% left", "50% left"],
  [TEAM]: ["50% left", "75% left"],
  [OTHER]: ["25% left", "25% left"],
};
/** What each tile names its account. */
const NAMED: Record<Id, string> = {
  [PERSONAL]: "probe@scratch-fleet.test (Scratch Fleet)",
  [TEAM]: "probe@scratch-fleet.test (Scratch Team)",
  [OTHER]: "other@scratch-fleet.test",
};
/** What the usage popover's cells call each account, by its email's first part. */
const SHORT: Record<Id, string> = {
  [PERSONAL]: "probe (Scratch Fleet)",
  [TEAM]: "probe (Scratch Team)",
  [OTHER]: "other",
};
/** How long a reading goes unrefreshed in the stale leg. */
const AGED_MS = 2 * HOUR_MS;
/** The accounts the mock refuses as at their usage limit, until {@link LIMITED_UNTIL}. */
const limited = new Set<Id>();
/** Past the at-limit policy's wait, so the session moves rather than waits for it. */
const LIMITED_UNTIL = STARTED + 3 * HOUR_MS;

/** A model in the overage-included models (Claude Code's default list: "Fable", "Fable 5", "Fable 5.1"). */
const FABLE_MODEL = "claude-fable-5";
/** The model the probe's sessions run on (scratch-fleet `MODEL.claude`): another model's scope, Haiku. */
const OTHER_MODEL = "claude-haiku-4-5";
/** A request on {@link FABLE_MODEL}, by the model its body names. */
const FABLE_REQUEST = /"model"\s*:\s*"claude-fable/;
/**
 * The personal plan's overage-included weekly window (`7d_oi`), once the
 * Fable leg turns it on: the share it has used, and its reset, two days out.
 * Its Fable requests are refused on it until then.
 */
const fableWeek: { on: boolean; resetsAt: number; used: number } = {
  on: false,
  used: 0.6,
  resetsAt: STARTED + 48 * HOUR_MS,
};

/** A model whose own weekly window the event does not carry (Opus's), refused on the usage credits. */
const OPUS_MODEL = "claude-opus-5-5";
/** A request on {@link OPUS_MODEL}, by the model its body names. */
const OPUS_REQUEST = /"model"\s*:\s*"claude-opus/;
/**
 * The personal plan's usage credits, once the leg spends them: its Opus
 * requests are refused on them (the `overage` claim) until they refill,
 * twenty days out, while its 5-hour and week stay short of their limits.
 */
const credits: { out: boolean; resetsAt: number } = {
  out: false,
  resetsAt: STARTED + 20 * 24 * HOUR_MS,
};

/** The account a request to the mock is on, by the token it carries. */
export const accountOf = (request: Seen): Id | undefined =>
  ACCOUNTS.find((id) => request.auth.endsWith(TOKEN[id]));

/** The usage headers `id`'s answers carry: its 5-hour and week, and its Fable week once that leg turns it on. */
const usageOf = (id: Id): Reply["limits"] => {
  const resets = resetsOf(id);
  return {
    fiveHour: { utilization: USED[id].fiveHour, resetsAt: resets.fiveHour },
    sevenDay: { utilization: USED[id].sevenDay, resetsAt: resets.sevenDay },
    ...(id === PERSONAL && fableWeek.on
      ? {
          overageIncluded: {
            utilization: fableWeek.used,
            resetsAt: fableWeek.resetsAt,
          },
        }
      : {}),
  };
};

const respond = (request: Seen): Reply => {
  const id = accountOf(request);
  if (!id) {
    return { everyMs: 5, words: ["ok"] };
  }
  if (limited.has(id)) {
    return { everyMs: 5, words: [], refuse: { resetsAt: LIMITED_UNTIL } };
  }
  const limits = usageOf(id);
  if (id === PERSONAL && fableWeek.on && FABLE_REQUEST.test(request.body)) {
    return {
      everyMs: 5,
      words: [],
      refuse: {
        claim: "seven_day_overage_included",
        limits,
        resetsAt: fableWeek.resetsAt,
      },
    };
  }
  if (id === PERSONAL && credits.out && OPUS_REQUEST.test(request.body)) {
    return {
      everyMs: 5,
      words: [],
      refuse: { claim: "overage", limits, resetsAt: credits.resetsAt },
    };
  }
  return { everyMs: 5, words: ["ok"], limits };
};

/** An account's Claude dir in `home`, signed in with its token as `email` in `organization`. */
const furnish = async (
  home: string,
  id: Id,
  email: string,
  organization: string,
  n: number
) => {
  const dir = join(home, ".cawco", "accounts", id, "claude");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, ".credentials.json"),
    JSON.stringify({
      claudeAiOauth: {
        accessToken: TOKEN[id],
        expiresAt: Date.now() + 365 * 24 * HOUR_MS,
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
        emailAddress: email,
        organizationName: organization,
        accountUuid: `00000000-0000-4000-8000-0000000000${n}1`,
        organizationUuid: `00000000-0000-4000-8000-0000000000${n}2`,
      },
    })
  );
};

/**
 * The fleet with its three accounts signed in on the scratch machine, the
 * mock answering each with `answer` (this spec's usage by default).
 */
export const standUp = async (
  kit: Kit,
  answer: (request: Seen) => Reply = respond
): Promise<KitFleet> => {
  const fleet = await kit.fleet(answer);
  await furnish(
    fleet.home,
    TEAM,
    "probe@scratch-fleet.test",
    "Scratch Team",
    2
  );
  await furnish(fleet.home, OTHER, "other@scratch-fleet.test", "Other Org", 3);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  // No nickname: it goes by its email, as the owner's accounts do.
  fleet.write("UPDATE accounts SET label = NULL WHERE id = ?", PERSONAL);
  for (const [id, order, hue] of [
    [TEAM, 1, "green"],
    [OTHER, 2, "rose"],
  ] as const) {
    fleet.write(
      "INSERT OR IGNORE INTO accounts (id, provider, kind, label, hue, \"order\", never_backup, created_at) VALUES (?, 'anthropic', 'subscription', NULL, ?, ?, 0, ?)",
      id,
      hue,
      order,
      Date.now()
    );
  }
  // The personal plan's older reading: a weekly Fable window whose reset
  // passed nine days ago, still held, as the live hub held jude's.
  fleet.write(
    "INSERT OR REPLACE INTO account_readings (account_id, subscription, overage, last_seen_at) VALUES (?, 'max', NULL, ?)",
    PERSONAL,
    STARTED - 10 * 24 * HOUR_MS
  );
  fleet.write(
    "INSERT OR REPLACE INTO account_windows (account_id, kind, scope_label, \"group\", is_active, percent, severity, resets_at) VALUES (?, 'weekly_scoped', 'Fable', 'weekly', 1, 100, 'critical', ?)",
    PERSONAL,
    new Date(STARTED - 9 * 24 * HOUR_MS).toISOString()
  );
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  for (const id of [TEAM, OTHER]) {
    // biome-ignore lint/performance/noAwaitInLoops: one account's sign-in at a time
    await until(
      `${id} signed in`,
      () =>
        fleet.query<{ state: string }>(
          "SELECT state FROM account_signins WHERE account_id = ?",
          id
        )[0],
      (row) => row?.state === "signed-in",
      120_000
    );
  }
  return fleet;
};

const limitsOf = async (fleet: KitFleet, id: Id) =>
  (await fleet.api<UsageLimitsResponse>("/api/usage/limits")).claude?.find(
    (one) => one.accountId === id
  )?.limits;

/** The percents a reading holds, by window kind. */
const percents = (
  limits: Awaited<ReturnType<typeof limitsOf>>
): Record<string, number> =>
  Object.fromEntries(
    (limits?.windows ?? []).map((w) => [
      `${w.kind}${w.scopeLabel ? `:${w.scopeLabel}` : ""}`,
      w.percent,
    ])
  );

/** What the Usage page's tile for `id` says: its name, its key's values, its sentence. */
const tileOf = (page: Page, id: string) =>
  page.evaluate((account) => {
    const tile = document.querySelector(
      `[data-tile][data-account="${account}"]`
    );
    return tile
      ? {
          name:
            tile.querySelector('[data-slot="head"] b')?.textContent?.trim() ??
            "",
          left: [...tile.querySelectorAll("[data-key-value]")].map(
            (one) => one.textContent?.replace(/\s+/g, " ").trim() ?? ""
          ),
          say:
            tile
              .querySelector("[data-status]")
              ?.textContent?.replace(/\s+/g, " ")
              .trim() ?? "",
        }
      : null;
  }, id);

const run = async (kit: Kit) => {
  const fleet = await standUp(kit);
  const sessions = {} as Record<Id, string>;
  for (const id of ACCOUNTS) {
    // biome-ignore lint/performance/noAwaitInLoops: one session's start at a time, on its own account
    sessions[id] = await fleet.spawn("claude", `Usage ${id}`, fleet.repo, {
      account: id,
    });
    await fleet.send(sessions[id], "PROBE-USAGE say ok");
  }

  // 1. Each account's own reading, by account, current.
  for (const id of ACCOUNTS) {
    const want = {
      session: USED[id].fiveHour * 100,
      weekly_all: USED[id].sevenDay * 100,
    };
    // biome-ignore lint/performance/noAwaitInLoops: one account's reading at a time
    const limits = await until(
      `${id}'s reading on the hub`,
      () => limitsOf(fleet, id),
      (landed) =>
        percents(landed).session === want.session &&
        percents(landed).weekly_all === want.weekly_all,
      180_000
    ).catch(() => undefined);
    const read = limits ?? (await limitsOf(fleet, id).catch(() => undefined));
    kit.check(
      `${id}: /api/usage/limits carries its own windows by account, current`,
      Boolean(
        read &&
        !read.stale &&
        percents(read).session === want.session &&
        percents(read).weekly_all === want.weekly_all
      ),
      JSON.stringify({ want, got: percents(read), stale: read?.stale })
    );
  }
  const personal = await limitsOf(fleet, PERSONAL);
  kit.check(
    "the personal plan's Fable window held past its reset is gone once it reports again",
    personal !== undefined && !("weekly_scoped:Fable" in percents(personal)),
    JSON.stringify(percents(personal))
  );

  // 2. Placement's words name the account with its organization.
  const placed = await fleet.api<PlacementPreview>(
    `/api/accounts/placement?harness=claude&machineId=${MACHINE}`
  );
  kit.check(
    "placement names the account on a shared email with its organization",
    placed.why.includes("probe@scratch-fleet.test (Scratch "),
    placed.why
  );

  // 3. Each dial on the Usage page: its own numbers, its own name.
  const base = await fleet.dashboard();
  const page = await kit.page("desk");
  await open(page, `${base}/usage`, `[data-tile][data-account="${OTHER}"]`);
  for (const id of ACCOUNTS) {
    // biome-ignore lint/performance/noAwaitInLoops: one tile at a time
    const tile = await tileOf(page, id);
    kit.check(
      `${id}: its dial shows its own numbers and names its account`,
      tile !== null &&
        tile.name === NAMED[id] &&
        JSON.stringify(tile.left) === JSON.stringify(LEFT[id]),
      JSON.stringify({ want: { name: NAMED[id], left: LEFT[id] }, got: tile })
    );
  }

  // 3a. Configure → Accounts names each account beside the others
  // (dashboard accounts/model `nameOf`): the two on one email with their
  // organizations.
  await page.goto(`${base}/config/accounts`, { waitUntil: "domcontentloaded" });
  const listed = await until(
    "every account's row on Configure → Accounts",
    () =>
      page.evaluate(
        (ids) =>
          Object.fromEntries(
            ids.map((id) => [
              id,
              document
                .querySelector(
                  `a[href="/config/accounts/${id}"] [data-slot="words"]`
                )
                ?.textContent?.trim() ?? null,
            ])
          ),
        [...ACCOUNTS]
      ),
    (names) => ACCOUNTS.every((id) => names[id] !== null),
    60_000
  ).catch((error: unknown) => ({ error: String(error) }));
  kit.check(
    "Configure → Accounts names the accounts on a shared email with their organizations",
    JSON.stringify(listed) === JSON.stringify(NAMED),
    JSON.stringify({ want: NAMED, got: listed })
  );

  // 3a'. The usage popover's short names (rings `shownNames`): the two on
  // one email by their organizations, not by the domain they share.
  await page.locator('[data-slot="strip"] .strip-hit').first().click();
  const short = await until(
    "every account's cell in the usage popover",
    () =>
      page.evaluate(
        (ids) =>
          Object.fromEntries(
            ids.map((id) => [
              id,
              document
                .querySelector(`.cell-d[data-account="${id}"] [data-name]`)
                ?.textContent?.replace(/\s+/g, " ")
                .trim() ?? null,
            ])
          ),
        [...ACCOUNTS]
      ),
    (names) => ACCOUNTS.every((id) => names[id] !== null),
    60_000
  ).catch((error: unknown) => ({ error: String(error) }));
  await page.keyboard.press("Escape");
  kit.check(
    "the usage popover tells the accounts on a shared email apart by organization",
    JSON.stringify(short) === JSON.stringify(SHORT),
    JSON.stringify({ want: SHORT, got: short })
  );

  // 3b. The other email's session details: its own account's limit (the
  // fullest of its windows, 75% used), not the first account signed in on
  // the machine.
  await open(
    page,
    `${base}/session/${sessions[OTHER]}`,
    `[data-session-tab="${sessions[OTHER]}"]`,
    120_000
  );
  await page
    .locator(`[data-session-tab="${sessions[OTHER]}"]`)
    .filter({ visible: true })
    .first()
    .hover();
  const shownLimit = await page
    .waitForSelector(".session-details-popover [data-limit-left]", {
      timeout: 15_000,
    })
    .then((node) => node.textContent())
    .then((text) => text?.replace(/\s+/g, " ").trim() ?? "")
    .catch((error: unknown) => `none: ${String(error)}`);
  kit.check(
    "a session's details show its own account's limit",
    shownLimit === "25% left",
    JSON.stringify({ want: "25% left", got: shownLimit })
  );

  // 4. Nothing refreshes the other email's reading for two hours, its
  // session idle but running: stale, as of that time.
  const agedAt = Date.now() - AGED_MS;
  for (const id of [OTHER, TEAM]) {
    fleet.write(
      "UPDATE account_readings SET last_seen_at = ? WHERE account_id = ?",
      agedAt,
      id
    );
  }
  const other = await limitsOf(fleet, OTHER);
  kit.check(
    "a reading nothing refreshed for two hours is stale, with its time, though its session runs",
    other?.stale === true && other.fetchedAt === agedAt,
    JSON.stringify({ stale: other?.stale, fetchedAt: other?.fetchedAt, agedAt })
  );

  // 5. The Team seat's turn reports nothing new: it confirms the reading.
  const asked = Date.now();
  await fleet.send(sessions[TEAM], "PROBE-USAGE again");
  const team = await until(
    "the Team seat's reading confirmed by its turn",
    () => limitsOf(fleet, TEAM),
    (read) => read.fetchedAt >= asked - 60_000 && !read.stale,
    180_000
  ).catch(() => undefined);
  kit.check(
    "a turn that moved nothing confirms its account's reading as of that turn",
    team !== undefined &&
      !team.stale &&
      percents(team).session === USED[TEAM].fiveHour * 100,
    JSON.stringify({
      stale: team?.stale,
      fetchedAt: team?.fetchedAt,
      asked,
      got: percents(team),
    })
  );

  // 6. The dials say so: the other email's tile is out of date, two hours.
  await open(page, `${base}/usage`, `[data-tile][data-account="${OTHER}"]`);
  const aged = await until(
    "the other email's tile out of date",
    () => tileOf(page, OTHER),
    (tile) => tile?.say.startsWith("Hasn’t reported for 2h") === true,
    30_000
  ).catch(() => tileOf(page, OTHER));
  kit.check(
    "the unrefreshed account's dial says it hasn't reported for two hours",
    aged?.say.startsWith("Hasn’t reported for 2h") === true,
    JSON.stringify(aged)
  );
  const teamTile = await tileOf(page, TEAM);
  kit.check(
    "the confirmed account's dial is current",
    teamTile !== null && !teamTile.say.startsWith("Hasn’t reported"),
    JSON.stringify(teamTile)
  );

  // 7. A session's start reports the account's plan (initialize) and no
  // window: the reading's time stays.
  const startedAt = Date.now();
  await fleet.spawn("claude", "Usage plan only", fleet.repo, {
    account: OTHER,
  });
  const reported = await until(
    "the new session's plan reported (its catalog kept)",
    () =>
      fleet.query<{ read_at: number }>(
        "SELECT read_at FROM account_catalogs WHERE account_id = ?",
        OTHER
      )[0],
    (row) => row.read_at >= startedAt,
    120_000
  ).catch(() => undefined);
  const asked7 = fleet.seen.filter(
    (one) => one.at >= startedAt && accountOf(one) === OTHER
  ).length;
  // Read from the forecast, which every build serves: the reading's time.
  const seenAt = (
    await fleet.api<ProviderForecast>(
      "/api/accounts/forecast?provider=anthropic"
    )
  ).accounts.find((one) => one.accountId === OTHER)?.lastSeenAt;
  kit.check(
    "a plan reported at a session's start leaves the reading's time where it was",
    reported !== undefined && asked7 === 0 && seenAt === agedAt,
    JSON.stringify({
      reported: reported?.read_at ?? null,
      modelRequestsSince: asked7,
      lastSeenAt: seenAt,
      agedAt,
    })
  );

  // 8. Benched at its limit, its dial still says how old its reading is.
  fleet.write(
    "INSERT OR REPLACE INTO account_bench (account_id, scope, until) VALUES (?, '', ?)",
    OTHER,
    Date.now() + 3 * HOUR_MS
  );
  await open(page, `${base}/usage`, `[data-tile][data-account="${OTHER}"]`);
  const benched = await until(
    "the other email's tile at its limit",
    () => tileOf(page, OTHER),
    (tile) => tile?.say.startsWith("At its limit") === true,
    30_000
  ).catch(() => tileOf(page, OTHER));
  kit.check(
    "an account at its limit with an old reading says when it last reported",
    benched?.say.startsWith("At its limit") === true &&
      benched.say.includes("Last reported 2h"),
    JSON.stringify(benched)
  );

  // 9. The Team seat refused at its limit, moving on, the other email still
  // benched: its session moves to the personal plan on its email, and its
  // transcript's line names each with its organization.
  const put = await fetch(`${fleet.base}/api/accounts/routing/anthropic`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      yours: { strategy: "pinned" },
      delegates: { strategy: "soonest-reset" },
      atLimit: { move: true, waitMinutes: 15, moveWholeUnderK: 200 },
    }),
  });
  if (!put.ok) {
    throw new Error(`routing: ${put.status} ${await put.text()}`);
  }
  limited.add(TEAM);
  await fleet.send(sessions[TEAM], "PROBE-USAGE at its limit");
  const moved = await until(
    "the Team seat's session moved at its limit",
    () =>
      fleet
        .query<{ move: string }>(
          "SELECT move FROM limit_events WHERE instance_id = ? ORDER BY at",
          sessions[TEAM]
        )
        .map((row) => JSON.parse(row.move) as AccountMove)
        .find((move) => move.kind === "moved"),
    (move) => move !== undefined,
    180_000
  ).catch(() => undefined);
  const words = moved ? accountMoveWords(moved, Date.now()) : undefined;
  kit.check(
    "a move at the limit to the account sharing its email names each with its organization",
    moved?.kind === "moved" &&
      moved.to.id === PERSONAL &&
      moved.to.name === NAMED[PERSONAL] &&
      moved.from.name === NAMED[TEAM] &&
      words?.line.startsWith(`Moved to ${NAMED[PERSONAL]} · `) === true,
    JSON.stringify({
      want: { to: NAMED[PERSONAL], from: NAMED[TEAM] },
      got: moved?.kind === "moved" ? { to: moved.to, from: moved.from } : moved,
      words,
    })
  );

  await fableLeg(kit, fleet, sessions[PERSONAL]);
};

/**
 * 10. The weekly window of the models that spill into usage credits
 * (Claude Code's `seven_day_overage_included`, its "Fable limit"): the
 * personal plan reads it as its weekly Fable window; refused on it, the
 * plan is spent for Fable alone. Its usage credits refused next on Opus,
 * whose own week the event does not carry, it is spent for Opus too. A
 * session on another model (Haiku, `personal`, the plan's own session)
 * still starts and runs there. The other two accounts are benched, so the
 * personal plan is the only one with room.
 */
const fableLeg = async (kit: Kit, fleet: KitFleet, personal: string) => {
  fableWeek.on = true;
  await fleet.send(personal, "PROBE-USAGE the Fable week");
  const fableKey = "weekly_scoped:Fable";
  const weekly =
    (await until(
      "the personal plan's weekly Fable window",
      () => limitsOf(fleet, PERSONAL),
      (read) => percents(read)[fableKey] === fableWeek.used * 100,
      120_000
    ).catch(() => undefined)) ??
    (await limitsOf(fleet, PERSONAL).catch(() => undefined));
  kit.check(
    "the overage-included weekly window reads as the account's weekly Fable window",
    percents(weekly)[fableKey] === fableWeek.used * 100,
    JSON.stringify({
      want: { [fableKey]: fableWeek.used * 100 },
      got: percents(weekly),
    })
  );

  const onFable = await fleet.spawn("claude", "Usage Fable", fleet.repo, {
    account: PERSONAL,
    model: FABLE_MODEL,
  });
  await fleet.send(onFable, "PROBE-USAGE on Fable");
  const bench = await until(
    "the personal plan benched by its Fable week's refusal",
    () =>
      fleet.query<{ scope: string; until: number }>(
        "SELECT scope, until FROM account_bench WHERE account_id = ?",
        PERSONAL
      ),
    (rows) => rows.length > 0,
    180_000
  ).catch(() => [] as { scope: string; until: number }[]);
  const [only] = bench;
  kit.check(
    "refused on its weekly Fable window, the account is spent for Fable alone, until that window resets",
    bench.length === 1 &&
      only?.scope === "Fable" &&
      Math.abs((only?.until ?? 0) - fableWeek.resetsAt) < 1000,
    JSON.stringify({
      want: { scope: "Fable", until: fableWeek.resetsAt },
      got: bench,
    })
  );

  // Its usage credits spent next, on a model whose own week the event does
  // not carry (Opus), its 5-hour and week short of their limits: the
  // refused request's model is what the credits held, so Opus alone.
  credits.out = true;
  const onOpus = await fleet.spawn("claude", "Usage Opus", fleet.repo, {
    account: PERSONAL,
    model: OPUS_MODEL,
  });
  await fleet.send(onOpus, "PROBE-USAGE on Opus");
  const benches = () =>
    fleet.query<{ scope: string; until: number }>(
      "SELECT scope, until FROM account_bench WHERE account_id = ? ORDER BY scope",
      PERSONAL
    );
  const both = await until(
    "the personal plan benched by its credits' refusal",
    benches,
    (rows) => rows.some((one) => one.scope !== "Fable"),
    180_000
  ).catch(benches);
  const opus = both.find((one) => one.scope === "Opus");
  kit.check(
    "refused on its usage credits on Opus, its 5-hour and week short, the account is spent for Opus too, not for every model",
    both.length === 2 &&
      both.some((one) => one.scope === "Fable") &&
      Math.abs((opus?.until ?? 0) - credits.resetsAt) < 1000,
    JSON.stringify({
      want: [
        { scope: "Fable", until: fableWeek.resetsAt },
        { scope: "Opus", until: credits.resetsAt },
      ],
      got: both,
    })
  );

  // A refusal (no account with room) is an answer to check, not the run's end.
  const forHaiku = await fleet
    .api<PlacementPreview>(
      `/api/accounts/placement?harness=claude&machineId=${MACHINE}&model=${OTHER_MODEL}&kind=delegates`
    )
    .catch((error: unknown) => ({ accountId: null, refused: String(error) }));
  kit.check(
    "a new session on another model is still placed on the account spent for Fable and Opus",
    forHaiku.accountId === PERSONAL,
    JSON.stringify({ want: PERSONAL, got: forHaiku })
  );

  const askedHaiku = Date.now();
  await fleet.send(personal, "PROBE-USAGE on Haiku still");
  const ran = await until(
    "the Haiku session's turn on the personal plan",
    () =>
      fleet.seen.find(
        (one) =>
          one.at >= askedHaiku &&
          accountOf(one) === PERSONAL &&
          one.last.includes("on Haiku still")
      ),
    (one) => one !== undefined,
    120_000
  ).catch(() => undefined);
  const [stayed] = fleet.query<{ account_id: string | null }>(
    "SELECT account_id FROM instances WHERE id = ?",
    personal
  );
  const held = fleet.query<{ instance_id: string }>(
    "SELECT instance_id FROM limit_holds WHERE instance_id = ?",
    personal
  );
  kit.check(
    "a running session on another model takes its turn there, not held or moved",
    ran !== undefined && stayed?.account_id === PERSONAL && held.length === 0,
    JSON.stringify({
      ranOn: ran ? accountOf(ran) : null,
      account: stayed?.account_id ?? null,
      held: held.length,
    })
  );
};

export default {
  name: "usage-accounts",
  run,
} satisfies Spec;
