import type {
  AccountBorrowFrame,
  AccountProvider,
  HomeLoginMoved,
  HomeStore,
} from "@cawco/core/accounts";
import {
  ACCOUNT_RULES,
  accountNameAmong,
  CLAUDE_PROVIDER,
} from "@cawco/core/accounts";
import {
  CONTROL_ACCOUNT_LENT,
  CONTROL_BORROW_ACCOUNT,
  CONTROL_LEND_ACCOUNT,
  CONTROL_MOVE_HOME_CREDENTIAL,
  CONTROL_MOVE_HOME_LOGIN,
} from "@cawco/core/accounts/controls";
import { detach } from "@cawco/core/detach";
import { traitsOf } from "@cawco/core/harness/traits";
import { CONTROL_RESTLESS, CONTROL_SLEEP } from "@cawco/core/session/controls";
import { secondsOf } from "@cawco/core/time";
import type { LoginMove } from "./db/accounts";
import type { HubContext } from "./hub-context";
import type { HubTimer } from "./lifetime";
import type { Unanswered } from "./machine-answers";
import { unreachable } from "./unreachable";

/** An account sign-in step on a machine (core `ACCOUNT_RULES.signinWaitMs`). */
export const SIGNIN_TIMEOUT_MS = ACCOUNT_RULES.signinWaitMs;

export type LoginMovesContext = Pick<
  HubContext,
  | "accountWords"
  | "callAgent"
  | "db"
  | "keptWarm"
  | "lifetime"
  | "machineName"
  | "moveKey"
  | "moveRowsToAccount"
  | "movedFrom"
  | "movingFor"
  | "movingLogins"
  | "placedOn"
  | "publishInstances"
  | "publishUsage"
  | "registry"
  | "sessionName"
  | "silentWords"
  | "stepping"
  | "workItems"
>;

export const createLoginMoves = (ctx: LoginMovesContext) => {
  /**
   * How long a machine gets to put a session to sleep: the harness's own stop
   * (an interrupt, a settle, the process's exit) takes seconds.
   */
  const SLEEP_TIMEOUT_MS = 60_000;

  /**
   * A delegate whose work item is over (done, failed or cancelled) and
   * reported has nothing left to run for: its machine is asked to put it to
   * sleep now, rather than at the end of an idle half hour. Asked when the
   * item ends and again as each later turn of its session ends, because a
   * machine does it only for a session at rest ({@link CONTROL_SLEEP}), and
   * the turn that called `finish_item` is still running when the item ends.
   * The machine's `asleep` frame is what files the row.
   */
  const sleepFinished = (instanceId: string): void => {
    const [row] = ctx.db.getInstancesByIds([instanceId]);
    if (
      !(row && ctx.workItems.over(row)) ||
      (row.status !== "running" && row.status !== "starting") ||
      ctx.keptWarm(row.machineId, [row.id]).length > 0
    ) {
      return;
    }
    // The machine's `asleep` frame carries the outcome; a refusal means the
    // session is not at rest.
    detach(
      ctx.callAgent(
        row.machineId,
        CONTROL_SLEEP,
        [],
        SLEEP_TIMEOUT_MS,
        undefined,
        row.id
      ),
      "sleep request"
    );
  };

  /** How long a machine gets to move its login: two `claude auth status` runs and the store's own tool, or a usage read. */
  const MOVE_TIMEOUT_MS = 120_000;
  /** How long a machine gets to say which of its sessions are at rest. */
  const RESTLESS_TIMEOUT_MS = 20_000;
  /** How often a pending move is tried, and what ran from a moved credential is asked to sleep. */
  const MOVE_TICK_MS = 5000;
  /** What the last move of each credential came to, for `GET /api/accounts/move-login`, by {@link moveKey}. */
  const moveResults = new Map<
    string,
    {
      accountId: string;
      at: number;
      error?: string;
      machineId: string;
      provider: AccountProvider;
      /** Where the moved credential is kept now, as its owner names it. */
      kept?: string;
      store: HomeStore;
      storeProvider: string;
    }
  >();
  let moveTicker: HubTimer | undefined;

  /**
   * Whether a session in `status` may have a process: running, starting, or
   * `unknown`, which a starting hub files every one that was running as until
   * its machine says (`sweepBootStatuses`). A move counts those too, so it
   * never runs in the window after a hub restart before the machine reports.
   */
  const mayRun = (status: string): boolean =>
    status === "running" || status === "starting" || status === "unknown";
  /**
   * The sessions that run from a moving credential whose process still runs:
   * the ones a move waits on to be at rest, as account dirs never share the
   * credential (core paths.ts: per account, "never linked or carried").
   */
  const liveFrom = (move: LoginMove): string[] =>
    ctx.db
      .listInstances()
      .filter((row) => {
        const from = ctx.movingFor(row);
        return (
          row.machineId === move.machineId &&
          from !== undefined &&
          ctx.moveKey(from) === ctx.moveKey(move) &&
          mayRun(row.status)
        );
      })
      .map((row) => row.id);

  /**
   * What one move came to: the sign-in recorded as moved and the sessions
   * that ran from it noted ({@link movedFrom}), or why not; the move is gone
   * from the pending ones only after that, so a hub that stops in between
   * asks the machine again, and the machine answers a move it already made.
   */
  const settleMove = async (
    move: LoginMove,
    answer: Awaited<ReturnType<typeof ctx.callAgent>>,
    ranFrom: string[],
    lentBy?: string
  ): Promise<void> => {
    const at = Date.now();
    const { machineId, store } = move;
    const machine = ctx.machineName(machineId);
    const key = ctx.moveKey(move);
    const done = {
      accountId: move.accountId,
      at,
      machineId,
      provider: move.provider,
      store,
      storeProvider: move.storeProvider,
    };
    const what = `${machine}'s own ${store} ${traitsOf(store).accountModel === "dir" ? "login" : move.storeProvider}`;
    switch (answer.kind) {
      case "unanswered":
        // Not known to have moved or not: the move stays pending and the
        // next tick asks again; the machine answers a move it already made.
        console.warn(
          `[hub] moving ${what}: ${answer.reason === "dead" ? "a machine it needs is not connected" : `no answer within ${secondsOf(answer.after)} s`}; asked again at the next tick`
        );
        return;
      case "answered":
        if (!answer.value.ok) {
          const error = answer.value.error ?? "The move did not finish.";
          moveResults.set(key, { ...done, error });
          ctx.db.accounts.removeMove(move);
          console.warn(`[hub] moving ${what} failed: ${error}`);
          return;
        }
        break;
      default:
        throw unreachable(answer);
    }
    const kept = (answer.value.result as HomeLoginMoved).store;
    const repinned =
      traitsOf(store).accountModel === "dir" ? ranOnHomeLogin(move) : [];
    ctx.db.accounts.putSignin({
      accountId: move.accountId,
      machineId,
      state: "signed-in",
      moved: { at, from: store },
    });
    // Each one to re-pin is kept with the ones that ran from the login until
    // it is: a hub that stops in between re-pins it at its next tick.
    ctx.db.accounts.putMovedFrom(
      [...new Set([...ranFrom, ...repinned.map((row) => row.id)])],
      machineId
    );
    ctx.db.accounts.removeMove(move);
    moveResults.set(key, { ...done, kept });
    const { moved, running } = await repinOnto(move, repinned, ranFrom);
    const borrowed = lentBy
      ? ` (its own login had expired; the account's is used, from ${ctx.machineName(lentBy)})`
      : "";
    console.log(
      `[hub] moved ${what} (${move.identity.email}) into account ${move.accountId}${borrowed}, kept in ${kept}; ${moved} session(s) that ran on it re-pinned to it, ${running} when their process ends`
    );
    ctx.publishUsage(machineId);
  };

  /** How long a lender gets to refresh and lend an account's sign-in. */
  const LEND_TIMEOUT_MS = 60_000;

  /** The machines `accountId` is signed in on in CawCo, other than `machineId`: who could lend it there. */
  const lendersOf = (accountId: string, machineId: string): string[] =>
    ctx.db.accounts
      .signins()
      .filter(
        (one) =>
          one.accountId === accountId &&
          one.machineId !== machineId &&
          one.state === "signed-in"
      )
      .map((one) => one.machineId);

  /** Why an account's lender cannot lend it now, in a sentence. */
  const lenderAway = (accountId: string, lender: string): string => {
    const account = ctx.db.accounts.get(accountId);
    return `${account ? accountNameAmong(account, ctx.db.accounts.list()) : `Account ${accountId}`} is refreshed by ${ctx.machineName(lender)}, which is offline.`;
  };

  /**
   * A machine's own credential of a moving identity did not answer
   * ({@link HomeLoginMoved.expired}): the account's working sign-in, held by
   * another machine, is lent to it ({@link CONTROL_LEND_ACCOUNT}, then
   * {@link CONTROL_BORROW_ACCOUNT}), so its harness runs on the account with
   * nobody signing in again there. With no machine signed in to the account
   * the move fails as it always did.
   */
  const borrowInto = async (
    move: LoginMove,
    expired: string
  ): Promise<{
    answer: Awaited<ReturnType<typeof ctx.callAgent>>;
    lender?: string;
  }> => {
    const lenders = lendersOf(move.accountId, move.machineId);
    const failures: string[] = [];
    let silent: Unanswered | undefined;
    for (const lender of lenders) {
      if (!ctx.registry.agent(lender)) {
        failures.push(lenderAway(move.accountId, lender));
        continue;
      }
      const lent = await ctx.callAgent(
        lender,
        CONTROL_LEND_ACCOUNT,
        [move.accountId],
        LEND_TIMEOUT_MS
      );
      switch (lent.kind) {
        case "unanswered":
          console.warn(
            `[hub] ${ctx.machineName(lender)} did not lend ${ctx.accountWords(move.accountId)}: ${ctx.silentWords(lender, lent)}`
          );
          silent ??= lent;
          continue;
        case "answered":
          if (!lent.value.ok) {
            failures.push(
              `${ctx.machineName(lender)} did not lend it: ${lent.value.error ?? "it gave no reason"}`
            );
            continue;
          }
          break;
        default:
          throw unreachable(lent);
      }
      const answer = await ctx.callAgent(
        move.machineId,
        CONTROL_BORROW_ACCOUNT,
        [
          move.accountId,
          lender,
          lent.value.result,
          move.store,
          move.storeProvider,
          move.identity,
        ],
        MOVE_TIMEOUT_MS
      );
      return { answer, lender };
    }
    // A lender that did not answer may yet lend: the move stays pending.
    if (silent) {
      return { answer: silent };
    }
    const error = [`The account did not answer: ${expired}.`, ...failures].join(
      " "
    );
    return {
      answer: {
        kind: "answered",
        value: {
          kind: "control_result",
          ok: false,
          requestId: "",
          error,
        },
      },
    };
  };

  /**
   * Borrowers whose ask found their lender away, by lender: brought a fresh
   * sign-in once it connects again ({@link lendToWaiting}), so nothing asks
   * again on a timer meanwhile.
   */
  const awaitingLender = new Map<
    string,
    Map<string, { accountId: string; borrower: string }>
  >();

  /** Answers a borrower ({@link CONTROL_ACCOUNT_LENT}) with a lender's fresh sign-in or why there is none. */
  const answerBorrower = (
    borrower: string,
    requestId: string | null,
    accountId: string,
    answer: unknown
  ): void => {
    detach(
      ctx.callAgent(
        borrower,
        CONTROL_ACCOUNT_LENT,
        [requestId, answer, accountId],
        SIGNIN_TIMEOUT_MS
      ),
      "lent sign-in"
    );
  };

  /** One lend of `accountId` by `lender`: its fresh sign-in, or why not, in a sentence. */
  const lendOnce = async (
    accountId: string,
    lender: string
  ): Promise<unknown> => {
    if (!ctx.registry.agent(lender)) {
      return { error: lenderAway(accountId, lender) };
    }
    const lent = await ctx.callAgent(
      lender,
      CONTROL_LEND_ACCOUNT,
      [accountId],
      LEND_TIMEOUT_MS
    );
    const account = ctx.db.accounts.get(accountId);
    const refused = (why: string) => ({
      error: `${account ? accountNameAmong(account, ctx.db.accounts.list()) : `Account ${accountId}`} is refreshed by ${ctx.machineName(lender)}, which did not lend it: ${why}.`,
    });
    switch (lent.kind) {
      case "unanswered":
        return lent.reason === "dead"
          ? { error: lenderAway(accountId, lender) }
          : refused(`it did not answer within ${secondsOf(lent.after)} s`);
      case "answered":
        return lent.value.ok
          ? lent.value.result
          : refused(lent.value.error ?? "it gave no reason");
      default:
        throw unreachable(lent);
    }
  };

  /**
   * A borrower near its borrowed sign-in's expiry ({@link AccountBorrowFrame}):
   * its lender asked for a fresh one, which goes back to the borrower. A
   * lender that is away is said to the borrower once, and the borrower is
   * brought a fresh sign-in when the lender connects again.
   */
  const answerBorrow = async (
    borrower: string,
    frame: AccountBorrowFrame
  ): Promise<void> => {
    const { accountId, lender, requestId } = frame;
    const signed = lendersOf(accountId, borrower).includes(lender);
    const answer = signed
      ? await lendOnce(accountId, lender)
      : {
          error: `Account ${accountId} is not signed in on ${ctx.machineName(lender)} in CawCo any more, so nothing lends it to ${ctx.machineName(borrower)}.`,
        };
    if (signed && !ctx.registry.agent(lender)) {
      const waiting = awaitingLender.get(lender) ?? new Map();
      waiting.set(`${borrower}\u0000${accountId}`, { accountId, borrower });
      awaitingLender.set(lender, waiting);
    }
    if (answer && typeof answer === "object" && "error" in answer) {
      console.warn(
        `[hub] ${ctx.machineName(borrower)}'s borrowed sign-in of account ${accountId} was not refreshed: ${String(answer.error)}`
      );
    } else {
      console.log(
        `[hub] ${ctx.machineName(borrower)}'s borrowed sign-in of account ${accountId} refreshed from ${ctx.machineName(lender)}`
      );
    }
    answerBorrower(borrower, requestId, accountId, answer);
  };

  /** A lender connected again: each borrower that found it away is brought a fresh sign-in, once. */
  const lendToWaiting = (lender: string): void => {
    const waiting = awaitingLender.get(lender);
    if (!waiting) {
      return;
    }
    awaitingLender.delete(lender);
    for (const { accountId, borrower } of waiting.values()) {
      lendOnce(accountId, lender)
        .then((answer) => {
          if (answer && typeof answer === "object" && !("error" in answer)) {
            console.log(
              `[hub] ${ctx.machineName(lender)} is back: ${ctx.machineName(borrower)}'s borrowed sign-in of account ${accountId} refreshed`
            );
            answerBorrower(borrower, null, accountId, answer);
          }
        })
        .catch(console.error);
    }
  };

  /**
   * Every Claude session on a machine whose own login moved, on an account
   * CawCo never placed there: it ran on that login, so it is the moved
   * account's from now on.
   */
  const ranOnHomeLogin = (move: LoginMove) =>
    ctx.db
      .listInstances()
      .filter(
        (row) =>
          row.machineId === move.machineId &&
          traitsOf(row.harness).accountModel === "dir" &&
          row.accountId !== move.accountId &&
          !(row.accountId && ctx.placedOn(move.machineId, row.accountId))
      );

  /**
   * Re-pins what ran on a moved login to the account it moved into: each
   * one's data carried into that account's dir, then its row. One whose
   * process still runs from the machine's own dir stays in
   * {@link movedFrom}, carried when that process is gone
   * ({@link sleepMovedFrom}); the rest leave it.
   */
  const repinOnto = async (
    move: LoginMove,
    rows: ReturnType<typeof ranOnHomeLogin>,
    ranFrom: string[]
  ): Promise<{ moved: number; running: number }> => {
    const { moved, kept } = await ctx.moveRowsToAccount(
      move.machineId,
      rows,
      move.accountId
    );
    const running = [...kept]
      .filter(([, why]) => why.running)
      .map(([id]) => id);
    for (const row of rows) {
      const why = kept.get(row.id);
      if (!why) {
        continue;
      }
      console.warn(
        `[accounts] ${ctx.sessionName(row)} stays on ${ctx.machineName(move.machineId)}'s own Claude Code login for now, not ${ctx.accountWords(move.accountId)}: ${why.why}. ${why.running ? "It is copied there once its process is gone." : "Its row keeps the login it ran on."}`
      );
    }
    for (const row of rows) {
      if (!(running.includes(row.id) || ranFrom.includes(row.id))) {
        ctx.db.accounts.removeMovedFrom(row.id);
      }
    }
    return { moved: moved.length, running: running.length };
  };

  /**
   * The account a machine's own Claude Code login moved into, if it has:
   * the one its sessions from before the move are re-pinned to.
   */
  const homeMovedAccountOn = (machineId: string): string | undefined =>
    ctx.db.accounts
      .signins()
      .filter(
        (one) =>
          one.machineId === machineId &&
          traitsOf(one.movedFrom).accountModel === "dir" &&
          ctx.db.accounts.get(one.accountId)?.provider === CLAUDE_PROVIDER
      )
      .sort((a, b) => (b.movedAt ?? 0) - (a.movedAt ?? 0))[0]?.accountId;

  /** The sessions {@link sleepMovedFrom} is carrying now, so no tick starts a second carry of one. */
  const repinning = new Set<string>();

  /**
   * A Claude session that ran from a machine's own login, whose process is
   * gone: re-pinned now to the account the login moved into, its data
   * carried first. Done with once moved, or once it cannot be.
   */
  const repinMovedFrom = async (
    instanceId: string,
    machineId: string
  ): Promise<void> => {
    const [row] = ctx.db.getInstancesByIds([instanceId]);
    const into = homeMovedAccountOn(machineId);
    if (
      !(row && into) ||
      traitsOf(row.harness).accountModel !== "dir" ||
      row.accountId === into
    ) {
      ctx.db.accounts.removeMovedFrom(instanceId);
      return;
    }
    if (repinning.has(instanceId) || !ctx.registry.agent(machineId)) {
      return;
    }
    repinning.add(instanceId);
    try {
      const { kept } = await ctx.moveRowsToAccount(machineId, [row], into);
      const why = kept.get(instanceId);
      if (why) {
        console.warn(
          `[accounts] ${ctx.sessionName(row)} stays on ${ctx.machineName(machineId)}'s own Claude Code login for now, not ${ctx.accountWords(into)}: ${why.why}. ${why.running ? "It is copied there once its process is gone again." : "Its row keeps the login it ran on."}`
        );
      }
      // A process that came back is carried when it is gone again.
      if (!why?.running) {
        ctx.db.accounts.removeMovedFrom(instanceId);
      }
      ctx.publishInstances(machineId);
    } finally {
      repinning.delete(instanceId);
    }
  };

  /**
   * Each session in {@link movedFrom} is asked to sleep, which its machine
   * does only at rest; one whose process is gone is done with, a Claude one
   * once it is re-pinned ({@link repinMovedFrom}).
   */
  const sleepMovedFrom = (): void => {
    const moved = ctx.movedFrom();
    const status = new Map(
      ctx.db
        .getInstancesByIds([...moved.keys()])
        .map((row) => [row.id, row.status])
    );
    for (const [instanceId, machineId] of moved) {
      const now = status.get(instanceId);
      if (!(now && mayRun(now))) {
        // Each re-pin runs on its own; one not done is tried at the next tick.
        detach(repinMovedFrom(instanceId, machineId), "login move re-pin");
        continue;
      }
      // Not known yet (a hub just started): asked once its machine says.
      if (now === "unknown") {
        continue;
      }
      // The machine's `asleep` frame files the row; a refusal is a session not
      // at rest yet, asked again next tick.
      detach(
        ctx.callAgent(
          machineId,
          CONTROL_SLEEP,
          [],
          SLEEP_TIMEOUT_MS,
          undefined,
          instanceId
        ),
        "sleep request"
      );
    }
  };

  /**
   * One step of a credential's move out of a machine's own store
   * ({@link movingLogins}). Nothing is held and nothing is asked to sleep:
   * the sessions that run from it ({@link movingFor}) go on running from it,
   * and the step asks the machine whether every one with a process
   * ({@link liveFrom}) is at rest ({@link CONTROL_RESTLESS}: no turn, no ask,
   * no subagent, nothing on its way to it). At the first step that finds
   * them all at rest the machine moves it, so the move never lands under a
   * turn. The account's sign-in there is then recorded as moved from that
   * store, and each session whose process ran from it goes into
   * {@link movedFrom}, to be put to sleep at rest so that its next wake runs
   * where the credential is now. A move that fails is said in the log and in
   * its result, and the original is as it was.
   */
  const advanceMove = async (move: LoginMove): Promise<void> => {
    const key = ctx.moveKey(move);
    if (ctx.stepping.has(key)) {
      return;
    }
    ctx.stepping.add(key);
    try {
      await stepMove(move);
    } finally {
      ctx.stepping.delete(key);
    }
  };
  const stepMove = async (move: LoginMove): Promise<void> => {
    const { machineId } = move;
    // A machine not connected (a hub just started, a machine away) is asked
    // once it is.
    if (!ctx.registry.agent(machineId)) {
      return;
    }
    const ranFrom = liveFrom(move);
    if (ranFrom.length > 0) {
      const restless = await ctx.callAgent(
        machineId,
        CONTROL_RESTLESS,
        [ranFrom],
        RESTLESS_TIMEOUT_MS
      );
      switch (restless.kind) {
        case "unanswered":
          // Asked again at the next tick.
          return;
        case "answered":
          if (
            !restless.value.ok ||
            Object.keys(restless.value.result as Record<string, string>)
              .length > 0 ||
            liveFrom(move).some((id) => !ranFrom.includes(id))
          ) {
            // Asked again at the next tick.
            return;
          }
          break;
        default:
          throw unreachable(restless);
      }
    }
    const answer =
      traitsOf(move.store).accountModel === "dir"
        ? await ctx.callAgent(
            machineId,
            CONTROL_MOVE_HOME_LOGIN,
            [move.accountId, move.identity],
            MOVE_TIMEOUT_MS,
            "claude"
          )
        : await ctx.callAgent(
            machineId,
            CONTROL_MOVE_HOME_CREDENTIAL,
            [move.accountId, move.store, move.storeProvider, move.identity],
            MOVE_TIMEOUT_MS
          );
    const expired =
      answer.kind === "answered" && answer.value.ok
        ? (answer.value.result as HomeLoginMoved).expired
        : undefined;
    if (expired === undefined) {
      await settleMove(move, answer, ranFrom);
    } else {
      const borrowed = await borrowInto(move, expired);
      await settleMove(move, borrowed.answer, ranFrom, borrowed.lender);
    }
    sleepMovedFrom();
    ctx.publishInstances(machineId);
  };

  /**
   * Starts the ticks that carry every pending move along and put what ran
   * from a moved credential to sleep; they stop when neither is left. A hub
   * that starts with either in its database starts them at once.
   */
  const tickMoves = (): void => {
    moveTicker ??= ctx.lifetime.every(MOVE_TICK_MS, () => {
      const moves = ctx.movingLogins();
      if (moves.length === 0 && ctx.movedFrom().size === 0) {
        ctx.lifetime.cancel(moveTicker);
        moveTicker = undefined;
        return;
      }
      for (const move of moves) {
        advanceMove(move).catch(console.error);
      }
      sleepMovedFrom();
    });
  };
  /** What a hub that just started finds in its database it carries on with. */
  const carryOnMoves = (): void => {
    const moves = ctx.movingLogins().length;
    const moved = ctx.movedFrom().size;
    if (moves === 0 && moved === 0) {
      return;
    }
    console.log(
      `[hub] carrying on ${moves} login move(s) and ${moved} session(s) still running from a moved login`
    );
    tickMoves();
  };

  return {
    SLEEP_TIMEOUT_MS,
    sleepFinished,
    MOVE_TICK_MS,
    moveResults,
    mayRun,
    liveFrom,
    answerBorrow,
    lendToWaiting,
    homeMovedAccountOn,
    advanceMove,
    tickMoves,
    carryOnMoves,
  };
};
