/**
 * A session stopped at its account's limit is never left there quietly
 * while another account can take it (hub at-limit.ts `decideStop`,
 * admission.ts, server.ts `moveByHand`; dashboard switch.svelte.ts). On a
 * scratch fleet (real hub, agent and sessiond; the real Claude Code CLI
 * against the mock model) with three Claude accounts, every model request
 * saying which one it ran on: Probe (A) and Probe C in one organization,
 * Probe B in another. B's 5-hour window reads 72%, priced at $2.56 a
 * percent from its own history: room (2026-10-22 10:16, "No other account
 * has room for it" beside marketing@ at 72%). C reads 99%, priced at $0.30
 * a percent: a move's next-turn allowance alone takes more than its 1%.
 *
 * - move (2026-10-22 11:39, case A): A refuses the session's first turn.
 *   One decision moves it to B within {@link MOVE_WITHIN_MS}: C, of A's
 *   organization, has too little left for the move, and its cache is cold,
 *   so waiting for A's reset would re-read it cold too. C never runs it,
 *   and nothing says no other account has room.
 * - full: B is spent until 2 minutes on, A refuses until 4 minutes on, and
 *   the session's cache is cold (the mock writes none): the wait for A
 *   outlives its cache, so it waits for B, the account back soonest. Its
 *   row and transcript line say it is at A's limit and moves to B, counting
 *   down to B's reset; its second line says no other account can take it
 *   now, and its accounts say why each didn't (C's 1% too little for its
 *   move, B at its limit, back at its reset); at B's reset it runs on B.
 * - held (case B): B is spent, so A's refusal holds the session, a command
 *   of its running in the background. B frees, and a person's message to the
 *   held session moves it to B at once, the command ended by the move: it
 *   is told so on B, and the message reaches B, never a wait for the
 *   command.
 * - compact (case C): a context past the policy's `moveWholeUnderK` moves to
 *   B (another organization), carries on past its limit, then files its
 *   open items there, slowly; a person's message meanwhile waits behind the
 *   compaction (the hub's log says `compacting`, not `limit`). The hub stops
 *   inside the filing turn and starts again only after it ended; reading
 *   that end off the machine, it runs the `/compact`, and the message goes,
 *   with no interrupt.
 * - later (the design's leg 11, a driven session): an orchestrator's child,
 *   its last turn sent by its parent, refused at A's limit with a command
 *   running in the background. No person waits on it, so its move to B waits
 *   for that command: it is held, its row says it moves to B when its work
 *   in flight ends, counting down to A's reset (which comes before the cap
 *   from when it was first held: "· resets in …") or to the cap ("in … at
 *   the latest"), and nothing runs on B. The hub stops, its hold's start is set back past the cap (as if
 *   the hub had been down that long), and the hub starts again: the cap
 *   counts from that stored start, so the first look moves it to B, ending
 *   the command, and it is told so there.
 * - pick: moving at the limit is switched off, and the session holds a
 *   background command when A refuses it. It waits, never a failure: its
 *   rail row is read out "At its limit", its tab and its card's head wear the
 *   at-limit status, its card's account line and its transcript line say
 *   "At Probe's limit · resets in …" as a status (`role="status"`, none an
 *   alert), and nothing is drawn in the failure ink. Picked from its card's
 *   account chip, B takes it at once: the chip never goes back to A, no
 *   line waits for a turn, the command is ended by the move and the session
 *   is told so on B, where it carries on; the wait goes.
 *
 *   bun scripts/probe-kit/run.ts limit-pick
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import {
  accountMoveWords,
  heldReasonWords,
  type Stall,
} from "../../../packages/core/src/accounts";
import { CLAUDE_JSON_NAME } from "../../../packages/core/src/claude-dirs";
import { accountsWords } from "../../../packages/core/src/words/accounts";
import { COMPACT_FOCUS } from "../../../packages/hub/src/open-items";
import { toolWords } from "../../lib/tool-call";
import {
  ACCOUNT,
  MACHINE,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec } from "../kit";

const A = ACCOUNT;
const B = "acct-limit-pick-b";
const C = "acct-limit-pick-c";
const TOKEN: Record<string, string> = {
  [A]: "sk-ant-oat01-fake-scratch-fleet",
  [B]: "sk-ant-oat01-fake-scratch-fleet-pick-b",
  [C]: "sk-ant-oat01-fake-scratch-fleet-pick-c",
};
const NAME = { [A]: "Probe", [B]: "Probe B", [C]: "Probe C" } as const;
/** The words a session at its limit is said in (core words/accounts.ts). */
const HELD = accountsWords.held;
/** How a carrying move's cap ends its line: " at the latest". */
const LATEST = HELD.atTheLatest("").slice(HELD.atTheLatest("").indexOf(" at"));
const HOUR = 3_600_000;
const MINUTE = 60_000;
/** B's 5-hour window as read, and the dollars a percent of it costs. */
const B_USED_PCT = 72;
const B_USD_PER_PCT = 2.56;
/** C's 5-hour window as read, and the dollars a percent of it costs. */
const C_USED_PCT = 99;
const C_USD_PER_PCT = 0.3;
/** A session moved off its limit runs on B within this of A's refusal. */
const MOVE_WITHIN_MS = 30_000;
/** A hold is looked at again within this: the controller's recheck, and a minute for the session to start there. */
const RECHECK_WITHIN_MS = 6 * 60_000;

const LEGS = ["move", "full", "held", "compact", "later", "pick"] as const;
type Leg = (typeof LEGS)[number];
/** Only `leg`'s session's words carry this. */
const markOf = (leg: Leg) => `PROBE-LIMIT-${leg}`;
/** A leg's first answer, which a later request carrying it has. */
const memoryOf = (leg: Leg) => `PROBE-MEMORY-${leg}`;
/** The legs whose first turn leaves a command running in the background. */
const COMMAND_LEGS: readonly Leg[] = ["held", "later", "pick"];
/** What marks the hub's filing turn: its filing prompt (open-items.ts `filingPrompt`). */
const FILING = "file everything still open";
/** What marks the summary request of the hub's `/compact`: its focus. */
const HUB_FOCUS = COMPACT_FOCUS.slice(0, 40);
/** How long the compact leg's filing turn runs: long enough to restart the hub inside it. */
const FILING_WORDS = 30;
/** What the hub tells a session whose move ended its background work (server.ts `endedByMoveWords`). */
const ENDED = "You were moved to another account.";

/** Until when A refuses each leg's session, and B the full leg's. */
const limited: Record<Leg, number> = {
  move: 0,
  full: 0,
  held: 0,
  compact: 0,
  later: 0,
  pick: 0,
};
let bFullUntil = 0;
/** When an account refused each leg's session first. */
const refusedAt: Partial<Record<Leg, number>> = {};
/** The legs whose first turn has answered. */
const worked = new Set<Leg>();
/** The compact leg's filing turn: when it was asked, and when its answer ends. */
const filing: { askedAt: number; endsAt: number } = { askedAt: 0, endsAt: 0 };

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const onAccount = (request: Seen, id: string): boolean =>
  request.auth.endsWith(TOKEN[id] as string);
const accountOf = (request: Seen): string | undefined =>
  [B, C, A].find((id) => onAccount(request, id));

const refuse = (leg: Leg, resetsAt: number): Reply => {
  refusedAt[leg] ??= Date.now();
  return { everyMs: 5, words: [], refuse: { resetsAt } };
};

/**
 * Whether `request` is the summary request of the hub's `/compact`: its last
 * user message, the instruction Claude Code appends, names the hub's focus.
 */
const summarising = (request: Seen): boolean =>
  request.last.includes(HUB_FOCUS) &&
  !request.last.trimStart().startsWith("/compact") &&
  // The turn after a compaction carries the /compact line's own output
  // (`<local-command-…>`, its focus in it) merged into its message.
  !request.last.includes("<local-command");

const answer = (request: Seen, leg: Leg): Reply => {
  const now = Date.now();
  if (onAccount(request, A) && limited[leg] > now) {
    return refuse(leg, limited[leg]);
  }
  if (leg === "full" && onAccount(request, B) && bFullUntil > now) {
    return refuse(leg, bFullUntil);
  }
  // The compact leg's filing turn, on B: slow, so the hub restarts inside it.
  if (leg === "compact" && request.last.includes(FILING)) {
    filing.askedAt ||= now;
    filing.endsAt ||= now + FILING_WORDS * 1000;
    return {
      everyMs: 1000,
      words: Array.from({ length: FILING_WORDS }, (_, n) => `filed${n} `),
    };
  }
  // A command leg's first turn leaves a command running in the background,
  // which no resume on another account brings back.
  if (COMMAND_LEGS.includes(leg) && !worked.has(leg) && !request.afterTool) {
    return {
      everyMs: 5,
      words: [],
      tool: {
        name: "Bash",
        input: {
          command: "sleep 600",
          description: "A long wait in the background",
          run_in_background: true,
        },
      },
    };
  }
  if (!worked.has(leg)) {
    worked.add(leg);
    return text(`Working on it. ${memoryOf(leg)}`);
  }
  return text("Carrying on.");
};

const respond = (request: Seen): Reply => {
  if (summarising(request)) {
    return {
      everyMs: 200,
      words: ["<summary>", "PROBE-SUMMARY compacted.", "</summary>"],
    };
  }
  if (!request.tools) {
    return text("Probe title");
  }
  const leg = LEGS.find((one) => request.all.includes(markOf(one)));
  if (!leg) {
    return text("ok");
  }
  const reply = answer(request, leg);
  // The compact leg's context reads past its policy's `moveWholeUnderK`: each
  // of its answers reports reading 5,000 tokens from cache.
  return leg === "compact" && !reply.refuse
    ? { ...reply, cache: { read: 5000, write: 0 } }
    : reply;
};

/**
 * An account's Claude dir in `home`, signed in with its token: B in another
 * organization, C in A's (the scratch fleet's own, scratch-fleet.ts).
 */
const furnish = async (
  home: string,
  id: string,
  who: { email: string; org: string; orgId: string; uuid: string }
) => {
  const dir = join(home, ".cawco", "accounts", id, "claude");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, ".credentials.json"),
    JSON.stringify({
      claudeAiOauth: {
        accessToken: TOKEN[id],
        expiresAt: Date.now() + 365 * 24 * HOUR,
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
        emailAddress: who.email,
        organizationName: who.org,
        accountUuid: who.uuid,
        organizationUuid: who.orgId,
      },
    })
  );
};

/** An account's 5-hour window: `percent` used, resetting at `resetsAt`. */
const window5h = (
  fleet: KitFleet,
  id: string,
  percent: number,
  resetsAt: number
) =>
  fleet.write(
    "INSERT OR REPLACE INTO account_windows (account_id, kind, scope_label, \"group\", is_active, percent, severity, resets_at) VALUES (?, 'session', '', 'session', 1, ?, ?, ?)",
    id,
    percent,
    percent >= 100 ? "critical" : "normal",
    new Date(resetsAt).toISOString()
  );
const bWindow = (fleet: KitFleet, percent: number, resetsAt: number) =>
  window5h(fleet, B, percent, resetsAt);

/**
 * An account's room measured as the hub measures a signed-in account's
 * (forecast.ts `usdPerPercent`): read at `usedPct`, its history moving 0% →
 * `usedPct` across `usedPct × perPct` dollars of its turns.
 */
const measure = (
  fleet: KitFleet,
  id: string,
  usedPct: number,
  perPct: number
): void => {
  const now = Date.now();
  const resetsAt = now + 4 * HOUR;
  window5h(fleet, id, usedPct, resetsAt);
  for (const [percent, at] of [
    [0, now - 2 * HOUR],
    [usedPct, now - HOUR],
  ] as const) {
    fleet.write(
      "INSERT INTO usage_limit_history (account_id, kind, scope_label, percent, severity, resets_at, fetched_at) VALUES (?, 'session', NULL, ?, 'normal', ?, ?)",
      id,
      percent,
      new Date(resetsAt).toISOString(),
      at
    );
  }
  fleet.write(
    "INSERT INTO turn_usage (instance_id, result_id, model, account_id, input_tokens, cache_read_tokens, cache_write_tokens, cache_write_1h_tokens, output_tokens, cost_usd, keep_alive, at) VALUES (?, ?, 'claude-probe', ?, 0, 0, 0, 0, 0, ?, 0, ?)",
    `${id}-history`,
    `${id}-history`,
    id,
    usedPct * perPct,
    now - 1.5 * HOUR
  );
};

/** At the limit, a session moves to an account with room (`move`), or waits (moving off). */
const route = async (
  fleet: KitFleet,
  move: boolean,
  moveWholeUnderK = 200
): Promise<void> => {
  const placed = { strategy: "pinned", pinnedAccountId: A };
  const put = await fetch(`${fleet.base}/api/accounts/routing/anthropic`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      yours: placed,
      delegates: placed,
      atLimit: { move, waitMinutes: 0, moveWholeUnderK },
    }),
  });
  if (!put.ok) {
    throw new Error(`routing: ${put.status} ${await put.text()}`);
  }
};

const standUp = async (kit: Kit): Promise<KitFleet> => {
  const fleet = await kit.fleet(respond);
  await furnish(fleet.home, B, {
    email: "probe-pick-b@scratch-fleet.test",
    org: "Other Organization",
    orgId: "00000000-0000-4000-8000-0000000000c2",
    uuid: "00000000-0000-4000-8000-0000000000c1",
  });
  await furnish(fleet.home, C, {
    email: "probe-pick-c@scratch-fleet.test",
    org: "Scratch Fleet",
    orgId: "00000000-0000-4000-8000-000000000002",
    uuid: "00000000-0000-4000-8000-0000000000c3",
  });
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  for (const [id, order] of [
    [B, 1],
    [C, 2],
  ] as const) {
    fleet.write(
      "INSERT OR IGNORE INTO accounts (id, provider, kind, label, hue, \"order\", never_backup, created_at) VALUES (?, 'anthropic', 'subscription', ?, 'green', ?, 0, ?)",
      id,
      NAME[id],
      order,
      Date.now()
    );
  }
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  for (const id of [B, C] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one account's sign-in at a time
    await until(
      `account ${NAME[id]} signed in`,
      () =>
        fleet.query<{ state: string }>(
          "SELECT state FROM account_signins WHERE account_id = ?",
          id
        )[0],
      (row) => row?.state === "signed-in",
      120_000
    );
  }
  for (const id of [A, B, C]) {
    fleet.write(
      "INSERT OR REPLACE INTO account_readings (account_id, subscription, overage, last_seen_at) VALUES (?, 'max', NULL, ?)",
      id,
      Date.now()
    );
  }
  measure(fleet, B, B_USED_PCT, B_USD_PER_PCT);
  measure(fleet, C, C_USED_PCT, C_USD_PER_PCT);
  await route(fleet, true);
  return fleet;
};

/** The account the hub's row names for `id`. */
const rowAccount = (fleet: KitFleet, id: string) =>
  fleet.query<{ account_id: string | null }>(
    "SELECT account_id FROM instances WHERE id = ?",
    id
  )[0]?.account_id ?? null;

/** What reached the model from `leg`'s session after `since`. */
const seenOf = (fleet: KitFleet, leg: Leg, since: number) =>
  fleet.seen.filter(
    (one) => one.at > since && one.tools && one.all.includes(markOf(leg))
  );

/** The board's row for `id`, as every dashboard is handed it. */
const boardRow = async (fleet: KitFleet, id: string) =>
  (
    await fleet.api<
      {
        accountId?: string | null;
        id: string;
        owedMove?: { accountId: string; waits: string };
        stalled?: Stall;
      }[]
    >("/api/instances")
  ).find((one) => one.id === id);

/** The account lines in `id`'s transcript, newest last. */
const accountLines = async (fleet: KitFleet, id: string) =>
  (
    await fleet.api<{
      blocks: {
        content: string;
        metadata?: {
          accountMove?: Parameters<typeof accountMoveWords>[0];
        };
        type: string;
      }[];
    }>(`/api/instances/${id}/transcript?limit=400`)
  ).blocks.filter((one) => one.type === "system.account_move");

/** A moment as the hub's words say it (core accounts.ts `clockWords`). */
const clockOf = (at: number): string =>
  new Date(at).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

const moveLeg = async (kit: Kit, fleet: KitFleet): Promise<void> => {
  const id = await fleet.spawn("claude", "Limit move", fleet.repo, {
    account: A,
  });
  limited.move = Date.now() + 90_000;
  await fleet.send(id, `${markOf("move")}: go on`);
  const refused = await until(
    "move: A refuses its first turn",
    () => refusedAt.move,
    Boolean,
    120_000
  ).catch(() => undefined);
  const onB = await until(
    "move: it runs on B",
    () => seenOf(fleet, "move", refused ?? 0).find((one) => onAccount(one, B)),
    Boolean,
    MOVE_WITHIN_MS + 60_000
  ).catch(() => undefined);
  const lines = await accountLines(fleet, id);
  const log = (await fleet.logs("hub"))
    .split("\n")
    .filter((line) => line.includes("Limit move"));
  const onC = seenOf(fleet, "move", refused ?? 0).filter((one) =>
    onAccount(one, C)
  );
  kit.check(
    `move: refused on A, it moves to B (read at ${B_USED_PCT}%) by itself within ${MOVE_WITHIN_MS / 1000} s, in one decision that tried nothing else, its line saying both sides' costs, and nothing says no other account has room`,
    !!refused &&
      !!onB &&
      onB.at - refused <= MOVE_WITHIN_MS &&
      onC.length === 0 &&
      rowAccount(fleet, id) === B &&
      lines.some((one) => one.metadata?.accountMove?.kind === "moved") &&
      log.some((line) =>
        line.includes(`moves from ${NAME[A]} to ${NAME[B]}: moving re-reads`)
      ) &&
      log.some((line) => line.includes("would re-read it cold too")) &&
      !log.some((line) => line.includes("couldn't move to")) &&
      !log.some((line) => line.includes("No other account has room")),
    `${onB && refused ? `first request on B ${onB.at - refused} ms after A's refusal` : "nothing on B"}; account ${rowAccount(fleet, id)}; lines ${JSON.stringify(lines.map((one) => one.content))}; log ${JSON.stringify(log.filter((line) => line.includes("[at-limit]")).slice(-4))}`
  );
};

const fullLeg = async (kit: Kit, fleet: KitFleet): Promise<void> => {
  const id = await fleet.spawn("claude", "Limit full", fleet.repo, {
    account: A,
  });
  const now = Date.now();
  bFullUntil = now + 2 * MINUTE;
  limited.full = now + 4 * MINUTE;
  bWindow(fleet, 100, bFullUntil);
  await fleet.send(id, `${markOf("full")}: go on`);
  const atA = `${HELD.at(NAME[A])} · ${HELD.movesIn(NAME[B], "")}`;
  const row = await until(
    "full: its row says it is at A's limit and moves to B",
    () => boardRow(fleet, id),
    (one) => !!one?.stalled?.words.startsWith(atA),
    120_000
  ).catch(() => boardRow(fleet, id));
  const line = (await accountLines(fleet, id)).at(-1);
  const move = line?.metadata?.accountMove;
  const readAt = Date.now();
  const detail = move ? accountMoveWords(move, readAt).detail : "";
  const held = row?.stalled?.held;
  kit.check(
    "full: with no account free and its cache cold, its row and transcript line say it is at A's limit and moves to B, the account with room soonest, counting down to B's reset",
    !!row?.stalled?.words.startsWith(atA) &&
      held?.kind === "waiting" &&
      held.frees?.id === B &&
      Math.abs((row.stalled.until ?? 0) - bFullUntil) <= 2000 &&
      !!line?.content.startsWith(atA),
    `row ${JSON.stringify(row?.stalled ?? null)}; line ${JSON.stringify(line?.content ?? null)}; B resets at ${clockOf(bFullUntil)}, A at ${clockOf(limited.full)}`
  );
  const reasons = new Map(
    (move?.kind === "waiting" ? (move.accounts ?? []) : []).map((one) => [
      one.account.id,
      heldReasonWords(one, readAt),
    ])
  );
  kit.check(
    "full: its second line says no other account can take it now, and its accounts say why each didn't, never that none has room beside one that has: C's 1% is too little for its move, B is at its limit, back at its reset",
    detail === HELD.why.full &&
      !!reasons
        .get(C)
        ?.startsWith(
          HELD.reason.room(HELD.reason.left(1), 0).slice(0, -"0%".length)
        ) &&
      !!reasons
        .get(B)
        ?.startsWith(`${HELD.reason.limit}${HELD.reason.back("")}`) &&
      ![...reasons.values()].some((one) =>
        one.startsWith(HELD.reason.fits("", false))
      ),
    JSON.stringify({ detail, reasons: Object.fromEntries(reasons) })
  );
  const onB = await until(
    "full: it runs on B past B's reset",
    () => seenOf(fleet, "full", bFullUntil).find((one) => onAccount(one, B)),
    Boolean,
    Math.max(0, bFullUntil - Date.now()) + 120_000
  ).catch(() => undefined);
  kit.check(
    "full: at B's reset, before A's, it runs on B",
    !!onB && onB.at < limited.full && rowAccount(fleet, id) === B,
    `${onB ? `first request on B ${onB.at - bFullUntil} ms after B's reset` : "nothing on B"}; account ${rowAccount(fleet, id)}`
  );
};

/** A leg's session on A, its first turn answered (its command left running, on a command leg). */
const firstTurn = async (
  fleet: KitFleet,
  leg: Leg,
  title: string,
  extra: object = {}
): Promise<string> => {
  const id = await fleet.spawn("claude", title, fleet.repo, {
    account: A,
    ...extra,
  });
  await fleet.send(id, `${markOf(leg)}: start`);
  await until(
    `${leg}: its first turn answered`,
    () =>
      worked.has(leg) && fleet.instance(id)?.turn_open_at === null ? 1 : 0,
    Boolean,
    120_000
  );
  return id;
};

/**
 * Case B: B spent, so A's refusal holds the session, its command running;
 * B frees, and a person's message to it moves it to B at once.
 */
const heldLeg = async (kit: Kit, fleet: KitFleet): Promise<void> => {
  const id = await firstTurn(fleet, "held", "Limit held");
  bWindow(fleet, 100, Date.now() + HOUR);
  limited.held = Date.now() + 3 * MINUTE;
  await fleet.send(id, `${markOf("held")}: and the next thing`);
  const held = await until(
    "held: it is held at A's limit",
    () => boardRow(fleet, id),
    (one) => !!one?.stalled,
    120_000
  ).catch(() => boardRow(fleet, id));
  bWindow(fleet, B_USED_PCT, Date.now() + 4 * HOUR);
  const sentAt = Date.now();
  await fleet.send(id, `${markOf("held")}: PROBE-HELD-NOTE carry on`);
  const onB = await until(
    "held: it runs on B",
    () =>
      seenOf(fleet, "held", sentAt).find(
        (one) => onAccount(one, B) && one.all.includes("PROBE-HELD-NOTE")
      ),
    Boolean,
    MOVE_WITHIN_MS + 60_000
  ).catch(() => undefined);
  const told = await until(
    "held: told on B what the move ended",
    () =>
      seenOf(fleet, "held", sentAt).find(
        (one) => onAccount(one, B) && one.all.includes(ENDED)
      ),
    Boolean,
    60_000
  ).catch(() => undefined);
  const log = (await fleet.logs("hub"))
    .split("\n")
    .filter((line) => line.includes("Limit held"));
  kit.check(
    "held: held at A's limit with its command running, a person's message moves it to B at once: the move ends the command, it is told so on B, and the message reaches B",
    !!held?.stalled &&
      !!onB &&
      onB.at - sentAt <= MOVE_WITHIN_MS &&
      !!told &&
      rowAccount(fleet, id) === B &&
      !log.some((line) => line.includes("waiting for work in flight")),
    `held ${JSON.stringify(held?.stalled ?? null)}; ${onB ? `the message reached B ${onB.at - sentAt} ms after it was sent` : "the message never reached B"}; told what ended: ${!!told}; account ${rowAccount(fleet, id)}; log ${JSON.stringify(log.filter((line) => line.includes("[at-limit]") || line.includes("[accounts]")).slice(-4))}`
  );
};

/**
 * Case C: a context past the policy's threshold moves to B and files its
 * open items there first, slowly; a person's message waits behind that
 * (`compacting`), the hub restarts inside the filing turn, and once it ends
 * the `/compact` runs and the message goes, with no interrupt.
 */
const compactLeg = async (kit: Kit, fleet: KitFleet): Promise<void> => {
  await route(fleet, true, 1);
  const id = await firstTurn(fleet, "compact", "Limit compact");
  limited.compact = Date.now() + 3 * MINUTE;
  await fleet.send(id, `${markOf("compact")}: and the next thing`);
  await until(
    "compact: its filing turn runs on B",
    () => filing.askedAt || undefined,
    Boolean,
    120_000
  ).catch(() => undefined);
  const note = await fleet.send(id, `${markOf("compact")}: PROBE-COMPACT-NOTE`);
  const queued = await until(
    "compact: the hub says the message waits for the compaction",
    async () =>
      (await fleet.logs("hub"))
        .split("\n")
        .find((line) => line.startsWith(`[hub] send ${note} `)),
    Boolean,
    20_000
  ).catch(() => undefined);
  // The hub stops inside the filing turn and starts again only once that
  // turn has ended: its end never reaches a hub, which reads it off the
  // machine's word as it registers.
  const restartedAt = Date.now();
  await fleet.stop("hub");
  await Bun.sleep(Math.max(0, filing.endsAt + 3000 - Date.now()));
  fleet.launch("hub");
  await fleet.hubUp();
  const summary = await until(
    "compact: the /compact runs after the filing turn",
    () =>
      fleet.seen.find(
        (one) =>
          one.at > filing.askedAt && summarising(one) && onAccount(one, B)
      ),
    Boolean,
    Math.max(0, filing.endsAt - Date.now()) + 120_000
  ).catch(() => undefined);
  const reached = await until(
    "compact: the message reaches B after it",
    () =>
      seenOf(fleet, "compact", filing.askedAt).find(
        (one) =>
          onAccount(one, B) &&
          one.last.includes("PROBE-COMPACT-NOTE") &&
          !summarising(one)
      ),
    Boolean,
    120_000
  ).catch(() => undefined);
  const early = seenOf(fleet, "compact", filing.askedAt).filter(
    (one) =>
      one.all.includes("PROBE-COMPACT-NOTE") &&
      summary !== undefined &&
      one.at < summary.at
  );
  const log = (await fleet.logs("hub"))
    .split("\n")
    .filter((line) => line.includes("Limit compact") || line.includes(note));
  kit.check(
    "compact: a message sent during the filing turn waits behind the compaction (queued: compacting), the hub restarts inside the filing turn, then the /compact runs and the message goes, with no interrupt",
    !!queued?.includes("queued: compacting") &&
      filing.askedAt < restartedAt &&
      restartedAt < filing.endsAt &&
      !!summary &&
      !!reached &&
      reached.at > summary.at &&
      early.length === 0 &&
      !log.some((line) => line.includes("was interrupted")),
    `queued ${JSON.stringify(queued ?? null)}; filing asked ${filing.askedAt ? restartedAt - filing.askedAt : "never"} ms before the restart, ends ${filing.endsAt - restartedAt} ms after it; /compact ${summary ? `${summary.at - filing.endsAt} ms after the filing turn's end` : "never ran"}; the message ${reached ? `reached B ${reached.at - (summary?.at ?? 0)} ms after the /compact` : "never reached B"}; before it: ${early.length}; log ${JSON.stringify(log.filter((line) => line.includes("[at-limit]")).slice(-5))}`
  );
};

/**
 * A message to `id` from its parent session `parent`, sent as a parent
 * sends it: its `handoff`, through the hub's tool door with the parent's own
 * credential (a page's send is the person's, hub stream.ts, so a socket
 * send naming the parent is refused).
 */
const peerSend = async (
  fleet: KitFleet,
  id: string,
  parent: string,
  words: string
): Promise<void> => {
  const credential = await until(
    "the parent's credential",
    () => fleet.sessionCredential(parent),
    Boolean,
    60_000
  );
  const said = await toolWords(
    { base: fleet.base, id: parent, credential },
    "handoff",
    { target: id, message: words }
  );
  if (said.refused) {
    throw new Error(`the parent's handoff was refused: ${said.text}`);
  }
};

/** The restart bound a move waits for work held for later (core binary-updates.ts `RESTART_WAIT_CAP_MS`). */
const CAP_MS = 30 * MINUTE;

/**
 * Leg 11, a driven session: an orchestrator's child, refused at A's limit
 * on a turn its parent sent, a command of its running in the background.
 * Its move to B waits for that command; across a hub restart the cap counts
 * from its hold's stored start, so once that start is past the cap the
 * first look moves it, ending the command.
 */
const laterLeg = async (kit: Kit, fleet: KitFleet): Promise<void> => {
  const parent = await fleet.spawn("claude", "Limit parent", fleet.repo, {
    account: A,
  });
  const id = await fleet.spawn("claude", "Limit later", fleet.repo, {
    account: A,
  });
  fleet.write(
    "UPDATE instances SET parent_instance_id = ? WHERE id = ?",
    parent,
    id
  );
  await peerSend(fleet, id, parent, `${markOf("later")}: start`);
  await until(
    "later: its first turn answered, the command left running",
    () =>
      worked.has("later") && fleet.instance(id)?.turn_open_at === null ? 1 : 0,
    Boolean,
    120_000
  );
  limited.later = Date.now() + 4 * MINUTE;
  await peerSend(fleet, id, parent, `${markOf("later")}: and the next thing`);
  const held = await until(
    "later: its move waits for its command",
    () => boardRow(fleet, id),
    (one) => !!one?.stalled?.words.includes("work in flight"),
    120_000
  ).catch(() => boardRow(fleet, id));
  const since =
    fleet.query<{ created_at: number }>(
      "SELECT created_at FROM limit_holds WHERE instance_id = ?",
      id
    )[0]?.created_at ?? 0;
  // A while for anything that would move it now to show.
  await Bun.sleep(15_000);
  const early = seenOf(fleet, "later", refusedAt.later ?? 0).filter((one) =>
    onAccount(one, B)
  );
  const waits = (await accountLines(fleet, id)).find(
    (one) =>
      one.metadata?.accountMove?.kind === "unmoved" &&
      one.metadata.accountMove.waits === true
  );
  // A resets before the cap from its hold's start, so the row counts down to
  // that reset: it carries on there then, unless the command ends first.
  const resets = limited.later < since + CAP_MS;
  const carrying = held?.stalled?.held;
  kit.check(
    "later: no person waits on it, so its move to B waits for its command: held, its row saying it moves to B when its work in flight ends, counting down to what comes first of A's reset and the cap from when it was first held, its line saying it can't move yet, and nothing runs on B",
    carrying?.kind === "carrying" &&
      !!held?.stalled?.words.startsWith(
        `${HELD.at(NAME[A])} · ${HELD.carrying(NAME[B], carrying.work)}`
      ) &&
      (resets
        ? held.stalled.words.includes(` · ${HELD.resetsIn("")}`)
        : held.stalled.words.endsWith(LATEST)) &&
      carrying.resets === resets &&
      Math.abs(
        (held.stalled.until ?? 0) - (resets ? limited.later : since + CAP_MS)
      ) <= 2000 &&
      !!waits?.content.startsWith(
        `Can't move from ${NAME[A]} to ${NAME[B]} yet`
      ) &&
      early.length === 0 &&
      rowAccount(fleet, id) === A,
    `chip ${JSON.stringify(held?.stalled ?? null)}; held since ${since ? clockOf(since) : "never"}; line ${JSON.stringify(waits?.content ?? null)}; requests on B ${early.length}; account ${rowAccount(fleet, id)}`
  );
  // The hub goes down; its hold's stored start is set back past the cap,
  // as if it had stayed down that long.
  await fleet.stop("hub");
  fleet.write(
    "UPDATE limit_holds SET created_at = ? WHERE instance_id = ?",
    Date.now() - CAP_MS - MINUTE,
    id
  );
  const restartedAt = Date.now();
  fleet.launch("hub");
  await fleet.hubUp();
  const onB = await until(
    "later: after the restart it runs on B, told what the move ended",
    () =>
      seenOf(fleet, "later", restartedAt).find(
        (one) => onAccount(one, B) && one.all.includes(ENDED)
      ),
    Boolean,
    RECHECK_WITHIN_MS
  ).catch(() => undefined);
  const moved = (await accountLines(fleet, id)).findLast(
    (one) => one.metadata?.accountMove?.kind === "moved"
  );
  kit.check(
    "later: started again with its hold's start past the cap, the hub's first look moves it to B, ending the command: it is told so there, and its line says the move ended it",
    !!onB &&
      rowAccount(fleet, id) === B &&
      !!moved?.content.includes(
        "a command was running and was ended by the move"
      ),
    `${onB ? `told on B ${onB.at - restartedAt} ms after the restart` : "never told on B"}; account ${rowAccount(fleet, id)}; line ${JSON.stringify(moved?.content ?? null)}`
  );
};

const CARD = "[data-session-details-popover]";

/** Opens session `id`'s page and its card, from a hover on its tab. */
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

/**
 * What the page says of the wait, each part with whether it wears the
 * failure ink: its rail row's read-out, its tab and card glyphs, its card's
 * account line, its transcript's live line, and any alert there.
 */
const waitShown = (page: Page, id: string) =>
  page.evaluate(
    ({ session, card }) => {
      const fail = document.createElement("span");
      fail.className = "text-status-fail-ink";
      document.body.append(fail);
      const failInk = getComputedStyle(fail).color;
      fail.remove();
      const read = (el: Element | null | undefined) =>
        el
          ? {
              text: el.textContent?.replace(/\s+/g, " ").trim() ?? "",
              failInk: getComputedStyle(el).color === failInk,
            }
          : null;
      const glyph = (el: Element | null | undefined) =>
        el
          ? {
              label: el.getAttribute("aria-label"),
              tone: el.getAttribute("data-session-status-tone"),
            }
          : null;
      // The live line: a status while the session waits (AccountMoveDivider `waiting`).
      const live = document.querySelector('[data-waiting][role="status"]');
      // The rail's row is one line: its title, read out after its status word.
      const row = document.querySelector<HTMLElement>(
        `[data-session-row="${session}"] [data-session-row-row]`
      );
      const name = row?.querySelector('[data-slot="title"]');
      return {
        row: name
          ? {
              said: name.querySelector(".sr-only")?.textContent?.trim() ?? "",
              failInk: read(name)?.failInk ?? false,
            }
          : {
              said: "",
              failInk: false,
              rows: [
                ...document.querySelectorAll<HTMLElement>("[data-session-row]"),
              ].map((one) => one.dataset.sessionRow),
            },
        tab: glyph(
          document.querySelector(
            `[data-session-tab="${session}"] [data-slot="session-status"]`
          )
        ),
        head: glyph(
          document.querySelector(`${card} [data-slot="session-status"]`)
        ),
        // The card's account line while it waits (SessionDetails.svelte `feedback`).
        card: read(
          document.querySelector(
            `${card} [data-slot="feedback"][role="status"]`
          )
        ),
        transcript: read(live?.querySelector('[data-slot="words"]')),
        line: read(live?.querySelector("button")),
        alerts: document.querySelectorAll(
          '.group\\/move [role="alert"], [data-slot="stop"][role="alert"]'
        ).length,
        failed: document.querySelectorAll('[data-session-status-tone="failed"]')
          .length,
        chip:
          document
            .querySelector(
              `${card} [data-slot="settings"] [data-account-chip] [data-slot="chip-label"]`
            )
            ?.textContent?.trim() ?? null,
      };
    },
    { session: id, card: CARD }
  );

/** Session `id`'s row in the rail, once the rail has drawn it, as {@link waitShown} reads it. */
const railRowOf = async (page: Page, base: string, id: string) => {
  await open(
    page,
    `${base}/session/${id}`,
    `[data-session-row="${id}"]`,
    120_000
  ).catch(() => undefined);
  return (await waitShown(page, id)).row;
};

const pickLeg = async (kit: Kit, fleet: KitFleet): Promise<void> => {
  await route(fleet, false);
  // In a project, as the owner's own sessions are: the rail lists a
  // session under its project.
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Limits",
    machineId: MACHINE,
    cwd: fleet.repo,
    caw: false,
  });
  const id = await fleet.spawn("claude", "Limit pick", fleet.repo, {
    account: A,
    projectId: project.id,
  });
  await fleet.send(id, `${markOf("pick")}: start the long wait`);
  await until(
    "pick: its first turn answered, the command left running",
    () =>
      worked.has("pick") && fleet.instance(id)?.turn_open_at === null ? 1 : 0,
    Boolean,
    120_000
  );
  limited.pick = Date.now() + 20 * MINUTE;
  await fleet.send(id, `${markOf("pick")}: and the next thing`);
  const held = await until(
    "pick: its row says it is stopped",
    () => boardRow(fleet, id),
    (one) => !!one?.stalled,
    120_000
  ).catch(() => boardRow(fleet, id));
  const atA = `${HELD.at(NAME[A])} · ${HELD.resetsIn("")}`;
  kit.check(
    "pick: refused on A with moving off, its row says it is at A's limit, counting down to A's reset",
    !!held?.stalled?.words.startsWith(atA) &&
      held.stalled.held?.kind === "waiting",
    JSON.stringify(held?.stalled ?? null)
  );
  const base = await fleet.dashboard();
  const page = await kit.page("desk");
  const railRow = () => railRowOf(page, base, id);
  const row = await railRow();
  await openCard(page, base, id);
  const shown = await until(
    "pick: the page shows the wait",
    () => waitShown(page, id),
    (one) => !!one.transcript && !!one.card,
    30_000
  ).catch(() => waitShown(page, id));
  kit.check(
    "pick: it waits, never a failure: its rail row is read out at its limit, its tab and card head wear the at-limit status, its card's account line and its transcript line say it at A's limit as a status, none an alert, nothing in the failure ink",
    row.said.startsWith(HELD.status) &&
      !row.failInk &&
      shown.tab?.tone === "held" &&
      shown.tab.label === HELD.status &&
      shown.head?.tone === "held" &&
      !!shown.card?.text.startsWith(atA) &&
      !shown.card.failInk &&
      !!shown.transcript?.text.startsWith(atA) &&
      !shown.transcript.failInk &&
      !!shown.line &&
      !shown.line.failInk &&
      shown.alerts === 0 &&
      shown.failed === 0,
    JSON.stringify({ ...shown, row })
  );
  // The pick, from the card's account chip; the chip is read every 100 ms
  // from then until the hub's row names B.
  const pickedAt = Date.now();
  await page
    .locator(`${CARD} [data-slot="settings"] [data-account-chip][data-tool]`)
    .first()
    .click();
  await page
    .locator(`[data-account-option="${B}"]`)
    .filter({ visible: true })
    .first()
    .click({ timeout: 10_000 });
  // Sampled for 5 s from the pick, past the move landing, so a chip that
  // went back to A after it would be seen; the card is held open by its tab.
  const chips: string[] = [];
  const owed: string[] = [];
  while (Date.now() - pickedAt < 5000) {
    // biome-ignore lint/performance/noAwaitInLoops: one sample of the chip at a time
    const now = await waitShown(page, id);
    if (now.chip) {
      chips.push(now.chip);
    } else {
      await page
        .locator(`[data-session-tab="${id}"]`)
        .filter({ visible: true })
        .first()
        .hover();
    }
    const waits = (await boardRow(fleet, id))?.owedMove?.waits;
    if (waits) {
      owed.push(waits);
    }
    await Bun.sleep(100);
  }
  const onB = await until(
    "pick: it runs on B",
    () => seenOf(fleet, "pick", pickedAt).find((one) => onAccount(one, B)),
    Boolean,
    60_000
  ).catch(() => undefined);
  kit.check(
    "pick: picked from its card, it moves to B at once, though its background command still ran, and the chip never goes back to A",
    !!onB &&
      onB.at - pickedAt <= MOVE_WITHIN_MS &&
      rowAccount(fleet, id) === B &&
      chips.length > 0 &&
      chips.every((one) => one === NAME[B]) &&
      !owed.includes("turn"),
    `${onB ? `first request on B ${onB.at - pickedAt} ms after the pick` : "nothing on B"}; account ${rowAccount(fleet, id)}; chip samples ${JSON.stringify([...new Set(chips)])} of ${chips.length}; owed waits seen ${JSON.stringify([...new Set(owed)])}`
  );
  const told = await until(
    "pick: told on B what the move ended",
    () =>
      seenOf(fleet, "pick", pickedAt).find(
        (one) => onAccount(one, B) && one.all.includes(ENDED)
      ),
    Boolean,
    60_000
  ).catch(() => undefined);
  kit.check(
    "pick: on B it reads that the move ended its background command, its earlier turns with it",
    !!told && told.body.includes(memoryOf("pick")),
    told
      ? `told ${told.at - pickedAt} ms after the pick`
      : `B's requests: ${JSON.stringify(seenOf(fleet, "pick", pickedAt).map((one) => [accountOf(one), one.last.slice(0, 120)]))}`
  );
  const after = await until(
    "pick: the wait goes",
    async () => ({
      row: await boardRow(fleet, id),
      page: await waitShown(page, id),
    }),
    (one) =>
      !(
        one.row?.stalled ||
        one.page.transcript ||
        one.page.row?.said.startsWith(HELD.status)
      ),
    30_000
  ).catch(async () => ({
    row: await boardRow(fleet, id),
    page: await waitShown(page, id),
  }));
  const rowAfter = await railRow();
  kit.check(
    "pick: once on B, its row, head and transcript no longer show the wait",
    !(
      after.row?.stalled ||
      after.page.transcript ||
      rowAfter.said.startsWith(HELD.status) ||
      rowAfter.failInk
    ) && after.page.tab?.tone !== "held",
    JSON.stringify({
      stalled: after.row?.stalled ?? null,
      page: after.page,
      row: rowAfter,
    })
  );
};

/** Waits until A no longer refuses `leg`'s session, so the next leg's session is placed on A and moved by nothing before its own refusal. */
const aFreeAfter = async (leg: Leg): Promise<void> => {
  await Bun.sleep(Math.max(0, limited[leg] + 5000 - Date.now()));
};

const run = async (kit: Kit) => {
  const fleet = await standUp(kit);
  await moveLeg(kit, fleet);
  await fullLeg(kit, fleet);
  await aFreeAfter("full");
  await heldLeg(kit, fleet);
  await aFreeAfter("held");
  await compactLeg(kit, fleet);
  await route(fleet, true);
  await aFreeAfter("compact");
  await laterLeg(kit, fleet);
  await aFreeAfter("later");
  await pickLeg(kit, fleet);
};

export default {
  name: "limit-pick",
  run,
} satisfies Spec;
