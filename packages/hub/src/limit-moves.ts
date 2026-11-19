import type { Account, AccountMark, AccountMove } from "@cawco/core/accounts";
import {
  accountNameAmong,
  accountProvidersOf,
  CLAUDE_PROVIDER,
  DEFAULT_COMPACTION,
  isChatgptPlan,
  LIMITED_PROVIDERS,
  namedAccount,
} from "@cawco/core/accounts";
import { detach } from "@cawco/core/detach";
import type { HarnessKind } from "@cawco/core/harness/kinds";
import { COMPACTION_ORIGIN } from "@cawco/core/harness/kinds";
import { traitsOf } from "@cawco/core/harness/traits";
import { doing } from "@cawco/core/loop-watch";
import { modelAdmitted, modelListingOn } from "@cawco/core/model-names";
import type { InstanceStatus } from "@cawco/core/protocol";
import type { MoveEnded } from "@cawco/core/session/controls";
import { HOUR_MS } from "@cawco/core/time";
import {
  accountMoveSentence,
  clockWords,
  markWords,
} from "@cawco/core/words/account-lines";
import { accountsWords } from "@cawco/core/words/accounts";
import { chatgptPlanWords } from "@cawco/core/words/chatgpt-plan";
import { configurePage } from "@cawco/core/words/configure";
import { owedMoveWords } from "@cawco/core/words/owed-moves";
import { relaunchWords } from "@cawco/core/words/relaunch";
import { ElysiaStatus } from "elysia";
import { type KeptOff, keptOffIn, markOn } from "./account-marks";
import { machineAccount } from "./accounts";
import { accountsRead } from "./at-limit";
import type { ClosureContext } from "./closure-context";
import type { DbShape } from "./db";
import type { MovedLine } from "./db/at-limit";
import type { ContinuationRow, ContinuationSlip } from "./db/continuations";
import type { PublicInstanceRow } from "./db/instances";
import type { OwedCarry, OwedMove } from "./db/owed-moves";
import type {
  ContinuationAsker,
  ContinueRequest,
  StrandedWhy,
} from "./db/stored-types";
import {
  CHOICE_FRESH_MS,
  type DecidedMove,
  type DecideFacts,
  decide,
  staleChoice,
} from "./decide";
import type { MoveOffWhy, StoredRow } from "./hub-shapes";
import { type CacheState, cacheState } from "./keep-alive";
import {
  type AccountsRead,
  type CompactionPlan,
  compactedLine,
  factsOf,
  type Kept,
  lineCost,
  linePrice,
  type MoveHow,
  moveSideWords,
  planOf,
  refusedUntil,
  type Stall,
} from "./limit-decision";
import type { Arrival, PlacementInput, TaskAccounts } from "./placement";
import { runningAccounts, signedInForWords } from "./placement";
import { unreachable } from "./unreachable";

/** Statuses a session is not running in: asleep, stopping, stopped or failed. */
const AT_REST: ReadonlySet<InstanceStatus> = new Set([
  "sleeping",
  "stopping",
  "stopped",
  "error",
]);

/** A sentence's closing stop, dropped so it sits inside another. */
const SENTENCE_STOP = /\.$/u;

/** A session's row as a mover reads it. */
type MoverRow = ReturnType<DbShape["getInstancesByIds"]>[number];

export type LimitMovesContext = Pick<
  ClosureContext,
  | "SETTLED"
  | "accountProviderFor"
  | "accountWords"
  | "admission"
  | "atLimit"
  | "board"
  | "carryOn"
  | "catalogFaults"
  | "cloneForContinuation"
  | "continuationRefusal"
  | "credentialTurns"
  | "db"
  | "followupState"
  | "forgetPendingOf"
  | "inFlightFor"
  | "inputRefusal"
  | "codexLeaving"
  | "keepCodexLeave"
  | "keptNextWords"
  | "knownProviders"
  | "launchClaims"
  | "launchInFlight"
  | "lastRequestContext"
  | "machineName"
  | "modelRefusal"
  | "moveRowsToAccount"
  | "noteAtLimit"
  | "noteCodexSignin"
  | "outOfStore"
  | "owedMoves"
  | "owedTargets"
  | "prepareContinuation"
  | "processMayRun"
  | "projectTypes"
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
  | "signinsFor"
  | "startCompaction"
  | "startContinuation"
  | "taskAccounts"
  | "unstrand"
  | "tickLeaves"
  | "turnInFlight"
>;

export const createLimitMoves = (ctx: LimitMovesContext) => {
  /**
   * An owed move whose carry cannot happen, dropped ({@link keepUncarried}):
   * a model picked to go with it goes with it, and the person who was shown
   * it waiting is shown it didn't happen. A refused first turn's answer is
   * asked where it stays: its refusal comes back and its pass goes on or
   * ends (start-model-moves.ts), never left read and unanswered.
   */
  const dropUncarried = (
    stored: StoredRow,
    owed: OwedMove,
    to: string,
    why: string
  ): void => {
    ctx.owedMoves.delete(stored.id);
    if (owed.byHand || owed.model !== undefined) {
      refuseMove(stored, to, why);
    }
    if (owed.carry?.kind === "model") {
      ctx.carryOn(stored, owed.carry);
    }
  };

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
    const landing = owedOn(row);
    const owed = ctx.owedMoves.get(row.id);
    if (owed && owed.to === undefined) {
      landOwed(row.id);
    }
    return landing;
  };

  /**
   * `row` as the launch a move owed to it lands runs it ({@link owedMoves}):
   * on the account the move names, and on the model a person picked while it
   * waited ({@link pickWithMove}). As it is when it owes none.
   */
  const owedOn = (row: StoredRow): StoredRow => {
    const owed = owedNow(row);
    return owed
      ? {
          ...row,
          ...(owed.to === undefined ? {} : { accountId: owed.to }),
          ...(owed.model === undefined ? {} : { model: owed.model }),
        }
      : row;
  };

  /**
   * The move `instanceId` owed has landed: its record goes, and a model
   * picked while it waited is its row's from now on, so every later launch
   * runs it there. Every landing of an owed move ends it here.
   */
  const landOwed = (instanceId: string): void => {
    const picked = ctx.owedMoves.get(instanceId)?.model;
    if (picked !== undefined) {
      ctx.db.patchInstance(instanceId, { model: picked });
    }
    ctx.owedMoves.delete(instanceId);
  };

  /**
   * A model a person picked for `row` while it owes a move
   * ({@link owedMoves}), judged against the account it lands on: the one a
   * person's or rebalance's move names, else the one its row already names
   * (a model that crossed providers put it there). Taken, it rides the move
   * on its record: the process the move leaves is never asked to change, and
   * the launch that lands runs it ({@link owedOn}, {@link landOwed}). The
   * model it runs now, picked again, takes the pick back. Refused, why, in
   * that account's terms. Undefined when it owes no move.
   */
  const pickWithMove = (
    row: StoredRow,
    model: string
  ): "carried" | { refusal: string } | undefined => {
    const owed = ctx.owedMoves.get(row.id);
    if (!owed) {
      return;
    }
    const refusal = landingRefusal(row, owed.to ?? row.accountId, model);
    if (refusal) {
      return { refusal };
    }
    const { model: _picked, ...move } = owed;
    ctx.owedMoves.set(row.id, model === row.model ? move : { ...move, model });
    console.info(
      `[accounts] ${ctx.sessionName(row)} runs ${model} once its move to ${ctx.accountWords(owed.to ?? row.accountId)} lands; its process now is not asked to change.`
    );
    return "carried";
  };

  /**
   * Why a `row` that lands on `accountId` (null: on none) can't run `model`
   * there: the account is another provider's than the model, its catalog
   * doesn't list it (a machine's own list, for a harness whose catalog is
   * the machine's). Undefined when it can. A limit stored for it never
   * refuses: a pick on it warns, asks the provider again, and may go anyway
   * (the dashboard's accounts/limit-checks).
   */
  const landingRefusal = (
    row: StoredRow,
    accountId: string | null,
    model: string
  ): string | undefined => {
    const to = accountId ? ctx.db.accounts.get(accountId) : undefined;
    const toName = ctx.accountWords(accountId);
    const provider = ctx.accountProviderFor(
      row.machineId,
      row.harness,
      model,
      to?.id
    );
    if (to && to.provider !== provider) {
      return provider
        ? owedMoveWords.pickRefused.otherProvider(
            toName,
            providerName(to.provider),
            model
          )
        : owedMoveWords.pickRefused.noAccount(toName, model);
    }
    const unlisted =
      to && traitsOf(row.harness).modelCatalog === "account"
        ? unlistedOn(row, to.id, toName, model)
        : ctx.modelRefusal(row.machineId, row.harness, model);
    return unlisted?.replace(SENTENCE_STOP, "");
  };

  /**
   * Why `model` is not in the catalog of `accountId` (`toName`), the
   * account a `row` lands on, for a harness whose catalog is each
   * account's: it lists others, or it was never read.
   */
  const unlistedOn = (
    row: StoredRow,
    accountId: string,
    toName: string,
    model: string
  ): string | undefined => {
    const catalog = ctx.db.accounts
      .catalogs()
      .find((one) => one.accountId === accountId);
    const fault = ctx.catalogFaults.get(accountId);
    const listing = modelListingOn(row.harness, {
      catalogs: catalog ? [catalog.models] : [],
      faults: fault ? [fault] : [],
    });
    if (modelAdmitted(row.harness, model, listing)) {
      return;
    }
    return listing.read
      ? owedMoveWords.pickRefused.notOffered(
          toName,
          model,
          listing.rows
            .map((one) => one.value)
            .filter((value) => value !== "default")
        )
      : owedMoveWords.pickRefused.unread(toName, model, listing.why);
  };

  /** A provider's name, as a person reads it: "Claude", or its catalog's name. */
  const providerName = (id: string): string =>
    id === CLAUDE_PROVIDER
      ? "Claude"
      : (ctx.knownProviders().find((one) => one.id === id)?.name ?? id);

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
      landOwed(row.id);
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
    const named = providerName;
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
          sameOrganization: carriesTo(row, from, account),
          tokens: row.contextTokens,
          window: null,
          resetsAt: null,
        }
      : null;
  };

  /** What a carry-on says stopped its session's turn, as a move reads it ({@link stoppedNow}): its limit or its sign-in; none for a refused first turn, which holds nothing. */
  const stopOf = (
    carry: OwedCarry | undefined
  ): "limit" | "signin" | undefined =>
    carry?.kind === "limit" || carry?.kind === "signin"
      ? carry.kind
      : undefined;

  /** The carry-on of a turn `stopped` cut ({@link OwedCarry}); none when nothing stopped it. */
  const carryAfter = (
    stopped: "limit" | "signin" | undefined
  ): OwedCarry | undefined => (stopped ? { kind: stopped } : undefined);

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
   * `row`'s move to `to` as the one decision takes a person's move
   * (decide.ts, trigger `hand`): their target, made small the cheapest way
   * its cache and the policy allow, `stopped` by its limit or sign-in or
   * not. Undefined for a session on no account, or one the decision can't
   * read.
   */
  const handMoveOf = (
    row: StoredRow,
    to: Account,
    stopped: "limit" | "signin" | undefined
  ): DecidedMove | undefined => {
    const from = row.accountId ? ctx.db.accounts.get(row.accountId) : undefined;
    const facts = from ? factsFor(row, from, Date.now()) : undefined;
    if (!facts) {
      return;
    }
    const choice = decide(facts, {
      kind: "hand",
      to: to.id,
      stopped: stopped !== undefined,
    });
    return choice.kind === "move" ? choice.moves[0] : undefined;
  };

  /**
   * `move`, the line a move whole would write, as `decided` makes it small
   * ({@link moveAs}), priced as the decision priced it; undefined when it
   * moves whole.
   */
  const howFor = (
    row: StoredRow,
    move: AccountMove | null,
    decided: DecidedMove | undefined
  ): MoveHow | undefined => {
    const plan: CompactionPlan = decided
      ? planOf(decided)
      : { method: "whole", chosen: false };
    if (plan.method === "whole" || move?.kind !== "moved") {
      return;
    }
    return {
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
    const asked = askedMove(row, account);
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
        move: asked,
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
    const decided = handMoveOf(row, account, stopped);
    const move = pricedLine(asked, decided);
    const how = howFor(row, move, decided);
    if (decided && how) {
      return await moveByHandCompacted(row, decided, account, how, stopped);
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
        refusal: owedMoveWords.notMoved(title, fromName, toName, why.why),
      };
    }
    movedByHand(row);
    // One at rest is relaunched only when its limit or sign-in cut its last
    // turn: its carry-on starts it there ({@link relaunchOnAccount}).
    if (live || stopped) {
      relaunchOnAccount(row.id, carryAfter(stopped), live);
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

  /** A person's move's line, saying what the decision priced beside the next best; as it was with no decision. */
  const pricedLine = (
    asked: AccountMove | null,
    decided: DecidedMove | undefined
  ): AccountMove | null =>
    asked?.kind === "moved" && decided
      ? { ...asked, price: linePrice(decided.price, ctx.db.accounts.list()) }
      : asked;

  /** A person's move of `row` went: a hold at its old account's limit ends, and every screen hears it. */
  const movedByHand = (row: StoredRow): void => {
    ctx.db.atLimit.dropHold(row.id);
    ctx.publishStalls();
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
    decided: DecidedMove,
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
    const done = await moveAs(row, decided, stopped ?? false, how);
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
        refusal: owedMoveWords.notMoved(title, fromName, toName, why.why),
      };
    }
    movedByHand(row);
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
   * carry cannot happen stays on its account and in place. `carry`: what
   * stopped its turn (its account's limit, its refused sign-in, a first
   * turn its provider refused on the hub's model), so it is told to carry
   * on there, relaunched or not, and answers there what that turn was asked;
   * absent, the carry-on the move it owes keeps ({@link OwedCarry}). `live`:
   * whether its process worked before the carry ended it
   * ({@link processWorks}), read now when no carry came first; only then is
   * it relaunched.
   */
  const relaunchOnAccount = (
    instanceId: string,
    carry?: OwedCarry,
    live?: boolean
  ): void => {
    const going = takeUpOwedMove(instanceId, carry);
    if (going !== undefined) {
      // The carry runs on its own; the relaunch follows it.
      detach(going, "account move");
      return;
    }
    const [stored] = ctx.db.getInstancesByIds([instanceId]);
    // Read before the launch lands the move it owes, which takes its record.
    const told = carry ?? (stored && ctx.owedMoves.get(stored.id)?.carry);
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
          told !== undefined
        )
      );
      if (told) {
        ctx.carryOn(row, told);
      }
      return;
    }
    console.log(
      relaunchWords.onAccount(
        ctx.sessionName(row),
        ctx.accountWords(row.accountId),
        told ? " and told to carry on past what stopped it" : ""
      )
    );
    ctx.resumeSpawn(
      agent,
      row.machineId,
      { ...row, sessionId: row.sessionId },
      true
    );
    if (told) {
      ctx.carryOn(row, told);
    }
  };

  /**
   * Each session's move that was shown waiting and then didn't happen, by
   * session: the account it stays on, and the hub's words for it
   * ({@link owedMoveWords} `notMoved`). Its account line says it (InstanceRow
   * `moveRefused`) while the session still runs on that account, until it
   * is asked to move again ({@link owedMoves}). Held for the hub's life: the
   * log keeps it past a restart.
   */
  const moveRefusals = new Map<
    string,
    { from: string | null; words: string }
  >();

  /** `row`'s move to `to` didn't happen, for `why`: its account line says so. */
  const refuseMove = (
    row: { accountId?: string | null; id: string; machineId: string },
    to: string,
    why: string
  ): void => {
    const [named] = ctx.db.getInstancesByIds([row.id]);
    const words = owedMoveWords.notMoved(
      named ? ctx.sessionName(named) : row.id,
      ctx.accountWords(row.accountId),
      ctx.accountWords(to),
      why.replace(SENTENCE_STOP, "")
    );
    moveRefusals.set(row.id, { from: row.accountId ?? null, words });
    console.warn(`[accounts] ${words}`);
    ctx.board.sessionsMoved([row.id]);
  };

  /** What `row`'s account line says of a move that didn't happen, while it still runs where it stayed. */
  const moveRefusalOf = (row: {
    accountId?: string | null;
    id: string;
  }): string | undefined => {
    const refused = moveRefusals.get(row.id);
    return refused && refused.from === (row.accountId ?? null)
      ? refused.words
      : undefined;
  };

  /** A move of `instanceId` was asked again: the one that didn't happen is no longer news. */
  const forgetMoveRefusal = (instanceId: string): void => {
    if (moveRefusals.delete(instanceId)) {
      ctx.board.sessionsMoved([instanceId]);
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
    // As its record stands now: a model picked while the carry ran stays.
    const now = ctx.owedMoves.get(stored.id) ?? owed;
    if (mine && why.running) {
      ctx.owedMoves.set(stored.id, {
        ...now,
        waits: why.later ? "work" : "turn",
      });
    } else if (mine && away) {
      ctx.owedMoves.set(stored.id, { ...now, waits: "machine" });
    } else if (mine) {
      dropUncarried(stored, now, to, why.why);
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
    carry?: OwedCarry
  ): Promise<void> | undefined => {
    const inFlight = owedCarries.get(instanceId);
    if (inFlight !== undefined) {
      return inFlight;
    }
    const [stored] = ctx.db.getInstancesByIds([instanceId]);
    if (!(stored && ctx.registry.agent(stored.machineId))) {
      return undefined;
    }
    const owed = owedNow(stored);
    if (owed?.to === undefined) {
      return undefined;
    }
    const { to } = owed;
    /** The record is still this move's: no newer ask replaced it. */
    const still = () => ctx.owedMoves.get(stored.id)?.to === to;
    // Its carry-on rides beside the move from here, so a hub that restarts
    // under the carry tells it as it carries the move again
    // ({@link takeUpMovesOn}); whoever lands the move tells it once.
    if (carry) {
      ctx.owedMoves.set(stored.id, { ...owed, carry });
    }
    const told = carry ?? owed.carry;
    // A provider refused the target its model since the move was owed: it
    // doesn't go, in the words of any move a carry left where it was.
    const marked = owedMark(stored, owed);
    if (marked) {
      keepUncarried(
        stored,
        owed,
        to,
        {
          running: false,
          target: true,
          why: markWords(marked, ctx.accountWords(to), Date.now()),
        },
        still()
      );
      return undefined;
    }
    const stopped = stoppedNow(stored.id, stopOf(told));
    const hand = handHowOf(stored, owed, to, stopped);
    if (hand) {
      const compacted = moveOwedCompacted(
        stored,
        owed,
        hand.decided,
        hand.how,
        stopped
      ).finally(() => owedCarries.delete(instanceId));
      owedCarries.set(instanceId, compacted);
      return compacted;
    }
    // Read before the carry, which ends its process at rest.
    const live = processWorks(stored);
    const carried = carryOwedWhole(stored, { ...owed, to }, stopped)
      .finally(() => owedCarries.delete(instanceId))
      .then((landed) => {
        // Behind the carry's own end, so its relaunch (and a newer move
        // asked meanwhile) is taken up afresh, never joined to this one.
        if (landed) {
          relaunchOnAccount(stored.id, told ?? carryAfter(stopped), live);
          ctx.releaseOwed({ instanceId: stored.id });
        }
      });
    owedCarries.set(instanceId, carried);
    return carried;
  };

  /**
   * An owed move carried whole ({@link takeUpOwedMove}): its process ended
   * at rest and its data carried into the account's dir, its record landed
   * and its line written. True once it landed; one the carry left where it
   * was is kept as {@link keepUncarried} says.
   */
  const carryOwedWhole = async (
    stored: StoredRow,
    owed: OwedMove & { to: string },
    stopped: "limit" | "signin" | undefined
  ): Promise<boolean> => {
    const { to } = owed;
    const still = () => ctx.owedMoves.get(stored.id)?.to === to;
    const { kept } = await ctx.moveRowsToAccount(
      stored.machineId,
      [stored],
      to,
      true,
      stopped
    );
    const why = kept.get(stored.id);
    if (why) {
      keepUncarried(stored, owed, to, why, still());
      return false;
    }
    if (still()) {
      landOwed(stored.id);
    }
    ctx.db.atLimit.dropHold(stored.id);
    ctx.publishStalls();
    if (owed.move) {
      ctx.noteAtLimit(stored, owed.move);
    }
    return true;
  };

  /**
   * A person's owed move to `to` as it goes (decide.ts, `hand`), when it is
   * made small: decided now, unless its line already says how it was
   * compacted. Undefined when it moves whole: the hub's own moves are
   * decided as they are carried, whole.
   */
  const handHowOf = (
    stored: StoredRow,
    owed: OwedMove,
    to: string,
    stopped: "limit" | "signin" | undefined
  ): { decided: DecidedMove; how: MoveHow } | undefined => {
    const toAccount = ctx.db.accounts.get(to);
    const decided =
      owed.byHand && toAccount
        ? handMoveOf(stored, toAccount, stopped)
        : undefined;
    const how =
      decided && owed.move?.kind === "moved" && !owed.move.compact
        ? howFor(stored, owed.move, decided)
        : undefined;
    return decided && how ? { decided, how } : undefined;
  };

  /**
   * The move `row` owes as it is carried now: a person's as they asked; a
   * marker that it must leave its account ({@link oweMoveOff}) decided now
   * (decide.ts, as at a refused sign-in: it can't run there), its record
   * then naming where it goes for the carry that follows; the hub's own,
   * kept only for the launch that carries it (a wake's), dropped once older
   * than the decision allows (decide.ts `CHOICE_FRESH_MS`). Undefined when
   * it owes none, or nothing can take it now.
   */
  const owedNow = (row: StoredRow): OwedMove | undefined => {
    const owed = ctx.owedMoves.get(row.id);
    if (!owed) {
      return;
    }
    const now = Date.now();
    const stale =
      owed.to !== undefined &&
      !owed.byHand &&
      owed.carry === undefined &&
      owed.at !== undefined &&
      now - owed.at > CHOICE_FRESH_MS;
    // A marker to leave is decided as it is carried, and again once the
    // target it was carried towards is older than the decision allows.
    if (owed.leave !== undefined && (owed.to === undefined || stale)) {
      return leaveNow(row, owed, owed.leave, now);
    }
    if (stale) {
      ctx.owedMoves.delete(row.id);
      console.info(
        `[accounts] ${ctx.sessionName(row)}'s move to ${ctx.accountWords(owed.to)} was decided more than ${CHOICE_FRESH_MS / 60_000} minutes ago and not carried out, so it is dropped: the hub decides again when it next looks.`
      );
      return;
    }
    return owed;
  };

  /**
   * Where `row`, which must leave its account (`why`), goes now: the one
   * decision's first move (decide.ts, as at a refused sign-in), its record
   * naming it and the line it writes, priced. Undefined when no account
   * takes it now: the marker stays.
   */
  const leaveNow = (
    row: StoredRow,
    owed: OwedMove,
    why: MoveOffWhy,
    now: number
  ): OwedMove | undefined => {
    const from = row.accountId ? ctx.db.accounts.get(row.accountId) : undefined;
    const facts = from ? factsFor(row, from, now) : undefined;
    const choice = facts
      ? decide(facts, { kind: "refused-credential" })
      : undefined;
    const move = choice?.kind === "move" ? choice.moves[0] : undefined;
    const to = move ? ctx.db.accounts.get(move.to) : undefined;
    if (!(from && move && to)) {
      return;
    }
    const accounts = ctx.db.accounts.list();
    const taken: OwedMove = {
      ...owed,
      to: to.id,
      move: {
        kind: "moved",
        from: namedAccount(from, accounts),
        to: namedAccount(to, accounts),
        sameOrganization: move.carries,
        tokens: row.contextTokens,
        window: null,
        resetsAt: null,
        ...lineCost(move),
        price: linePrice(move.price, accounts),
        ...moveOffMark(why, row.machineId),
      },
    };
    ctx.owedMoves.set(row.id, taken);
    console.info(
      `[accounts] ${ctx.sessionName(row)} leaves ${accountNameAmong(from, accounts)} now and goes to ${accountNameAmong(to, accounts)}, decided as it is carried: ${moveSideWords(move, row.contextTokens, accountNameAmong(to, accounts))}.`
    );
    return ctx.owedMoves.get(row.id) ?? taken;
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
    decided: DecidedMove,
    how: MoveHow,
    stopped: "limit" | "signin" | undefined
  ): Promise<void> => {
    const { to } = decided;
    const mine = () => ctx.owedMoves.get(stored.id)?.to === to;
    // Its record goes as it is taken up. A model picked while it waited goes
    // with the move, and the row takes it only as the move lands (a carry,
    // a compaction's move after it, a summary's continuation on it): a move
    // that never lands leaves it running what it ran.
    const owing = mine() ? ctx.owedMoves.get(stored.id) : undefined;
    if (owing) {
      ctx.owedMoves.delete(stored.id);
    }
    const picked = owing?.model;
    const done = await moveAs(
      picked === undefined ? stored : { ...stored, model: picked },
      decided,
      stopped ?? false,
      picked === undefined ? how : { ...how, picked }
    );
    if ("kept" in done) {
      ctx.owedMoves.set(stored.id, owing ?? owed);
      keepUncarried(stored, owing ?? owed, to, done.kept, true);
      return;
    }
    ctx.db.atLimit.dropHold(stored.id);
    ctx.publishStalls();
    if (!("later" in done)) {
      ctx.noteAtLimit(stored, how.move, how.line);
    }
  };

  /**
   * `machineId` registered: each move that waited on it (`waits` is
   * `machine`: asked or left uncarried while it was away) is taken up now,
   * never left for a start that a session held at its old account's limit
   * would not make, and only those say in the log that the machine was
   * away. One held at its limit is looked at by the at-limit controller
   * ({@link AtLimit.lookNow}), which carries out a person's move; any other
   * is carried as at a turn's end ({@link takeUpOwedMove}). A move that
   * waits on its session's turn or work is not the register's: that end
   * takes it up. Only one whose session is at rest on its machine's word
   * goes now ({@link relaunchOnAccount}), its end having passed while
   * the link or the hub was down, as a relaunch alone (`to` absent) goes.
   * This is also how a hub restart carries out what {@link owedMoves}
   * holds: every machine registers again. A link that dropped and came
   * back takes up nothing that did not wait on it.
   */
  const takeUpMovesOn = (machineId: string): void => {
    const owed = ctx.owedMoves.list();
    const machineOf = new Map(
      ctx.db
        .getInstancesByIds(owed.map(([id]) => id))
        .map((row) => [row.id, row.machineId])
    );
    const onMachine = owed.filter(([id]) => machineOf.get(id) === machineId);
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
    const heldIds = new Set(heldHere.map((one) => one.instanceId));
    for (const [id, move] of onMachine) {
      if (move.to !== undefined && heldIds.has(id)) {
        continue;
      }
      if (move.waits !== "machine" || move.to === undefined) {
        detach(
          (async () => {
            const [row] = ctx.db.getInstancesByIds([id]);
            if (row && ctx.owedMoves.has(id) && (await ctx.sessionIdle(row))) {
              relaunchOnAccount(id);
            }
          })(),
          "owed move at rest"
        );
        continue;
      }
      const [row] = ctx.db.getInstancesByIds([id]);
      console.info(
        `[accounts] ${row ? ctx.sessionName(row) : id}'s move to ${ctx.accountWords(move.to)} waited for ${ctx.machineName(machineId)}, which was away; it is connected again, so the move is carried out now.`
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
      ) !== null ||
      (owed !== undefined && owedMark(row, owed) !== undefined)
    ) {
      return false;
    }
    console.info(
      `[at-limit] ${ctx.sessionName(row)}'s turn was refused: ${ctx.accountWords(row.accountId)} is at its limit. It already owed a move to ${accountNameAmong(to, ctx.db.accounts.list())}, which has room, so it moves there now and carries on there.`
    );
    relaunchOnAccount(row.id, { kind: "limit" });
    return true;
  };

  /**
   * The provider's refusals the hub keeps for `row`'s model, as its harness
   * runs it (`model`: the one a move picked with it, else its own): no move
   * lands it on an account out of credit for that model's provider or not
   * enabled for that model (account-marks.ts).
   */
  const rowKeptOff = (
    row: { harness: string; machineId: string; model?: string | null },
    model = row.model
  ): KeptOff =>
    keptOffIn(
      ctx.db,
      row.harness,
      ctx.resolvedModel(row.machineId, row.harness, model)
    );

  /**
   * The provider's refusal the hub keeps of the account a move the hub owes
   * `row` goes to, for the model it runs there (account-marks.ts): none for
   * a person's move, which goes where they said, as their pick of a model
   * runs. Rebalance and the at-limit controller weigh the marks as they
   * decide ({@link limitRows}); this reads them again as the move goes.
   */
  const owedMark = (
    row: { harness: string; machineId: string; model?: string | null },
    owed: OwedMove
  ): AccountMark | undefined =>
    owed.to === undefined || owed.byHand
      ? undefined
      : markOn(rowKeptOff(row, owed.model ?? row.model), owed.to);

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
      taskAccounts: allowedHere(row, ctx.taskAccounts(projectId, item?.taskId)),
      ...(typeAccount ? { typeAccount } : {}),
    };
  };

  /**
   * A running session's task allow-list as a move reads it: the list, or,
   * while its task's `accounts:` line does not read whole, the account the
   * session is on alone, so it moves nowhere else on a list the hub cannot
   * read (spawns.ts `taskAccounts`; a new start is refused for it).
   */
  const allowedHere = (
    row: ReturnType<typeof ctx.db.getInstancesByIds>[number],
    allowed: TaskAccounts
  ): string[] | null => {
    if ("accounts" in allowed) {
      return allowed.accounts;
    }
    const here = row.accountId ?? machineAccount(ctx.db, row.machineId);
    return here ? [here] : null;
  };

  /** `row`'s prompt cache now (keep-alive.ts `cacheState`): inside a turn is warm. */
  const cacheOf = (row: MoverRow): CacheState =>
    cacheState(row, ctx.followupState(row), Date.now());

  /** `row`'s context: its row's last reading, else the one its turn's requests sent; null when neither. */
  const contextOf = (row: MoverRow): number | null =>
    row.contextTokens ?? ctx.lastRequestContext.get(row.id) ?? null;

  /**
   * Whether moving `row` from `from` to `to` keeps its prompt cache: one
   * organization, by id, while its cache is warm (a move line's
   * `sameOrganization`).
   */
  const carriesTo = (row: MoverRow, from: Account, to: Account): boolean =>
    cacheOf(row).kind === "warm" &&
    !!from.identity?.orgId &&
    from.identity.orgId === to.identity?.orgId;

  /**
   * What the one decision reads for `row` on `from` at `now` (decide.ts
   * `DecideFacts`): a person's move, a wake, a marker to leave taken up.
   * Who waits on it is no part of those choices.
   */
  const factsFor = (
    row: MoverRow,
    from: Account,
    now: number
  ): DecideFacts | undefined =>
    factsOf(
      ctx.db,
      {
        accountRows: limitRows,
        cacheState: cacheOf,
        compactable: (one) =>
          !ctx.inputRefusal(one.id, {
            kind: "system",
            name: COMPACTION_ORIGIN,
          }),
        context: contextOf,
        waitedOn: () => false,
      },
      row,
      from,
      now
    );

  /**
   * Whether a cold wake leaves `row` on `accountId`: a person moved it there,
   * its start named that account, or it is its project's account.
   */
  const keptAtWake = (
    row: ReturnType<typeof ctx.db.getInstancesByIds>[number],
    accountId: string
  ): boolean => {
    // A line that does not read could be a person's move there: it stays.
    const last = ctx.db.atLimit.latestEvent(row.id, "moved");
    if (
      last &&
      (last.move === null || (last.move.kind === "moved" && last.move.asked))
    ) {
      return true;
    }
    const project = row.projectId ? ctx.db.project(row.projectId) : undefined;
    return (
      row.namedAccount === accountId ||
      project?.inEffect.account.value === accountId
    );
  };

  /**
   * The account a waking `row` may be moved off: a Claude conversation the
   * hub carries, on a limited provider's account, not a fork, owing no move,
   * held by no limit, and not one {@link keptAtWake} keeps. Undefined when
   * it stays.
   */
  const wakesOff = (row: MoverRow): Account | undefined => {
    const from = row.accountId ? ctx.db.accounts.get(row.accountId) : undefined;
    return from &&
      traitsOf(row.harness).accountDir &&
      LIMITED_PROVIDERS.includes(from.provider) &&
      row.forkedFrom === null &&
      !ctx.owedMoves.has(row.id) &&
      !ctx.db.atLimit.hold(row.id) &&
      !keptAtWake(row, from.id)
      ? from
      : undefined;
  };

  /**
   * A Claude session woken for a send is decided first (decide.ts, trigger
   * `wake`): one whose cache is cold re-reads its whole context wherever it
   * runs, so it moves only where the move is free, and only when its own
   * account no longer holds it (under its floor, or running short); an
   * unknown cache is not free, and stays. It is charged against the
   * target's room like every move (admission.ts), so a reset never takes a
   * herd of waking sessions at once. The move rides its launch alone
   * ({@link owedMoves}), which carries its conversation into the new
   * account's dir; its line is written once that has. A fork stays with its
   * origin, and one a person moved, whose start named its account or on its
   * project's account stays ({@link keptAtWake}); only Claude's
   * conversations are carried this way.
   */
  const replaceAtWake = (
    row: ReturnType<typeof ctx.db.getInstancesByIds>[number]
  ): void => {
    const from = wakesOff(row);
    if (!from) {
      return;
    }
    const now = Date.now();
    const facts = factsFor(row, from, now);
    const choice = facts ? decide(facts, { kind: "wake" }) : undefined;
    const accounts = ctx.db.accounts.list();
    const fromName = accountNameAmong(from, accounts);
    if (choice?.kind !== "move") {
      if (choice?.kind === "stay" && choice.why === "full") {
        console.info(
          `[rebalance] ${ctx.sessionName(row)} wakes on ${fromName}, which no longer holds it, but no move of it holds elsewhere either.`
        );
      }
      return;
    }
    const [move] = choice.moves;
    const to = move ? ctx.db.accounts.get(move.to) : undefined;
    if (!(move && to && facts)) {
      return;
    }
    const toName = accountNameAmong(to, accounts);
    const next = facts.session.costs.nextTurnUsd;
    ctx.admission.charge(
      row,
      to.id,
      move.usd === null || next === null ? null : move.usd + next
    );
    console.info(
      `[rebalance] ${ctx.sessionName(row)} moves from ${fromName} to ${toName} as it wakes: its prompt cache is cold, so it re-reads its context on either account, and ${fromName} no longer holds it; ${moveSideWords(move, choice.tokens, toName)}. Its conversation is copied there before it starts.`
    );
    ctx.owedMoves.set(row.id, {
      to: to.id,
      move: {
        kind: "moved",
        from: namedAccount(from, accounts),
        to: namedAccount(to, accounts),
        sameOrganization: false,
        tokens: choice.tokens,
        window: null,
        resetsAt: null,
        because: { kind: "cold", wake: true },
        ...lineCost(move),
        price: linePrice(move.price, accounts),
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
   * reads it (decide.ts, through limit-decision.ts `factsOf`): placement's rows (placement.ts
   * `accountRows`) with the burn already arriving on each, the ledger's
   * figures (admission.ts), and whether a turn on `row`'s machine proved its
   * sign-in lately; `row`'s own burn, its kind's strategy, its model's window.
   */
  const limitRows = (
    row: ReturnType<typeof ctx.db.getInstancesByIds>[number],
    leaving: string,
    landing: readonly Arrival[] = []
  ): AccountsRead =>
    accountsRead(ctx.db, ctx.admission, row, leaving, landing, {
      asks: rowAsks(row),
      keptOff: rowKeptOff(row),
      machineName: ctx.machineName(row.machineId),
      owed: ctx.owedTargets(),
      provenSince: Date.now() - SIGNIN_PROVEN_MS,
      signins: ctx.signinsFor(row.harness),
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
    compact: { line: string; move: MovedLine } | undefined,
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
      ctx.carryOn(now, { kind: stopped });
    }
  };

  /**
   * `carrying`, the carry of `row` to `accountId` ({@link carryTo}), with
   * what stopped its turn (`stopped`) kept beside it as the move's carry-on
   * while it runs (db/owed-moves.ts `OwedCarry`): a hub that restarts under
   * it carries the move again as the machine registers and tells it then
   * ({@link takeUpMovesOn}), and a take of the move meanwhile joins this
   * carry ({@link owedCarries}). Once it is over, landed or not, the record
   * is the one before it again; the carry-on is told as it relaunches.
   */
  const carriedWithWord = async <T>(
    row: { id: string },
    accountId: string,
    stopped: "limit" | "signin" | undefined,
    carrying: Promise<T>
  ): Promise<T> => {
    if (!stopped) {
      return await carrying;
    }
    const carry: OwedCarry = { kind: stopped };
    const before = ctx.owedMoves.get(row.id);
    ctx.owedMoves.set(row.id, {
      ...(before ?? { move: null, waits: "turn" }),
      to: accountId,
      carry,
    });
    const joined = !owedCarries.has(row.id);
    if (joined) {
      owedCarries.set(
        row.id,
        carrying.then(() => undefined)
      );
    }
    try {
      return await carrying;
    } finally {
      if (joined) {
        owedCarries.delete(row.id);
      }
      const now = ctx.owedMoves.get(row.id);
      if (now?.to === accountId && now.carry?.kind === carry.kind) {
        if (before) {
          ctx.owedMoves.set(row.id, before);
        } else {
          ctx.owedMoves.delete(row.id);
        }
      }
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
    compact: { line: string; move: MovedLine } | undefined,
    laterSince: number | undefined,
    /** A model picked to go with the move: the row takes it as the carry lands, before it relaunches there. */
    picked?: string
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
    const { kept, ended } = await carriedWithWord(
      row,
      accountId,
      stopped || undefined,
      ctx.moveRowsToAccount(
        row.machineId,
        [row],
        accountId,
        true,
        stopped || undefined,
        laterSince
      )
    );
    const why = kept.get(row.id);
    if (why) {
      return { kept: why };
    }
    if (picked !== undefined) {
      ctx.db.patchInstance(row.id, { model: picked });
    }
    const agent = ctx.registry.agent(row.machineId);
    const [moved] = ctx.db.getInstancesByIds([row.id]);
    if (!(agent && moved?.sessionId)) {
      return {
        kept: {
          running: false,
          why: `${ctx.machineName(row.machineId)} is not connected.`,
        },
      };
    }
    relaunchMoved(
      agent,
      { ...moved, sessionId: moved.sessionId },
      stopped,
      compact,
      live
    );
    const what = ended.get(row.id);
    return what ? { ended: what } : {};
  };

  /**
   * THE ONE MOVER: `row` to `accountId`, made small as `how`'s plan says
   * (decide.ts, limit-decision.ts `planOf`; absent, whole). Whole, or natively after
   * the move: carried now ({@link carryTo}). Natively before it: its filing
   * turn and its harness's `/compact` run where it is, and the move follows
   * once they end ({@link compactFirst}). From a summary: the same session
   * goes on in a fresh conversation on `accountId` ({@link continueAsMove});
   * one that can't leaves it where it is, as does a compaction before the
   * move that compacted nothing (`compactFirstFailed`): a move goes
   * the way its plan says or not at all. Every mover calls this: the
   * at-limit controller, the rebalance, a person's move and a move owed to a
   * turn's end.
   */
  const moveAs = async (
    row: MoverRow,
    decided: DecidedMove,
    stopped: false | "limit" | "signin",
    asked: MoveHow | undefined,
    laterSince?: number
  ): Promise<{ kept: Kept } | { ended?: MoveEnded } | { later: true }> => {
    const accountId = decided.to;
    // A choice is carried out within moments of being made, or made again.
    if (staleChoice(decided, Date.now())) {
      return {
        kept: {
          running: false,
          why: `its move to ${ctx.accountWords(accountId)} was decided more than ${CHOICE_FRESH_MS / 60_000} minutes ago, so it is decided again`,
        },
      };
    }
    doing(
      `the move of ${ctx.sessionName(row)} to ${ctx.accountWords(accountId)}`
    );
    // A move already under way as a continuation from a summary is this
    // session's move: a second one beside it (an owed move taken up, a
    // person's) would compact or carry the row that job folds away.
    const job = moveJobOf(row.id);
    if (job?.askedBy?.kind === "move") {
      console.info(
        `[at-limit] ${ctx.sessionName(row)} isn't moved to ${ctx.accountWords(accountId)}: it is going on from a summary as its move to ${ctx.accountWords(job.askedBy.to)} already (${job.stage}), and that move stands.`
      );
      return { later: true };
    }
    if (!asked || asked.plan.method === "whole") {
      return carryTo(
        row,
        accountId,
        stopped,
        undefined,
        laterSince,
        asked?.picked
      );
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
      laterSince,
      how.picked
    );
    return done;
  };

  /**
   * Compacts `row` where it is, warm, before its move (core `AccountMove`
   * `compactFirst`): its line is written now, then its filing turn and its
   * harness's `/compact` run ({@link startCompaction}); the move to the
   * account the line names follows their end (`moveCompacted`).
   */
  const compactFirst = (row: MoverRow, how: MoveHow): void => {
    ctx.noteAtLimit(row, how.move, how.line);
    ctx.startCompaction(row, how.line, how.move, false, how.picked);
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
      const held = await ctx.cloneForContinuation(row.id);
      if (held instanceof ElysiaStatus) {
        return held.response.detail;
      }
      release = held;
      const prepared = await ctx.prepareContinuation(row.id);
      if (prepared instanceof ElysiaStatus) {
        return prepared.response.detail;
      }
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
          row.askedBy?.kind === "move" &&
          !ctx.SETTLED.has(row.stage)
      );

  /**
   * A summary its move asked for failed after its job was filed (`row`, in
   * the failure's words), its new session removed (`undoStart`): the
   * session stays where it is, the failure said in its transcript and to
   * its parent, and, stopped at its limit, held there as any session no
   * account took. Nothing moves it some other way. Nothing when the source
   * runs no more.
   */
  const summaryMoveFailed = (row: ContinuationRow, reason: string): void => {
    const asker = row.askedBy;
    const [source] = ctx.db.getInstancesByIds([row.sourceInstanceId]);
    if (asker?.kind !== "move" || !source) {
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
    // One a ChatGPT plan left waits for that plan alone (core
    // `isChatgptPlan`); its stall carries the offer (chatgpt-offer.ts).
    const words =
      left.provider && isChatgptPlan({ provider: left.provider })
        ? chatgptPlanWords
        : accountsWords.stalled;
    return {
      words:
        left.why === "removed"
          ? words.removed(left.accountName)
          : words.signedOut(
              left.accountName,
              ctx.machineName(row.machineId),
              left.why === "codex-signed-out"
                ? signedInForWords(row.harness)
                : ""
            ),
    };
  };

  /**
   * Who answers the end of a turn of `instanceId` its live launch's Claude
   * Code ended on its account's credential (`settleRefusal`): the
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
    const owed = ctx.owedMoves.get(instanceId);
    const take = (): void => {
      if (
        owed?.leave === "refused" ||
        (owed?.move?.kind === "moved" && owed.move.because?.kind === "refused")
      ) {
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
    if (
      !(row && from) ||
      row.accountId !== from.id ||
      ctx.atLimit.credentialMoveTo(row.id) === undefined
    ) {
      return false;
    }
    // A marker, not a target: where it goes is decided as it is carried.
    ctx.owedMoves.set(row.id, { move: null, waits: "turn", leave: why });
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
   * out there; on every machine, when he removes it; of the harnesses
   * `scope.of` keeps, when one sign-in alone goes and another stays) owes a
   * move to the account placement carries it to ({@link oweMoveOff}): one
   * at rest is never woken for it, one in a turn moves at its end. A move
   * owed to `account` there is dropped. One left on no account is stranded
   * as `scope.strand` (else `why`) says. Answers how many move and how many
   * have no account to go to, and the rows whose process may still run
   * (`live`).
   */
  const moveOff = (
    account: Account,
    why: "removed" | "signed-out",
    machineId?: string,
    scope?: {
      of: (row: { harness: HarnessKind }) => boolean;
      strand?: StrandedWhy;
    }
  ): {
    live: PublicInstanceRow[];
    moving: number;
    staying: number;
  } => {
    const named = accountNameAmong(account, ctx.db.accounts.list());
    const there = (row: { harness: HarnessKind; machineId: string }) =>
      (machineId === undefined || row.machineId === machineId) &&
      (scope === undefined || scope.of(row));
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
      } else if (traitsOf(row.harness).accountDir || isChatgptPlan(account)) {
        // Its next send is refused for want of an account (placement's
        // `noAccountRefusal`): its line says it stopped, and why. One on a
        // ChatGPT plan goes back on that plan alone, and offers to continue
        // elsewhere meanwhile (launch-accounts.ts `accountLaunch`).
        strandedIds.push(row.id);
      }
    }
    ctx.db.accounts.strand(strandedIds, account, named, scope?.strand ?? why);
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
   * (`leaveAccounts`). One whose process is up between turns moves
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
   * now and its store once none does (`leaveAccounts`), the rows at
   * rest there naming no account at once; otherwise the machine has
   * already signed it out, and every row there names no account. A row that
   * names no account is placed at its next wake like a new session, among
   * the accounts signed in on its machine, and is refused with the way back
   * (core `SendRefusal` `no-account`) when there is none. Its Codex
   * sessions there are left as they are while its Codex home there stays
   * signed in: the machine keeps that home through this sign-out (agent
   * provider-accounts.ts `removeAccount`), and Codex runs on it alone
   * (placement.ts `harnessSignins`).
   */
  const signOutMachine = (
    account: Account,
    named: string,
    machineId: string,
    leaves: boolean
  ): { moving: number; staying: number } => {
    const of = ctx.outOfStore(account.id, machineId);
    const { moving, staying, live } = moveOff(
      account,
      "signed-out",
      machineId,
      { of }
    );
    if (leaves) {
      ctx.db.accounts.leaveMachine(account.id, machineId);
      ctx.rowsLeave(account.id, null, [machineId], "at-rest", of);
      carryBetweenTurns(live);
      ctx.tickLeaves();
    } else {
      ctx.db.accounts.removeSignin(account.id, machineId);
      ctx.rowsLeave(account.id, null, [machineId], "all", of);
    }
    console.log(
      `[accounts] ${named} signed out on ${ctx.machineName(machineId)}: ${moving} session${moving === 1 ? " owes" : "s owe"} a move to another account there, ${staying} ${staying === 1 ? "has" : "have"} none to go to${leaves ? "; its store goes once no session there runs on it" : ""}.`
    );
    ctx.publishUsage();
    return { moving, staying };
  };

  /**
   * Signs Codex alone out of `account` (`named`) on `machineId`, as a person
   * asked: the same rule as {@link signOutMachine}, for its Codex sessions
   * there alone (the account's own sign-in there, pi's and OpenCode's,
   * stays). Each owes its move ({@link moveOff}); one on a ChatGPT plan,
   * which goes on no other plan, is left stopped with the way on and goes
   * back on its plan once Codex is signed in there again. With a Codex
   * session there still running (`leaves`), the account counts as signed
   * out for Codex at once, so nothing new starts on it, and its Codex home
   * is signed out once none runs (account-carry.ts `leaveCodexHomes`): one
   * up between turns that owes a move moves now; one in a turn finishes it.
   * Otherwise the machine has already signed Codex out.
   */
  const signOutCodex = (
    account: Account,
    named: string,
    machineId: string,
    leaves: boolean
  ): { moving: number; staying: number } => {
    ctx.noteCodexSignin(account.id, machineId, false);
    if (leaves) {
      ctx.keepCodexLeave(account.id, machineId, true);
    }
    const { moving, staying, live } = moveOff(
      account,
      "signed-out",
      machineId,
      { of: (row) => row.harness === "codex", strand: "codex-signed-out" }
    );
    if (leaves) {
      carryBetweenTurns(live);
      ctx.tickLeaves();
    }
    console.log(
      `[accounts] ${named} signed out for Codex on ${ctx.machineName(machineId)}: ${moving} Codex session${moving === 1 ? " owes" : "s owe"} a move to another account there, ${staying} ${staying === 1 ? "has" : "have"} none to go to${leaves ? "; Codex signs out there once no Codex session there runs on it" : ""}.`
    );
    ctx.publishUsage(machineId);
    return { moving, staying };
  };

  /**
   * Takes back a Codex sign-out of `account` on `machineId` that still waits
   * for its sessions ({@link signOutCodex}), as a person asked: its Codex
   * home there was never signed out, so the account counts as signed in for
   * Codex there again, each of its Codex sessions there drops the move that
   * sign-out owed it, and one it stopped is no longer stopped. False when
   * no sign-out waits there.
   */
  const keepCodex = (account: Account, machineId: string): boolean => {
    if (!ctx.codexLeaving(account.id, machineId)) {
      return false;
    }
    ctx.noteCodexSignin(account.id, machineId, true);
    const rows = ctx.db
      .instancesOnAccount(account.id)
      .filter((row) => row.machineId === machineId && row.harness === "codex");
    for (const row of rows) {
      const owed = ctx.owedMoves.get(row.id);
      if (
        owed &&
        !owed.byHand &&
        owed.move?.kind === "moved" &&
        owed.move.signedOut
      ) {
        ctx.owedMoves.delete(row.id);
      }
      if (ctx.db.accounts.strandedOf(row.id)?.why === "codex-signed-out") {
        ctx.unstrand(row.id);
      }
    }
    console.log(
      `[accounts] ${accountNameAmong(account, ctx.db.accounts.list())} stays signed in for Codex on ${ctx.machineName(machineId)}: its waiting sign-out was taken back.`
    );
    ctx.publishStalls();
    ctx.publishUsage(machineId);
    return true;
  };

  return {
    keepCodex,
    owedCarries,
    takeOwedMove,
    owedOn,
    pickWithMove,
    refuseMove,
    moveRefusalOf,
    forgetMoveRefusal,
    landSessionDir,
    handMoveRefusal,
    moveByHand,
    relaunchOnAccount,
    takeUpOwedMove,
    takeUpMovesOn,
    moveOwedAtRefusal,
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
    signOutCodex,
    signOutMachine,
  };
};
