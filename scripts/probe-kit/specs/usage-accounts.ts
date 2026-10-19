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
 *
 *   bun scripts/probe-kit/run.ts usage-accounts
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import type {
  PlacementPreview,
  ProviderForecast,
  UsageLimitsResponse,
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
const PERSONAL = ACCOUNT;
/** The Team seat: the same email, in "Scratch Team". */
const TEAM = "acct-usage-team";
/** A second email: other@scratch-fleet.test in "Other Org". */
const OTHER = "acct-usage-other";
const ACCOUNTS = [PERSONAL, TEAM, OTHER] as const;
type Id = (typeof ACCOUNTS)[number];

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
/** How long a reading goes unrefreshed in the stale leg. */
const AGED_MS = 2 * HOUR_MS;

const accountOf = (request: Seen): Id | undefined =>
  ACCOUNTS.find((id) => request.auth.endsWith(TOKEN[id]));

const respond = (request: Seen): Reply => {
  const id = accountOf(request);
  const resets = id ? resetsOf(id) : undefined;
  return {
    everyMs: 5,
    words: ["ok"],
    ...(id && resets
      ? {
          limits: {
            fiveHour: {
              utilization: USED[id].fiveHour,
              resetsAt: resets.fiveHour,
            },
            sevenDay: {
              utilization: USED[id].sevenDay,
              resetsAt: resets.sevenDay,
            },
          },
        }
      : {}),
  };
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

const standUp = async (kit: Kit): Promise<KitFleet> => {
  const fleet = await kit.fleet(respond);
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
  const limited = await until(
    "the other email's tile at its limit",
    () => tileOf(page, OTHER),
    (tile) => tile?.say.startsWith("At its limit") === true,
    30_000
  ).catch(() => tileOf(page, OTHER));
  kit.check(
    "an account at its limit with an old reading says when it last reported",
    limited?.say.startsWith("At its limit") === true &&
      limited.say.includes("Last reported 2h"),
    JSON.stringify(limited)
  );
};

export default {
  name: "usage-accounts",
  run,
} satisfies Spec;
