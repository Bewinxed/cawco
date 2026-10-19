/**
 * An account at its plan limit with extra usage on: its own setting (core
 * `AtPlanLimit`, `PATCH /api/accounts/:id` `atPlanLimit`) decides whether a
 * session on it keeps going on that extra usage or moves to an account with
 * plan room (hub at-limit.ts `extraUsageTurn`, rebalance.ts `moveOff`,
 * placement.ts `Usage.onExtraUsage`). On a scratch fleet (real hub, agent
 * and sessiond; the real Claude Code CLI against the mock model) with two
 * accounts in two organizations, A and B, each read with room, every model
 * request saying which account it ran on (`Seen.auth`). Sessions are pinned
 * to A; every answer on A runs on its extra usage past its spent 5-hour
 * window (the mock's `credits`: Claude Code's `isUsingOverage`), B's within
 * its plan.
 *
 * - default: A's setting reads `move` before anyone sets it.
 * - keep going: A set to `extra-usage`, a session's turn on A runs on its
 *   extra usage. Its turn's end and the hub's next look (at-limit.ts
 *   `RECHECK_MS`, armed when A's bench came, its rebalance pass over A's
 *   sessions) each say it stays; past that look the session is still on A,
 *   and its next turn runs there.
 * - move: A set back to `move`. The session's next turn on A's extra usage
 *   ends, and within {@link MOVE_WITHIN_MS} it is on B; the turn after runs
 *   there, its conversation with it.
 *
 *   bun scripts/probe-kit/run.ts extra-usage-setting
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Account } from "../../../packages/core/src";
import { CLAUDE_JSON_NAME } from "../../../packages/core/src/claude-dirs";
import { ACCOUNT, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const B = "acct-scratch-fleet-b";
/** Each account's token, as its requests carry it. */
const TOKEN: Record<string, string> = {
  [ACCOUNT]: "sk-ant-oat01-fake-scratch-fleet",
  [B]: "sk-ant-oat01-fake-scratch-fleet-b",
};
/** Only this spec's session's conversation carries it. */
const MARK = "PROBE-EXTRA-USAGE";
/** Only the session's first answer carries it: a later request that has it has its earlier turns. */
const MEMORY = "PROBE-MEMORY-on-credits";
/** The hub's next look comes within its recheck (at-limit.ts `RECHECK_MS`, 5 minutes); this allows for it. */
const LOOK_WITHIN_MS = 6 * 60_000;
/** The words the rebalance pass says a session on an account that keeps going stays in (rebalance.ts `keepsGoing`). */
const PASS_KEEPS = "keep going on its extra usage, as its setting says";
/** A session moved off its plan limit runs on B within this of its turn's end. */
const MOVE_WITHIN_MS = 30_000;

/** When A's spent 5-hour window resets: well past the run. */
const aResets = Date.now() + 30 * 60_000;

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const onAccount = (request: Seen, id: string): boolean =>
  request.auth.endsWith(TOKEN[id] as string);
const accountOfRequest = (request: Seen): string | undefined =>
  [ACCOUNT, B].find((id) => onAccount(request, id));

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (!request.all.includes(MARK)) {
    return text("ok");
  }
  return onAccount(request, ACCOUNT)
    ? {
        everyMs: 5,
        words: [`On A's extra usage. ${MEMORY}`],
        credits: { resetsAt: aResets },
      }
    : text("On B, within its plan.");
};

/** Account B's Claude dir in `home`: signed in with its token (no refresh token), in another organization. */
const furnishB = async (home: string) => {
  const dir = join(home, ".cawco", "accounts", B, "claude");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, ".credentials.json"),
    JSON.stringify({
      claudeAiOauth: {
        accessToken: TOKEN[B],
        expiresAt: Date.now() + 365 * 24 * 60 * 60_000,
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
        emailAddress: "probe-b@scratch-fleet.test",
        organizationName: "Other Organization",
        accountUuid: "00000000-0000-4000-8000-00000000000b",
        organizationUuid: "00000000-0000-4000-8000-000000000003",
      },
    })
  );
};

/** A request to the hub's own API with `method`, answered as JSON; throws on a refusal. */
const call = async <T>(
  fleet: KitFleet,
  method: string,
  path: string,
  body: unknown
): Promise<T> => {
  const response = await fetch(`${fleet.base}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const read = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path}: ${response.status} ${read}`);
  }
  return JSON.parse(read) as T;
};

/** The fleet stood up: A and B signed in and read with room, every session pinned to A, moving at a limit with no wait for a close reset. */
const standUp = async (kit: Kit): Promise<KitFleet> => {
  const fleet = await kit.fleet(respond);
  await furnishB(fleet.home);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.write(
    "INSERT OR IGNORE INTO accounts (id, provider, kind, label, hue, \"order\", never_backup, created_at) VALUES (?, 'anthropic', 'console', 'Probe B', 'green', 1, 0, ?)",
    B,
    Date.now()
  );
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  await until(
    "account B signed in",
    () =>
      fleet.query<{ state: string }>(
        "SELECT state FROM account_signins WHERE account_id = ?",
        B
      )[0],
    (row) => row?.state === "signed-in"
  );
  for (const id of [ACCOUNT, B]) {
    fleet.write(
      "INSERT OR REPLACE INTO account_readings (account_id, subscription, overage, last_seen_at) VALUES (?, 'max', NULL, ?)",
      id,
      Date.now()
    );
  }
  const placed = { strategy: "pinned", pinnedAccountId: ACCOUNT };
  await call(fleet, "PUT", "/api/accounts/routing/anthropic", {
    yours: placed,
    delegates: placed,
    atLimit: { move: true, waitMinutes: 0, moveWholeUnderK: 200 },
  });
  return fleet;
};

/** A's setting as `PATCH /api/accounts/:id` answers it after setting it to `to`. */
const setA = async (fleet: KitFleet, to: Account["atPlanLimit"]) =>
  (await call<Partial<Account>>(fleet, "PATCH", `/api/accounts/${ACCOUNT}`, {
    atPlanLimit: to,
  }).catch((error: unknown) => ({
    refused: String(error),
  }))) as Partial<Account> & { refused?: string };

const accountOf = (fleet: KitFleet, instance: string): string | null =>
  fleet.query<{ account_id: string | null }>(
    "SELECT account_id FROM instances WHERE id = ?",
    instance
  )[0]?.account_id ?? null;

/** The session's requests the mock saw after `since`. */
const turnsSince = (fleet: KitFleet, since: number): Seen[] =>
  fleet.seen.filter(
    (one) => one.at > since && one.tools && one.all.includes(MARK)
  );

/** A's extra usage as the hub read it: in use, its plan window spent. */
const aOnCredits = (fleet: KitFleet) =>
  fleet.query<{ overage: string | null }>(
    "SELECT overage FROM account_readings WHERE account_id = ?",
    ACCOUNT
  )[0]?.overage ?? null;

/** Sends the session a message and waits for the turn it starts to reach the model; that request. */
const turn = async (
  fleet: KitFleet,
  instance: string,
  words: string
): Promise<Seen | undefined> => {
  const since = Date.now();
  await fleet.send(instance, `${MARK} ${words}`);
  return await until(
    `the turn "${words}" reached the model`,
    () => turnsSince(fleet, since).find((one) => one.all.includes(words)),
    Boolean,
    120_000
  ).catch(() => undefined);
};

const keepGoingLeg = async (
  kit: Kit,
  fleet: KitFleet
): Promise<string | undefined> => {
  const set = await setA(fleet, "extra-usage");
  kit.check(
    "keep going: A's setting is saved as extra-usage",
    set.atPlanLimit === "extra-usage",
    JSON.stringify(set)
  );
  const instance = await fleet.spawn("claude", "Extra usage", fleet.workdir);
  const first = await turn(fleet, instance, "first turn");
  const reading = await until(
    "keep going: the hub read A on its extra usage",
    () => aOnCredits(fleet) ?? undefined,
    (overage) => overage.includes('"inUse":true'),
    60_000
  ).catch(() => aOnCredits(fleet));
  kit.check(
    "keep going: the session's turn ran on A, and the hub read A's extra usage in use past its plan",
    !!first && onAccount(first, ACCOUNT) && !!reading?.includes('"inUse":true'),
    `first turn on ${first ? accountOfRequest(first) : "nothing"}; A's overage ${reading}`
  );
  // The hub's next look: its rebalance pass over A's sessions says it keeps
  // them, or (as without the setting) moves this one off A.
  const lookedAt = Date.now();
  await until(
    "keep going: the hub's next look passed over A's sessions",
    async () =>
      (await hubLines(fleet)).some((line) => line.includes(PASS_KEEPS)) ||
      accountOf(fleet, instance) !== ACCOUNT ||
      undefined,
    Boolean,
    LOOK_WITHIN_MS
  ).catch(() => undefined);
  const stayed = accountOf(fleet, instance);
  const next = await turn(fleet, instance, "second turn");
  kit.check(
    "keep going: past the hub's next look, the session is still on A and its next turn runs there",
    stayed === ACCOUNT && !!next && onAccount(next, ACCOUNT),
    `account ${stayed} ${Math.round((Date.now() - lookedAt) / 1000)} s on; next turn on ${next ? accountOfRequest(next) : "nothing"}`
  );
  // Both deciders looked at it and said why it stays: the look's rebalance
  // pass (rebalance.ts `keepsGoing`) and its turn's end (at-limit.ts
  // `extraUsageTurn`).
  const lines = await hubLines(fleet);
  kit.check(
    "keep going: the rebalance pass and the turn's end each say it stays on A's extra usage, as A's setting says",
    lines.some(
      (line) => line.includes("[rebalance]") && line.includes(PASS_KEEPS)
    ) &&
      lines.some(
        (line) =>
          line.includes("[at-limit]") &&
          line.includes("says to keep going on extra usage at a plan limit")
      ),
    lines.join(" | ") || "no rebalance or at-limit line in the hub's log"
  );
  return instance;
};

/** The hub's lines from its rebalance and at-limit deciders, as its log has them. */
const hubLines = async (fleet: KitFleet): Promise<string[]> =>
  (await fleet.logs("hub"))
    .split("\n")
    .filter(
      (line) => line.includes("[rebalance]") || line.includes("[at-limit]")
    )
    .map((line) => line.slice(0, 400));

const moveLeg = async (
  kit: Kit,
  fleet: KitFleet,
  instance: string
): Promise<void> => {
  const set = await setA(fleet, "move");
  kit.check(
    "move: A's setting is saved as move",
    set.atPlanLimit === "move",
    JSON.stringify(set)
  );
  const onA = await turn(fleet, instance, "third turn");
  const endedAt = Date.now();
  const moved = await until(
    "move: the session is on B",
    () => accountOf(fleet, instance) ?? undefined,
    (account) => account === B,
    MOVE_WITHIN_MS
  ).catch(() => accountOf(fleet, instance));
  kit.check(
    `move: its turn on A's extra usage ends, and within ${MOVE_WITHIN_MS / 1000} s it is on B`,
    !!onA && onAccount(onA, ACCOUNT) && moved === B,
    `turn on ${onA ? accountOfRequest(onA) : "nothing"}; account ${moved} ${Date.now() - endedAt} ms on; ${
      (await hubLines(fleet))
        .filter((line) => line.includes("moves whole to"))
        .join(" | ") || "no at-limit move line"
    }`
  );
  const onB = await turn(fleet, instance, "fourth turn");
  kit.check(
    "move: its next turn runs on B, its conversation with it",
    !!onB && onAccount(onB, B) && onB.body.includes(MEMORY),
    onB
      ? `on ${accountOfRequest(onB)}; earlier turns carried ${onB.body.includes(MEMORY)}`
      : "no turn reached the model"
  );
};

const run = async (kit: Kit) => {
  const fleet = await standUp(kit);
  const listed = await fleet.api<{ accounts: Partial<Account>[] }>(
    "/api/accounts"
  );
  const a = listed.accounts.find((one) => one.id === ACCOUNT);
  kit.check(
    "default: A's setting reads move before anyone sets it",
    a?.atPlanLimit === "move",
    JSON.stringify(a ?? null)
  );
  const instance = await keepGoingLeg(kit, fleet);
  if (instance) {
    await moveLeg(kit, fleet, instance);
  }
};

export default {
  name: "extra-usage-setting",
  run,
} satisfies Spec;
