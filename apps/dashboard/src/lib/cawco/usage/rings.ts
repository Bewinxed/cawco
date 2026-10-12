/**
 * Usage as Rings (the owner's "double dial"): every surface that shows
 * limits draws each account as one concentric mark, an inner disc for its
 * 5-hour window and an outer rim for its week, each filled with what is
 * LEFT, in the account's colour; and says, in one unit ("left"), whether you
 * can keep going, on which account, what happens when it runs out and when
 * an account is back.
 *
 * Pure: a function of the hub's accounts (`/api/accounts`), its forecast
 * (`/api/accounts/forecast`), the sessions on each account and the clock.
 * The words are typed parts ({@link Part}) so each surface typesets them
 * (emphasis, an account's dot) and nothing is a " · " chain.
 */
import {
  ACCOUNT_HUES,
  type Account,
  type AccountBench,
  type AccountForecast,
  type AccountHue,
  accountName,
  type CarrySpan,
  CLAUDE_PROVIDER,
  type InstanceRow,
  type LimitWindow,
  type ProviderForecast,
  type ProviderRouting,
  type WindowForecast,
} from "@cawco/core";
import { readMeter } from "../usage";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
/** How far the carry answer looks ahead: one 5-hour window. */
export const HORIZON_MS = 5 * HOUR_MS;
/**
 * An account with no session on it is only seen when one runs; past this its
 * reading is called out of date (the at-a-glance "seen 1h ago").
 */
const STALE_MS = HOUR_MS;

/** A word in a sentence: plain, emphasised, or an account's name led by its dot. */
export type Part =
  | string
  | { strong: string }
  /** A measured figure among the words: set in the mono figure face. */
  | { figure: string }
  | { account: string; color: string };

/** One window as a ring draws it: the share left, and its clock. */
export interface RingWindow {
  /** Percent left, 0–100. */
  left: number;
  resetsAt: number | null;
  /** When it runs out at its pace, before its reset; null: it lasts. */
  runsOutAt: number | null;
}

export type RingState = "ok" | "limit" | "reserve" | "stale";

/** One account (or opencode's plan) as every Rings surface draws it. */
export interface RingAccount {
  /** When its limit lifts; null unless at its limit. */
  backAt: number | null;
  /** The window that limits it: the 5-hour, else the week. */
  bind: "5h" | "week";
  /** "5-hour", "week", "Opus week". */
  bindName: string;
  /** When the binding window runs out at its pace; null: it lasts. */
  bindOut: number | null;
  /** When the first span it carries you in starts (now, or later). */
  carryFrom: number | null;
  /** When the span it carries you in ends (it carries now, or next). */
  carryUntil: number | null;
  /** `var(--account-<hue>)`, {@link hue}'s token. */
  color: string;
  email: string | null;
  /**
   * The hue it is drawn in where it is shown with others: its own, unless an
   * account shown before it already wears that (see {@link shownHues}).
   */
  hue: AccountHue;
  id: string;
  /** Which window is spent, when it is at its limit. */
  limitOn: "5h" | "week" | null;
  /** Opencode's month; none on a Claude account. */
  month: RingWindow | null;
  name: string;
  neverBackup: boolean;
  /** The nickname, when one was given: shown with the email beneath. */
  nick: string | null;
  /**
   * The Claude organization it bills, by name (`identity.organization`, the
   * initialize response's `account.organization`); null on any other
   * provider, where that field is an account id or a key's fingerprint.
   */
  org: string | null;
  /** Percent left where its reserve sits, once the reserve is reached. */
  reserveLeft: number | null;
  /** When it last reported; null: never. */
  seenAt: number | null;
  sessions: InstanceRow[];
  state: RingState;
  w5: RingWindow | null;
  week: RingWindow | null;
}

const hueToken = (hue: AccountHue): string => `var(--account-${hue})`;

/**
 * The hues a set of accounts shown together are drawn in, in their order:
 * each keeps its stored hue unless an account before it (or one in `worn`,
 * the hues already on screen beside them) wears it; those that can't take
 * the first of core's seven {@link ACCOUNT_HUES} nobody wears. Two passes, so
 * an account whose own hue is free keeps it even when a clash before it is
 * resolved. A new account is already stored in a hue nobody wears; this is
 * for the ones that aren't: an account from before there were seven, one
 * given a worn swatch by hand, and the opencode Go plan, which has no stored
 * hue. Past seven accounts on screen at once the hues repeat, in that order.
 */
export function shownHues(
  own: readonly AccountHue[],
  worn: readonly AccountHue[] = []
): AccountHue[] {
  const used = new Set<AccountHue>(worn);
  const kept = own.map((hue) => {
    if (used.has(hue)) {
      return null;
    }
    used.add(hue);
    return hue;
  });
  let spare = 0;
  return kept.map((hue) => {
    if (hue) {
      return hue;
    }
    const free = ACCOUNT_HUES.find((one) => !used.has(one));
    if (free) {
      used.add(free);
      return free;
    }
    const repeat = ACCOUNT_HUES[spare % ACCOUNT_HUES.length] as AccountHue;
    spare += 1;
    return repeat;
  });
}

/** What accounts/AccountName reads of a ring: its nickname, else its email. */
export const nameFields = (
  r: Pick<RingAccount, "email" | "id" | "nick">
): Pick<Account, "email" | "id" | "label"> => ({
  id: r.id,
  email: r.email,
  label: r.nick,
});

/** A provider's accounts in carrying order, and the carry answer. */
export interface ClaudeRings {
  accounts: RingAccount[];
  /**
   * The forecast's moment: the hub walks its spans from it (forecast.ts
   * `carrySequence` starts at its own now, so the first span's `from`), with
   * the readings as they stand then. A stop worked out here walks from it
   * too, so it counts down with the bands between readings.
   */
  at: number;
  /** The account that is back first after nothing can carry you. */
  back: RingAccount | null;
  backAt: number | null;
  /**
   * The fleet's burn, in percent of a 5-hour window an hour: the summed
   * 5-hour pace of every account, which the relay moves onto whoever
   * carries (hub forecast.ts `carrySequence`).
   */
  burn: number;
  /** The fleet's weekly burn: the summed weekly pace, percent an hour. */
  burnWeek: number;
  /** Who carries your new sessions now; null: nothing can. */
  carry: RingAccount | null;
  /** Where the next delegate goes, and why in a few words. */
  delegate: RingAccount | null;
  delegateWhy: string;
  /** Who carries after {@link carry} runs out; null: nothing does. */
  next: RingAccount | null;
  /** When it takes over from the carrier. */
  nextAt: number | null;
  /** An account in the carry chain whose reading is out of date. */
  stale: RingAccount | null;
  /** When nothing can carry you any more; null: past the 5-hour horizon. */
  stopAt: number | null;
}

/** "50m", "3h 10m", "2d 4h": a span to the minute, as the Rings words say it. */
export function fmt(ms: number): string {
  const m = Math.max(0, Math.round(ms / MINUTE_MS));
  if (m < 60) {
    return `${m}m`;
  }
  if (m < 1440) {
    return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
  }
  return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
}

const WEEKDAY_TIME = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const DATE_TIME = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
/** A week's reset as a day and a time ("Tue 09:00"), the date past a week. */
export const dayTime = (at: number, now: number): string =>
  (at - now < 7 * 24 * HOUR_MS ? WEEKDAY_TIME : DATE_TIME)
    .format(at)
    .replace(",", "");

/** A count of sessions in words, its figure set as one: "2 sessions". */
const sessionsSaid = (n: number): Part[] => [
  { figure: String(n) },
  n === 1 ? " session" : " sessions",
];
const until = (at: number | null, now: number) =>
  at === null ? "" : fmt(at - now);

const ringWindow = (w: WindowForecast | undefined): RingWindow | null =>
  w
    ? {
        left: Math.min(100, Math.max(0, 100 - w.utilization)),
        resetsAt: w.resetsAt ? Date.parse(w.resetsAt) : null,
        runsOutAt: w.runsOutAt ?? null,
      }
    : null;

/** A live session holds its account's reading current. */
const isLive = (row: InstanceRow) =>
  row.status === "running" || row.status === "starting";

/** Which window is spent: one at 100%, else the one its bench runs to. */
function limitOf(
  five: WindowForecast | undefined,
  week: WindowForecast | undefined,
  benched: AccountBench | undefined
): RingAccount["limitOn"] {
  if (five && five.utilization >= 100) {
    return "5h";
  }
  if (week && week.utilization >= 100) {
    return "week";
  }
  if (!benched) {
    return null;
  }
  const reset = five?.resetsAt ? Date.parse(five.resetsAt) : null;
  return reset !== null && benched.until <= reset + MINUTE_MS ? "5h" : "week";
}

/** The window that limits it, and what it is called; a spent one limits it. */
function bindOf(
  bound: WindowForecast | undefined,
  limitOn: RingAccount["limitOn"]
): Pick<RingAccount, "bind" | "bindName"> {
  const bind = limitOn ?? (bound?.kind === "session" ? "5h" : "week");
  if (bind === "5h") {
    return { bind, bindName: "5-hour" };
  }
  const scoped =
    !limitOn && bound?.kind === "weekly_scoped" && bound.scopeLabel;
  return { bind, bindName: scoped ? `${bound.scopeLabel} week` : "week" };
}

/** At its limit, out of date, past its reserve, or fine, in that order. */
function stateOf(
  limitOn: RingAccount["limitOn"],
  stale: boolean,
  reserved: boolean
): RingState {
  if (limitOn) {
    return "limit";
  }
  if (stale) {
    return "stale";
  }
  return reserved ? "reserve" : "ok";
}

/** An account as its rings draw it, before the carry answer is known. */
function accountRing(
  account: Account,
  forecast: AccountForecast | undefined,
  bench: AccountBench[],
  rows: InstanceRow[],
  now: number
): RingAccount {
  const windows = forecast?.windows ?? [];
  const five = windows.find((w) => w.kind === "session");
  const weekAll = windows.find((w) => w.kind === "weekly_all");
  const w5 = ringWindow(five);
  const week = ringWindow(weekAll);
  const ref = forecast?.bindingWindow;
  const bound = ref
    ? windows.find(
        (w) => w.kind === ref.kind && w.scopeLabel === ref.scopeLabel
      )
    : undefined;
  const live = rows.filter(
    (row) => row.accountId === account.id && isLive(row)
  );
  const benched = bench.find(
    (one) =>
      one.accountId === account.id && one.scope === null && one.until > now
  );
  const limitOn = limitOf(five, weekAll, benched);
  const limitWindow = limitOn === "5h" ? w5 : week;
  const backAt = limitOn
    ? (benched?.until ?? limitWindow?.resetsAt ?? null)
    : null;
  const { bind, bindName } = bindOf(bound, limitOn);
  const reserved =
    account.reservePct !== null &&
    weekAll !== undefined &&
    weekAll.utilization >= account.reservePct;
  const seenAt = forecast?.lastSeenAt ?? null;
  const stale =
    live.length === 0 && seenAt !== null && now - seenAt >= STALE_MS;
  const state = stateOf(limitOn, stale, reserved);
  return {
    id: account.id,
    name: accountName(account),
    nick: account.label,
    email: account.email,
    org:
      account.provider === CLAUDE_PROVIDER && account.identity?.organization
        ? account.identity.organization
        : null,
    hue: account.hue,
    color: hueToken(account.hue),
    w5,
    week,
    month: null,
    bind,
    bindName,
    bindOut: bound?.runsOutAt ?? null,
    limitOn,
    backAt,
    reserveLeft:
      state === "reserve" && account.reservePct !== null
        ? 100 - account.reservePct
        : null,
    neverBackup: account.neverBackup,
    seenAt,
    sessions: live,
    state,
    carryFrom: null,
    carryUntil: null,
  };
}

/** The delegates' reason, in the routing's own words. */
function delegateReason(
  routing: ProviderRouting | undefined,
  to: RingAccount | null,
  byId: Map<string, RingAccount>
): string {
  const choice = routing?.delegates;
  if (!(choice && to)) {
    return "";
  }
  if (choice.strategy === "pinned") {
    const pinned = choice.pinnedAccountId
      ? byId.get(choice.pinnedAccountId)
      : undefined;
    if (!pinned || pinned.id === to.id) {
      return "pinned";
    }
    if (pinned.state === "limit") {
      return `${pinned.name} is at its limit`;
    }
    return pinned.state === "reserve"
      ? `${pinned.name} reached its reserve`
      : `${pinned.name} can't take it`;
  }
  return {
    "fill-first": "first in your order",
    spread: "most room left",
    "soonest-reset": "resets soonest",
  }[choice.strategy];
}

/** The summed pace of one kind of window across a forecast's accounts. */
const paceSum = (
  forecast: ProviderForecast,
  kind: "session" | "weekly_all"
): number =>
  forecast.accounts.reduce(
    (sum, one) =>
      sum + (one.windows.find((window) => window.kind === kind)?.pace ?? 0),
    0
  );

/**
 * A provider's accounts in carrying order (who carries you now, then next,
 * then the rest in fill-first order), and the carry answer from the
 * forecast's spans.
 */
export function claudeRings(input: {
  accounts: Account[];
  bench: AccountBench[];
  forecast: ProviderForecast;
  instances: InstanceRow[];
  now: number;
  routing: ProviderRouting | undefined;
}): ClaudeRings {
  const { forecast, now } = input;
  const own = input.accounts
    .filter((account) => account.provider === forecast.provider)
    .sort((a, b) => a.order - b.order);
  const rings = own.map((account) =>
    accountRing(
      account,
      forecast.accounts.find((one) => one.accountId === account.id),
      input.bench,
      input.instances,
      now
    )
  );
  // In the account order, not the carrying order: a clash resolves the same
  // way whoever carries, so no account changes colour when the relay moves.
  shownHues(rings.map((ring) => ring.hue)).forEach((hue, i) => {
    const ring = rings[i];
    if (ring) {
      ring.hue = hue;
      ring.color = hueToken(hue);
    }
  });
  const byId = new Map(rings.map((ring) => [ring.id, ring]));
  const spans: CarrySpan[] = forecast.yours;
  const of = (span: CarrySpan | undefined) =>
    span?.accountId ? (byId.get(span.accountId) ?? null) : null;
  for (const span of spans) {
    const ring = of(span);
    if (ring && ring.carryUntil === null) {
      ring.carryFrom = span.from;
      ring.carryUntil = span.to;
    }
  }
  const carry = of(spans[0]);
  const next =
    carry && spans[1] && of(spans[1]) !== carry ? of(spans[1]) : null;
  const stopIndex = spans.findIndex((span) => span.accountId === null);
  const stopAt = stopIndex === -1 ? null : (spans[stopIndex]?.from ?? null);
  const backSpan =
    stopIndex === -1
      ? undefined
      : spans.slice(stopIndex).find((span) => span.accountId !== null);
  const chain = [
    ...new Set(spans.map((span) => span.accountId).filter(Boolean)),
  ] as string[];
  const order = [
    ...chain,
    ...rings.map((r) => r.id).filter((id) => !chain.includes(id)),
  ];
  const delegate = of(forecast.delegates[0]);
  return {
    accounts: order
      .map((id) => byId.get(id))
      .filter((r): r is RingAccount => Boolean(r)),
    at: spans[0]?.from ?? now,
    burn: paceSum(forecast, "session"),
    burnWeek: paceSum(forecast, "weekly_all"),
    carry,
    next,
    nextAt: next ? (spans[1]?.from ?? null) : null,
    stopAt,
    back: of(backSpan),
    backAt: backSpan?.from ?? null,
    delegate,
    delegateWhy: delegateReason(input.routing, delegate, byId),
    stale:
      chain.map((id) => byId.get(id)).find((ring) => ring?.state === "stale") ??
      null,
  };
}

/**
 * Opencode's plan as one ring: its own 5-hour, week and month windows. It
 * goes by amber unless a Claude account shown beside it (`worn`) does.
 */
export function openCodeRing(
  reading: { fetchedAt: number; stale?: boolean; windows: LimitWindow[] },
  live: InstanceRow[],
  now: number,
  worn: readonly AccountHue[]
): RingAccount {
  const [hue = "amber"] = shownHues(["amber"], worn);
  const win = (group: string): RingWindow | null => {
    const w = reading.windows.find((one) => one.group === group);
    if (!w) {
      return null;
    }
    const meter = readMeter(w, now, false);
    return {
      left: Math.min(100, Math.max(0, 100 - w.percent)),
      resetsAt: w.resetsAt ? Date.parse(w.resetsAt) : null,
      runsOutAt: meter.runsOutIn === null ? null : now + meter.runsOutIn,
    };
  };
  const w5 = win("session");
  const week = win("weekly");
  const month = win("monthly");
  const spent = (
    [
      ["5h", w5],
      ["week", week],
      ["month", month],
    ] as const
  ).find(([, w]) => w && w.left <= 0);
  const outs = [w5, week, month]
    .map((w) => w?.runsOutAt ?? null)
    .filter((at): at is number => at !== null);
  const state = stateOf(spent ? "5h" : null, Boolean(reading.stale), false);
  let limitOn: RingAccount["limitOn"] = null;
  if (spent) {
    limitOn = spent[0] === "5h" ? "5h" : "week";
  }
  return {
    id: "opencode",
    name: "Go plan",
    // The plan has no email; it goes by its name.
    nick: "Go plan",
    email: null,
    org: null,
    hue,
    color: hueToken(hue),
    w5,
    week,
    month,
    bind: limitOn ?? "5h",
    bindName: limitOn === "week" ? "week" : "5-hour",
    bindOut: outs.length > 0 ? Math.min(...outs) : null,
    limitOn,
    backAt: spent ? (spent[1]?.resetsAt ?? null) : null,
    reserveLeft: null,
    neverBackup: false,
    seenAt: reading.fetchedAt,
    sessions: live,
    state,
    carryFrom: null,
    carryUntil: null,
  };
}

// ── words ─────────────────────────────────────────────────────────────────

const named = (ring: RingAccount, name = ring.name): Part => ({
  account: name,
  color: ring.color,
});
const strong = (text: string): Part => ({ strong: text });
/** A measured figure among the words (a time, a share, a count). */
const fig = (text: string): Part => ({ figure: text });

/** The parts as plain text: a label, a key for a crossfade. */
export const plain = (parts: Part[]): string =>
  parts
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }
      if ("strong" in part) {
        return part.strong;
      }
      return "figure" in part ? part.figure : part.account;
    })
    .join("");

/**
 * A time worked out from a reading out of date is a guess, and says so with a
 * tilde ("~3h 40m"); the out-of-date ring's tooltip says why. Every time the
 * strip, the popover and the rows show takes it from here, so none says
 * "seen 1h 40m ago" instead.
 */
const guess = (stale: boolean, time: string): string =>
  stale ? `~${time}` : time;

/** The strip's and the page's figure: how long until nothing can carry you. */
export const stopText = (c: ClaudeRings, now: number): string =>
  c.stopAt === null || c.stopAt - now >= HORIZON_MS
    ? "5h+"
    : guess(c.stale !== null, fmt(c.stopAt - now));

/**
 * The strip's caption: who is next, else when you're back, each account by
 * the name its popover cell shows (`nameOf`). An account out of date in the
 * chain is said by the figure's tilde, not here.
 */
export function caption(
  c: ClaudeRings,
  now: number,
  nameOf: (r: RingAccount) => string
): Part[] {
  if (c.next) {
    return ["then ", named(c.next, nameOf(c.next))];
  }
  if (c.stopAt !== null && c.backAt !== null) {
    return ["back in ", { figure: fmt(c.backAt - now) }];
  }
  if (c.carry?.w5) {
    return [
      named(c.carry, nameOf(c.carry)),
      " ",
      { figure: `${c.carry.w5.left}%` },
      " left",
    ];
  }
  return [];
}

/** When an account stops, and the limit it stops on ("5-hour", "week"). */
export interface Stop {
  at: number;
  limit: string;
}

/**
 * An account's forecast stop: when it runs out, and on which limit. The
 * carrier, which takes your new sessions now, and an idle account, as if it
 * took over now, at the fleet's pace (`takeover`): the pace the relay walk
 * spends a carrier at, from the forecast's moment. The carrier's band ends
 * at its stop, or sooner when the walk hands over first (an account before
 * it in the order is back): the band says how long it carries you, the cell
 * when it runs out (`bandTip`, `dialTip`). Any other
 * account running sessions (and the Go plan, no `c`) at its own pace: the
 * hub's run-out for its binding window, none when every window lasts to its
 * reset (forecast.ts windowForecast). Null past the 5-hour horizon.
 */
export function stopFor(
  r: RingAccount,
  c: ClaudeRings | null,
  now: number
): Stop | null {
  const own = !c || (r.sessions.length > 0 && r.id !== c.carry?.id);
  let stop: Stop | null = null;
  if (!own) {
    stop = takeover(r, c, now);
  } else if (r.bindOut !== null) {
    stop = { at: r.bindOut, limit: r.bindName };
  }
  return stop !== null && stop.at - now < HORIZON_MS ? stop : null;
}

/** When an account stops (`stopFor`), as a moment. */
export const stopOf = (
  r: RingAccount,
  c: ClaudeRings | null,
  now: number
): number | null => stopFor(r, c, now)?.at ?? null;

/**
 * A dial-wall cell's time, a figure alone: how long it lasts (`stop`), or,
 * at its limit, when it's back (`back`, null when that isn't known). The
 * words it stands for are the cell's label and its tooltips'.
 */
export type CellTime =
  | { kind: "stop"; figure: string; guess: boolean }
  | { kind: "back"; figure: string | null };

/**
 * The time on a dial-wall cell's second line, one shape for every account:
 * its forecast stop ("1h 20m"; `stopOf`), "5h+" when it won't run out inside
 * the five hours (no stop), or at its limit when it's back ("4h 50m"); a
 * reading out of date makes it a guess ("~1h 20m"), and the dial's tooltip
 * says why. Who takes over when is the relay bar's to say.
 */
export function cellTime(
  r: RingAccount,
  c: ClaudeRings | null,
  now: number
): CellTime {
  if (r.state === "limit") {
    return {
      kind: "back",
      figure: r.backAt === null ? null : until(r.backAt, now),
    };
  }
  const out = stopOf(r, c, now);
  return {
    kind: "stop",
    figure: out === null ? "5h+" : fmt(out - now),
    guess: r.state === "stale",
  };
}

/**
 * A dial's tooltip under its account's name, a short line per limit: what
 * is left of it and, on the one it stops on, when it runs out (the cell's
 * time: "5-hour: 29% left · runs out in 32m"), an idle account if it takes
 * over now, "lasts past the next 5 hours" with no stop inside them; a spent
 * one says when it's back. How long it carries you is its relay band's to
 * say. An out-of-date reading adds one line, "Estimate: last reading 14m
 * ago".
 */
export function dialTip(
  r: RingAccount,
  c: ClaudeRings | null,
  now: number
): string {
  const time = cellTime(r, c, now);
  /** At the fleet's pace as if it took over now (`stopFor`'s idle). */
  const idle = c !== null && r.sessions.length === 0 && r.id !== c.carry?.id;
  let pace = "";
  if (time.kind === "stop") {
    if (time.figure === "5h+") {
      pace = " · lasts past the next 5 hours";
    } else {
      pace = ` · runs out in ${time.figure}${idle ? " if it takes over now" : ""}`;
    }
  }
  /** The line the pace goes on: the limit it stops on, else the one that binds. */
  const stopsOnWeek = (stopFor(r, c, now)?.limit ?? r.bindName) !== "5-hour";
  const spent =
    r.backAt === null ? "used up" : `used up · back in ${until(r.backAt, now)}`;
  const line = (
    label: string,
    limited: boolean,
    left: number | undefined,
    binds: boolean
  ): string | null => {
    if (limited) {
      return `${label}: ${spent}`;
    }
    return left === undefined
      ? null
      : `${label}: ${left}% left${binds ? pace : ""}`;
  };
  return [
    line("5-hour", r.limitOn === "5h", r.w5?.left, !stopsOnWeek),
    line("Week", r.limitOn === "week", r.week?.left, stopsOnWeek),
    r.state === "stale" ? estimateOf(r, now) : null,
  ]
    .filter((one) => one !== null)
    .join("\n");
}

/** A cell's week: what is left of it ("62%"), 0 at its limit, none unread. */
export const weekLeft = (r: RingAccount): number | null =>
  r.limitOn === "week" ? 0 : (r.week?.left ?? null);

/** An email domain's top level ("gmail.com" → "gmail"). */
const TOP_DOMAIN = /\.[^.]+$/;
/** An account's first name: its nickname, else its email's local part. */
const localOf = (r: RingAccount): string =>
  r.nick || !r.email ? r.name : r.email.slice(0, r.email.lastIndexOf("@"));

/** A name as the usage popover and strip show it: its first part, then a stem. */
export interface ShownName {
  /** The domain's stem ("@gmail"), or "" when the first part says enough. */
  domain: string;
  local: string;
}

/**
 * The names the usage strip and popover show, one per account: its first
 * part (a nickname, else the email's local part), then, only where an
 * ungrouped account shares that first part with another shown with it, its
 * domain's stem ("@gmail"). Under an organization's head the head tells
 * them apart, as it does for `extra` (the Go plan).
 */
export function shownNames(
  accounts: RingAccount[],
  extra: RingAccount | null
): Map<string, ShownName> {
  const all = extra ? [...accounts, extra] : accounts;
  const count = new Map<string, number>();
  for (const r of all) {
    count.set(localOf(r), (count.get(localOf(r)) ?? 0) + 1);
  }
  const grouped = new Set(
    orgGroups(accounts)
      .filter((group) => group.org !== null)
      .flatMap((group) => group.accounts.map((r) => r.id))
  );
  if (extra) {
    grouped.add(extra.id);
  }
  return new Map(
    all.map((r) => {
      const local = localOf(r);
      const shared = (count.get(local) ?? 0) > 1;
      const domain =
        !grouped.has(r.id) && shared && r.email
          ? `@${r.email.slice(r.email.lastIndexOf("@") + 1).replace(TOP_DOMAIN, "")}`
          : "";
      return [r.id, { local, domain }];
    })
  );
}

/**
 * When an account runs out carrying you, as the relay's walk spends a
 * carrier (hub forecast.ts `carrySequence`), from the forecast's moment
 * (`c.at`), so it counts down between readings as the bands do: its 5-hour
 * use climbs at the fleet's burn (`c.burn`, percent an hour), a window that
 * resets starts again from nothing, and one not open has no reset ahead;
 * its week spends at the fleet's weekly pace (`c.burnWeek`) until its
 * reset. The sooner of the two; null when nothing burns.
 */
export function takeover(
  r: RingAccount,
  c: ClaudeRings,
  now: number
): Stop | null {
  const from = c.at;
  const horizon = now + HORIZON_MS;
  let five: number | null = null;
  if (c.burn > 0 && r.w5) {
    let use = 100 - r.w5.left;
    let reset =
      r.w5.resetsAt !== null && r.w5.resetsAt > from ? r.w5.resetsAt : null;
    let t = from;
    while (t < horizon) {
      const out = t + ((100 - use) / c.burn) * HOUR_MS;
      if (reset === null || out <= reset) {
        five = out;
        break;
      }
      use = 0;
      t = reset;
      reset += HORIZON_MS;
    }
  }
  let week: number | null = null;
  if (c.burnWeek > 0 && r.week) {
    const out = from + (r.week.left / c.burnWeek) * HOUR_MS;
    week = r.week.resetsAt === null || out < r.week.resetsAt ? out : null;
  }
  if (five !== null && (week === null || five <= week)) {
    return { at: five, limit: "5-hour" };
  }
  return week === null ? null : { at: week, limit: "week" };
}

/** One group of the accounts: an organization's accounts, or (null) the rest. */
export interface OrgGroup {
  accounts: RingAccount[];
  org: string | null;
}

/**
 * The accounts in groups: each organization with more than two accounts is a
 * group, in the order its first account carries, its accounts in carrying
 * order; the accounts of a smaller organization, or of none, follow
 * ungrouped.
 */
export function orgGroups(accounts: RingAccount[]): OrgGroup[] {
  const size = new Map<string, number>();
  for (const ring of accounts) {
    if (ring.org) {
      size.set(ring.org, (size.get(ring.org) ?? 0) + 1);
    }
  }
  const groups = new Map<string, RingAccount[]>();
  const rest: RingAccount[] = [];
  for (const ring of accounts) {
    if (ring.org && (size.get(ring.org) ?? 0) > 2) {
      groups.set(ring.org, [...(groups.get(ring.org) ?? []), ring]);
    } else {
      rest.push(ring);
    }
  }
  return [
    ...[...groups].map(([org, members]) => ({ org, accounts: members })),
    ...(rest.length > 0 ? [{ org: null, accounts: rest }] : []),
  ];
}

/** An out-of-date reading's line in its dial's tooltip: how old it is. */
const estimateOf = (r: RingAccount, now: number): string =>
  r.seenAt === null
    ? "Estimate: no reading yet"
    : `Estimate: last reading ${fmt(now - r.seenAt)} ago`;

/** The routing's reason as placement applies it (hub placement.ts). */
const DELEGATE_WHY: Record<string, string> = {
  "first in your order": "it’s the first in your order with room.",
  "resets soonest": "its 5-hour limit resets soonest.",
  pinned: "delegates are pinned to it.",
};

/**
 * What placement's spread compares (hub placement.ts `Usage.binding`, the
 * higher of an account's 5-hour and week use): the share left on its lower
 * limit.
 */
const lowerLeft = (r: RingAccount): number =>
  Math.min(
    r.limitOn === "5h" ? 0 : (r.w5?.left ?? 100),
    r.limitOn === "week" ? 0 : (r.week?.left ?? 100)
  );

/**
 * The tooltip on the delegates' mark, by the cell of the account new
 * delegates start on: why, saying exactly what placement computes, so the
 * wall cannot contradict it. Spread takes the lowest binding use, the higher
 * of an account's 5-hour and week use (hub placement.ts `spread`): the
 * account whose lower limit has the most left. One with more left that it
 * passed over was held back, past its reserve (placement's `pastReserve`)
 * or not one delegates may run on.
 */
export function delegateTip(c: ClaudeRings, to: RingAccount): string {
  if (c.delegateWhy !== "most room left") {
    const why = DELEGATE_WHY[c.delegateWhy];
    return why
      ? `New delegates start here: ${why}`
      : "New delegates start here.";
  }
  const left = lowerLeft(to);
  const passed = c.accounts.filter(
    (r) => r.id !== to.id && lowerLeft(r) > left
  );
  const lead = `New delegates start here: its lower limit has ${left}% left,`;
  if (passed.length === 0) {
    return `${lead} more than any other account’s.`;
  }
  return passed.every((r) => r.state === "reserve")
    ? `${lead} more than any account’s outside your reserve.`
    : `${lead} more than any other account’s delegates can use.`;
}

/**
 * A tile's sentence: the same status, said whole. An account running
 * sessions says so ("Carrying 2 sessions" on the carrier, "Running 1
 * session." on any other); only one running none is "Idle.".
 */
export function tileSentence(
  r: RingAccount,
  c: ClaudeRings,
  now: number
): Part[] {
  const n = r.sessions.length;
  const running: Part[] = n > 0 ? ["Running ", ...sessionsSaid(n), "."] : [];
  /** The running sentence, then `rest` after a space. */
  const after = (rest: Part[]): Part[] =>
    running.length > 0 ? [...running, " ", ...rest] : rest;
  if (r.state === "limit") {
    return ["At its limit. Back in ", fig(until(r.backAt, now)), "."];
  }
  if (r.state === "stale" && r.seenAt !== null) {
    return [
      "Hasn’t reported for ",
      fig(fmt(now - r.seenAt)),
      ", so this may be out of date.",
    ];
  }
  if (r.state === "reserve") {
    return n > 0
      ? [
          "Reserve reached. It keeps its ",
          ...sessionsSaid(n),
          "; new work goes elsewhere.",
        ]
      : ["Reserve reached. New work goes elsewhere."];
  }
  if (r.id === c.carry?.id) {
    return [
      ...(n > 0
        ? ["Carrying ", ...sessionsSaid(n)]
        : ["Carries your next session"]),
      ...(c.next ? [", then ", named(c.next)] : []),
      ".",
    ];
  }
  if (r.neverBackup) {
    return after(["Never a backup: only a pick or a pin uses it."]);
  }
  if (r.id === c.next?.id && c.carry && c.nextAt !== null) {
    return after([
      "Takes over from ",
      named(c.carry),
      " in ",
      fig(fmt(c.nextAt - now)),
      ".",
    ]);
  }
  return running.length > 0 ? running : ["Idle."];
}

/**
 * A tile's figure, beside its mark, and what the figure is: how long it
 * lasts, or at its limit (`back`, drawn after the refresh mark, as the
 * popover's cell does) how long until it's back.
 */
export interface TileFigure {
  back: boolean;
  figure: string;
  label: string;
}

/** A tile's figure: how long it lasts, or how long until it's back. */
export function tileFigure(
  r: RingAccount,
  c: ClaudeRings,
  now: number
): TileFigure {
  if (r.state === "limit") {
    return {
      back: true,
      figure: until(r.backAt, now),
      label: `until it’s back · ${r.bindName} at its limit`,
    };
  }
  const carrying = r.id === c.carry?.id;
  if (r.neverBackup && !carrying) {
    return { back: false, figure: "5h+", label: "never a backup" };
  }
  // The same stop the popover's cell says, naming the limit it runs out on.
  const stop = stopFor(r, c, now);
  const figure = stop === null ? "5h+" : fmt(stop.at - now);
  const label =
    stop === null
      ? "lasts past the next 5 hours"
      : `until its ${stop.limit} limit runs out`;
  return {
    back: false,
    figure,
    label: r.state === "stale" ? `last known · ${label}` : label,
  };
}

/** Opencode's figure beside its mark, and what it is, as its popover cell says it. */
export function openCodeFigure(o: RingAccount, now: number): TileFigure {
  const time = cellTime(o, null, now);
  if (time.kind === "back") {
    return {
      back: true,
      figure: time.figure ?? "",
      label: `until it’s back · ${o.bindName} at its limit`,
    };
  }
  const stop = stopFor(o, null, now);
  return {
    back: false,
    figure: time.guess ? `~${time.figure}` : time.figure,
    label:
      stop === null
        ? "lasts past the next 5 hours"
        : `until its ${stop.limit} limit runs out`,
  };
}

/** The page's lead sentence: who carries you, until when, and what then. */
export function leadSentence(c: ClaudeRings, now: number): Part[] {
  const back: Part[] =
    c.back && c.backAt !== null
      ? [
          " You’re back on ",
          strong(c.back.name),
          " in ",
          fig(fmt(c.backAt - now)),
          ".",
        ]
      : [];
  if (!c.carry) {
    return c.back && c.backAt !== null
      ? [
          "Nothing can carry you now. ",
          strong(c.back.name),
          " is back in ",
          fig(fmt(c.backAt - now)),
          ".",
        ]
      : ["Nothing can carry you now."];
  }
  const carryEnd = c.carry.carryUntil;
  const parts: Part[] =
    carryEnd === null || carryEnd - now >= HORIZON_MS
      ? [strong(c.carry.name), " carries you past the next 5 hours."]
      : [
          strong(c.carry.name),
          " carries you for ",
          fig(fmt(carryEnd - now)),
          ...(c.next ? [", then ", strong(c.next.name), "."] : ["."]),
        ];
  if (c.stale && c.stale.seenAt !== null) {
    return [
      ...parts,
      " ",
      strong(c.stale.name),
      " last reported ",
      fig(fmt(now - c.stale.seenAt)),
      " ago, so the time after that is a guess.",
    ];
  }
  if (c.stopAt === null) {
    return parts;
  }
  const others = c.accounts.filter((r) => r.id !== c.carry?.id);
  const limited = c.next ? undefined : others.find((r) => r.state === "limit");
  if (limited && limited.backAt !== null) {
    return [
      ...parts,
      " ",
      strong(limited.name),
      " is at its limit and back in ",
      fig(fmt(limited.backAt - now)),
      ", so nothing carries you in between.",
      ...(c.back && c.back.id !== limited.id ? back : []),
    ];
  }
  const reserved = others.find((r) => r.state === "reserve");
  if (reserved) {
    return [
      ...parts,
      " ",
      strong(reserved.name),
      " reached its weekly reserve: it keeps its ",
      ...sessionsSaid(reserved.sessions.length),
      ", and new work goes elsewhere.",
      ...back,
    ];
  }
  return [...parts, ...back];
}

export function openCodeSentence(o: RingAccount, now: number): Part[] {
  if (o.state === "limit") {
    return ["At its limit. Back in ", fig(until(o.backAt, now)), "."];
  }
  if (o.state === "stale" && o.seenAt !== null) {
    return [
      "Hasn’t reported for ",
      fig(fmt(now - o.seenAt)),
      ", so this may be out of date.",
    ];
  }
  return o.bindOut !== null && o.bindOut - now < HORIZON_MS
    ? ["Runs out in ", fig(fmt(o.bindOut - now)), "."]
    : ["Nothing stops you in the next 5 hours."];
}

/** One line of the key: glyph | label | value | reset. */
export interface KeyRow {
  /** The disc (5-hour), the rim (week), or no glyph (month). */
  glyph: "disc" | "rim" | null;
  id: string;
  label: string;
  /** The window is spent: its glyph goes to the track's grey. */
  limit: boolean;
  /** When it resets or is back, its figure set as one. */
  reset: Part[];
  /** What is left of it ("62% left"), its figure set as one. */
  value: Part[];
}

/** An account's key: the 5-hour (the disc), then the week (the rim), then the month. */
export function keyRows(r: RingAccount, now: number): KeyRow[] {
  const rows: KeyRow[] = [];
  const left = (share: number, limited: boolean): Part[] =>
    limited ? ["at its limit"] : [fig(`${share}%`), " left"];
  if (r.w5) {
    const lim = r.limitOn === "5h";
    const resets = r.w5.resetsAt;
    rows.push({
      id: "5h",
      glyph: "disc",
      label: "5-hour",
      limit: lim,
      value: left(r.w5.left, lim),
      reset: lim
        ? ["back in ", fig(until(r.backAt, now))]
        : ["resets in ", fig(until(resets, now))],
    });
  }
  if (r.week) {
    const lim = r.limitOn === "week";
    const resets = r.week.resetsAt;
    rows.push({
      id: "week",
      glyph: "rim",
      label: "Week",
      limit: lim,
      value: left(r.week.left, lim),
      reset: resets === null ? [] : ["resets ", ...clockSaid(resets, now)],
    });
  }
  if (r.month) {
    const resets = r.month.resetsAt;
    rows.push({
      id: "month",
      glyph: null,
      label: "Month",
      limit: r.month.left <= 0,
      value: left(r.month.left, r.month.left <= 0),
      reset: resets === null ? [] : ["resets in ", fig(fmt(resets - now))],
    });
  }
  return rows;
}

/** A day and time ("Tue 14:00"): the day in words, the clock a figure. */
const clockSaid = (at: number, now: number): Part[] => {
  const said = dayTime(at, now);
  const space = said.lastIndexOf(" ");
  return space === -1
    ? [fig(said)]
    : [said.slice(0, space + 1), fig(said.slice(space + 1))];
};
