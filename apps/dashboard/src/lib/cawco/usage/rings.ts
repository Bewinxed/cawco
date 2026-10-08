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
  type Account,
  type AccountBench,
  type AccountForecast,
  accountName,
  type CarrySpan,
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
  /** When the span it carries you in ends (it carries now, or next). */
  carryUntil: number | null;
  /** `var(--account-<hue>)`. */
  color: string;
  email: string | null;
  id: string;
  /** Which window is spent, when it is at its limit. */
  limitOn: "5h" | "week" | null;
  /** Opencode's month; none on a Claude account. */
  month: RingWindow | null;
  name: string;
  neverBackup: boolean;
  /** The nickname, when one was given: shown with the email beneath. */
  nick: string | null;
  /** Percent left where its reserve sits, once the reserve is reached. */
  reserveLeft: number | null;
  /** When it last reported; null: never. */
  seenAt: number | null;
  sessions: InstanceRow[];
  state: RingState;
  w5: RingWindow | null;
  week: RingWindow | null;
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
  /** The account that is back first after nothing can carry you. */
  back: RingAccount | null;
  backAt: number | null;
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

const sessions = (n: number) => (n === 1 ? "1 session" : `${n} sessions`);
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
    color: `var(--account-${account.hue})`,
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
  const byId = new Map(rings.map((ring) => [ring.id, ring]));
  const spans: CarrySpan[] = forecast.yours;
  const of = (span: CarrySpan | undefined) =>
    span?.accountId ? (byId.get(span.accountId) ?? null) : null;
  for (const span of spans) {
    const ring = of(span);
    if (ring && ring.carryUntil === null) {
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

/** Opencode's plan as one ring: its own 5-hour, week and month windows. */
export function openCodeRing(
  reading: { fetchedAt: number; stale?: boolean; windows: LimitWindow[] },
  live: InstanceRow[],
  now: number
): RingAccount {
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
    color: "var(--account-amber)",
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
    carryUntil: null,
  };
}

// ── words ─────────────────────────────────────────────────────────────────

const named = (ring: RingAccount): Part => ({
  account: ring.name,
  color: ring.color,
});
const strong = (text: string): Part => ({ strong: text });

/** The parts as plain text: a label, a key for a crossfade. */
export const plain = (parts: Part[]): string =>
  parts
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }
      return "strong" in part ? part.strong : part.account;
    })
    .join("");

/** The strip's and the page's figure: how long until nothing can carry you. */
export const stopText = (c: ClaudeRings, now: number): string =>
  c.stopAt === null || c.stopAt - now >= HORIZON_MS
    ? "5h+"
    : fmt(c.stopAt - now);

/** The strip's caption: who is next, else when you're back. */
export function caption(c: ClaudeRings, now: number): Part[] {
  if (c.stale && c.stale.seenAt !== null) {
    return [named(c.stale), ` seen ${fmt(now - c.stale.seenAt)} ago`];
  }
  if (c.next) {
    return ["then ", named(c.next)];
  }
  if (c.stopAt !== null && c.backAt !== null) {
    return ["back in ", strong(fmt(c.backAt - now))];
  }
  if (c.carry?.w5) {
    return [named(c.carry), ` ${c.carry.w5.left}% left`];
  }
  return [];
}

/** The time that matters for a row, at its end. */
export function rowTime(r: RingAccount, c: ClaudeRings, now: number): string {
  if (r.state === "limit") {
    return `back in ${until(r.backAt, now)}`;
  }
  if (r.state === "reserve" || r.id === c.carry?.id) {
    const out = r.bindOut ?? r.carryUntil;
    return out !== null && out - now < HORIZON_MS
      ? `${fmt(out - now)} left`
      : "5h+";
  }
  if (r.neverBackup) {
    return "5h+";
  }
  return r.carryUntil !== null && r.carryUntil - now < HORIZON_MS
    ? `${fmt(r.carryUntil - now)} left`
    : "5h+";
}

/** A row's short status, under its name. */
export function rowStatus(r: RingAccount, c: ClaudeRings, now: number): Part[] {
  const n = r.sessions.length;
  if (r.state === "limit") {
    return ["at its limit"];
  }
  if (r.state === "stale" && r.seenAt !== null) {
    return [`seen ${fmt(now - r.seenAt)} ago`];
  }
  if (r.state === "reserve") {
    return [
      `${r.bind === "5h" ? "" : `its ${r.bindName} runs out first; `}reserve reached, keeps its ${sessions(n)}`,
    ];
  }
  if (r.id === c.carry?.id) {
    return [
      n > 0 ? `carrying ${sessions(n)}` : "carries your next session",
      ...(c.next ? [", then ", named(c.next)] : []),
    ];
  }
  if (r.neverBackup) {
    return ["never a backup"];
  }
  if (r.id === c.next?.id && c.nextAt !== null) {
    return ["takes over in ", strong(fmt(c.nextAt - now))];
  }
  return ["not carrying anything"];
}

/** A tile's sentence: the same status, said whole. */
export function tileSentence(
  r: RingAccount,
  c: ClaudeRings,
  now: number
): Part[] {
  const n = r.sessions.length;
  if (r.state === "limit") {
    return ["At its limit. Back in ", strong(until(r.backAt, now)), "."];
  }
  if (r.state === "stale" && r.seenAt !== null) {
    return [
      `Hasn’t reported for ${fmt(now - r.seenAt)}, so this may be out of date.`,
    ];
  }
  if (r.state === "reserve") {
    return [
      `Reserve reached. It keeps its ${sessions(n)}; new work goes elsewhere.`,
    ];
  }
  if (r.id === c.carry?.id) {
    return [
      n > 0 ? `Carrying ${sessions(n)}` : "Carries your next session",
      ...(c.next ? [", then ", named(c.next)] : []),
      ".",
    ];
  }
  if (r.neverBackup) {
    return ["Never a backup: only a pick or a pin uses it."];
  }
  if (r.id === c.next?.id && c.carry && c.nextAt !== null) {
    return [
      "Takes over from ",
      named(c.carry),
      " in ",
      strong(fmt(c.nextAt - now)),
      ".",
    ];
  }
  return ["Not carrying anything."];
}

/** A tile's figure, beside its mark, and what the figure is. */
export function tileFigure(
  r: RingAccount,
  c: ClaudeRings,
  now: number
): { figure: string; label: string } {
  if (r.state === "limit") {
    return {
      figure: `back in ${until(r.backAt, now)}`,
      label: `${r.bindName} at its limit`,
    };
  }
  const carrying = r.id === c.carry?.id;
  if (r.neverBackup && !carrying) {
    return { figure: "5h+", label: "never a backup" };
  }
  const out =
    carrying || r.state === "reserve"
      ? (r.bindOut ?? r.carryUntil)
      : (r.carryUntil ?? r.bindOut);
  const figure = within(out, now);
  if (r.state === "stale") {
    return { figure, label: "last known" };
  }
  return {
    figure,
    label: r.bind === "5h" ? "left of 5 hours" : `left of the ${r.bindName}`,
  };
}

/** A time inside the 5-hour horizon, else "5h+". */
const within = (at: number | null, now: number): string =>
  at !== null && at - now < HORIZON_MS ? fmt(at - now) : "5h+";

/** Opencode's figure beside its mark, and what it is. */
export function openCodeFigure(
  o: RingAccount,
  now: number
): { figure: string; label: string } {
  const figure = openCodeStop(o, now);
  if (o.state === "limit") {
    return { figure, label: `${o.bindName} at its limit` };
  }
  return {
    figure,
    label: figure === "5h+" ? "nothing runs out" : "until it runs out",
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
          strong(fmt(c.backAt - now)),
          ".",
        ]
      : [];
  if (!c.carry) {
    return c.back && c.backAt !== null
      ? [
          "Nothing can carry you now. ",
          strong(c.back.name),
          " is back in ",
          strong(fmt(c.backAt - now)),
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
          " runs out in ",
          strong(fmt(carryEnd - now)),
          ...(c.next ? [", then ", strong(c.next.name), "."] : ["."]),
        ];
  if (c.stale && c.stale.seenAt !== null) {
    return [
      ...parts,
      " ",
      strong(c.stale.name),
      ` last reported ${fmt(now - c.stale.seenAt)} ago, so the time after that is a guess.`,
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
      strong(fmt(limited.backAt - now)),
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
      ` reached its weekly reserve: it keeps its ${sessions(reserved.sessions.length)}, and new work goes elsewhere.`,
      ...back,
    ];
  }
  return [...parts, ...back];
}

/** Opencode's figure: how long until one of its windows runs out. */
export const openCodeStop = (o: RingAccount, now: number): string => {
  if (o.state === "limit") {
    return "0m";
  }
  return o.bindOut !== null && o.bindOut - now < HORIZON_MS
    ? fmt(o.bindOut - now)
    : "5h+";
};

export function openCodeStatus(o: RingAccount, now: number): Part[] {
  if (o.state === "limit") {
    return ["at its limit"];
  }
  if (o.state === "stale" && o.seenAt !== null) {
    return [`seen ${fmt(now - o.seenAt)} ago`];
  }
  return o.bindOut !== null && o.bindOut - now < HORIZON_MS
    ? ["runs out in ", strong(fmt(o.bindOut - now))]
    : ["nothing runs out in the next 5 hours"];
}

export function openCodeSentence(o: RingAccount, now: number): Part[] {
  if (o.state === "limit") {
    return ["At its limit. Back in ", strong(until(o.backAt, now)), "."];
  }
  if (o.state === "stale" && o.seenAt !== null) {
    return [
      `Hasn’t reported for ${fmt(now - o.seenAt)}, so this may be out of date.`,
    ];
  }
  return o.bindOut !== null && o.bindOut - now < HORIZON_MS
    ? ["Runs out in ", strong(fmt(o.bindOut - now)), "."]
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
  reset: string;
  value: string;
}

/** An account's key: the 5-hour (the disc), then the week (the rim), then the month. */
export function keyRows(r: RingAccount, now: number): KeyRow[] {
  const rows: KeyRow[] = [];
  if (r.w5) {
    const lim = r.limitOn === "5h";
    const resets = r.w5.resetsAt;
    rows.push({
      id: "5h",
      glyph: "disc",
      label: "5-hour",
      limit: lim,
      value: lim ? "at its limit" : `${r.w5.left}% left`,
      reset: lim
        ? `back in ${until(r.backAt, now)}`
        : `resets in ${until(resets, now)}`,
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
      value: lim ? "at its limit" : `${r.week.left}% left`,
      reset: resets === null ? "" : `resets ${dayTime(resets, now)}`,
    });
  }
  if (r.month) {
    const resets = r.month.resetsAt;
    rows.push({
      id: "month",
      glyph: null,
      label: "Month",
      limit: r.month.left <= 0,
      value: r.month.left <= 0 ? "at its limit" : `${r.month.left}% left`,
      reset: resets === null ? "" : `resets in ${fmt(resets - now)}`,
    });
  }
  return rows;
}
