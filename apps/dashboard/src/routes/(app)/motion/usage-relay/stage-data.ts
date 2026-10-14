/**
 * The usage benches' staged forecast as plain data, with no hub and no
 * Svelte: six accounts, five in Petralab (a group) and one in Omar Al Matar
 * (ungrouped); twenty adds Northwind's four (a group) and Acme's two
 * (ungrouped). The web benches stand it in for the hub's (`stage.ts`), and
 * the iOS usage probe's scratch hub serves it (scripts/stage-ios-usage.ts),
 * so both draw the same forecast.
 */
import type {
  Account,
  AccountForecast,
  CarrySpan,
  InstanceRow,
  LimitWindow,
  ProviderForecast,
  ProviderRouting,
} from "@cawco/core";

const MIN = 60_000;
const HOUR = 60 * MIN;

/**
 * Each account's stored hue, as the owner's were assigned when there were
 * five: past five they repeat (bewinxed@gmail.com wears design@'s amber),
 * and an existing account keeps its hue; the rings' shownHues tells them
 * apart.
 */
const HUES = ["amber", "blue", "cyan", "green", "orange"] as const;

interface Seed {
  email: string;
  five: number;
  fiveResets: number;
  seenAgo: number;
  week: number;
  /** Its week's pace while it runs sessions, percent an hour (0.5 else). */
  weekPace?: number;
  weekResets: number;
}
/** A running account's 5-hour pace, percent an hour. */
const FIVE_PACE = 18;
const WEEK_PACE = 0.5;

/** The screenshot's six, in fill-first order. */
const SIX: Seed[] = [
  {
    email: "design@petralab.ai",
    five: 71,
    fiveResets: 1.6 * HOUR,
    week: 38,
    weekResets: 52 * HOUR,
    seenAgo: 2 * MIN,
  },
  {
    email: "bewinxed@petralab.ai",
    five: 22,
    fiveResets: 3.2 * HOUR,
    week: 54,
    weekResets: 75 * HOUR,
    seenAgo: 4 * MIN,
  },
  {
    email: "jude@petralab.ai",
    five: 35,
    fiveResets: 2.4 * HOUR,
    week: 41,
    weekResets: 98 * HOUR,
    seenAgo: 100 * MIN,
  },
  {
    email: "marketing@petralab.ai",
    five: 8,
    fiveResets: 4.1 * HOUR,
    week: 63,
    weekResets: 30 * HOUR,
    seenAgo: 9 * MIN,
  },
  {
    email: "rand@petralab.ai",
    five: 100,
    fiveResets: 4 * HOUR + 50 * MIN,
    week: 72,
    weekResets: 120 * HOUR,
    seenAgo: 6 * MIN,
  },
  {
    email: "bewinxed@gmail.com",
    five: 12,
    fiveResets: 2.9 * HOUR,
    week: 93,
    weekResets: 26 * HOUR,
    seenAgo: 12 * MIN,
    // Its one session spends a week with 7% left: the week binds it.
    weekPace: 2,
  },
];

const extra = (i: number): Seed => ({
  email: `ops${i + 1}@petralab.ai`,
  five: (i * 17) % 90,
  fiveResets: ((i % 5) + 1) * HOUR,
  week: (i * 23) % 85,
  weekResets: (24 + i * 7) * HOUR,
  seenAgo: (5 + i) * MIN,
});

/** Six: Petralab's five and Omar Al Matar's one; then Northwind's four, Acme's two, and Petralab. */
function orgAt(i: number): string {
  if (i < 5) {
    return "Petralab";
  }
  if (i === 5) {
    return "Omar Al Matar";
  }
  if (i < 10) {
    return "Northwind";
  }
  return i < 12 ? "Acme" : "Petralab";
}

const SESSIONS = [
  {
    id: "bench-relay",
    accountId: "acc-0",
    title: "Build the relay popover",
    cwd: "/home/omar/cockpit",
  },
  {
    id: "bench-relay-probe",
    accountId: "acc-0",
    title: "Measure the relay bands",
    cwd: "/home/omar/.worktrees/cockpit-84f29783",
    parent: "bench-relay",
  },
  {
    id: "bench-tray",
    accountId: "acc-1",
    title: "Fix tray chip overflow",
    cwd: "/home/omar/anbar",
  },
  // An account that carries nothing new still runs a session.
  {
    id: "bench-notes",
    accountId: "acc-5",
    title: "Draft release notes",
    cwd: "/home/omar/site",
  },
];
/** A session on opencode Go, so its row carries a count too. */
const OPENCODE_SESSION = {
  id: "bench-go",
  harness: "opencode",
  status: "running",
  title: "Port the bench to Go",
  cwd: "/home/omar/cockpit",
  machineId: "nixbox",
} as unknown as InstanceRow;

/**
 * Who carries your new sessions, span by span, as the hub walks it
 * (forecast.ts carrySequence) under Fill first (placement.ts fillFirst):
 * the first account in order with headroom (5-hour and week under 100,
 * not out) carries; the fleet's burn moves onto it; one that runs out is
 * out until its 5-hour window resets, which starts it again from nothing.
 */
function relayOf(
  seeds: Seed[],
  forecasts: AccountForecast[],
  now: number
): CarrySpan[] {
  const horizon = now + 5 * HOUR;
  const burn = forecasts.reduce(
    (sum, one) =>
      sum + (one.windows.find((w) => w.kind === "session")?.pace ?? 0),
    0
  );
  const use = seeds.map((seed) => seed.five);
  const reset = seeds.map((seed) => now + seed.fiveResets);
  const out: { i: number; until: number }[] = [];
  const spans: CarrySpan[] = [];
  const push = (i: number | null, from: number, to: number) => {
    const accountId = i === null ? null : `acc-${i}`;
    const last = spans.at(-1);
    if (last && last.accountId === accountId && last.to === from) {
      last.to = to;
    } else if (to > from) {
      spans.push({ accountId, from, to });
    }
  };
  let t = now;
  for (let step = 0; step < 64 && t < horizon; step += 1) {
    reset.forEach((at, i) => {
      if (at <= t) {
        use[i] = 0;
        reset[i] = at + 5 * HOUR;
      }
    });
    const back = Math.min(
      ...[...out.map((one) => one.until), ...reset].filter((at) => at > t)
    );
    const carrier = seeds.findIndex(
      (seed, i) =>
        Math.max(use[i] ?? 0, seed.week) < 100 &&
        !out.some((one) => one.i === i && one.until > t)
    );
    if (carrier < 0) {
      const until = Math.min(horizon, back);
      push(null, t, until);
      t = until;
      continue;
    }
    const from = use[carrier] ?? 0;
    const runsOut =
      burn > 0 ? t + ((100 - from) / burn) * HOUR : Number.POSITIVE_INFINITY;
    const until = Math.min(horizon, runsOut, back);
    push(carrier, t, until);
    use[carrier] = from + (burn * (until - t)) / HOUR;
    if (until === runsOut && runsOut < horizon) {
      out.push({ i: carrier, until: reset[carrier] ?? until + 5 * HOUR });
    }
    t = until;
  }
  return spans;
}

/** The staged forecast, and everything the hub would serve beside it. */
export interface StagedData {
  accounts: Account[];
  forecast: ProviderForecast;
  /** The Go plan's three windows. */
  go: LimitWindow[];
  /** The Claude sessions, each on its account, and the one on opencode Go. */
  instances: InstanceRow[];
  now: number;
  openCodeSession: InstanceRow;
  routing: ProviderRouting;
}

/**
 * The staged forecast at `now`: `n` Claude accounts (6 or 20) and the Go
 * plan. `stop` tightens it: "1" puts every account's 5-hour window at 92% or
 * more, so the relay stops inside the five hours; "2" puts every one at its
 * limit.
 */
export function stagedData(
  n: number,
  stop: string | null = null,
  now = Date.now()
): StagedData {
  const seeds = [
    ...SIX,
    ...Array.from({ length: n - SIX.length }, (_, i) => extra(i)),
  ].map((seed) => {
    if (stop === "1") {
      return { ...seed, five: Math.max(seed.five, 92), fiveResets: 4.5 * HOUR };
    }
    return stop === "2" ? { ...seed, five: 100, fiveResets: 2 * HOUR } : seed;
  });
  const iso = (ms: number) => new Date(now + ms).toISOString();
  const accounts: Account[] = seeds.map((seed, i) => ({
    createdAt: now - 30 * 24 * HOUR,
    email: seed.email,
    hue: HUES[i % HUES.length],
    id: `acc-${i}`,
    identity: { email: seed.email, organization: orgAt(i) },
    kind: "subscription",
    label: null,
    neverBackup: false,
    order: i,
    provider: "anthropic",
    reservePct: null,
  }));
  // Each window as the hub forecasts it (forecast.ts windowForecast): a
  // pace only while the account runs sessions, a run-out only with a pace
  // and only before the window resets; the binding window the one that
  // runs out first, else the one that resets last (bindingWindow).
  const windowOf = (
    kind: "session" | "weekly_all",
    used: number,
    resetIn: number,
    pace: number | null
  ) => {
    const out =
      pace && pace > 0 ? now + ((100 - used) / pace) * HOUR : undefined;
    return {
      kind,
      pace,
      resetsAt: iso(resetIn),
      scopeLabel: null,
      utilization: used,
      ...(out !== undefined && out < now + resetIn ? { runsOutAt: out } : {}),
    };
  };
  const forecasts: AccountForecast[] = seeds.map((seed, i) => {
    const running = SESSIONS.some((one) => one.accountId === `acc-${i}`);
    const windows = [
      windowOf(
        "session",
        seed.five,
        seed.fiveResets,
        running ? FIVE_PACE : null
      ),
      windowOf(
        "weekly_all",
        seed.week,
        seed.weekResets,
        running ? (seed.weekPace ?? WEEK_PACE) : null
      ),
    ];
    const runningOut = windows.filter((one) => one.runsOutAt !== undefined);
    const binds =
      runningOut.length > 0
        ? runningOut.reduce((a, b) =>
            (b.runsOutAt ?? 0) < (a.runsOutAt ?? 0) ? b : a
          )
        : windows.reduce((a, b) =>
            Date.parse(b.resetsAt) > Date.parse(a.resetsAt) ? b : a
          );
    return {
      accountId: `acc-${i}`,
      bindingWindow: { kind: binds.kind, scopeLabel: null },
      lastSeenAt: now - seed.seenAgo,
      windows,
    };
  });
  const yours = relayOf(seeds, forecasts, now);
  // Delegates go where the hub's Spread puts them (placement.ts): the
  // lowest binding use, the higher of the 5-hour and weekly use, ties to
  // the account order.
  const binding = (seed: Seed) => Math.max(seed.five, seed.week);
  const spreadTo = seeds.reduce(
    (best, seed, i, all) =>
      binding(seed) < binding(all[best] ?? seed) ? i : best,
    0
  );
  const forecast: ProviderForecast = {
    accounts: forecasts,
    delegates: [{ accountId: `acc-${spreadTo}`, from: now, to: now + HOUR }],
    provider: "anthropic",
    yours,
  };
  // design@ carries a session and its delegate; bewinxed@ one session.
  const instances = SESSIONS.map(
    (one) =>
      ({
        id: one.id,
        accountId: one.accountId,
        status: "running",
        harness: "claude",
        title: one.title,
        cwd: one.cwd,
        machineId: "nixbox",
        parentInstanceId: one.parent ?? null,
      }) as unknown as InstanceRow
  );
  const routing = {
    provider: "anthropic",
    delegates: { strategy: "spread" },
    yours: { strategy: "fill-first" },
  } as ProviderRouting;
  const go: LimitWindow[] = [
    {
      group: "session",
      isActive: true,
      kind: "rolling",
      percent: 100,
      resetsAt: iso(72 * MIN),
      scopeLabel: null,
      severity: "critical",
    },
    {
      group: "weekly",
      isActive: true,
      kind: "weekly",
      percent: 64,
      resetsAt: iso(80 * HOUR),
      scopeLabel: null,
      severity: "normal",
    },
    {
      group: "monthly",
      isActive: true,
      kind: "monthly",
      percent: 40,
      resetsAt: iso(18 * 24 * HOUR),
      scopeLabel: null,
      severity: "normal",
    },
  ];
  return {
    accounts,
    forecast,
    go,
    instances,
    now,
    openCodeSession: OPENCODE_SESSION,
    routing,
  };
}
