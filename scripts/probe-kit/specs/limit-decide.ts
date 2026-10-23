/**
 * The at-limit decision is one pure pass (hub at-limit.ts `decideStop`):
 * every account's readings, the ledger, organizations, the session's cache
 * expiry and real context, and who waits on it go in; a move (the accounts
 * that fit, best first) or a wait (why, until when, every account's reason)
 * comes out. No account is tried and failed in turn. Fixtures in, decision
 * out: nothing stands up, nothing is read but the inputs (the design's legs
 * 1-5, 7-10, 12 and 13; the herd, 6, and the fallback, 14, run through the
 * controller in limit-admission, the later-work leg, 11, live in limit-pick).
 *
 * The 11:39 and 17:44 legs replay 2026-10-22 from the hub's journal and the
 * accounts as they stood (`$TMPDIR/inputs` of the brief): "Waiting for
 * rand@petralab.ai to reset · 3h 51m. No other account has room for it"
 * beside bewinxed@ (another organization) at 3%, and "Waiting … · 1d 5h"
 * beside marketing@ at 2%, the context priced as a turn's sum (7,962k).
 *
 *   bun scripts/probe-kit/run.ts limit-decide
 */
import {
  type AccountMove,
  accountMoveWords,
  costForUsage,
  type NamedAccount,
} from "../../../packages/core/src";
import {
  decideStop,
  type StopAccount,
  type StopDecision,
  type StopInput,
  type StopSession,
} from "../../../packages/hub/src/at-limit";
import type { Kit, Spec } from "../kit";

const MODEL = "claude-opus-5-5";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WINDOW = 1_000_000;
/** 2026-10-22 11:39 in the owner's time (+03:00), as the journal's lines stand. */
const AT_1139 = Date.parse("2026-10-22T11:39:10+03:00");
const AT_1744 = Date.parse("2026-10-22T17:44:51+03:00");
const NOW = AT_1139;

const PETRALAB = "Petralab";
const OTHER_ORG = "bewinxed@petralab.ai's Organization";
const OMAR = "Omar Al Matar";

/** A window of an account as placement reads it. */
const win = (
  kind: "session" | "weekly_all",
  utilization: number,
  resetsAt: number,
  pace: number | null = null,
  tokensPerPct: number | null = null
) => ({
  kind,
  scopeLabel: null,
  utilization,
  resetsAt: new Date(resetsAt).toISOString(),
  pace,
  tokensPerPct,
});

/** An account with room, read, signed in, measured: `over` says how it differs. */
const account = (
  id: string,
  organization: string | null,
  order: number,
  over: Partial<StopAccount> = {},
  now = NOW
): StopAccount => ({
  id,
  organization,
  order,
  createdAt: order,
  neverBackup: false,
  signedIn: true,
  notAllowedBy: null,
  read: true,
  benchedUntil: null,
  pastReserve: null,
  backAt: null,
  windows: [
    win("session", 10, now + 3 * HOUR),
    win("weekly_all", 10, now + 4 * DAY),
  ],
  arrivals: [],
  usdPerPct: 1.17,
  spentPct: 0,
  pendingPct: 0,
  pendingMoves: 0,
  proven: false,
  ...over,
});

/** An account at its 5-hour limit until `until`. */
const atLimit = (
  id: string,
  organization: string | null,
  order: number,
  until: number,
  now = NOW
): StopAccount =>
  account(
    id,
    organization,
    order,
    {
      windows: [
        win("session", 100, until),
        win("weekly_all", 40, now + 4 * DAY),
      ],
      backAt: until,
    },
    now
  );

const session = (over: Partial<StopSession> = {}): StopSession => ({
  id: "session",
  model: MODEL,
  context: 300_000,
  window: WINDOW,
  cacheTtl: "1h",
  cacheExpiresAt: null,
  burn: null,
  forked: false,
  compactable: true,
  presence: "driven",
  handMove: null,
  ...over,
});

const input = (over: Partial<StopInput> = {}): StopInput => ({
  now: NOW,
  cause: "limit",
  policy: { move: true, waitMinutes: 15, moveWholeUnderK: 600 },
  strategy: { kind: "soonest-reset", pinned: null, prefers: null },
  session: session(),
  current: { id: "rand", organization: PETRALAB, resetAt: NOW + 3 * HOUR },
  accounts: [],
  ...over,
});

/** What re-reading `tokens` costs, cold (a 1-hour write) or from a carried cache. */
const price = (tokens: number, carried: boolean, now = NOW): number =>
  costForUsage(
    MODEL,
    carried
      ? {
          input: 0,
          output: 0,
          reasoning: 0,
          cacheCreation: 0,
          cacheRead: tokens,
        }
      : {
          input: 0,
          output: 0,
          reasoning: 0,
          cacheCreation: tokens,
          cacheCreation1h: tokens,
          cacheRead: 0,
        },
    now
  ) ?? Number.NaN;

const close = (a: number | null | undefined, b: number): boolean =>
  a !== null && a !== undefined && Math.abs(a - b) < 1e-9;

/** The waiting line a hold of `decision` writes (at-limit.ts `hold`), each account named by its id. */
const waitingLine = (
  decision: Extract<StopDecision, { action: "wait" }>,
  current: string
): AccountMove => {
  const named = (id: string): NamedAccount => ({
    id,
    name: `${id}@`,
    hue: "blue",
  });
  return {
    kind: "waiting",
    account: named(current),
    ...(decision.frees ? { frees: named(decision.frees) } : {}),
    accounts: decision.accounts.map((one) => ({
      account: named(one.accountId),
      reason: one.reason,
      ...(one.backAt === undefined ? {} : { backAt: one.backAt }),
    })),
    until: decision.until,
    why:
      decision.why === "hand" || decision.why === "warm"
        ? "full"
        : decision.why,
    tokens: decision.tokens,
  };
};

/** A moment as the hub's words say it (core accounts.ts `clockWords`). */
const clockOf = (at: number): string =>
  new Date(at).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

const brief = (decision: StopDecision): string =>
  decision.action === "move"
    ? `move ${decision.targets.map((one) => `${one.accountId}${one.carries ? "(carries)" : ""}${one.compact ? "(compact)" : ""}`).join(" > ")}; ${decision.tokens} tokens`
    : `wait ${decision.why} until ${clockOf(decision.until)}${decision.frees ? ` for ${decision.frees}` : ""}; ${decision.accounts.map((one) => `${one.accountId}:${one.reason.kind}`).join(", ")}`;

/** 1. One organization, its cache warm: it moves at once, its cache carried, priced warm, whole. */
const warmLeg = (kit: Kit) => {
  const decision = decideStop(
    input({
      session: session({ cacheExpiresAt: NOW + 30 * MINUTE }),
      accounts: [
        account("jude", PETRALAB, 2, {
          windows: [
            win("session", 40, NOW + 2 * HOUR),
            win("weekly_all", 20, NOW + 4 * DAY),
          ],
        }),
      ],
    })
  );
  const first = decision.action === "move" ? decision.targets[0] : undefined;
  kit.check(
    "1 warm: a same-organization account fits and the cache is warm: it moves there at once, its cache carried, not compacted, priced at the warm read",
    !!first &&
      first.accountId === "jude" &&
      first.carries &&
      !first.compact &&
      close(first.moveUsd, price(300_000, true)),
    `${brief(decision)}; moveUsd ${first?.moveUsd} against warm ${price(300_000, true)}`
  );
};

/** 2. One organization, its cache cold: priced cold, compacted when at or over the floor. */
const coldSameOrgLeg = (kit: Kit) => {
  const jude = account("jude", PETRALAB, 2);
  const large = decideStop(
    input({ session: session({ context: 700_000 }), accounts: [jude] })
  );
  const small = decideStop(input({ accounts: [jude] }));
  const big = large.action === "move" ? large.targets[0] : undefined;
  const little = small.action === "move" ? small.targets[0] : undefined;
  kit.check(
    "2 cold: one organization with its cache cold moves priced cold, compacted at 700k (over the 600k floor), whole at 300k",
    !!big &&
      !big.carries &&
      big.compact &&
      close(big.moveUsd, price(700_000, false)) &&
      !!little &&
      !little.carries &&
      !little.compact &&
      close(little.moveUsd, price(300_000, false)),
    `${brief(large)} ($${big?.moveUsd?.toFixed(2)}); ${brief(small)} ($${little?.moveUsd?.toFixed(2)})`
  );
};

/** 3. Only other organizations, its own reset before its cache lapses: a driven one waits free, a watched one moves cold. */
const freeLeg = (kit: Kit) => {
  const other = [account("bewinxed", OTHER_ORG, 6)];
  const base = {
    current: { id: "rand", organization: PETRALAB, resetAt: NOW + 40 * MINUTE },
    accounts: other,
  };
  const driven = decideStop(
    input({ ...base, session: session({ cacheExpiresAt: NOW + 55 * MINUTE }) })
  );
  const watched = decideStop(
    input({
      ...base,
      session: session({
        cacheExpiresAt: NOW + 55 * MINUTE,
        presence: "watched",
      }),
    })
  );
  const words =
    driven.action === "wait"
      ? accountMoveWords(waitingLine(driven, "rand"), NOW).detail
      : "";
  kit.check(
    "3 free, driven: only another organization fits and its own reset (40 min) comes before its cache lapses (55 min): it waits, for nothing, and says so",
    driven.action === "wait" &&
      driven.why === "free" &&
      driven.waitUsd === 0 &&
      driven.until === NOW + 40 * MINUTE &&
      words.startsWith(
        "Its cache lasts past the reset, so waiting costs nothing · moving would re-read 300k tokens cold"
      ),
    `${brief(driven)}; ${JSON.stringify(words)}`
  );
  const first = watched.action === "move" ? watched.targets[0] : undefined;
  kit.check(
    "3 free, watched: the same with a person waiting on it, the reset further than the policy's 15 minutes: it moves cold",
    !!first && first.accountId === "bewinxed" && !first.carries,
    brief(watched)
  );
};

/** 4. Its own reset within the policy's wait: it waits, `soon`, and says the reset is near. */
const soonLeg = (kit: Kit) => {
  const decision = decideStop(
    input({
      current: {
        id: "rand",
        organization: PETRALAB,
        resetAt: NOW + 9 * MINUTE,
      },
      accounts: [account("bewinxed", OTHER_ORG, 6)],
    })
  );
  const words =
    decision.action === "wait"
      ? accountMoveWords(waitingLine(decision, "rand"), NOW).detail
      : "";
  kit.check(
    "4 soon: its own account resets in 9 min, inside the 15 the policy waits: it waits for that reset, in the design's words",
    decision.action === "wait" &&
      decision.why === "soon" &&
      decision.until === NOW + 9 * MINUTE &&
      words.startsWith(
        "rand@ resets in 9 min, sooner than re-reading 300k tokens elsewhere is worth"
      ),
    `${brief(decision)}; ${JSON.stringify(words)}`
  );
};

/** 5. No account can take it: it waits until the soonest back, that account named, every account's reason listed. */
const fullLeg = (kit: Kit) => {
  const designBack = NOW + 41 * MINUTE;
  const accounts = [
    atLimit("jude", PETRALAB, 2, NOW + 2 * HOUR + 21 * MINUTE),
    account("design", PETRALAB, 4, {
      benchedUntil: designBack,
      backAt: designBack,
    }),
    account("marketing", PETRALAB, 5, {
      pastReserve: 80,
      backAt: NOW + 3 * DAY,
      windows: [
        win("session", 20, NOW + 3 * HOUR),
        win("weekly_all", 85, NOW + 3 * DAY),
      ],
    }),
    account("gmail", OMAR, 0, { read: false, windows: [] }),
    account("petra", PETRALAB, 1, { notAllowedBy: "project" }),
    account("other", OTHER_ORG, 6, { signedIn: false }),
  ];
  const decision = decideStop(input({ accounts }));
  const words =
    decision.action === "wait"
      ? accountMoveWords(waitingLine(decision, "rand"), NOW).detail
      : "";
  const kinds =
    decision.action === "wait"
      ? Object.fromEntries(
          decision.accounts.map((one) => [one.accountId, one.reason.kind])
        )
      : {};
  kit.check(
    "5 full: every account at its limit, benched, past its reserve, unread, not allowed or not signed in: it waits until the soonest back (design@'s bench, before its own reset), naming it, with every account's reason",
    decision.action === "wait" &&
      decision.why === "full" &&
      decision.until === designBack &&
      decision.frees === "design" &&
      JSON.stringify(kinds) ===
        JSON.stringify({
          jude: "limit",
          design: "benched",
          marketing: "reserve",
          gmail: "unread",
          petra: "allowed",
          other: "signin",
        }),
    `${brief(decision)}`
  );
  kit.check(
    '5 full: its words name each account\'s reason and where it moves, never "No other account has room"',
    words ===
      [
        "No account can take it now",
        `jude@ at its limit until ${clockOf(NOW + 2 * HOUR + 21 * MINUTE)}`,
        `design@ benched until ${clockOf(designBack)}`,
        "marketing@ past its 80% reserve",
        "gmail@ limits unread",
        "petra@ not allowed by this project",
        "other@ not signed in here",
        `it moves to design@ at ${clockOf(designBack)}, before rand@ resets`,
      ].join(" · "),
    JSON.stringify(words)
  );
};

/**
 * The accounts at 11:39 (accounts.txt, journal 09:51-11:39), for a session
 * on rand@ (Petralab), refused until 15:30.
 */
const accountsAt1139 = (): StopAccount[] => [
  atLimit("jude", PETRALAB, 2, Date.parse("2026-10-22T14:00:00+03:00")),
  atLimit("marketing", PETRALAB, 5, Date.parse("2026-10-22T12:20:00+03:00")),
  atLimit(
    "bewinxed-petralab",
    PETRALAB,
    1,
    Date.parse("2026-10-22T13:20:00+03:00")
  ),
  // design@ read 99%, its 5-hour window running at 4% an hour.
  account("design", PETRALAB, 4, {
    windows: [
      win("session", 99, Date.parse("2026-10-22T12:10:00+03:00"), 4, 2_000_000),
      win("weekly_all", 60, NOW + 4 * DAY),
    ],
    usdPerPct: 1.17,
  }),
  account("gmail", OMAR, 0, { read: false, windows: [] }),
  // bewinxed@ in its own organization read 3%, $3.42 a percent.
  account("bewinxed", OTHER_ORG, 6, {
    windows: [
      win("session", 3, Date.parse("2026-10-22T16:00:00+03:00"), 1, 2_000_000),
      win("weekly_all", 30, NOW + 6 * DAY),
    ],
    usdPerPct: 3.42,
  }),
];

/** Charges `decision`'s move onto the accounts as the controller does before the next decision: its percent pending, its burn arriving. */
const charged = (
  accounts: StopAccount[],
  decision: StopDecision,
  instanceId: string,
  burn: number
): StopAccount[] => {
  const first = decision.action === "move" ? decision.targets[0] : undefined;
  return accounts.map((one) =>
    first && one.id === first.accountId
      ? {
          ...one,
          pendingPct: (one.pendingPct ?? 0) + (first.movePct ?? 0),
          pendingMoves: one.pendingMoves + 1,
          arrivals: [
            ...one.arrivals,
            { accountId: one.id, burn, instanceId, since: NOW },
          ],
        }
      : one
  );
};

/** 7. The 11:39 replay. */
const replay1139Leg = (kit: Kit) => {
  const policy = { move: true, waitMinutes: 15, moveWholeUnderK: 600 };
  const current = {
    id: "rand",
    organization: PETRALAB,
    resetAt: Date.parse("2026-10-22T15:30:00+03:00"),
  };
  // Orchestrate: a person waits on it, its cache lapses at 12:37.
  const orchestrate = session({
    id: "orchestrate",
    context: 2_821_000,
    cacheExpiresAt: Date.parse("2026-10-22T12:37:00+03:00"),
    presence: "watched",
    burn: 2_000_000,
  });
  // Wash canvas: a delegate's, its cache cold.
  const wash = session({
    id: "wash",
    context: 21_023_000,
    cacheExpiresAt: null,
    presence: "driven",
    burn: 2_000_000,
  });
  const first = decideStop(
    input({ policy, current, session: orchestrate, accounts: accountsAt1139() })
  );
  const second = decideStop(
    input({
      policy,
      current,
      session: wash,
      accounts: charged(accountsAt1139(), first, "orchestrate", 2_000_000),
    })
  );
  const reasonOf = (decision: StopDecision, id: string) =>
    decision.accounts.find((one) => one.accountId === id)?.reason;
  const target = (decision: StopDecision) =>
    decision.action === "move" ? decision.targets[0] : undefined;
  const design = reasonOf(first, "design");
  kit.check(
    '7 11:39: design@ (one organization, 99%) is left out though its cache would carry, as it runs out within the policy\'s wait ("1% left, runs out by …")',
    design?.kind === "runsOut" && Math.floor(design.leftPct) === 1,
    JSON.stringify(design)
  );
  kit.check(
    "7 11:39: both sessions move to bewinxed@ (another organization, 3%), cold, compacted, each priced at its model's window, not its turn's sum",
    target(first)?.accountId === "bewinxed" &&
      target(second)?.accountId === "bewinxed" &&
      !target(first)?.carries &&
      target(first)?.compact === true &&
      first.tokens === WINDOW &&
      second.tokens === WINDOW,
    `${brief(first)}; ${brief(second)}`
  );
  const onto = target(first);
  const then = target(second);
  kit.check(
    "7 11:39: both fit after each other's charge: the second decision sees the first's move pending on bewinxed@ and still has room after its own",
    !!onto &&
      !!then &&
      onto.roomAfter > 0 &&
      then.roomAfter > 0 &&
      close(onto.roomAfter - then.roomAfter, then.movePct ?? Number.NaN),
    `bewinxed@ after the first ${onto?.roomAfter.toFixed(1)}% left, after the second ${then?.roomAfter.toFixed(1)}%; each move ${onto?.movePct?.toFixed(2)}%, ${then?.movePct?.toFixed(2)}%`
  );
};

/** 8. The 17:44 replay. */
const replay1744Leg = (kit: Kit) => {
  const now = AT_1744;
  const weekReset = Date.parse("2026-10-23T23:00:00+03:00");
  const accounts: StopAccount[] = [
    atLimit("gmail", OMAR, 0, now + 2 * HOUR, now),
    atLimit("bewinxed-petralab", PETRALAB, 1, now + 3 * HOUR, now),
    // jude@ read 70%, proven, its window running at 15% an hour: it runs out before its reset.
    account(
      "jude",
      PETRALAB,
      2,
      {
        windows: [
          win("session", 70, now + 4 * HOUR, 15, 2_000_000),
          win("weekly_all", 40, now + 4 * DAY),
        ],
        usdPerPct: 1.94,
        proven: true,
      },
      now
    ),
    atLimit("rand", PETRALAB, 3, now + 2 * HOUR, now),
    account(
      "design",
      PETRALAB,
      4,
      {
        windows: [
          win("session", 96, now + 2 * HOUR, 20, 2_000_000),
          win("weekly_all", 50, now + 4 * DAY),
        ],
      },
      now
    ),
    // marketing@ read 2%, not proven, lasting.
    account(
      "marketing",
      PETRALAB,
      5,
      {
        windows: [
          win("session", 2, now + 5 * HOUR, 2, 2_000_000),
          win("weekly_all", 10, now + 4 * DAY),
        ],
        usdPerPct: 1.09,
      },
      now
    ),
  ];
  const decision = decideStop(
    input({
      now,
      strategy: { kind: "pinned", pinned: "gmail", prefers: null },
      current: { id: "bewinxed", organization: OTHER_ORG, resetAt: weekReset },
      session: session({
        id: "orchestrate",
        context: 7_962_000,
        cacheExpiresAt: null,
        presence: "watched",
      }),
      accounts,
    })
  );
  const targets = decision.action === "move" ? decision.targets : [];
  const order = targets.map((one) => one.accountId);
  const jude = targets.find((one) => one.accountId === "jude");
  kit.check(
    "8 17:44: in an organization of its own, its week resetting in 29h, it moves at once to marketing@ (2%, lasting), never waiting",
    decision.action === "move" &&
      order[0] === "marketing" &&
      weekReset - now > 29 * HOUR,
    `${brief(decision)}; its reset in ${((weekReset - now) / HOUR).toFixed(1)}h`
  );
  kit.check(
    "8 17:44: proven jude@ (70%, running out) comes after marketing@, which lasts; the pin's fill-first order would have put jude@ first",
    order.indexOf("jude") > order.indexOf("marketing") &&
      jude?.lasts === false &&
      targets[0]?.lasts === true,
    `order ${order.join(" > ")}; jude lasts ${jude?.lasts}, runs out ${jude?.runsOutAt ? clockOf(jude.runsOutAt) : "never"}`
  );
  kit.check(
    "8 17:44: its 7,962k (a turn's sum) is priced at the 1M window: $8.00 cold, ≈4.1% of jude@'s window at $1.94",
    decision.tokens === WINDOW &&
      close(jude?.moveUsd ?? null, price(WINDOW, false, now)) &&
      Math.abs((jude?.moveUsd ?? 0) / 1.94 - 4.12) < 0.05,
    `${decision.tokens} tokens, $${jude?.moveUsd?.toFixed(2)}, ${((jude?.moveUsd ?? 0) / 1.94).toFixed(2)}% of jude@'s window`
  );
};

/** 9. The context priced: over the window or never reported, at the window; a turn's sum never reaches the price. */
const contextLeg = (kit: Kit) => {
  const accounts = [account("bewinxed", OTHER_ORG, 6, { usdPerPct: 3.42 })];
  const tokensOf = (asked: Partial<StopSession>) => {
    const decision = decideStop(input({ session: session(asked), accounts }));
    const first = decision.action === "move" ? decision.targets[0] : undefined;
    return { tokens: decision.tokens, usd: first?.moveUsd ?? null };
  };
  const over = tokensOf({ context: 7_962_000 });
  const never = tokensOf({ context: null });
  const within = tokensOf({ context: 412_000 });
  const unknown = tokensOf({ context: 412_000, window: null });
  kit.check(
    "9 context: 7,962k and a context never reported are priced at the 1M window ($8.00), 412k at itself, and with no window known at what was reported",
    over.tokens === WINDOW &&
      close(over.usd, price(WINDOW, false)) &&
      never.tokens === WINDOW &&
      within.tokens === 412_000 &&
      close(within.usd, price(412_000, false)) &&
      unknown.tokens === 412_000,
    JSON.stringify({ over, never, within, unknown })
  );
};

/** 10. A fork waits, the policy off waits, a person's move to a full account waits until it is back. */
const holdsLeg = (kit: Kit) => {
  const accounts = [
    account("bewinxed", OTHER_ORG, 6),
    atLimit("jude", PETRALAB, 2, NOW + 2 * HOUR),
  ];
  const fork = decideStop(
    input({ session: session({ forked: true }), accounts })
  );
  const off = decideStop(
    input({
      policy: { move: false, waitMinutes: 15, moveWholeUnderK: 600 },
      accounts,
    })
  );
  const hand = decideStop(
    input({ session: session({ handMove: "jude" }), accounts })
  );
  const handFree = decideStop(
    input({ session: session({ handMove: "bewinxed" }), accounts })
  );
  kit.check(
    "10 holds: a fork waits (`fork`), the policy off waits (`off`), a person's move to jude@ at its limit waits until jude@ is back, and one to bewinxed@ goes there only",
    fork.action === "wait" &&
      fork.why === "fork" &&
      off.action === "wait" &&
      off.why === "off" &&
      hand.action === "wait" &&
      hand.why === "hand" &&
      hand.until === NOW + 2 * HOUR &&
      handFree.action === "move" &&
      handFree.targets.length === 1 &&
      handFree.targets[0]?.accountId === "bewinxed",
    [fork, off, hand, handFree].map(brief).join("; ")
  );
};

/** 12. A rebalance: a wait means it stays. */
const forecastLeg = (kit: Kit) => {
  const runsOut = NOW + 2 * HOUR;
  const base = {
    cause: "forecast" as const,
    current: { id: "rand", organization: PETRALAB, resetAt: runsOut },
  };
  const warm = NOW + 50 * MINUTE;
  const sameOrg = decideStop(
    input({
      ...base,
      session: session({ cacheExpiresAt: warm }),
      accounts: [account("jude", PETRALAB, 2)],
    })
  );
  const crossWarm = decideStop(
    input({
      ...base,
      session: session({ cacheExpiresAt: warm, context: 900_000 }),
      accounts: [account("bewinxed", OTHER_ORG, 6)],
    })
  );
  const crossCold = decideStop(
    input({
      ...base,
      session: session({ cacheExpiresAt: null, context: 900_000 }),
      accounts: [account("bewinxed", OTHER_ORG, 6)],
    })
  );
  const sameOrgShort = decideStop(
    input({
      ...base,
      session: session({ cacheExpiresAt: warm, burn: 4_000_000 }),
      accounts: [
        account("jude", PETRALAB, 2, {
          windows: [
            win("session", 80, NOW + 4 * HOUR, 10, 1_000_000),
            win("weekly_all", 20, NOW + 4 * DAY),
          ],
        }),
      ],
    })
  );
  kit.check(
    "12 forecast: a same-organization account that lasts takes it, its cache carried",
    sameOrg.action === "move" &&
      sameOrg.targets[0]?.accountId === "jude" &&
      sameOrg.targets[0].carries,
    brief(sameOrg)
  );
  kit.check(
    "12 forecast: one that would run out (80%, 10%/h, its burn on top) does not, though its cache would carry",
    sameOrgShort.action === "wait",
    brief(sameOrgShort)
  );
  kit.check(
    "12 forecast: another organization with its cache warm, driven, stays (`warm`); with its cache cold, it moves",
    crossWarm.action === "wait" &&
      crossWarm.why === "warm" &&
      crossCold.action === "move" &&
      crossCold.targets[0]?.accountId === "bewinxed" &&
      !crossCold.targets[0].compact,
    `${brief(crossWarm)}; ${brief(crossCold)}`
  );
};

/** Freezes `value` and everything under it: a write into it throws. */
const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object") {
    for (const one of Object.values(value)) {
      deepFreeze(one);
    }
    Object.freeze(value);
  }
  return value;
};

/** 13. Purity: the same input gives the same decision; nothing is read or written. */
const purityLeg = (kit: Kit) => {
  const fixture = () =>
    input({
      session: session({
        cacheExpiresAt: Date.parse("2026-10-22T12:37:00+03:00"),
        presence: "watched",
        burn: 2_000_000,
        context: 2_821_000,
      }),
      current: {
        id: "rand",
        organization: PETRALAB,
        resetAt: Date.parse("2026-10-22T15:30:00+03:00"),
      },
      accounts: accountsAt1139(),
    });
  const frozen = deepFreeze(fixture());
  const touched: string[] = [];
  const g = globalThis as unknown as Record<string, unknown>;
  const consoled = console as unknown as Record<string, unknown>;
  const bun = Bun as unknown as Record<string, unknown>;
  const traps: [Record<string, unknown>, string][] = [
    [Date as unknown as Record<string, unknown>, "now"],
    [Math as unknown as Record<string, unknown>, "random"],
    [g, "fetch"],
    [g, "setTimeout"],
    [g, "queueMicrotask"],
    [performance as unknown as Record<string, unknown>, "now"],
    [bun, "file"],
    [bun, "write"],
    [bun, "spawn"],
    [consoled, "log"],
    [consoled, "info"],
    [consoled, "warn"],
    [consoled, "error"],
  ];
  const saved = traps.map(([on, key]) => on[key]);
  for (const [on, key] of traps) {
    on[key] = () => {
      touched.push(key);
      throw new Error(`decideStop called ${key}`);
    };
  }
  let first: StopDecision | undefined;
  let second: StopDecision | undefined;
  let thrown: unknown;
  try {
    first = decideStop(frozen);
    second = decideStop(frozen);
  } catch (error) {
    thrown = error;
  } finally {
    traps.forEach(([on, key], at) => {
      on[key] = saved[at];
    });
  }
  const third = decideStop(fixture());
  kit.check(
    "13 purity: on a frozen input, with the clock, randomness, timers, network, files, processes and the console all trapped, it decides twice the same and touches none of them; a fresh copy of the input decides the same again",
    thrown === undefined &&
      touched.length === 0 &&
      JSON.stringify(first) === JSON.stringify(second) &&
      JSON.stringify(first) === JSON.stringify(third),
    thrown
      ? `threw ${String(thrown)}; touched ${touched.join(", ")}`
      : brief(first as StopDecision)
  );
};

const run = async (kit: Kit): Promise<void> => {
  warmLeg(kit);
  coldSameOrgLeg(kit);
  freeLeg(kit);
  soonLeg(kit);
  fullLeg(kit);
  replay1139Leg(kit);
  replay1744Leg(kit);
  contextLeg(kit);
  holdsLeg(kit);
  forecastLeg(kit);
  purityLeg(kit);
  await Promise.resolve();
};

export default { name: "limit-decide", run } satisfies Spec;
