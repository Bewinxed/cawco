/**
 * What `account_read` and `account_move` say (hub account-tools.ts): the
 * accounts' use against their floors, where the router runs each of the
 * caller's delegates, and a move's price or refusal. Agent-facing words: no
 * screen draws them.
 */

import { clockWords, dayWords } from "./account-lines";

/** A sentence's closing stop, dropped so it sits inside another. */
const SENTENCE_STOP = /\.$/u;

/** A moment ahead as a line names it: "18:40" today, else "21 Nov 09:00". */
export const atWords = (at: number, now: number): string =>
  dayWords(at) === dayWords(now)
    ? clockWords(at)
    : `${dayWords(at)} ${clockWords(at)}`;

/** "1 session", "3 sessions", "no sessions". */
const sessionsWords = (count: number): string => {
  if (count === 0) {
    return "no sessions";
  }
  return count === 1 ? "1 session" : `${count} sessions`;
};

export const accountReadWords = {
  /** The accounts' heading. */
  accountsHeading: "Accounts:",
  /**
   * One account: "jude@ (Petralab): weekly 61% used of 90% allowed, resets
   * 21 Nov 09:00 · 5-hour 42% used of 80% allowed, resets 18:40 · lasts the
   * next 5 h · 3 sessions".
   */
  account: (
    name: string,
    organization: string | null,
    parts: readonly string[],
    sessions: number
  ) =>
    `- ${name}${organization ? ` (${organization})` : ""}: ${[...parts, sessionsWords(sessions)].join(" · ")}`,
  /** One window's use against its floor and its reset; `window` empty for one of no known length. */
  window: (
    window: string,
    usedPct: number,
    allowedPct: number,
    resetsAt: string | null
  ) =>
    `${window || "its limit"} ${Math.round(usedPct)}% used of ${Math.round(allowedPct)}% allowed${resetsAt ? `, resets ${resetsAt}` : ", reset not known"}`,
  /** The windows read none: why, never shown as empty. */
  unread: (why: string) => `limits not read: ${why}`,
  /** Why its windows were not read, when nothing names a refusal. */
  neverRead: "no report from its provider has named its windows yet",
  /** Signed out on the machine the router read it for. */
  signedOut: (machine: string, reason: string | null) =>
    `signed out on ${machine}${reason ? ` (${reason.replace(SENTENCE_STOP, "")})` : ""}`,
  /** No sign-in of it on that machine. */
  notSignedIn: (machine: string) => `not signed in on ${machine}`,
  /** A provider none of whose accounts any session runs on now. */
  providerIdle: (provider: string) =>
    `limits not read: no session runs on a ${provider} account now, so the router reads none of them`,
  /** Why it takes no session whatever the price (core `heldAccountWords`). */
  takesNone: (why: string) => `takes no session: ${why}`,
  /** No window runs short within the router's look-ahead. */
  lasts: (hours: number) => `lasts the next ${hours} h`,
  /** A window at or past its floor: the account takes no new session and no move (placement's words). */
  pastFloor: (allowedPct: number) => `past its ${allowedPct}% reserve`,
  /** A window runs out before it resets. */
  runsOut: (at: string) => `runs out at ${at}`,
  /** Which account a new delegate starts on, and the placement's why. */
  newDelegate: (name: string, why: string) =>
    `A new delegate starts on ${name}: ${why}`,
  /** A start placed on no account (its machine's own store). */
  newDelegateNone: (why: string) =>
    `A new delegate starts on no account: ${why}`,
  /** Placement refused a start here. */
  newDelegateRefused: (why: string) => `A new delegate can't start: ${why}`,
  delegatesHeading: "Your delegates:",
  delegatesNone: "Your delegates: none live.",
  /** One delegate: "- Fix tray chip (cockpit#5a167bde) on jude@: stays, jude@ lasts the next 5 h". */
  delegate: (title: string, handle: string, account: string, outlook: string) =>
    `- ${title} (${handle}) on ${account}: ${outlook}`,
  /** A delegate on no account (its machine's own login). */
  onNoAccount: "no account",
  /** The router reads no account for it. */
  unreadOutlook: "the router reads no account for it, so nothing moves it",
  /** Its account lasts: nothing is decided. */
  staysLasting: (account: string, hours: number) =>
    `stays, ${account} lasts the next ${hours} h`,
  /** Its account runs short, and its sessions go on extra usage. */
  staysOnCredits: (account: string, at: string) =>
    `stays, ${account} runs out at ${at} but its sessions go on its extra usage past its plan`,
  /** The decision moves it; `free`: why the move costs nothing staying wouldn't, ahead of a limit. */
  moves: (
    to: string,
    usd: string,
    shape: string,
    next: string,
    free: string | null,
    when: string,
    because: string
  ) =>
    `moves to ${to} for ${usd} (${shape}), ${next}${free ? `: ${free}` : ""}; ${when}. Because ${because}.`,
  /** Why a move ahead of a limit is free (decide.ts: a forecast or a wake moves only what is). */
  free: {
    cold: "its cache is cold, so its next turn re-reads its whole context wherever it runs, and moving costs nothing staying wouldn't",
    carries:
      "its cache carries to an account of the same organization, so moving re-reads little more than staying",
  },
  /** What the decision passed over. */
  nextBest: (what: string, where: string | null, usd: string) =>
    `against ${usd} for ${what}${where ? ` on ${where}` : ""}`,
  onlyOption: "the only option that held",
  /** A move ahead of a limit, or a person's owed move to a running session. */
  betweenTurns: "it moves between turns",
  /** A move off a limit or a refused sign-in. */
  now: "it moves now",
  /** The decision holds it until a reset. */
  held: (until: string, why: string, because: string) =>
    `held until ${until}: ${why}. Because ${because}.`,
  /** The decision keeps it where it is. */
  stays: (why: string, because: string) => `stays: ${why}. Because ${because}.`,
  /** What the decision was asked for, after "Because". */
  because: {
    limit: (account: string) => `${account} is at its limit`,
    signin: (account: string) => `${account}'s sign-in was refused`,
    hand: (to: string) => `a person moved it to ${to}`,
    forecast: (account: string, at: string) => `${account} runs out at ${at}`,
    other: (account: string) => `${account} was looked at`,
  },
  /** Why a held session waits (decide.ts `WaitWhy`). */
  waitWhy: {
    fork: "a fork stays on the account its origin's cache is on",
    off: "moving at the limit is switched off",
    full: "no other account has room for it",
    free: "its cache lasts past the reset, so waiting re-reads nothing",
    soon: "the reset comes sooner than the policy's wait",
    hand: "the account a person chose can't take it yet",
  },
  /** Why a session stays ahead of any limit (decide.ts `StayWhy`). */
  stayWhy: {
    fork: "a fork stays on the account its origin's cache is on",
    off: "moving to another account is switched off",
    waiting:
      "a person waits on it, and a forecast moves no session a person waits on",
    ended:
      "its work item ended, so it runs no turn until someone writes to it, and that send decides it again",
    bounce:
      "the hub moved it lately, and moves it again only after both accounts' 5-hour windows reset",
    unknown:
      "its cache isn't measured, and a move ahead of a limit is made only when it is free",
    dearer: "moving costs more than staying",
    full: "no move of it is free and holds",
    holds: "its account holds it",
    credits: "its account keeps it going on extra usage",
  },
  /** One account a stay or hold names, after the reason. */
  others: (list: string) => ` (${list})`,
  /** The detailed form's line under a window. */
  windowDetail: (parts: readonly string[]) => `    ${parts.join(", ")}`,
  detail: {
    spent: (pct: number) => `${pct.toFixed(1)}% spent since its reading`,
    pending: (pct: number) => `${pct.toFixed(1)}% in moves landing`,
    pace: (pct: number) => `pace ${pct.toFixed(1)}% an hour`,
    paceNone: "pace not measured",
    arriving: (tokens: number) =>
      `${Math.round(tokens / 1000).toLocaleString("en")}k weighted tokens an hour arriving`,
    usdPerPct: (usd: number) => `$${usd.toFixed(2)} a percent`,
    tokensPerPct: (tokens: number) =>
      `${Math.round(tokens / 1000).toLocaleString("en")}k weighted tokens a percent`,
    opened: (at: string) => `opened ${at}`,
  },
};

export const accountMoveWords = {
  /** The session named is none of the caller's live delegates. */
  notYours: (asked: string, yours: readonly string[]) =>
    `${asked} is not one of your live delegates, so account_move leaves it where it is. ${yours.length > 0 ? `Your live delegates: ${yours.join(", ")}.` : "You have no live delegates."}`,
  /** Several of the caller's delegates match. */
  ambiguous: (asked: string, matched: readonly string[]) =>
    `${asked} names more than one of your delegates: ${matched.join(", ")}. Name one by its handle.`,
  /** No account by that name. */
  noAccount: (asked: string, accounts: readonly string[]) =>
    `There is no account ${asked}. Accounts: ${accounts.join(", ")}.`,
  /** The target can't take it: the reason, the window, and where there is room. */
  refused: (
    title: string,
    from: string,
    reason: string,
    window: string | null,
    room: readonly string[]
  ) =>
    `${title} stays on ${from}: ${reason}${window ? ` (its ${window} window)` : ""}. ${room.length > 0 ? `Accounts with room: ${room.join(" · ")}.` : "No account has room for it now."}`,
  /** The router reads no account for the session. */
  unread: (title: string) =>
    `${title} runs on no account the router reads, so account_move can't price a move of it.`,
  /** The move went, or waits for its turn's end: its words, then the price. */
  moved: (said: string, price: string) => `${said} ${price}`,
  /** The decided price and the next best. */
  price: (usd: string, shape: string, next: string | null) =>
    `The router priced it at ${usd} (${shape})${next ? `; the next-best account is ${next}` : "; no other account would take it"}.`,
  /** The next-best account and its price. */
  next: (account: string, usd: string) => `${account} at ${usd}`,
};
