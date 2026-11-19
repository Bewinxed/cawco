/**
 * `account_read` and `account_move`: an orchestrator sees what the hub's
 * account router sees and will do, and passes on an account the person
 * named. Every figure is the router's own: the facts a decision reads
 * (limit-decision.ts `factsOf`, through at-limit.ts `outlook`), the one
 * decision run on them and nothing carried out (decide.ts `decide`), and
 * the placement a start takes (routes/account-placement.ts
 * `placementPreview`). A move is a person's move (hand-move.ts), decided as
 * one (trigger `hand`). Nothing here routes around the router.
 */

import {
  type Account,
  accountNameAmong,
  type HeldReason,
  namedAccount,
} from "@cawco/core/accounts";
import { ACCOUNT_TOOL_NAMES } from "@cawco/core/delegate-types";
import type { InstanceRow } from "@cawco/core/protocol";
import { OVER_STATUSES } from "@cawco/core/protocol";
import { MINUTE_MS } from "@cawco/core/time";
import { windowWords } from "@cawco/core/usage/windows";
import {
  dollarWords,
  heldAccountWords,
  OPTION_WORDS,
} from "@cawco/core/words/account-lines";
import {
  accountMoveWords,
  accountReadWords,
  atWords,
} from "@cawco/core/words/account-tools";
import { problem } from "elysia";
import { z } from "zod";
import type { DbShape } from "./db";
import {
  type AccountVerdict,
  type DecidedMove,
  type DecideFacts,
  decide,
  type FactAccount,
  type FactWindow,
  LOOK_AHEAD_MS,
  type MoveChoice,
  type MoveTrigger,
  runsShort,
} from "./decide";
import { sessionsUnder } from "./delegation-tree";
import type { handMoveOf } from "./hand-move";
import { byId } from "./handles";
import { sessionLabel } from "./labels";
import type { LimitRow, Outlook } from "./limit-decision";
import { answered, defineTool } from "./mcp-tool";
import { namedIn } from "./placement";
import type { placementPreview } from "./routes/account-placement";

/** The account tools, by name: what a call is routed by (delegation-mcp.ts). */
export const ACCOUNT_TOOLS: ReadonlySet<string> = new Set(ACCOUNT_TOOL_NAMES);

/** The router's look-ahead, in hours, as a line says it. */
const LOOK_AHEAD_HOURS = LOOK_AHEAD_MS / (60 * MINUTE_MS);

export interface AccountToolsDeps {
  db: Pick<
    DbShape,
    | "accounts"
    | "childIdsOfParents"
    | "getInstancesByIds"
    | "itemSessionsOfParents"
    | "liveOnAccounts"
  >;
  /** A person's move of a session to an account (hand-move.ts). */
  handMove: ReturnType<typeof handMoveOf>;
  machineName: (machineId: string) => string;
  /** What the router would do with a session now (at-limit.ts `outlook`). */
  outlook: (instanceId: string) => Outlook | undefined;
  /** Which account a start would go on (routes/account-placement.ts). */
  placement: ReturnType<typeof placementPreview>;
}

/** One window as `account_read` gives it: the router's fact. */
type WindowRead = FactWindow;

/** One account as `account_read` gives it. */
export interface AccountRead {
  id: string;
  name: string;
  organization: string | null;
  /** When a window runs out before its reset, epoch ms; null when it lasts the look-ahead. */
  runsOutAt: number | null;
  sessions: number;
  /** Why it takes no session whatever the price, in words; null when it may. */
  takesNone: string | null;
  /** Why its windows were not read, in words; null when they were. */
  unread: string | null;
  windows: WindowRead[];
}

/** One live delegate: where it runs and what the router would do with it now, in words. */
export interface DelegateRead {
  account: string;
  outlook: string;
  tag: string;
  title: string;
}

export interface AccountsAnswer {
  accounts: AccountRead[];
  delegates: DelegateRead[];
  /** Where a new delegate starts, in words. */
  newDelegate: string;
  now: number;
}

/** What `account_move` did: the move's words and the router's price. */
export interface AccountMoveAnswer {
  accountId: string;
  price: string;
  state: "moved" | "pending";
  why: string;
}

/** The router's facts of one account, with the machine it read them for. */
interface FactRead {
  account: FactAccount;
  machineId: string;
  waitMs: number;
}

/** A reason of the decision's, an account named, at `now` (core `heldAccountWords`). */
const reasonWords = (
  account: Account,
  accounts: readonly Account[],
  verdict: Pick<AccountVerdict, "backAt" | "reason">,
  now: number
): string =>
  heldAccountWords(
    {
      account: namedAccount(account, accounts),
      reason: verdict.reason,
      ...(verdict.backAt === undefined ? {} : { backAt: verdict.backAt }),
    },
    now
  );

/** What a window has left before anything new lands, percent (decide.ts `leftOf`). */
const leftOf = (window: FactWindow): number =>
  100 - window.usedPct - (window.spentPct ?? 0) - (window.pendingPct ?? 0);

/** The window a floor refusal is about: the first one under its floor after `takes` percent, as the decision tests them in order. */
const floorWindow = (
  account: FactAccount | undefined,
  reason: HeldReason
): string | null => {
  const takes = reason.kind === "room" ? reason.movePct : 0;
  const window = account?.windows.find(
    (one) => leftOf(one) - takes < one.floorPct
  );
  return window ? windowWords(window.window) || null : null;
};

/** One window's use against its floor and its reset, and, detailed, its readings and pace. */
const windowLine = (
  window: WindowRead,
  now: number,
  detailed: boolean
): string[] => {
  const line = accountReadWords.window(
    windowWords(window.window),
    window.usedPct,
    100 - window.floorPct,
    window.resetAt === null ? null : atWords(window.resetAt, now)
  );
  if (!detailed) {
    return [line];
  }
  const { detail } = accountReadWords;
  const parts = [
    window.pace === null ? detail.paceNone : detail.pace(window.pace),
    ...(window.spentPct === null ? [] : [detail.spent(window.spentPct)]),
    ...(window.pendingPct === null ? [] : [detail.pending(window.pendingPct)]),
    ...(window.arriving > 0 ? [detail.arriving(window.arriving)] : []),
    ...(window.usdPerPct === null ? [] : [detail.usdPerPct(window.usdPerPct)]),
    ...(window.tokensPerPct === null
      ? []
      : [detail.tokensPerPct(window.tokensPerPct)]),
    ...(window.openedAt === null
      ? []
      : [detail.opened(atWords(window.openedAt, now))]),
  ];
  return [line, accountReadWords.windowDetail(parts)];
};

/** `account_read`'s answer as an agent reads it; `detailed` adds each window's readings and pace. */
const accountsWords =
  (detailed: boolean) =>
  (answer: AccountsAnswer): string => {
    const words = accountReadWords;
    const { now } = answer;
    const accountLines = answer.accounts.flatMap((account) => {
      const windows = account.windows.map((window) =>
        windowLine(window, now, detailed)
      );
      const parts = account.unread
        ? [account.unread]
        : [
            ...windows.map(([line]) => line ?? ""),
            account.runsOutAt === null
              ? words.lasts(LOOK_AHEAD_HOURS)
              : words.runsOut(atWords(account.runsOutAt, now)),
            ...(account.takesNone ? [words.takesNone(account.takesNone)] : []),
          ];
      return [
        words.account(
          account.name,
          account.organization,
          parts,
          account.sessions
        ),
        ...(detailed
          ? windows.flatMap(([, more]) => (more ? [more] : []))
          : []),
      ];
    });
    const delegateLines =
      answer.delegates.length > 0
        ? [
            words.delegatesHeading,
            ...answer.delegates.map((one) =>
              words.delegate(one.title, one.tag, one.account, one.outlook)
            ),
          ]
        : [words.delegatesNone];
    return [
      words.accountsHeading,
      ...accountLines,
      answer.newDelegate,
      ...delegateLines,
    ].join("\n");
  };

const ACCOUNT_READ = defineTool(
  "account_read",
  "Accounts' usage and where the router will run each of your delegates. Use it to see where work runs or why a delegate is held.",
  {
    account: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        "One account by its name, email or id: its line and the delegates on it alone."
      ),
  },
  accountsWords(false),
  { detailed: accountsWords(true) }
);

const ACCOUNT_MOVE = defineTool(
  "account_move",
  "Moves a delegate to an account. Use it only when the person names one.",
  {
    session: z
      .string()
      .trim()
      .min(1)
      .describe("One of your delegates, by its handle or id."),
    to: z
      .string()
      .trim()
      .min(1)
      .describe("The account the person named, by its name, email or id."),
  },
  (answer: AccountMoveAnswer) =>
    answer.price ? accountMoveWords.moved(answer.why, answer.price) : answer.why
);

export const createAccountTools = (deps: AccountToolsDeps) => {
  const { db } = deps;

  /** The live sessions under `caller`: its delegates, theirs, and so on (delegation-tree.ts `sessionsUnder`). */
  const delegatesOf = (caller: InstanceRow): LimitRow[] => {
    const under = sessionsUnder(db, caller.id);
    under.delete(caller.id);
    return db
      .getInstancesByIds([...under])
      .filter((row) => !OVER_STATUSES.has(row.status));
  };

  /** An account's name among every account, or the id when it is gone. */
  const nameOf = (id: string | null, accounts: readonly Account[]): string => {
    const account = id ? accounts.find((one) => one.id === id) : undefined;
    if (account) {
      return accountNameAmong(account, accounts);
    }
    return id ?? accountReadWords.onNoAccount;
  };

  /** Why the decision was asked, after "Because". */
  const becauseWords = (
    trigger: MoveTrigger,
    here: string,
    accounts: readonly Account[],
    now: number
  ): string => {
    const { because } = accountReadWords;
    switch (trigger.kind) {
      case "limit":
      case "extra-usage":
        return because.limit(here);
      case "refused-credential":
        return because.signin(here);
      case "hand":
        return because.hand(nameOf(trigger.to, accounts));
      case "forecast":
        return because.forecast(here, atWords(trigger.runsOutAt, now));
      case "wake":
        return because.other(here);
    }
  };

  /** Every other account and why it didn't take the session, after a stay or a hold that found none. */
  const othersWords = (
    decision: MoveChoice,
    accounts: readonly Account[],
    now: number
  ): string => {
    const named = decision.accounts.flatMap((one) => {
      const account = accounts.find((each) => each.id === one.accountId);
      return account ? [reasonWords(account, accounts, one, now)] : [];
    });
    return named.length > 0 ? accountReadWords.others(named.join(" · ")) : "";
  };

  /** What the router would do with a session, in words. */
  const outlookWords = (
    row: LimitRow,
    outlook: Outlook | undefined,
    accounts: readonly Account[],
    now: number
  ): string => {
    const words = accountReadWords;
    if (!outlook) {
      return words.unreadOutlook;
    }
    const here = nameOf(row.accountId, accounts);
    if (outlook.kind === "lasts") {
      return words.staysLasting(here, LOOK_AHEAD_HOURS);
    }
    if (outlook.kind === "credits") {
      return words.staysOnCredits(here, atWords(outlook.runsOutAt, now));
    }
    return decisionWords(outlook, here, accounts, now);
  };

  /** One decision the router took for a session, in words. */
  const decisionWords = (
    { decision, trigger }: Extract<Outlook, { kind: "decided" }>,
    here: string,
    accounts: readonly Account[],
    now: number
  ): string => {
    const words = accountReadWords;
    const because = becauseWords(trigger, here, accounts, now);
    if (decision.kind === "wait") {
      const why =
        words.waitWhy[decision.why] +
        (decision.why === "full" ? othersWords(decision, accounts, now) : "");
      return words.held(atWords(decision.until, now), why, because);
    }
    if (decision.kind === "stay") {
      const why =
        words.stayWhy[decision.why] +
        (decision.why === "full" ? othersWords(decision, accounts, now) : "");
      return words.stays(why, because);
    }
    const [first] = decision.moves;
    return first
      ? moveWords(first, trigger, because, accounts)
      : words.stays(words.stayWhy.full, because);
  };

  /** A move the router decided, its price beside the next best, when it goes, and why. */
  const moveWords = (
    move: DecidedMove,
    trigger: MoveTrigger,
    because: string,
    accounts: readonly Account[]
  ): string => {
    const words = accountReadWords;
    const { next } = move.price;
    const runs =
      trigger.kind === "forecast" ||
      (trigger.kind === "hand" && !trigger.stopped);
    return words.moves(
      nameOf(move.to, accounts),
      dollarWords(move.price.usd),
      OPTION_WORDS[move.shape],
      next
        ? words.nextBest(
            OPTION_WORDS[next.what],
            next.to ? nameOf(next.to, accounts) : null,
            dollarWords(next.usd)
          )
        : words.onlyOption,
      runs ? words.betweenTurns : words.now,
      because
    );
  };

  /** The router's facts of every account a read reached, by account: the first read of each. */
  const factsByAccount = (
    reads: readonly { facts: DecideFacts; machineId: string }[]
  ): Map<string, FactRead> => {
    const byAccount = new Map<string, FactRead>();
    for (const { facts, machineId } of reads) {
      const waitMs = facts.policy.waitMinutes * MINUTE_MS;
      for (const account of [facts.current, ...facts.accounts]) {
        if (!byAccount.has(account.id)) {
          byAccount.set(account.id, { account, machineId, waitMs });
        }
      }
    }
    return byAccount;
  };

  /** Why `account`'s sign-in keeps it from a session on `machineId`, in words. */
  const signinWords = (accountId: string, machineId: string): string => {
    const machine = deps.machineName(machineId);
    const signin = db.accounts
      .signins()
      .find(
        (one) => one.accountId === accountId && one.machineId === machineId
      );
    return signin && signin.state !== "signed-in"
      ? accountReadWords.signedOut(machine, signin.reason)
      : accountReadWords.notSignedIn(machine);
  };

  /** Why `account` takes no session whatever the price, in words; null when it may. */
  const takesNoneOf = (
    account: Account,
    accounts: readonly Account[],
    fact: FactRead,
    now: number
  ): string | null => {
    const { out, backAt } = fact.account;
    if (!out) {
      return null;
    }
    return out.kind === "signin"
      ? signinWords(account.id, fact.machineId)
      : reasonWords(
          account,
          accounts,
          { reason: out, ...(backAt === null ? {} : { backAt }) },
          now
        );
  };

  /** One account as the router reads it, or why it can't. */
  const accountRead = (
    account: Account,
    accounts: readonly Account[],
    fact: FactRead | undefined,
    sessions: number,
    now: number
  ): AccountRead => {
    const base = {
      id: account.id,
      name: accountNameAmong(account, accounts),
      organization: account.identity?.organization || null,
      sessions,
    };
    if (!fact) {
      return {
        ...base,
        windows: [],
        runsOutAt: null,
        takesNone: null,
        unread: accountReadWords.providerIdle(account.provider),
      };
    }
    const { out } = fact.account;
    const takesNone = takesNoneOf(account, accounts, fact, now);
    const { windows } = fact.account;
    if (windows.length === 0) {
      return {
        ...base,
        windows,
        runsOutAt: null,
        takesNone: null,
        unread: accountReadWords.unread(
          takesNone && out?.kind !== "unread"
            ? takesNone
            : accountReadWords.neverRead
        ),
      };
    }
    return {
      ...base,
      windows,
      // The one test of running short, as a rebalancing pass reads a source (rebalance.ts `shortOf`).
      runsOutAt: runsShort(windows, 0, LOOK_AHEAD_MS, fact.waitMs, now),
      takesNone,
      unread: null,
    };
  };

  /** Where a new delegate of `caller`'s starts, in words (the placement a start takes). */
  const newDelegateWords = async (
    caller: InstanceRow,
    accounts: readonly Account[]
  ): Promise<string> => {
    const placed = await deps.placement({
      harness: caller.harness,
      machineId: caller.machineId,
      kind: "delegates",
      cwd: caller.cwd,
      ...(caller.projectId ? { projectId: caller.projectId } : {}),
    });
    if (!answered(placed)) {
      return accountReadWords.newDelegateRefused(placed.response.detail);
    }
    return placed.accountId
      ? accountReadWords.newDelegate(
          nameOf(placed.accountId, accounts),
          placed.why
        )
      : accountReadWords.newDelegateNone(placed.why);
  };

  /**
   * The router's facts of each account, as read for the caller's tree; a
   * provider none of it runs on, as read for any session that runs on it,
   * as the router reads the accounts for each.
   */
  const reachedFacts = (
    tree: readonly Pick<InstanceRow, "id" | "machineId">[],
    outlooks: ReadonlyMap<string, Outlook | undefined>,
    accounts: readonly Account[],
    live: readonly Pick<LimitRow, "accountId" | "id" | "machineId">[]
  ): Map<string, FactRead> => {
    const reads = tree.flatMap((row) => {
      const outlook = outlooks.get(row.id);
      return outlook
        ? [{ facts: outlook.facts, machineId: row.machineId }]
        : [];
    });
    const reached = factsByAccount(reads);
    const providerOf = (id: string | null) =>
      accounts.find((one) => one.id === id)?.provider;
    for (const account of accounts) {
      const runner = reached.has(account.id)
        ? undefined
        : live.find((row) => providerOf(row.accountId) === account.provider);
      const outlook = runner ? deps.outlook(runner.id) : undefined;
      if (!(runner && outlook)) {
        continue;
      }
      const more = factsByAccount([
        { facts: outlook.facts, machineId: runner.machineId },
      ]);
      for (const [id, fact] of more) {
        reached.set(id, reached.get(id) ?? fact);
      }
    }
    return reached;
  };

  /** `account_read`: every account as the router reads it, where a new delegate starts, and what it would do with each live delegate. */
  const readAccounts = async (
    caller: InstanceRow,
    asked: { account?: string | undefined }
  ) => {
    const now = Date.now();
    const accounts = db.accounts.list();
    const only = asked.account ? namedIn(accounts, asked.account) : undefined;
    if (asked.account && !only) {
      return problem(404, {
        code: "no-account",
        detail: accountMoveWords.noAccount(
          asked.account,
          accounts.map((one) => accountNameAmong(one, accounts))
        ),
      });
    }
    const delegates = delegatesOf(caller);
    const outlooks = new Map(
      [caller, ...delegates].map((row) => [row.id, deps.outlook(row.id)])
    );
    const live = db.liveOnAccounts(accounts.map((one) => one.id));
    const reached = reachedFacts(
      [caller, ...delegates],
      outlooks,
      accounts,
      live
    );
    const answer: AccountsAnswer = {
      now,
      accounts: accounts
        .filter((one) => !only || one.id === only.id)
        .map((account) =>
          accountRead(
            account,
            accounts,
            reached.get(account.id),
            live.filter((row) => row.accountId === account.id).length,
            now
          )
        ),
      newDelegate: await newDelegateWords(caller, accounts),
      delegates: delegates
        .filter((row) => !only || row.accountId === only.id)
        .map((row) => ({
          tag: sessionLabel(row).tag,
          title: row.title || row.derivedTitle || sessionLabel(row).name,
          account: nameOf(row.accountId, accounts),
          outlook: outlookWords(row, outlooks.get(row.id), accounts, now),
        })),
    };
    return answer;
  };

  /** The next-best account for `row` and its price: the first other target of the decision as if it couldn't stay (at-limit.ts `credentialMoveTo`). */
  const nextBestWords = (
    facts: DecideFacts,
    target: string,
    accounts: readonly Account[]
  ): string | null => {
    const choice = decide(facts, { kind: "refused-credential" });
    const other =
      choice.kind === "move"
        ? choice.moves.find((one) => one.to !== target)
        : undefined;
    return other
      ? accountMoveWords.next(
          nameOf(other.to, accounts),
          dollarWords(other.price.usd)
        )
      : null;
  };

  /** `account_move`: a person's move of one of the caller's delegates, refused where the target can't take it. */
  const moveDelegate = async (
    caller: InstanceRow,
    asked: { session: string; to: string }
  ) => {
    const found = sessionAndTarget(caller, asked);
    if (!answered(found)) {
      return found;
    }
    const { row, target } = found;
    const now = Date.now();
    const accounts = db.accounts.list();
    const title = row.title || row.derivedTitle || sessionLabel(row).tag;
    const outlook = deps.outlook(row.id);
    if (!outlook) {
      return problem(409, {
        code: "account-unread",
        detail: accountMoveWords.unread(title),
      });
    }
    const { facts } = outlook;
    const stopped =
      outlook.kind === "decided" &&
      (outlook.trigger.kind === "limit" ||
        outlook.trigger.kind === "refused-credential");
    const decision = decide(facts, { kind: "hand", to: target.id, stopped });
    const verdict = decision.accounts.find(
      (one) => one.accountId === target.id
    );
    if (verdict && verdict.reason.kind !== "fits") {
      return problem(409, {
        code: "move-refused",
        detail: refusedWords(title, row, target, verdict, decision, facts, now),
      });
    }
    const moved = await deps.handMove(row.id, target.id);
    if (!answered(moved)) {
      return moved;
    }
    const [decided] = decision.kind === "move" ? decision.moves : [];
    const answer: AccountMoveAnswer = {
      accountId: moved.accountId,
      state: moved.state,
      why: moved.why,
      price: decided
        ? accountMoveWords.price(
            dollarWords(decided.price.usd),
            OPTION_WORDS[decided.shape],
            nextBestWords(facts, target.id, accounts)
          )
        : "",
    };
    return answer;
  };

  /** Why `target` can't take `row`: the reason, the window, and the accounts with room. */
  const refusedWords = (
    title: string,
    row: LimitRow,
    target: Account,
    verdict: AccountVerdict,
    decision: MoveChoice,
    facts: DecideFacts,
    now: number
  ): string => {
    const accounts = db.accounts.list();
    const room = decision.accounts.flatMap((one) => {
      const account = accounts.find((each) => each.id === one.accountId);
      return account && one.reason.kind === "fits"
        ? [reasonWords(account, accounts, one, now)]
        : [];
    });
    return accountMoveWords.refused(
      title,
      nameOf(row.accountId, accounts),
      verdict.reason.kind === "signin"
        ? `${accountNameAmong(target, accounts)} is ${signinWords(target.id, row.machineId)}`
        : reasonWords(target, accounts, verdict, now),
      floorWindow(
        facts.accounts.find((one) => one.id === target.id),
        verdict.reason
      ),
      room
    );
  };

  /** The delegate and the account `account_move` names, or why it names none. */
  const sessionAndTarget = (
    caller: InstanceRow,
    asked: { session: string; to: string }
  ) => {
    const delegates = delegatesOf(caller);
    const matched = byId(asked.session, delegates, (one) => one.id);
    const tags = (rows: readonly LimitRow[]) =>
      rows.map((one) => sessionLabel(one).tag);
    if (matched.length > 1) {
      return problem(409, {
        code: "session-ambiguous",
        detail: accountMoveWords.ambiguous(asked.session, tags(matched)),
      });
    }
    const [row] = matched;
    if (!row) {
      return problem(403, {
        code: "not-your-delegate",
        detail: accountMoveWords.notYours(asked.session, tags(delegates)),
      });
    }
    const accounts = db.accounts.list();
    const target =
      namedIn(accounts, asked.to) ??
      byId(asked.to, accounts, (one) => one.id)[0];
    if (!target) {
      return problem(404, {
        code: "no-account",
        detail: accountMoveWords.noAccount(
          asked.to,
          accounts.map((one) => accountNameAmong(one, accounts))
        ),
      });
    }
    return { row, target };
  };

  return {
    /** `account_read` and `account_move`, bound to the calling session (none for a listing). */
    tools(actor: InstanceRow | undefined) {
      const caller = (): InstanceRow => {
        if (!actor) {
          throw new Error("Discovery cannot execute tools");
        }
        return actor;
      };
      return [
        ACCOUNT_READ.run(async (input) => await readAccounts(caller(), input)),
        ACCOUNT_MOVE.run(async (input) => await moveDelegate(caller(), input)),
      ];
    },
  };
};

export type AccountTools = ReturnType<typeof createAccountTools>;

/** The tools as a listing reads them, before any session's handlers are bound. */
export const ACCOUNT_DEFINITIONS = [
  ACCOUNT_READ.listed(),
  ACCOUNT_MOVE.listed(),
];
