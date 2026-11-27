import {
  type Account,
  type AccountMove,
  type AccountProvider,
  AT_LIMIT_PROVIDERS,
  accountNameAmong,
  isChatgptPlan,
  keepsGoingOnExtraUsage,
  namedAccount,
  type RebalanceNotice,
} from "@cawco/core/accounts";
import { HOUR_MS, MINUTE_MS } from "@cawco/core/time";
import { windowWords } from "@cawco/core/usage/windows";
import { clockWords, heldAccountWords } from "@cawco/core/words/account-lines";
import { usdWords } from "./admission";
import { stoppedByCawOff } from "./caw-own";
import type { DbShape } from "./db";
import type { LimitHold } from "./db/at-limit";
import {
  type DecidedMove,
  type DecideFacts,
  decide,
  LOOK_AHEAD_MS,
  type MoveChoice,
  type MoveTrigger,
  runsShort,
} from "./decide";
import { accountPaces, readPeriods } from "./forecast";
import type { HubLifetimeShape, HubTimer } from "./lifetime";
import {
  type AtLimitPorts,
  compactedLine,
  factsOf,
  type LimitRow,
  lineCost,
  linePrice,
  moveSideWords,
  type Outlook,
  planOf,
} from "./limit-decision";
import type { Arrival } from "./placement";
import { weightedTokens } from "./turn-weight";
import type { AccountPaces } from "./window-paces";

/**
 * A provider's accounts as a decision reads them ({@link readProvider}),
 * and the decision ahead of any limit, taken for one session at its own
 * turn's end (at-limit composes it). A session on an account that runs
 * short (decide.ts `runsShort`) moves at its turn's end only when the move
 * is free: its cache carries to an account of its own organization. One
 * whose cache has gone cold while it sat idle is decided as the next message
 * to it is about to start its turn (limit-moves.ts `moveAtMessage`), never
 * in the background (decided 2026-11-19, "At your next message"). When an
 * account signs in or comes back from its bench, the held sessions are
 * decided again at once and the Accounts page says what that did. A
 * session moves only within its provider and harness; a fork stays with its
 * origin.
 */

/**
 * How far back a session's burn is read from its turns: five hours, a time
 * constant of its own, not any account's window.
 */
const BURN_SPAN_MS = 5 * HOUR_MS;
/** The shortest span a burn is measured over, so one turn just taken is not an hour's rate. */
const MIN_BURN_SPAN_MS = 15 * 60_000;

/** A provider's accounts as one decision, or one start's placement, reads them. */
export interface ProviderRead {
  accounts: Account[];
  /** The sessions running on each account, owed to it, or admitted onto it and not landed, with their expected burn ({@link Arrival}). */
  arrivals: Arrival[];
  /** What each session burns, weighted tokens an hour, from its own turns of the last {@link BURN_SPAN_MS}; absent when it has none. */
  burns: ReadonlyMap<string, number>;
  /** What a new session of each kind is expected to burn: its kind's sessions with turns then, averaged; null when none had any. */
  kinds: { delegates: number | null; yours: number | null };
  paces: AccountPaces;
}

/**
 * `provider`'s accounts read once for one decision or start: their paces
 * and what a percent of each window costs, from the usage summary
 * (forecast.ts `readPeriods`); what each session burns, from the turns of
 * the last {@link BURN_SPAN_MS} (the turns' time index); and the burn
 * arriving on each account. `owed`: the sessions a move at their turn's end,
 * or a launch on its way, takes to an account (server.ts `owedMoves`,
 * `launchClaims`), each arriving there now. `admitted`: the moves the
 * ledger admitted (admission.ts `arrivals`); one still on its way arrives
 * on its target since it was admitted, in place of where it runs now.
 */
export const readProvider = (
  db: DbShape,
  provider: AccountProvider,
  now: number,
  owed: ReadonlyMap<string, string> = new Map(),
  admitted: readonly Arrival[] = []
): ProviderRead => {
  const accounts = db.accounts
    .list()
    .filter((account) => account.provider === provider);
  const ids = new Set(accounts.map((account) => account.id));
  const spent = new Map<string, { first: number; weighted: number }>();
  for (const turn of db.turnUsage.list({ since: now - BURN_SPAN_MS })) {
    const at = turn.at.getTime();
    if (
      !(turn.accountId && ids.has(turn.accountId)) ||
      at <= now - BURN_SPAN_MS
    ) {
      continue;
    }
    const was = spent.get(turn.instanceId);
    spent.set(turn.instanceId, {
      first: Math.min(was?.first ?? at, at),
      weighted: (was?.weighted ?? 0) + weightedTokens(turn),
    });
  }
  const burns = new Map(
    [...spent].map(([id, one]) => [
      id,
      one.weighted / (Math.max(MIN_BURN_SPAN_MS, now - one.first) / HOUR_MS),
    ])
  );
  // Read by key, never the fleet's every row: the sessions on these
  // accounts, those owed to one, and whoever burned on them within the
  // burn's span (their kind).
  const live = db.liveOnAccounts([...ids]);
  const held = new Set(live.map((row) => row.id));
  const rows = [
    ...live,
    ...db.listedInstancesByIds(
      [...new Set([...owed.keys(), ...spent.keys()])].filter(
        (id) => !held.has(id)
      )
    ),
  ];
  const parents = new Map(rows.map((row) => [row.id, row.parentInstanceId]));
  const kindOf = (delegates: boolean): number | null => {
    const mine = [...spent].filter(([id]) => !!parents.get(id) === delegates);
    return mine.length === 0
      ? null
      : mine.reduce((sum, [, one]) => sum + one.weighted, 0) /
          mine.length /
          (BURN_SPAN_MS / HOUR_MS);
  };
  const kinds = { delegates: kindOf(true), yours: kindOf(false) };
  const running = new Set(
    live.flatMap((row) =>
      row.status === "running" && row.accountId ? [row.accountId] : []
    )
  );
  // A move admitted and not landed arrives on its target from when it was
  // admitted, in place of where it runs now; once it runs there, its own
  // row says it arrives, as any session's does.
  const onTarget = new Set(
    live.flatMap((row) =>
      admitted.some(
        (one) => one.instanceId === row.id && one.accountId === row.accountId
      )
        ? [row.id]
        : []
    )
  );
  const inFlight = admitted.filter((one) => !onTarget.has(one.instanceId));
  const landing = new Set(inFlight.map((one) => one.instanceId));
  const arrivals = rows.flatMap((row): Arrival[] => {
    const to = owed.get(row.id);
    const accountId =
      to ??
      (["running", "starting"].includes(row.status) ? row.accountId : null);
    if (!(accountId && ids.has(accountId)) || landing.has(row.id)) {
      return [];
    }
    const burn =
      burns.get(row.id) ??
      (row.parentInstanceId ? kinds.delegates : kinds.yours);
    return burn
      ? [
          {
            accountId,
            instanceId: row.id,
            burn,
            since: to ? now : (row.spawnedAt?.getTime() ?? now),
          },
        ]
      : [];
  });
  return {
    accounts,
    arrivals: [
      ...arrivals,
      ...inFlight.filter((one) => ids.has(one.accountId)),
    ],
    burns,
    kinds,
    paces: accountPaces(
      accounts,
      db.accounts.readings(),
      readPeriods(db, [...ids], now),
      running,
      now
    ),
  };
};

/** What set a look at the holds going: the accounts that came, each newly signed in or back from its bench. */
export interface RebalanceCause {
  came: { accountId: string; how: "added" | "back" }[];
}

/** One provider on one machine whose accounts came, and what came. */
export interface CameOn {
  cause: RebalanceCause;
  machineId: string;
  provider: AccountProvider;
}

export interface RebalancerDeps {
  /** At-limit's answer to the accounts as they stand: the holds decided again, the notice said. */
  accountsChanged: () => void;
  /** Sessions being moved or continued now, shared with at-limit: each is acted on once at a time. */
  acting: Set<string>;
  db: DbShape;
  lifetime: HubLifetimeShape;
  ports: Pick<
    AtLimitPorts,
    | "accountRows"
    | "admission"
    | "cacheState"
    | "changed"
    | "compactable"
    | "context"
    | "idle"
    | "machineName"
    | "move"
    | "moving"
    | "named"
    | "note"
    | "noticed"
    | "owed"
    | "waitedOn"
  >;
}

/**
 * Whether `provider`'s accounts are balanced: CawCo carries its sessions at
 * a limit (core `AT_LIMIT_PROVIDERS`, which no Antigravity move is), and a
 * move between two of them is not one ChatGPT plan swapped for another
 * (core `isChatgptPlan`), which is all a ChatGPT move could make.
 */
const balances = (provider: AccountProvider): boolean =>
  AT_LIMIT_PROVIDERS.includes(provider) && !isChatgptPlan({ provider });

export const createRebalancer = (deps: RebalancerDeps) => {
  const { db, lifetime, ports, acting } = deps;
  const rowOf = (id: string): LimitRow | undefined =>
    db.getInstancesByIds([id])[0];

  /**
   * `row` as it stands now, when it is still on `from`, running, not Caw's
   * own with Caw off (at-limit `stays`), owing no person's move, and nothing
   * else is acting on it. Whether the hub moved it lately is the decision's
   * to weigh (decide.ts, its guard against bouncing).
   */
  const candidate = (row: LimitRow, from: Account): LimitRow | undefined => {
    const fresh = rowOf(row.id);
    if (
      fresh?.status !== "running" ||
      stoppedByCawOff(db, fresh) ||
      fresh.accountId !== from.id ||
      fresh.forkedFrom !== null ||
      ports.owed().has(row.id) ||
      acting.has(row.id) ||
      db.atLimit.hold(row.id) ||
      ports.moving(fresh)
    ) {
      return undefined;
    }
    return fresh;
  };

  /** The provider's accounts signed in on `machineId`. */
  const signedInOn = (provider: AccountProvider, machineId: string) =>
    new Set(
      db.accounts
        .signins()
        .filter(
          (one) =>
            one.machineId === machineId &&
            one.state === "signed-in" &&
            db.accounts.get(one.accountId)?.provider === provider
        )
        .map((one) => one.accountId)
    );

  /**
   * Why each session on an account that runs short last stayed, as logged:
   * said once per reason, not at every turn's end.
   */
  const staySaid = new Map<string, string>();

  /** Logs `line` for `row` once while it says the same. */
  const sayOnce = (row: LimitRow, line: string): void => {
    if (staySaid.get(row.id) === line) {
      return;
    }
    staySaid.set(row.id, line);
    console.info(line);
  };

  /**
   * Moves `row` as `move` says, between turns, and writes its line, priced
   * beside the next best. One whose process still runs, or holds work for
   * later, is decided again at its next turn's end: a move ahead of a limit
   * never ends a command (decided 2026-11-19). One whose move failed
   * otherwise stays, and says why.
   */
  const carry = async (
    from: Account,
    row: LimitRow,
    target: Account,
    move: DecidedMove,
    tokens: number | null,
    runsOut: { at: number; resetsAt: number | null; window: string | null }
  ): Promise<void> => {
    const accounts = db.accounts.list();
    const plan = planOf(move);
    const whole: Extract<AccountMove, { kind: "moved" }> = {
      kind: "moved",
      from: namedAccount(from, accounts),
      to: namedAccount(target, accounts),
      sameOrganization: move.carries,
      tokens,
      window: runsOut.window,
      resetsAt: runsOut.resetsAt,
      because: { kind: "forecast", runsOutAt: runsOut.at },
      ...lineCost(move),
      price: linePrice(move.price, accounts),
    };
    const line = compactedLine(whole, plan, row.harness);
    const id = crypto.randomUUID();
    acting.add(row.id);
    let done: Awaited<ReturnType<AtLimitPorts["move"]>>;
    try {
      // The hub's own move between turns keeps any work in flight.
      done = await ports.move(
        row,
        move,
        false,
        plan.method === "whole" ? undefined : { line: id, move: line, plan },
        true
      );
    } finally {
      acting.delete(row.id);
    }
    if ("later" in done) {
      ports.changed();
      return;
    }
    if ("kept" in done) {
      // It did not move: its charge goes with it.
      ports.admission.refund(row.id);
      console.warn(
        `[rebalance] ${ports.named(row)} stays on ${accountNameAmong(from, accounts)}, not moved to ${accountNameAmong(target, accounts)} ahead of its forecast run-out: ${done.kept.why}. Its next turn's end decides again.`
      );
      return;
    }
    staySaid.delete(row.id);
    ports.note(row, line, id);
    ports.changed();
  };

  /** Why a session moves ahead of its account's run-out, as the journal says it. */
  const goWords = (move: DecidedMove): string =>
    move.carries
      ? "one organization and its cache warm, so its cache carries"
      : "its cache is cold, so moving costs what its next turn there would";

  /** Why a session stays where it is ahead of its account's run-out, as the decision says it, for the journal. */
  const stayWords = (
    decision: Exclude<MoveChoice, { kind: "move" }>
  ): string => {
    if (decision.kind === "wait") {
      return "a person moved it, and the account they chose can't take it yet";
    }
    switch (decision.why) {
      case "fork":
        return "a fork stays on the account its origin's cache is on";
      case "off":
        return "moving to another account at the limit is switched off";
      case "waiting":
        return "a person waits on it, and a forecast moves no session a person waits on; its limit decides";
      case "ended":
        return "its work item ended, so it runs no turn until a person or its parent writes, and that send decides it again";
      case "bounce":
        return "the hub moved it lately, and it is not moved again before both accounts' 5-hour windows reset";
      case "unknown":
        return "its cache isn't measured, and a move is made ahead of a limit only when it is free";
      case "full":
        return `no move of it is free and holds: ${heldList(decision)}`;
      case "dearer":
      case "holds":
      case "credits":
        return `moving costs ${usdWords(decision.moveUsd)} against ${usdWords(decision.stayUsd)} for staying`;
    }
  };

  /** Every other account and why it didn't take the session, as a line names them. */
  const heldList = (
    decision: Exclude<MoveChoice, { kind: "move" }>
  ): string => {
    const accounts = db.accounts.list();
    return (
      decision.accounts
        .flatMap((one) => {
          const account = db.accounts.get(one.accountId);
          return account
            ? [
                heldAccountWords(
                  {
                    account: namedAccount(account, accounts),
                    reason: one.reason,
                    ...(one.backAt === undefined ? {} : { backAt: one.backAt }),
                  },
                  Date.now()
                ),
              ]
            : [];
        })
        .join(" · ") || "no other account is signed in for it"
    );
  };

  /** Whether `from`'s sessions keep going on its extra usage past its plan (core `keepsGoingOnExtraUsage`). */
  const onCredits = (from: Account): boolean =>
    keepsGoingOnExtraUsage(
      from,
      db.accounts.readings().find((one) => one.accountId === from.id)
    );

  /**
   * When `row`'s account runs short (decide.ts `runsShort`: a window runs
   * out within the look-ahead and more than the policy's wait before its
   * reset), as its facts read it, with the window it runs out on; null when
   * it doesn't. The same test a target is held to, over twice the
   * look-ahead (decide.ts): no account is both.
   */
  const shortOf = (
    facts: DecideFacts
  ): { at: number; resetsAt: number | null; window: string | null } | null => {
    const { windows } = facts.current;
    const waitMs = facts.policy.waitMinutes * MINUTE_MS;
    const at = runsShort(windows, 0, LOOK_AHEAD_MS, waitMs, facts.now);
    if (at === null) {
      return null;
    }
    const window = windows.find(
      (one) => runsShort([one], 0, LOOK_AHEAD_MS, waitMs, facts.now) === at
    );
    return {
      at,
      window: window ? windowWords(window.window) || null : null,
      resetsAt: window?.resetAt ?? null,
    };
  };

  /** The facts `row` on `from` is decided on now, its own account's moment the run-out when it runs short. */
  const factsNow = (
    row: LimitRow,
    from: Account
  ):
    | {
        facts: DecideFacts;
        short: ReturnType<typeof shortOf>;
      }
    | undefined => {
    const facts = factsOf(db, ports, row, from, Date.now());
    if (!facts) {
      return;
    }
    const short = shortOf(facts);
    return {
      short,
      facts: short
        ? { ...facts, current: { ...facts.current, resetAt: short.at } }
        : facts,
    };
  };

  /**
   * One turn of `instanceId` ended (decided at its turn's end, the one
   * moment it is between turns with its account just read): when its
   * account runs short and its sessions don't go on extra usage, the one
   * decision for a forecast (decide.ts, trigger `forecast`) moves it where
   * the move is free, or it stays. Nothing is read for a session whose
   * provider has no second account signed in on its machine.
   */
  const turnEnded = async (instanceId: string): Promise<void> => {
    const ended = shortAtTurnEnd(instanceId);
    if (!ended) {
      staySaid.delete(instanceId);
      return;
    }
    const { from, row, facts, short } = ended;
    const accounts = db.accounts.list();
    const head = `[rebalance] ${ports.named(row)} is on ${accountNameAmong(from, accounts)}, which is forecast to run out at ${clockWords(short.at)}`;
    if (onCredits(from)) {
      sayOnce(
        row,
        `${head}. It stays there: past its plan its sessions keep going on its extra usage, as its setting says.`
      );
      return;
    }
    if (!(await ports.idle(row))) {
      sayOnce(
        row,
        `${head}. Its machine says it is not between turns yet, and a session moves only between turns: its next turn's end decides again.`
      );
      return;
    }
    const decision = decide(facts, { kind: "forecast", runsOutAt: short.at });
    if (decision.kind !== "move") {
      sayOnce(
        row,
        `${head}. It stays: ${stayWords(decision)}. Its next turn's end decides again.`
      );
      return;
    }
    const [move] = decision.moves;
    const target = move ? db.accounts.get(move.to) : undefined;
    if (!(move && target)) {
      return;
    }
    // Charged now, before any await, so the next decision counts it.
    const next = facts.session.costs.nextTurnUsd;
    ports.admission.charge(
      row,
      target.id,
      move.usd === null || next === null ? null : move.usd + next,
      facts.session.burn
    );
    const targetName = accountNameAmong(target, accounts);
    console.info(
      `${head}. It moves to ${targetName} between turns: ${goWords(move)}; ${moveSideWords(move, decision.tokens, targetName)}.`
    );
    await carry(from, row, target, move, decision.tokens, short);
  };

  /**
   * `instanceId` as its turn's end decides it, when its account runs short:
   * a candidate ({@link candidate}) of a balanced provider that moves at a
   * limit, with a second account of it signed in on its machine, and its
   * facts. Undefined otherwise, with nothing more read.
   */
  const shortAtTurnEnd = (
    instanceId: string
  ):
    | {
        facts: DecideFacts;
        from: Account;
        row: LimitRow;
        short: NonNullable<ReturnType<typeof shortOf>>;
      }
    | undefined => {
    const row = rowOf(instanceId);
    const from = row?.accountId ? db.accounts.get(row.accountId) : undefined;
    if (
      !(row && from) ||
      lifetime.closed() ||
      !balances(from.provider) ||
      !db.accounts.routing(from.provider).atLimit.move ||
      signedInOn(from.provider, row.machineId).size < 2
    ) {
      return;
    }
    const fresh = candidate(row, from);
    const read = fresh ? factsNow(fresh, from) : undefined;
    return fresh && read?.short
      ? { from, row: fresh, facts: read.facts, short: read.short }
      : undefined;
  };

  /** One held session's outcome after a look, for its group in a notice. */
  const heldOutcome = (
    group: RebalanceNotice["held"][number],
    from: Account,
    row: LimitRow,
    context: number | null
  ): boolean => {
    if (db.atLimit.hold(row.id)) {
      group.waiting.push(context);
      return true;
    }
    const to =
      row.accountId && row.accountId !== from.id
        ? db.accounts.get(row.accountId)
        : undefined;
    if (!to) {
      return false;
    }
    // Its cache came along, and what it re-read, as the line of its move says.
    const last = db.atLimit.latestEvent(row.id, "moved")?.move;
    const line = last?.kind === "moved" && last.to.id === to.id ? last : null;
    group.moved.push({
      to: namedAccount(to, db.accounts.list()),
      tokens: context,
      cacheKept: line?.sameOrganization ?? false,
      ...(line?.cost && !line.sameOrganization ? { cost: line.cost } : {}),
    });
    return true;
  };

  /**
   * The holds a notice for the accounts that came on `machineId` reports:
   * those of `provider` there, with each one's context as it was held.
   */
  const heldOn = (
    provider: AccountProvider,
    machineId: string
  ): { holds: LimitHold[]; tokens: Map<string, number | null> } => {
    const holds = db.atLimit
      .holds()
      .filter((one) => db.accounts.get(one.accountId)?.provider === provider);
    const rows = db
      .getInstancesByIds(holds.map((one) => one.instanceId))
      .filter((row) => row.machineId === machineId);
    const tokens = new Map(rows.map((row) => [row.id, row.contextTokens]));
    return {
      holds: holds.filter((one) => tokens.has(one.instanceId)),
      tokens,
    };
  };

  /** What a look at the holds did to each, by the account each was held on. */
  const heldOutcomes = (
    before: LimitHold[],
    tokens: Map<string, number | null>
  ): RebalanceNotice["held"] => {
    const groups = new Map<string, RebalanceNotice["held"][number]>();
    for (const held of before) {
      const from = db.accounts.get(held.accountId);
      const row = rowOf(held.instanceId);
      if (!(from && row)) {
        continue;
      }
      const group = groups.get(from.id) ?? {
        from: namedAccount(from, db.accounts.list()),
        moved: [],
        continued: 0,
        waiting: [],
      };
      const context = tokens.get(row.id) ?? row.contextTokens;
      if (heldOutcome(group, from, row, context)) {
        groups.set(from.id, group);
      }
    }
    return [...groups.values()];
  };

  /**
   * The notice the accounts that came write for the Accounts page, once the
   * holds they reach were decided again: none when no hold was there.
   */
  const notify = (
    cameOn: CameOn,
    before: { holds: LimitHold[]; tokens: Map<string, number | null> }
  ): void => {
    const accounts = db.accounts.list();
    const named = cameOn.cause.came.flatMap((one) => {
      const account = db.accounts.get(one.accountId);
      return account
        ? [{ account: namedAccount(account, accounts), how: one.how }]
        : [];
    });
    const held = heldOutcomes(before.holds, before.tokens);
    if (named.length === 0 || held.length === 0) {
      return;
    }
    const at = Date.now();
    ports.noticed({
      id: `rebalance:${named.map((one) => one.account.id).join("+")}:${cameOn.machineId}:${at}`,
      at,
      came: named,
      machine: ports.machineName(cameOn.machineId),
      running: [],
      held,
    });
  };

  /** The sign-ins and benches as the last look at them found them. */
  let known: { benched: Map<string, number>; signed: Set<string> } | null =
    null;
  let benchTimer: HubTimer | undefined;
  const signinKey = (accountId: string, machineId: string) =>
    `${accountId}\u0000${machineId}`;

  /** The signed-in sign-ins of balanced providers' accounts. */
  const limitedSignins = () =>
    db.accounts.signins().filter((one) => {
      const provider = db.accounts.get(one.accountId)?.provider;
      return one.state === "signed-in" && !!provider && balances(provider);
    });

  /** Each benched account, until when, at `now`; the next bench's end armed as a change of the accounts. */
  const benchedNow = (now: number): Map<string, number> => {
    const benched = new Map<string, number>();
    for (const one of db.accounts.bench(now)) {
      if (one.until > now) {
        benched.set(
          one.accountId,
          Math.max(benched.get(one.accountId) ?? 0, one.until)
        );
      }
    }
    lifetime.cancel(benchTimer);
    benchTimer = undefined;
    const nextEnd = Math.min(...benched.values());
    if (Number.isFinite(nextEnd) && !lifetime.closed()) {
      benchTimer = lifetime.after(
        "account bench ended",
        Math.max(1000, nextEnd - now + 1000),
        deps.accountsChanged
      );
    }
    return benched;
  };

  /**
   * The accounts that came since the last look at the sign-ins and benches:
   * newly signed in on a machine, or back from their bench, as one cause
   * per provider and machine. The first look only learns them.
   */
  const came = (): CameOn[] => {
    const signins = limitedSignins();
    const signed = new Set(
      signins.map((one) => signinKey(one.accountId, one.machineId))
    );
    const benched = benchedNow(Date.now());
    const was = known;
    known = { signed, benched };
    if (!was) {
      return [];
    }
    const causes = new Map<string, CameOn>();
    for (const one of signins) {
      const added = !was.signed.has(signinKey(one.accountId, one.machineId));
      const back =
        was.benched.has(one.accountId) && !benched.has(one.accountId);
      const provider = db.accounts.get(one.accountId)?.provider;
      if (!((added || back) && provider)) {
        continue;
      }
      const key = signinKey(provider, one.machineId);
      const entry = causes.get(key) ?? {
        cause: { came: [] },
        machineId: one.machineId,
        provider,
      };
      entry.cause.came.push({
        accountId: one.accountId,
        how: added ? "added" : "back",
      });
      causes.set(key, entry);
    }
    for (const { cause, machineId } of causes.values()) {
      const words = cause.came
        .map((one) => {
          const account = db.accounts.get(one.accountId);
          const named = account
            ? accountNameAmong(account, db.accounts.list())
            : "an account";
          return `${named} ${one.how === "added" ? "signed in" : "came back from its bench"}`;
        })
        .join(", ");
      console.info(
        `[rebalance] ${words} on ${ports.machineName(machineId)}, so the sessions held at a limit there are decided again now; a running session on an account forecast to run out moves to it at its own turn's end when that move is free.`
      );
    }
    return [...causes.values()];
  };

  return {
    came,
    heldOn,
    notify,
    turnEnded,
    /** `instanceId` never runs again: what was said of it goes. */
    forget: (instanceId: string): void => {
      staySaid.delete(instanceId);
    },
    /**
     * What `row`'s next turn's end would do with it on `from`, read and
     * nothing carried out: its account lasts, goes on its extra usage, or
     * runs short and the one decision for a forecast is taken for it
     * ({@link turnEnded}); undefined when its account is none the hub reads.
     */
    outlook: (row: LimitRow, from: Account): Outlook | undefined => {
      const read = factsNow(row, from);
      if (!read) {
        return;
      }
      const { facts, short } = read;
      if (!short) {
        return { kind: "lasts", facts };
      }
      if (onCredits(from)) {
        return { kind: "credits", runsOutAt: short.at, facts };
      }
      const trigger: MoveTrigger = { kind: "forecast", runsOutAt: short.at };
      return {
        kind: "decided",
        trigger,
        decision: decide(facts, trigger),
        facts,
      };
    },
  };
};
