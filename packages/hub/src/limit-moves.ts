import type { Account, AccountMove } from "@cawco/core/accounts";
import {
  accountNameAmong,
  accountProvidersOf,
  CLAUDE_PROVIDER,
  DEFAULT_COMPACTION,
  LIMITED_PROVIDERS,
  namedAccount,
} from "@cawco/core/accounts";
import { detach } from "@cawco/core/detach";
import type { HarnessKind } from "@cawco/core/harness/kinds";
import { COMPACTION_ORIGIN } from "@cawco/core/harness/kinds";
import { traitsOf } from "@cawco/core/harness/traits";
import { doing } from "@cawco/core/loop-watch";
import type { InstanceStatus } from "@cawco/core/protocol";
import type { MoveEnded } from "@cawco/core/session/controls";
import { HOUR_MS } from "@cawco/core/time";
import { windowWords } from "@cawco/core/usage/windows";
import {
  accountMoveSentence,
  clockWords,
  tokenWords,
} from "@cawco/core/words/account-lines";
import { accountsWords } from "@cawco/core/words/accounts";
import { configurePage } from "@cawco/core/words/configure";
import { relaunchWords } from "@cawco/core/words/relaunch";
import { machineAccount } from "./accounts";
import { pricedTokens, projectedMove, usdWords } from "./admission";
import type {
  AccountsRead,
  CompactionPlan,
  Kept,
  MoveHow,
  Stall,
} from "./at-limit";
import {
  accountsRead,
  cacheCarries,
  compactedLine,
  compactionPlan,
  refusedUntil,
} from "./at-limit";
import type { DbShape } from "./db";
import type { ContinuationRow, ContinuationSlip } from "./db/continuations";
import type { PublicInstanceRow } from "./db/instances";
import type { OwedMove } from "./db/owed-moves";
import type { ContinuationAsker, ContinueRequest } from "./db/stored-types";
import type { HubContext } from "./hub-context";
import { cacheWarmNow, promptCacheExpiresAt } from "./keep-alive";
import type { PlacementInput } from "./placement";
import {
  accountFacts,
  place as placeAccount,
  runningAccounts,
} from "./placement";
import { sessionBurn } from "./rebalance";
import { unreachable } from "./unreachable";

/** Statuses a session is not running in: asleep, stopping, stopped or failed. */
const AT_REST: ReadonlySet<InstanceStatus> = new Set([
  "sleeping",
  "stopping",
  "stopped",
  "error",
]);

/** A session's row as the hub stores it. */
export type StoredRow = ReturnType<DbShape["getInstancesByIds"]>[number];

/** A session's row as a mover reads it. */
type MoverRow = ReturnType<DbShape["getInstancesByIds"]>[number];

/** Why a session leaves its account ({@link oweMoveOff}). */
export type MoveOffWhy = "refused" | "removed" | "signed-out";

export type LimitMovesContext = Pick<
  HubContext,
  | "SETTLED"
  | "accountWords"
  | "admission"
  | "atLimit"
  | "carryOn"
  | "carryTestFor"
  | "cloneForContinuation"
  | "continuationRefusal"
  | "credentialTurns"
  | "db"
  | "followupState"
  | "forgetPendingOf"
  | "inFlightFor"
  | "inputRefusal"
  | "keptNextWords"
  | "knownProviders"
  | "launchClaims"
  | "launchInFlight"
  | "machineName"
  | "moveRowsToAccount"
  | "noteAtLimit"
  | "owedMoves"
  | "owedTargets"
  | "prepareContinuation"
  | "processMayRun"
  | "projectTypes"
  | "publishInstances"
  | "publishStalls"
  | "publishUsage"
  | "refusalMoved"
  | "refusedFailures"
  | "registry"
  | "releaseOwed"
  | "reportToParent"
  | "resolvedModel"
  | "resumeSpawn"
  | "rowsLeave"
  | "sessionIdle"
  | "sessionName"
  | "startCompaction"
  | "startContinuation"
  | "taskAccounts"
  | "tickLeaves"
  | "turnInFlight"
>;

export const createLimitMoves = (ctx: LimitMovesContext) => {
  /**
   * The owed moves being carried now ({@link takeUpOwedMove}), by session:
   * a second ask for one joins its carry, never starts another. Only what
   * is in flight; the move itself is in {@link owedMoves} until it lands.
   */
  const owedCarries = new Map<string, Promise<void>>();

  /**
   * The row a launch of `row` runs as: on the account a person moved it to
   * (mid-turn, or while its machine was away), now that its process is being
   * replaced. Every launch takes it (`bounded`), so one that comes before the
   * turn's end (a restart, a wake after a crash, its machine's return) runs
   * on it too. The row itself names the account, and the move is over with
   * its line written, only once that launch's agent says the session's data
   * is in the account's dir ({@link landSessionDir}).
   */
  const takeOwedMove = (row: StoredRow): StoredRow => {
    const owed = ctx.owedMoves.get(row.id);
    if (owed && owed.to === undefined) {
      ctx.owedMoves.delete(row.id);
    }
    return owedOn(row);
  };

  /** `row` on the account a move owed to it names, when one does ({@link owedMoves}). */
  const owedOn = (row: StoredRow): StoredRow => {
    const to = ctx.owedMoves.get(row.id)?.to;
    return to === undefined ? row : { ...row, accountId: to };
  };

  /**
   * A Claude launch's word that its session's data is in `accountId`'s dir
   * (null: the machine's own), said once the launch carried it there and
   * before its CLI starts ({@link SESSION_DIR_READ}). The row names that
   * account from now on; a placement held for it ({@link launchClaims}) and
   * a move owed to it ({@link owedMoves}) are over, the move's line
   * written and any hold at its old account's limit ended.
   */
  const landSessionDir = (row: StoredRow, accountId: string | null): void => {
    ctx.launchClaims.delete(row.id);
    const owed = ctx.owedMoves.get(row.id);
    if (owed?.to !== undefined && owed.to === accountId) {
      ctx.owedMoves.delete(row.id);
      ctx.db.atLimit.dropHold(row.id);
      if (owed.move) {
        ctx.noteAtLimit(row, owed.move);
      }
      // What was kept for it at its old account's limit goes to this launch.
      ctx.releaseOwed({ instanceId: row.id });
    }
    if ((row.accountId ?? null) === accountId) {
      return;
    }
    ctx.db.patchInstance(row.id, { accountId });
    console.log(
      `[hub] ${row.id}'s conversation is in ${accountId ?? "the machine's own"} dir now; its row says so`
    );
    ctx.publishInstances(row.machineId);
  };

  /**
   * Why `row` cannot move to `account` by hand: the account is another
   * provider's than the session's, or is not signed in on its machine.
   */
  const handMoveRefusal = (
    row: StoredRow,
    account: Account
  ): string | undefined => {
    const { harness } = row;
    const provider = row.accountId
      ? ctx.db.accounts.get(row.accountId)?.provider
      : accountProvidersOf(
          harness,
          ctx.resolvedModel(row.machineId, harness, row.model)
        )[0];
    const named = (id: string) =>
      id === CLAUDE_PROVIDER
        ? "Claude"
        : (ctx.knownProviders().find((one) => one.id === id)?.name ?? id);
    const called = accountNameAmong(account, ctx.db.accounts.list());
    if (provider !== account.provider) {
      return provider
        ? `${ctx.sessionName(row)} runs on a ${named(provider)} account; ${called} is a ${named(account.provider)} account.`
        : `${ctx.sessionName(row)}'s model is no account's, so it can't run on ${called}.`;
    }
    const signedIn = ctx.db.accounts
      .signins()
      .some(
        (one) =>
          one.accountId === account.id &&
          one.machineId === row.machineId &&
          one.state === "signed-in"
      );
    if (signedIn) {
      return undefined;
    }
    // An account never signed in has no name of its own yet.
    return account.label || account.email
      ? `${called} isn't signed in on ${ctx.machineName(row.machineId)}; sign it in there first.`
      : `That ${named(account.provider)} account has never been signed in; sign it in on ${ctx.machineName(row.machineId)} first.`;
  };

  /**
   * What a person's move of `row` mid-turn says: it waits for the turn's end,
   * and, when its account is at its limit, that the limit will refuse that
   * turn and the move goes then.
   */
  const midTurnMoveWords = (
    row: StoredRow,
    title: string,
    fromName: string,
    toName: string
  ): string => {
    const now = Date.now();
    const resets = row.accountId
      ? refusedUntil(
          ctx.db.accounts.bench(now),
          ctx.db.accounts
            .readings()
            .find((one) => one.accountId === row.accountId),
          row.accountId,
          row.model,
          now
        )
      : null;
    return resets === null
      ? `${title} can't move from ${fromName} to ${toName} yet: it is inside a turn, and a session moves only between turns. It moves when the turn ends.`
      : `${title} can't move from ${fromName} to ${toName} yet: it is inside a turn, and ${fromName} is at its limit until ${clockWords(resets)}, so the limit will refuse that turn. It moves as soon as the turn ends and carries on on ${toName}; if ${toName} is at its limit by then, it is held until ${toName} resets.`;
  };

  /** The line a person's move of `row` to `account` writes once it lands; null for a row on no account. */
  const askedMove = (row: StoredRow, account: Account): AccountMove | null => {
    const from = row.accountId ? ctx.db.accounts.get(row.accountId) : undefined;
    const accounts = ctx.db.accounts.list();
    return from
      ? {
          kind: "moved",
          asked: true,
          from: namedAccount(from, accounts),
          to: namedAccount(account, accounts),
          sameOrganization: cacheCarries(
            from,
            account,
            cacheExpiry(row) !== null
          ),
          tokens: row.contextTokens,
          window: null,
          resetsAt: null,
        }
      : null;
  };

  /**
   * What `instanceId` is stopped by now: `carry` when its caller knows (its
   * turn was just refused at its limit, or on its sign-in), else what the
   * at-limit controller holds it on (its account's limit, or its refused
   * sign-in); undefined while it runs. No turn of it runs then, so a move
   * goes now and ends what its process holds for later
   * ({@link moveRowsToAccount} `stopped`): Claude Code restores no
   * background Bash or monitor task on resume and notes the ended ones in
   * the transcript (code.claude.com/docs/en/sessions: "Background Bash and
   * monitor tasks aren't"), so the session is told on the new account what
   * ended, and it carries on past what stopped it. Every move of a session
   * asks this one rule.
   */
  const stoppedNow = (
    instanceId: string,
    carry?: "limit" | "signin"
  ): "limit" | "signin" | undefined => {
    if (carry) {
      return carry;
    }
    const held = ctx.db.atLimit.hold(instanceId);
    if (!held) {
      return;
    }
    return held.until === null ? "signin" : "limit";
  };

  /**
   * How `row`'s move to `to` makes it small, by the one rule (at-limit.ts
   * `compactionPlan`): what stopped it (its limit, its refused sign-in), or
   * `cause` when nothing did. Whole for a session on no account.
   */
  const planFor = (
    row: StoredRow,
    to: Account,
    stopped: "limit" | "signin" | undefined,
    cause: "hand" | "forecast"
  ): CompactionPlan => {
    const from = row.accountId ? ctx.db.accounts.get(row.accountId) : undefined;
    if (!from) {
      return { method: "whole", chosen: false };
    }
    const window = contextWindowNow(row);
    const stoppedBy = {
      limit: "limit",
      signin: "refused-credential",
    } as const;
    return compactionPlan({
      carries: cacheCarries(from, to, cacheExpiry(row) !== null),
      cause: stopped ? stoppedBy[stopped] : cause,
      compactable: !ctx.inputRefusal(row.id, {
        kind: "system",
        name: COMPACTION_ORIGIN,
      }),
      policy: ctx.db.accounts.routing(from.provider).atLimit,
      reported:
        row.contextTokens === null
          ? null
          : Math.min(row.contextTokens, window ?? row.contextTokens),
    });
  };

  /**
   * `move`, the line a move whole would write, as a move `plan` compacts
   * ({@link moveAs}); undefined when it moves whole.
   */
  const howFor = (
    row: StoredRow,
    move: AccountMove | null,
    plan: CompactionPlan,
    cause: "hand" | "forecast"
  ): MoveHow | undefined => {
    if (plan.method === "whole" || move?.kind !== "moved") {
      return;
    }
    return {
      cause,
      line: crypto.randomUUID(),
      plan,
      move: compactedLine(move, plan, row.harness),
    };
  };

  /**
   * Moves `row` to `account` because a person asked, the line "Moved to …"
   * written as it moves. Its data is carried into the account's dir first
   * ({@link moveRowsToAccount}) and only then does its row name the account:
   * one at rest has its process ended for that and relaunches on it now; one
   * not running resumes on it when it next starts. One mid-turn goes on
   * reading its old account until the turn ends, so its row names that one
   * until then ({@link owedMoves}); so does one whose machine is
   * away, carried as that machine connects again ({@link takeUpMovesOn}).
   * A hold at its old account's limit
   * ends: the person chose. A carry that cannot happen is refused, the row
   * left as it was. Every answer is a sentence: what happened, why, what
   * happens next.
   */
  const moveByHand = async (
    row: StoredRow,
    account: Account
  ): Promise<
    | {
        accountId: string;
        state: "moved" | "pending";
        why: string;
      }
    | { refusal: string }
  > => {
    const move = askedMove(row, account);
    const running = !AT_REST.has(row.status);
    // Read before the carry, which ends its process at rest.
    const live = processWorks(row);
    const stopped = stoppedNow(row.id);
    const title = ctx.sessionName(row);
    const fromName = ctx.accountWords(row.accountId);
    const toName = accountNameAmong(account, ctx.db.accounts.list());
    const owe = (words: string, waitsOn: OwedMove["waits"] = "turn") => {
      ctx.owedMoves.set(row.id, {
        byHand: true,
        to: account.id,
        move,
        waits: waitsOn,
      });
      return { state: "pending" as const, accountId: account.id, why: words };
    };
    if (!ctx.registry.agent(row.machineId)) {
      return owe(
        `${title} can't move from ${fromName} to ${toName} yet: ${ctx.machineName(row.machineId)} isn't connected, and its conversation is copied on that machine. It moves as soon as ${ctx.machineName(row.machineId)} is connected again.`,
        "machine"
      );
    }
    if (running && !(await ctx.sessionIdle(row))) {
      return owe(midTurnMoveWords(row, title, fromName, toName));
    }
    // A move it still owed (asked mid-turn, to another account) is over.
    ctx.owedMoves.delete(row.id);
    const how = howFor(
      row,
      move,
      planFor(row, account, stopped, "hand"),
      "hand"
    );
    if (how) {
      return await moveByHandCompacted(row, account, how, stopped);
    }
    const { kept } = await ctx.moveRowsToAccount(
      row.machineId,
      [row],
      account.id,
      running,
      stopped
    );
    const why = kept.get(row.id);
    if (why?.running) {
      return owe(
        `${title} can't move from ${fromName} to ${toName} yet: ${why.why}. ${ctx.keptNextWords(why, toName)}`,
        why.later ? "work" : "turn"
      );
    }
    if (why) {
      return {
        refusal: `${title} stays on ${fromName}, not moved to ${toName}: ${why.why}. Nothing changed; move it again once that is fixed.`,
      };
    }
    ctx.db.atLimit.dropHold(row.id);
    ctx.publishInstances(row.machineId);
    ctx.publishStalls();
    // One at rest is relaunched only when its limit or sign-in cut its last
    // turn: its carry-on starts it there ({@link relaunchOnAccount}).
    if (live || stopped) {
      relaunchOnAccount(row.id, stopped, live);
    }
    if (move) {
      ctx.noteAtLimit(row, move);
    }
    // What was kept for it at its old account's limit goes to it there.
    ctx.releaseOwed({ instanceId: row.id });
    return {
      state: "moved",
      accountId: account.id,
      why: handMovedWords(live, title, fromName, toName),
    };
  };

  /**
   * A person's move of `row` to `account` that compacts it as its provider's
   * policy says (`how`, {@link moveAs}): before the move, or from a summary,
   * it goes once that is done, and the answer says it waits; after it, it
   * moves now. One whose carry can't happen now is owed or refused as a
   * move whole is.
   */
  const moveByHandCompacted = async (
    row: StoredRow,
    account: Account,
    how: MoveHow,
    stopped: "limit" | "signin" | undefined
  ): Promise<
    | { accountId: string; state: "moved" | "pending"; why: string }
    | { refusal: string }
  > => {
    const title = ctx.sessionName(row);
    const fromName = ctx.accountWords(row.accountId);
    const toName = accountNameAmong(account, ctx.db.accounts.list());
    const done = await moveAs(row, account.id, stopped ?? false, how);
    if ("kept" in done) {
      const why = done.kept;
      if (why.running) {
        ctx.owedMoves.set(row.id, {
          byHand: true,
          to: account.id,
          move: how.move,
          waits: why.later ? "work" : "turn",
        });
        return {
          state: "pending",
          accountId: account.id,
          why: `${title} can't move from ${fromName} to ${toName} yet: ${why.why}. ${ctx.keptNextWords(why, toName)}`,
        };
      }
      return {
        refusal: `${title} stays on ${fromName}, not moved to ${toName}: ${why.why}. Nothing changed; move it again once that is fixed.`,
      };
    }
    ctx.db.atLimit.dropHold(row.id);
    ctx.publishInstances(row.machineId);
    ctx.publishStalls();
    if ("later" in done) {
      return {
        state: "pending",
        accountId: account.id,
        why:
          how.plan.method === "summary"
            ? `${title}: ${accountsWords.atLimit.summaryHint}`
            : `${title}: ${accountMoveSentence(how.move, Date.now())}`,
      };
    }
    ctx.noteAtLimit(row, how.move, how.line);
    return {
      state: "moved",
      accountId: account.id,
      why: `${title}: ${accountMoveSentence(how.move, Date.now())}`,
    };
  };

  /**
   * Whether `row`'s process works now: its row says it runs, no launch of it
   * is on its way, and it is not being ended. The one rule every account
   * move reads before it relaunches a session ({@link relaunchOnAccount},
   * {@link relaunchMoved}), read before the move's carry ends the process
   * at rest. A session at rest (asleep, failed, or filed anything but
   * running) is moved, never started: its next wake starts it on the
   * account its row names. A launch on its way (a register's restore of a
   * cut turn, a wake) takes the move itself as it goes ({@link takeOwedMove}).
   * The rule before read the status alone (`notRunning`: anything but
   * sleeping, stopped or failed), so a row the register's restore had just
   * filed `starting`, or one still `unknown` or `running` from before the
   * boot, was relaunched as it owed a move, beside its own launch: obelisk,
   * 2026-10-23 20:16:32, 19 September sessions "relaunches on …, its
   * conversation resumed" in one second.
   */
  const processWorks = (row: {
    id: string;
    machineId: string;
    status: string;
  }): boolean =>
    row.status === "running" &&
    !ctx.launchInFlight(row.id) &&
    !ctx.db.ownedInstance(row.id, row.machineId)?.endIntent;

  /** What a person's move that went says: copied, and relaunched now or at its next start. */
  const handMovedWords = (
    running: boolean,
    title: string,
    fromName: string,
    toName: string
  ): string =>
    running
      ? `${title} moved from ${fromName} to ${toName}: its conversation was copied whole and it relaunched there. What was kept for it goes to it now.`
      : `${title} moved from ${fromName} to ${toName}: its conversation was copied there, and it runs on ${toName} when it next starts.`;

  /**
   * Relaunches a session on the account its row now names (or on none), its
   * conversation whole: Claude Code's is carried into that account's dir; pi
   * reopens its session file on that account's runtime; OpenCode carries it
   * into that account's server. A person's move it owes ({@link
   * owedMoves}) is carried first, its process ended at rest for it,
   * and its row names the account only once its data is there; one whose
   * carry cannot happen stays on its account and in place. `carry`: its
   * turn was refused at its account's limit (or on its sign-in), so it is
   * told to carry on there, relaunched or not, and answers there what that
   * turn was asked. `live`: whether its process worked before the carry
   * ended it ({@link processWorks}), read now when no carry came first; only
   * then is it relaunched.
   */
  const relaunchOnAccount = (
    instanceId: string,
    carry?: "limit" | "signin",
    live?: boolean
  ): void => {
    const going = takeUpOwedMove(instanceId, carry);
    if (going !== undefined) {
      // The carry runs on its own; the relaunch follows it.
      detach(going, "account move");
      return;
    }
    const [stored] = ctx.db.getInstancesByIds([instanceId]);
    const row = stored && takeOwedMove(stored);
    const agent = row ? ctx.registry.agent(row.machineId) : undefined;
    if (!(row?.sessionId && agent)) {
      return;
    }
    // At rest, starting, or being ended: a move never relaunches it. Its row
    // names the account now, so whatever wakes it next starts it there. A
    // turn its limit or sign-in cut is that wake: its carry-on goes now,
    // whatever its process's state, as any send does (it starts one at
    // rest, and waits for one starting to be up). Dropped here, nothing
    // sent it again until a person wrote (obelisk, 2026-11-05 12:40).
    if (!(live ?? processWorks(row))) {
      console.log(
        relaunchWords.atRest(
          ctx.sessionName(row),
          ctx.accountWords(row.accountId),
          row.status,
          ctx.launchInFlight(row.id),
          carry !== undefined
        )
      );
      if (carry) {
        ctx.carryOn(row, carry);
      }
      return;
    }
    console.log(
      relaunchWords.onAccount(
        ctx.sessionName(row),
        ctx.accountWords(row.accountId),
        carry ? " and told to carry on past the limit that stopped it" : ""
      )
    );
    ctx.resumeSpawn(
      agent,
      row.machineId,
      { ...row, sessionId: row.sessionId },
      true
    );
    if (carry) {
      ctx.carryOn(row, carry);
    }
  };

  /**
   * An owed move whose carry did not land ({@link takeUpOwedMove}), its
   * record still its own (`mine`): one whose process still runs owes it at
   * its turn's end; one whose machine went away under the carry owes it to
   * the machine's return; any other is dropped. Each says why in the log.
   */
  const keepUncarried = (
    stored: StoredRow,
    owed: OwedMove,
    to: string,
    why: Kept,
    mine: boolean
  ): void => {
    const away = !(why.running || ctx.registry.agent(stored.machineId));
    if (mine && why.running) {
      ctx.owedMoves.set(stored.id, {
        ...owed,
        waits: why.later ? "work" : "turn",
      });
    } else if (mine && away) {
      ctx.owedMoves.set(stored.id, { ...owed, waits: "machine" });
    } else if (mine) {
      ctx.owedMoves.delete(stored.id);
    }
    const next = away
      ? `It moves as soon as ${ctx.machineName(stored.machineId)} is connected again.`
      : ctx.keptNextWords(why, ctx.accountWords(to));
    console.warn(
      `[accounts] ${ctx.sessionName(stored)} can't move from ${ctx.accountWords(stored.accountId)} to ${ctx.accountWords(to)} yet: ${why.why}. ${next}`
    );
  };

  /**
   * The move `instanceId` owes ({@link owedMoves}), carried now: its
   * process ended at rest and its data carried into the account's dir, then
   * its row names the account, the move's line is written, and it relaunches
   * there (`carry`: told to carry on past the limit that stopped it). Its
   * record stays until the carry lands, so a hub that dies under it carries
   * it again on its return (a carry is idempotent: one already there moves
   * nothing). One whose process still runs owes it at its turn's end; one
   * whose machine went away under the carry owes it to the machine's
   * return; one whose carry cannot happen stays where it is, the move
   * dropped. A move asked meanwhile replaces it, and only its own outcome
   * clears it. A second ask while it is carried joins that carry
   * ({@link owedCarries}). A session stopped at its limit or on its sign-in
   * (`carry`, else its hold: {@link stoppedNow}) moves now, ending what its
   * process holds for later, and carries on there. Undefined when it owes
   * no move to an account, or its machine is away: nothing was taken up.
   */
  const takeUpOwedMove = (
    instanceId: string,
    carry?: "limit" | "signin"
  ): Promise<void> | undefined => {
    const inFlight = owedCarries.get(instanceId);
    if (inFlight !== undefined) {
      return inFlight;
    }
    const [stored] = ctx.db.getInstancesByIds([instanceId]);
    const owed = stored ? ctx.owedMoves.get(stored.id) : undefined;
    if (!(
      stored &&
      owed?.to !== undefined &&
      ctx.registry.agent(stored.machineId)
    )) {
      return undefined;
    }
    const { to } = owed;
    /** The record is still this move's: no newer ask replaced it. */
    const still = () => ctx.owedMoves.get(stored.id)?.to === to;
    const stopped = stoppedNow(stored.id, carry);
    // Weighed now it goes: a move owed before it was compacted (a person's,
    // a rebalance's) compacts as the policy says; one whose line already
    // says how it was compacted goes as it is.
    const toAccount = ctx.db.accounts.get(to);
    const cause = owed.byHand ? "hand" : "forecast";
    const how =
      toAccount && owed.move?.kind === "moved" && !owed.move.compact
        ? howFor(
            stored,
            owed.move,
            planFor(stored, toAccount, stopped, cause),
            cause
          )
        : undefined;
    if (how) {
      const compacted = moveOwedCompacted(
        stored,
        owed,
        to,
        how,
        stopped
      ).finally(() => owedCarries.delete(instanceId));
      owedCarries.set(instanceId, compacted);
      return compacted;
    }
    // Read before the carry, which ends its process at rest.
    const live = processWorks(stored);
    const carried = ctx
      .moveRowsToAccount(stored.machineId, [stored], to, true, stopped)
      .then(({ kept }) => {
        const why = kept.get(stored.id);
        if (why) {
          keepUncarried(stored, owed, to, why, still());
          return false;
        }
        if (still()) {
          ctx.owedMoves.delete(stored.id);
        }
        ctx.db.atLimit.dropHold(stored.id);
        ctx.publishInstances(stored.machineId);
        ctx.publishStalls();
        if (owed.move) {
          ctx.noteAtLimit(stored, owed.move);
        }
        return true;
      })
      .finally(() => owedCarries.delete(instanceId))
      .then((landed) => {
        // Behind the carry's own end, so its relaunch (and a newer move
        // asked meanwhile) is taken up afresh, never joined to this one.
        if (landed) {
          relaunchOnAccount(stored.id, stopped, live);
          ctx.releaseOwed({ instanceId: stored.id });
        }
      });
    owedCarries.set(instanceId, carried);
    return carried;
  };

  /**
   * A move `stored` owed ({@link takeUpOwedMove}) that compacts it as its
   * provider's policy says (`how`, {@link moveAs}): its record goes as it is
   * taken up, its line written as the move goes; one whose carry can't
   * happen now is kept as an uncarried move whole is.
   */
  const moveOwedCompacted = async (
    stored: StoredRow,
    owed: OwedMove,
    to: string,
    how: MoveHow,
    stopped: "limit" | "signin" | undefined
  ): Promise<void> => {
    const mine = () => ctx.owedMoves.get(stored.id)?.to === to;
    if (mine()) {
      ctx.owedMoves.delete(stored.id);
    }
    const done = await moveAs(stored, to, stopped ?? false, how);
    if ("kept" in done) {
      ctx.owedMoves.set(stored.id, owed);
      keepUncarried(stored, owed, to, done.kept, true);
      return;
    }
    ctx.db.atLimit.dropHold(stored.id);
    ctx.publishInstances(stored.machineId);
    ctx.publishStalls();
    if (!("later" in done)) {
      ctx.noteAtLimit(stored, how.move, how.line);
    }
  };

  /**
   * `machineId` is connected again: each move owed to a session on it is
   * taken up now, never left for a start that a session held at its old
   * account's limit would not make. One held at its limit is looked at by
   * the at-limit controller ({@link AtLimit.lookNow}), which carries out a
   * person's move; any other owed move is carried as at a turn's end
   * ({@link takeUpOwedMove}), and owed again by one inside a turn. A
   * relaunch alone (`to` absent) goes now when the session is at rest, as
   * its turn's end would have relaunched it, else at that end. This is also
   * how a hub restart carries out what {@link owedMoves} holds: every
   * machine registers again. Each says why in the log.
   */
  const takeUpMovesOn = (machineId: string): void => {
    const onMachine = ctx.owedMoves
      .list()
      .filter(
        ([id]) => ctx.db.getInstancesByIds([id])[0]?.machineId === machineId
      );
    const owedHere = onMachine.filter(([, owed]) => owed.to !== undefined);
    for (const [id] of onMachine.filter(([, owed]) => owed.to === undefined)) {
      detach(
        (async () => {
          const [row] = ctx.db.getInstancesByIds([id]);
          if (row && ctx.owedMoves.has(id) && (await ctx.sessionIdle(row))) {
            relaunchOnAccount(id);
          }
        })(),
        "owed relaunch"
      );
    }
    const heldHere = ctx.db.atLimit
      .holds()
      .filter(
        (held) =>
          ctx.db.getInstancesByIds([held.instanceId])[0]?.machineId ===
          machineId
      );
    for (const held of heldHere) {
      detach(
        ctx.atLimit.lookNow(
          held.instanceId,
          `${ctx.machineName(machineId)} is connected again`
        ),
        "at-limit look"
      );
    }
    for (const [id, owed] of owedHere) {
      if (heldHere.some((held) => held.instanceId === id)) {
        continue;
      }
      const [row] = ctx.db.getInstancesByIds([id]);
      console.info(
        `[accounts] ${row ? ctx.sessionName(row) : id} owed a move to ${ctx.accountWords(owed.to)} while ${ctx.machineName(machineId)} was away; it is connected again, so the move is carried out now.`
      );
      const going = takeUpOwedMove(id);
      if (going !== undefined) {
        detach(going, "owed move");
      }
    }
  };

  /**
   * A turn refused at its account's limit by a session that owes a move
   * ({@link owedMoves}: a person's, or rebalance's) to an account
   * that can take it now: the move is made, as at any turn's end, and the
   * session carries on there. True when it was; false leaves the refusal to
   * the at-limit controller.
   */
  const moveOwedAtRefusal = (instanceId: string): boolean => {
    const owed = ctx.owedMoves.get(instanceId);
    const [row] = ctx.db.getInstancesByIds([instanceId]);
    const to = owed?.to ? ctx.db.accounts.get(owed.to) : undefined;
    if (!(row && to) || to.id === row.accountId) {
      return false;
    }
    const now = Date.now();
    const reading = ctx.db.accounts
      .readings()
      .find((one) => one.accountId === to.id);
    if (
      refusedUntil(
        ctx.db.accounts.bench(now),
        reading,
        to.id,
        row.model,
        now
      ) !== null
    ) {
      return false;
    }
    console.info(
      `[at-limit] ${ctx.sessionName(row)}'s turn was refused: ${ctx.accountWords(row.accountId)} is at its limit. It already owed a move to ${accountNameAmong(to, ctx.db.accounts.list())}, which has room, so it moves there now and carries on there.`
    );
    relaunchOnAccount(row.id, "limit");
    return true;
  };

  /**
   * Where placement puts a session that runs on `accountId` now, for the
   * kind of session it is, on its machine, within its project's and task's
   * lists and its type's preference, its own burn in the carry test: it
   * moves only to an account that lasts to its reset with it, and stays when
   * none does (placement.ts `current`).
   */
  const replaceRow = (
    row: ReturnType<typeof ctx.db.getInstancesByIds>[number],
    accountId: string
  ): string | null => {
    // The provider of the account it is on: it moves only among that
    // provider's accounts signed in for its harness on its machine.
    const provider = ctx.db.accounts.get(accountId)?.provider;
    if (!provider) {
      return null;
    }
    const routing = ctx.db.accounts.routing(provider);
    const asks = rowAsks(row);
    const now = Date.now();
    const placed = placeAccount({
      ...accountFacts(ctx.db, provider),
      routing,
      machineId: row.machineId,
      machineName: ctx.machineName(row.machineId),
      ...(row.model ? { model: row.model } : {}),
      ...asks,
      ...ctx.carryTestFor(
        provider,
        routing[asks.kind].strategy,
        (forecast) =>
          sessionBurn(forecast.turns.get(accountId) ?? [], row.id, now),
        row.id
      ),
      current: accountId,
      now,
    });
    return placed.ok ? placed.accountId : null;
  };

  /** What a running session asks of placement: its kind, its project's and task's lists, its type's account. */
  const rowAsks = (
    row: ReturnType<typeof ctx.db.getInstancesByIds>[number]
  ): Pick<
    PlacementInput,
    "kind" | "projectAccounts" | "taskAccounts" | "typeAccount"
  > => {
    const item = row.workItemId ? ctx.db.workItem(row.workItemId) : undefined;
    const projectId = row.projectId ?? item?.projectId ?? null;
    const typeAccount = row.delegateType
      ? ctx.projectTypes.resolveTypeFor(
          row.delegateTypeProject ?? projectId ?? undefined,
          row.delegateType
        )?.account
      : undefined;
    return {
      kind: row.parentInstanceId ? "delegates" : "yours",
      // One on its project's account stays there (placement.ts `runningAccounts`).
      projectAccounts: projectId
        ? runningAccounts(ctx.db.project(projectId), row.accountId)
        : null,
      taskAccounts: ctx.taskAccounts(projectId, item?.taskId),
      ...(typeAccount ? { typeAccount } : {}),
    };
  };

  /** Whether a session's prompt cache is still warm, as the cold check reads it (keep-alive.ts `cacheWarmNow`). */
  const cacheWarm = (
    row: ReturnType<typeof ctx.db.getInstancesByIds>[number]
  ): boolean => {
    const state = ctx.followupState(row);
    return cacheWarmNow(row, state.midTurn, state.lastTurnAt);
  };

  /**
   * When `row`'s prompt cache lapses on its account, as measured (its last
   * request and the TTL its cache was written with); null when it is cold
   * already, or no lifetime was measured. Only a measured lifetime says a
   * cache outlives a reset or carries a move: a session that never wrote a
   * cache would wait up to an hour with nothing to keep.
   */
  const cacheExpiry = (
    row: ReturnType<typeof ctx.db.getInstancesByIds>[number]
  ): number | null => {
    if (row.cacheCold) {
      return null;
    }
    const expires = promptCacheExpiresAt(row);
    return expires !== null && expires > Date.now() ? expires : null;
  };

  /** What a cold wake's move re-reads on `toName`, as its line says it. */
  const wakeReReadWords = (
    figures: ReturnType<typeof ctx.admission.check>,
    tokens: number,
    toName: string
  ): string => {
    const name = figures.window ? windowWords(figures.window) : "";
    const window = `${toName}'s ${name ? `${name} ` : ""}window`;
    return `re-reading ${tokenWords(tokens)} cold costs ${usdWords(figures.projected.reReadUsd)}, ${figures.movePct === null ? `and ${window} isn't measured in dollars yet` : `≈${figures.movePct.toFixed(1)}% of ${window}, leaving it ${Math.round(figures.roomAfter)}%`}`;
  };

  /**
   * Why a cold wake's move to `toName` doesn't go, in words; undefined when
   * it does. Unmeasured, the target takes one move at a time; measured, only
   * one that leaves it room.
   */
  const wakeKept = (
    figures: ReturnType<typeof ctx.admission.check>,
    toName: string,
    reRead: string
  ): string | undefined => {
    if (figures.unmeasured) {
      return figures.pendingMoves > 0
        ? `another move is still landing on ${toName}`
        : undefined;
    }
    return figures.roomAfter <= 0
      ? `${reRead}, more than it has left`
      : undefined;
  };

  /**
   * Whether a cold wake leaves `row` on `accountId`: a person moved it there,
   * its start named that account, or it is its project's account.
   */
  const keptAtWake = (
    row: ReturnType<typeof ctx.db.getInstancesByIds>[number],
    accountId: string
  ): boolean => {
    const last = ctx.db.atLimit
      .events([row.id])
      .findLast((one) => one.move.kind === "moved")?.move;
    if (last?.kind === "moved" && last.asked) {
      return true;
    }
    const project = row.projectId ? ctx.db.project(row.projectId) : undefined;
    return (
      row.namedAccount === accountId ||
      project?.inEffect.account.value === accountId
    );
  };

  /**
   * A Claude session woken for a send with its cache cold is re-placed
   * first, by its kind's strategy: its first request re-reads its whole
   * context wherever it runs, so moving it costs nothing extra (fleet
   * history, at-limit check 3: own-account cold re-writes median 1.0 of the
   * prompt, cross-organization 0.94). It is charged against the target's
   * room like every move (admission.ts), so a reset never takes a herd of
   * waking sessions at once; one that does not fit wakes where it is, and
   * one admitted onto its account in this window stays. The move is owed to its launch
   * ({@link owedMoves}), which carries its conversation into the
   * new account's dir; its line is written once that has. A fork stays with
   * its origin, and one a person moved, whose start named its account or on
   * its project's account stays ({@link keptAtWake}); only Claude's
   * conversations are carried this way.
   */
  const replaceAtWake = (
    row: ReturnType<typeof ctx.db.getInstancesByIds>[number]
  ): void => {
    const from = row.accountId ? ctx.db.accounts.get(row.accountId) : undefined;
    if (
      !from ||
      traitsOf(row.harness).accountModel !== "dir" ||
      !LIMITED_PROVIDERS.includes(from.provider) ||
      row.forkedFrom !== null ||
      ctx.owedMoves.has(row.id) ||
      ctx.db.atLimit.hold(row.id) ||
      cacheWarm(row) ||
      !ctx.db.accounts.routing(from.provider).atLimit.move ||
      ctx.admission.admittedHere(row)
    ) {
      return;
    }
    if (keptAtWake(row, from.id)) {
      return;
    }
    const toId = replaceRow(row, from.id);
    const to = toId ? ctx.db.accounts.get(toId) : undefined;
    if (!to || to.id === from.id) {
      return;
    }
    const accounts = ctx.db.accounts.list();
    const toName = accountNameAmong(to, accounts);
    const now = Date.now();
    const tokens = pricedTokens(row.contextTokens, contextWindowNow(row));
    const figures = ctx.admission.check(
      row,
      to.id,
      projectedMove(row, tokens, false, now),
      now
    );
    const reRead = wakeReReadWords(figures, tokens, toName);
    const kept = wakeKept(figures, toName, reRead);
    if (kept) {
      console.info(
        `[rebalance] ${ctx.sessionName(row)} wakes on ${accountNameAmong(from, accounts)}, not moved to ${toName}: its prompt cache is cold, so it re-reads its context wherever it wakes, but ${kept}.`
      );
      return;
    }
    const { reReadUsd, allowanceUsd } = figures.projected;
    ctx.admission.charge(
      row,
      to.id,
      reReadUsd === null ? null : reReadUsd + allowanceUsd
    );
    console.info(
      `[rebalance] ${ctx.sessionName(row)} moves from ${accountNameAmong(from, accounts)} to ${toName} as it wakes: its prompt cache is cold, so re-reading its context costs the same on either account, and ${toName} is where placement puts it now; ${reRead}. Its conversation is copied there before it starts.`
    );
    ctx.owedMoves.set(row.id, {
      to: to.id,
      move: {
        kind: "moved",
        from: namedAccount(from, accounts),
        to: namedAccount(to, accounts),
        sameOrganization: false,
        tokens,
        window: null,
        resetsAt: null,
        because: { kind: "cold", wake: true },
      },
      waits: "turn",
    });
  };

  /**
   * How long a turn on an account proves its sign-in on that machine: an
   * access token's life, "Fresh tokens here are valid for 8 hours"
   * (github.com/anthropics/claude-code/issues/88054). A dir Claude Code
   * reports signed in, on a token alone, may hold a refresh token already
   * spent; one a turn used within this window holds a live access token, or
   * a refresh that succeeded since ("the refresh token is rotated on use",
   * github.com/anthropics/claude-code/issues/52202).
   */
  const SIGNIN_PROVEN_MS = 8 * HOUR_MS;

  /**
   * The tokens one request to `row`'s model may send, as the fleet knows it
   * now: claude's from the turns the hub has seen (its catalog has none;
   * no model named is Claude Code's own default, which its machine's
   * account's catalog resolves). Null for any other harness here, and when
   * unknown: never a guess.
   */
  const contextWindowNow = (
    row: ReturnType<typeof ctx.db.getInstancesByIds>[number]
  ): number | null => {
    if (traitsOf(row.harness).contextWindow !== "hub") {
      return null;
    }
    const accountId = row.accountId ?? machineAccount(ctx.db, row.machineId);
    const id =
      row.model ??
      ctx.db.accounts
        .catalogs()
        .find((one) => one.accountId === accountId)
        ?.models.find((one) => one.value === "default")?.resolvedModel;
    return (id ? ctx.db.claudeContextWindows()[id] : undefined) ?? null;
  };

  /**
   * Every other account of `leaving`'s provider as a decision for `row`
   * reads it (at-limit.ts `decideStop`): placement's rows (placement.ts
   * `accountRows`) with the burn already arriving on each, the ledger's
   * figures (admission.ts), and whether a turn on `row`'s machine proved its
   * sign-in lately; `row`'s own burn, its kind's strategy, its model's window.
   */
  const limitRows = (
    row: ReturnType<typeof ctx.db.getInstancesByIds>[number],
    leaving: string
  ): AccountsRead =>
    accountsRead(ctx.db, ctx.admission, row, leaving, {
      asks: rowAsks(row),
      machineName: ctx.machineName(row.machineId),
      owed: ctx.owedTargets(),
      provenSince: Date.now() - SIGNIN_PROVEN_MS,
      window: contextWindowNow(row),
    });

  /**
   * A session the at-limit controller moved, its conversation now in its new
   * account's dir, relaunched there with it: what the move ended first, then,
   * when its limit or sign-in stopped it, its carry-on, the two read as the
   * one turn that answers what the refused turn asked; with `compact`, that
   * carry-on is the compaction's first step, and its filing turn and its
   * harness's `/compact` follow it, before anything else it is owed (which
   * waits behind them, {@link compactions}). Relaunched only when its
   * process worked before the move (`live`, {@link processWorks}); one at
   * rest is moved, and what it is told next (its carry-on, a compaction's
   * step) goes as any send to a session at rest does.
   */
  const relaunchMoved = (
    agent: NonNullable<ReturnType<typeof ctx.registry.agent>>,
    now: ReturnType<typeof ctx.db.getInstancesByIds>[number] & {
      sessionId: string;
    },
    stopped: false | "limit" | "signin",
    compact: { line: string; move: AccountMove } | undefined,
    live: boolean
  ): void => {
    if (live) {
      console.log(
        relaunchWords.onAccount(
          ctx.sessionName(now),
          ctx.accountWords(now.accountId),
          `${compact ? ", files its open items and is compacted" : ""}${stopped ? `${compact ? ", then is" : " and"} told to carry on past what stopped it` : ""}`
        )
      );
      ctx.resumeSpawn(agent, now.machineId, now, true);
    } else {
      console.log(
        relaunchWords.atRest(
          ctx.sessionName(now),
          ctx.accountWords(now.accountId),
          now.status,
          false,
          stopped !== false
        )
      );
    }
    if (compact) {
      ctx.startCompaction(now, compact.line, compact.move, stopped);
      return;
    }
    if (stopped) {
      ctx.carryOn(now, stopped);
    }
  };

  /**
   * Carries `row`'s conversation whole to `accountId` and relaunches it
   * there ({@link relaunchMoved}), `compact` its native compaction after the
   * move. Its process ends at rest and its data goes into the account's dir,
   * and only then does its row say the account; it starts again there when
   * that process worked (read before the carry ends it). One that did not
   * move stays on its account; a process the carry ended there is asleep. A
   * stopped session's move ends what it holds for later, unless no person
   * waits on it: then it waits for that work up to the cap from
   * `laterSince`. A rebalance's of a running one waits for it.
   */
  const carryTo = async (
    row: MoverRow,
    accountId: string,
    stopped: false | "limit" | "signin",
    compact: { line: string; move: AccountMove } | undefined,
    laterSince: number | undefined
  ): Promise<{ kept: Kept } | { ended?: MoveEnded }> => {
    if (!(ctx.registry.agent(row.machineId) && row.sessionId)) {
      return {
        kept: {
          running: false,
          why: row.sessionId
            ? `${ctx.machineName(row.machineId)} is not connected.`
            : "it has no conversation to copy yet",
        },
      };
    }
    const live = processWorks(row);
    const { kept, ended } = await ctx.moveRowsToAccount(
      row.machineId,
      [row],
      accountId,
      true,
      stopped || undefined,
      laterSince
    );
    const why = kept.get(row.id);
    if (why) {
      return { kept: why };
    }
    const agent = ctx.registry.agent(row.machineId);
    const [now] = ctx.db.getInstancesByIds([row.id]);
    if (!(agent && now?.sessionId)) {
      return {
        kept: {
          running: false,
          why: `${ctx.machineName(row.machineId)} is not connected.`,
        },
      };
    }
    relaunchMoved(
      agent,
      { ...now, sessionId: now.sessionId },
      stopped,
      compact,
      live
    );
    const what = ended.get(row.id);
    return what ? { ended: what } : {};
  };

  /**
   * THE ONE MOVER: `row` to `accountId`, made small as `how`'s plan says
   * (at-limit.ts `compactionPlan`; absent, whole). Whole, or natively after
   * the move: carried now ({@link carryTo}). Natively before it: its filing
   * turn and its harness's `/compact` run where it is, and the move follows
   * once they end ({@link compactFirst}). From a summary: the same session
   * goes on in a fresh conversation on `accountId` ({@link continueAsMove});
   * one that can't leaves it where it is, as does a compaction before the
   * move that compacted nothing ({@link compactFirstFailed}): a move goes
   * the way its plan says or not at all. Every mover calls this: the
   * at-limit controller, the rebalance, a person's move and a move owed to a
   * turn's end.
   */
  const moveAs = async (
    row: MoverRow,
    accountId: string,
    stopped: false | "limit" | "signin",
    asked: MoveHow | undefined,
    laterSince?: number
  ): Promise<{ kept: Kept } | { ended?: MoveEnded } | { later: true }> => {
    doing(
      `the move of ${ctx.sessionName(row)} to ${ctx.accountWords(accountId)}`
    );
    // A move already under way as a continuation from a summary is this
    // session's move: a second one beside it (an owed move taken up, a
    // person's) would compact or carry the row that job folds away.
    const job = moveJobOf(row.id);
    if (job?.askedBy.kind === "move") {
      console.info(
        `[at-limit] ${ctx.sessionName(row)} isn't moved to ${ctx.accountWords(accountId)}: it is going on from a summary as its move to ${ctx.accountWords(job.askedBy.to)} already (${job.stage}), and that move stands.`
      );
      return { later: true };
    }
    if (!asked || asked.plan.method === "whole") {
      return carryTo(row, accountId, stopped, undefined, laterSince);
    }
    const how = asked;
    if (how.plan.method === "summary") {
      // ONE PATH: a move from a summary goes on from a summary or not at
      // all. One that can't be written leaves the session where it is, as
      // any move no account took ({@link Kept}); nothing moves it some
      // other way.
      const refusal = await continueAsMove(row, accountId, stopped, how);
      if (refusal === undefined) {
        return { later: true };
      }
      console.info(
        `[at-limit] ${ctx.sessionName(row)} can't go on from a summary as its move to ${ctx.accountWords(accountId)}: ${refusal}. It stays where it is.`
      );
      return { kept: { running: false, why: refusal } };
    }
    if (how.plan.method === "native" && how.plan.when === "before") {
      compactFirst(row, how);
      return { later: true };
    }
    const done = await carryTo(
      row,
      accountId,
      stopped,
      { line: how.line, move: how.move },
      laterSince
    );
    return done;
  };

  /**
   * Compacts `row` where it is, warm, before its move (core `AccountMove`
   * `compactFirst`): its line is written now, then its filing turn and its
   * harness's `/compact` run ({@link startCompaction}); the move to the
   * account the line names follows their end ({@link moveCompacted}).
   */
  const compactFirst = (row: MoverRow, how: MoveHow): void => {
    ctx.noteAtLimit(row, how.move, how.line);
    ctx.startCompaction(row, how.line, how.move, false);
  };

  /** Who writes `row`'s summaries: its provider's policy (core `Compaction.summarizer`), the default's on no account. */
  const summarizerOf = (row: {
    accountId?: string | null;
  }): { harness: HarnessKind; model: string } => {
    const provider = row.accountId
      ? ctx.db.accounts.get(row.accountId)?.provider
      : undefined;
    return provider
      ? ctx.db.accounts.routing(provider).atLimit.compaction.summarizer
      : DEFAULT_COMPACTION.summarizer;
  };

  /**
   * `row` going on from a summary as its move to `to` (core `Compaction`
   * `summary`): a continuation the move asked for, which stays one session
   * ({@link foldContinued}) on `to`, on its own harness and model, the
   * summary written by its provider's summariser. Ahead of a limit
   * (`stopped` false) it files its open items first, as it can still take a
   * turn; stopped, its records are read as they stand. Undefined once the
   * job is filed; why not, in the hub's words, when it could not be: the
   * summariser's model can't fit the conversation, the conversation can't
   * be read, or the job can't wait for its work in flight.
   */
  const continueAsMove = async (
    row: MoverRow,
    to: string,
    stopped: false | "limit" | "signin",
    how: MoveHow
  ): Promise<string | undefined> => {
    const asker: ContinuationAsker = {
      kind: "move",
      to,
      stopped,
      line: how.line,
      move: how.move,
    };
    let release: () => void = () => undefined;
    try {
      release = await ctx.cloneForContinuation(row.id);
      const prepared = await ctx.prepareContinuation(row.id);
      const request: ContinueRequest = {
        summarizer: summarizerOf(row),
        target: {
          harness: row.harness,
          ...(row.model ? { model: row.model } : {}),
          account: to,
          machineId: row.machineId,
        },
      };
      const refusal = await ctx.continuationRefusal(prepared, request, asker);
      if (refusal) {
        return refusal;
      }
      const inFlight = await ctx.inFlightFor(row.id);
      if ("refusal" in inFlight) {
        return inFlight.refusal;
      }
      ctx.startContinuation(prepared, request, asker, inFlight.work);
      return undefined;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    } finally {
      release();
    }
  };

  /**
   * Whether `instanceId` is going on from a summary as its move now: a job
   * its move asked for ({@link continueAsMove}) that has not settled. What
   * it is sent waits at the hub meanwhile, and goes to the new conversation.
   */
  const continuingAsMove = (instanceId: string): boolean =>
    moveJobOf(instanceId) !== undefined;

  /** The job going on from a summary as `instanceId`'s move ({@link continuingAsMove}), while it has not settled. */
  const moveJobOf = (instanceId: string): ContinuationSlip | undefined =>
    ctx.db
      .continuationSlips()
      .find(
        (row) =>
          row.sourceInstanceId === instanceId &&
          row.askedBy.kind === "move" &&
          !ctx.SETTLED.has(row.stage)
      );

  /**
   * A summary its move asked for failed after its job was filed (`row`, in
   * the failure's words), its new session removed ({@link undoStart}): the
   * session stays where it is, the failure said in its transcript and to
   * its parent, and, stopped at its limit, held there as any session no
   * account took. Nothing moves it some other way. Nothing when the source
   * runs no more.
   */
  const summaryMoveFailed = (row: ContinuationRow, reason: string): void => {
    const asker = row.askedBy;
    const [source] = ctx.db.getInstancesByIds([row.sourceInstanceId]);
    if (asker.kind !== "move" || !source) {
      return;
    }
    const why = `it couldn't go on from a summary: ${reason}`;
    ctx.atLimit.moveFailed(source.id, asker.to, why, asker.stopped);
    const [listed] = ctx.db.listedInstancesByIds([source.id]);
    if (listed?.parentInstanceId) {
      ctx.reportToParent(
        listed,
        `${ctx.sessionName(source)} wasn't moved to ${ctx.accountWords(asker.to)}: ${why}. It stays where it is${asker.stopped ? ", held at its limit" : ""}.`,
        false,
        { notice: true }
      );
    }
    if (!asker.stopped) {
      ctx.releaseOwed({ instanceId: source.id });
    }
  };
  /**
   * A session its account's removal (or sign-out on its machine) left on no
   * account, in its stalled words ({@link moveOff}), once its process is
   * gone: one still running reads its old store and answers what it is sent
   * until then.
   */
  const strandedStall = (instanceId: string): Stall | undefined => {
    const left = ctx.db.accounts.strandedOf(instanceId);
    const [row] = left ? ctx.db.getInstancesByIds([instanceId]) : [];
    if (!(left && row) || ctx.processMayRun(row)) {
      return undefined;
    }
    const words = accountsWords.stalled;
    return {
      words:
        left.why === "removed"
          ? words.removed(left.accountName)
          : words.signedOut(left.accountName, ctx.machineName(row.machineId)),
    };
  };

  /**
   * Who answers the end of a turn of `instanceId` its live launch's Claude
   * Code ended on its account's credential ({@link settleRefusal}): the
   * at-limit controller ({@link credentialTurns}), or the turn's end as any
   * failed turn's. A refusal moves the session and carries it on, but a work item's session only from a
   * turn that called no tool, once per item, and only with an account to
   * take it; otherwise its item fails as today, its failure naming the
   * account ({@link refusedFailures}).
   */
  const takeCredentialTurn = (instanceId: string): void => {
    const [row] = ctx.db.getInstancesByIds([instanceId]);
    const from = row?.accountId
      ? ctx.db.accounts.get(row.accountId)
      : undefined;
    if (!(row && from && ctx.atLimit.manages(instanceId))) {
      return;
    }
    // A move owed to its next launch off this refusal is the controller's
    // to make now ({@link oweMoveOff}).
    const owed = ctx.owedMoves.get(instanceId)?.move;
    const take = (): void => {
      if (owed?.kind === "moved" && owed.because?.kind === "refused") {
        ctx.owedMoves.delete(instanceId);
      }
      ctx.credentialTurns.add(instanceId);
    };
    const itemId = row.workItemId;
    if (!itemId) {
      take();
      return;
    }
    let stays: string | undefined;
    if (ctx.turnInFlight.worked(instanceId)) {
      stays = "its turn had already done work, so it was not run again";
    } else if (
      ctx.refusalMoved.has(itemId) &&
      ctx.refusalMoved.get(itemId) !== from.id
    ) {
      stays = "it was already moved once for this item";
    } else if (ctx.atLimit.credentialMoveTo(row.id) === undefined) {
      stays = `no other account it may run on is signed in on ${ctx.machineName(row.machineId)} with room for it`;
    }
    if (!stays) {
      ctx.refusalMoved.set(itemId, from.id);
      take();
      return;
    }
    ctx.refusedFailures.set(instanceId, {
      accountId: from.id,
      words: `${accountNameAmong(from, ctx.db.accounts.list())}'s sign-in was refused, so it is signed out on ${ctx.machineName(row.machineId)}; ${stays}. Sign it in again in ${configurePage("accounts")}.`,
    });
  };

  /**
   * A session that has to leave `accountId` (`why`): its account's
   * credential was refused (its item failed on it, or it rests there), or a
   * person removed the account. Its next launch runs on the account
   * placement carries it to, its line written once its data is there
   * ({@link owedMoves}): a wake judges that account, and a machine's
   * register carries one at rest without waking it ({@link takeUpMovesOn});
   * one in a turn moves at its end. None, when no account can take it:
   * false then.
   */
  const oweMoveOff = (
    instanceId: string,
    accountId: string,
    why: MoveOffWhy
  ): boolean => {
    const [row] = ctx.db.getInstancesByIds([instanceId]);
    const from = ctx.db.accounts.get(accountId);
    const toId = row && from ? ctx.atLimit.credentialMoveTo(row.id) : undefined;
    const to = toId ? ctx.db.accounts.get(toId) : undefined;
    if (!(row && from && to) || row.accountId !== from.id) {
      return false;
    }
    const accounts = ctx.db.accounts.list();
    ctx.owedMoves.set(row.id, {
      to: to.id,
      move: {
        kind: "moved",
        from: namedAccount(from, accounts),
        to: namedAccount(to, accounts),
        sameOrganization: cacheCarries(from, to, cacheExpiry(row) !== null),
        tokens: row.contextTokens,
        window: null,
        resetsAt: null,
        ...moveOffMark(why, row.machineId),
      },
      waits: "turn",
    });
    return true;
  };
  /** What a move off an account on `machineId` says of why it went ({@link oweMoveOff}). */
  const moveOffMark = (
    why: MoveOffWhy,
    machineId: string
  ): Pick<
    Extract<AccountMove, { kind: "moved" }>,
    "because" | "removed" | "signedOut" | "signedOutOn"
  > => {
    switch (why) {
      case "refused":
        return { because: { kind: "refused" } };
      case "removed":
        return { removed: true };
      case "signed-out":
        return { signedOut: true, signedOutOn: ctx.machineName(machineId) };
      default:
        throw unreachable(why);
    }
  };

  /**
   * What removing `account` does with the sessions on it: every kept row
   * naming it, however long ago it ran, either has an account placement
   * carries it to (`moving`) or none (`staying`: its next send is refused
   * with the way back, core `SendRefusal` `no-account`).
   */
  const removalOf = (account: Account): { moving: number; staying: number } => {
    const rows = ctx.db.instancesOnAccount(account.id);
    const moving = rows.filter(
      (row) =>
        (ctx.owedMoves.get(row.id)?.to ?? account.id) !== account.id ||
        ctx.atLimit.credentialMoveTo(row.id) !== undefined
    ).length;
    return { moving, staying: rows.length - moving };
  };

  /**
   * Every session on `account` (on `machineId` alone, when a person signs it
   * out there; on every machine, when he removes it) owes a move to the
   * account placement carries it to ({@link oweMoveOff}): one at rest is
   * never woken for it, one in a turn moves at its end. A move owed to
   * `account` there is dropped. Answers how many move and how many have no
   * account to go to, and the rows whose process may still run (`live`).
   */
  const moveOff = (
    account: Account,
    why: "removed" | "signed-out",
    machineId?: string
  ): {
    live: PublicInstanceRow[];
    moving: number;
    staying: number;
  } => {
    const named = accountNameAmong(account, ctx.db.accounts.list());
    const there = (row: { machineId: string }) =>
      machineId === undefined || row.machineId === machineId;
    for (const [id, owed] of ctx.owedMoves.list()) {
      const [row] =
        owed.to === account.id ? ctx.db.getInstancesByIds([id]) : [];
      if (row && there(row)) {
        ctx.owedMoves.delete(id);
      }
    }
    const rows = ctx.db.instancesOnAccount(account.id).filter(there);
    let moving = 0;
    const strandedIds: string[] = [];
    for (const row of rows) {
      // One a person (or rebalance) already moves elsewhere goes there.
      if (
        ctx.owedMoves.get(row.id)?.to !== undefined ||
        oweMoveOff(row.id, account.id, why)
      ) {
        moving += 1;
      } else if (traitsOf(row.harness).accountModel === "dir") {
        // Its next send is refused for want of an account (placement's
        // `noAccountRefusal`): its line says it stopped, and why.
        strandedIds.push(row.id);
      }
    }
    ctx.db.accounts.strand(strandedIds, named, why);
    ctx.publishStalls();
    return {
      live: rows.filter(ctx.processMayRun),
      moving,
      staying: rows.length - moving,
    };
  };

  /**
   * Removes `account` (`named`), its other machines already signed out:
   * every session on it owes its move ({@link moveOff}), its rows where
   * nothing runs on it name no account (their data went into the machine's
   * own dir with its store), and `leavesOn`, the machines where a process
   * still runs in its store, sign it out once none does
   * ({@link leaveAccounts}). One whose process is up between turns moves
   * now, as at a turn's end; one in a turn at that end.
   */
  const removeWithSessions = (
    account: Account,
    named: string,
    leavesOn: readonly string[]
  ): { moving: number; staying: number } => {
    const { moving, staying, live } = moveOff(account, "removed");
    ctx.db.accounts.remove(account.id, "removed", leavesOn);
    ctx.forgetPendingOf(account.id);
    const settled = new Set(
      ctx.db.instancesOnAccount(account.id).map((row) => row.machineId)
    );
    ctx.rowsLeave(
      account.id,
      null,
      [...settled].filter((machineId) => !leavesOn.includes(machineId))
    );
    // Where a process still runs in its store, the rows at rest name no
    // account now too; the running ones once their machine signs it out.
    ctx.rowsLeave(account.id, null, leavesOn, "at-rest");
    carryBetweenTurns(live);
    if (leavesOn.length > 0) {
      ctx.tickLeaves();
    }
    const signsOutLater =
      leavesOn.length > 0
        ? `; ${leavesOn.map(ctx.machineName).join(", ")} ${leavesOn.length === 1 ? "signs" : "sign"} it out once no session there runs on it`
        : "";
    console.log(
      `[accounts] ${named} removed: ${moving} session${moving === 1 ? " owes" : "s owe"} a move to another account, ${staying} ${staying === 1 ? "has" : "have"} none to go to${signsOutLater}.`
    );
    ctx.publishUsage();
    return { moving, staying };
  };

  /**
   * Each of `live` whose process is up between turns and owes a move is
   * carried now, as at a turn's end; one in a turn moves at that end.
   */
  const carryBetweenTurns = (live: readonly PublicInstanceRow[]): void => {
    for (const row of live) {
      detach(
        (async () => {
          if (ctx.owedMoves.has(row.id) && (await ctx.sessionIdle(row))) {
            relaunchOnAccount(row.id);
          }
        })(),
        "account move between turns"
      );
    }
  };

  /**
   * Signs `account` (`named`) out on `machineId` alone, as a person asked:
   * every session on it there owes its move ({@link moveOff}). With a
   * process there still running in its store (`leaves`), its sign-in goes
   * now and its store once none does ({@link leaveAccounts}), the rows at
   * rest there naming no account at once; otherwise the machine has
   * already signed it out, and every row there names no account. A row that
   * names no account is placed at its next wake like a new session, among
   * the accounts signed in on its machine, and is refused with the way back
   * (core `SendRefusal` `no-account`) when there is none.
   */
  const signOutMachine = (
    account: Account,
    named: string,
    machineId: string,
    leaves: boolean
  ): { moving: number; staying: number } => {
    const { moving, staying, live } = moveOff(account, "signed-out", machineId);
    if (leaves) {
      ctx.db.accounts.leaveMachine(account.id, machineId);
      ctx.rowsLeave(account.id, null, [machineId], "at-rest");
      carryBetweenTurns(live);
      ctx.tickLeaves();
    } else {
      ctx.db.accounts.removeSignin(account.id, machineId);
      ctx.rowsLeave(account.id, null, [machineId]);
    }
    console.log(
      `[accounts] ${named} signed out on ${ctx.machineName(machineId)}: ${moving} session${moving === 1 ? " owes" : "s owe"} a move to another account there, ${staying} ${staying === 1 ? "has" : "have"} none to go to${leaves ? "; its store goes once no session there runs on it" : ""}.`
    );
    ctx.publishUsage();
    return { moving, staying };
  };

  return {
    owedCarries,
    takeOwedMove,
    owedOn,
    landSessionDir,
    handMoveRefusal,
    moveByHand,
    relaunchOnAccount,
    takeUpOwedMove,
    takeUpMovesOn,
    moveOwedAtRefusal,
    cacheExpiry,
    replaceAtWake,
    limitRows,
    carryTo,
    moveAs,
    summarizerOf,
    continuingAsMove,
    moveJobOf,
    summaryMoveFailed,
    strandedStall,
    takeCredentialTurn,
    oweMoveOff,
    removalOf,
    removeWithSessions,
    signOutMachine,
  };
};
