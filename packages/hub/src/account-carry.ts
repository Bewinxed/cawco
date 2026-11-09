import type { Account } from "@cawco/core/accounts";
import { accountNameAmong, CLAUDE_PROVIDER } from "@cawco/core/accounts";
import {
  CONTROL_FORGET_ACCOUNT,
  CONTROL_FORGET_PROVIDER_ACCOUNT,
} from "@cawco/core/accounts/controls";
import { RESTART_WAIT_CAP_MS, waitedOut } from "@cawco/core/binary-updates";
import { detach } from "@cawco/core/detach";
import type { HarnessKind } from "@cawco/core/harness/kinds";
import { traitsOf } from "@cawco/core/harness/traits";
import type {
  CarrySessionOutcome,
  CarrySessionRequest,
  EndedTask,
  MoveEnded,
} from "@cawco/core/session/controls";
import {
  CONTROL_CARRY_SESSIONS,
  CONTROL_GET_SESSION_INFO,
  CONTROL_SLEEP,
} from "@cawco/core/session/controls";
import { noticeWords } from "@cawco/core/words/notices";
import { workWords } from "@cawco/core/words/work";
import type { Kept } from "./at-limit";
import type { AccountLeave } from "./db/accounts";
import type { HubContext } from "./hub-context";
import type { HubTimer } from "./lifetime";
import { SIGNIN_TIMEOUT_MS } from "./login-moves";
import { READ_TIMEOUT_MS } from "./machine-read-timeouts";
import { LIMIT_ORIGIN } from "./sends";
import { sessionWord } from "./session-word";
import { unreachable } from "./unreachable";

/**
 * A machine's word on one carry, or the hub's when the call to the machine
 * itself failed (`machine`: away, timed out, refused whole), which says
 * nothing of the account it was to carry into.
 */
type CarryOutcome =
  CarrySessionOutcome | { error: string; machine: true; state: "failed" };

export type AccountCarryContext = Pick<
  HubContext,
  | "MOVE_TICK_MS"
  | "SLEEP_TIMEOUT_MS"
  | "awayWords"
  | "callAgent"
  | "db"
  | "deliverSend"
  | "launchInFlight"
  | "lifetime"
  | "machineName"
  | "mayRun"
  | "owedCarries"
  | "owedMoves"
  | "publishInstances"
  | "publishStalls"
  | "readAgent"
  | "registry"
  | "reportedMachinePath"
  | "sessionName"
  | "silentWords"
  | "takeUpOwedMove"
>;

export const createAccountCarry = (ctx: AccountCarryContext) => {
  /** How long a machine gets to carry sessions' data: a few folders moved within one disk. */
  const CARRY_TIMEOUT_MS = 120_000;

  /**
   * `instanceId` is placed on an account: whatever left it on none
   * ({@link strandedStall}) is over.
   */
  const unstrand = (instanceId: string): void => {
    if (ctx.db.accounts.unstrand(instanceId)) {
      ctx.publishStalls();
    }
  };
  /** `instanceId`'s row names `accountId` from now on ({@link unstrand} when it is one). */
  const onAccount = (instanceId: string, accountId: string | null): void => {
    ctx.db.patchInstance(instanceId, { accountId });
    if (accountId) {
      unstrand(instanceId);
    }
  };

  /**
   * Puts `rows`, all on `machineId`, on `accountId` (null: on none). A Claude
   * session's own data lives in its account's dir (core paths/claude.ts
   * `sessionConfigDir`), so each one's machine carries it there first
   * ({@link CONTROL_CARRY_SESSIONS}) and its row says the new account only
   * once the machine answers that it all is: a reader with the row reads
   * that one dir. `stop` ends a session's process first when it is between
   * turns (no turn running, no ask parked, no send unread, no background
   * task, no wake-up its resume would not bring back), for a move that
   * relaunches it with its conversation; one that holds any of those is
   * kept `running`, and its move waits for its next turn's end. Without
   * `stop`, a session whose process runs stays where it is. A session
   * `stopped` at its limit or on its refused sign-in runs no turn, so with
   * `stop` nothing its process holds for later (a background command, a
   * monitor, a wake-up) keeps it: the move ends that work, and the session
   * is told on its new account what ended ({@link tellEndedByMove}). That is
   * the one rule for every move of a stopped session, whoever started it
   * ({@link stoppedNow}): a person's pick (`moveByHand`), a person's or the
   * limit's owed move carried at a look or at the refusal
   * (`takeUpOwedMove`), and the at-limit controller's own move (at the
   * refusal, at a look a held message or a reconnect asks for, at a reset:
   * its `move` port). A stopped session no person waits on, its hold's start
   * `laterSince` given, waits for that work instead, until it has been held
   * the restart bound (core `waitedOut`), from that start across a hub
   * restart too: the controller's looks carry it then. A running session's
   * move waits for that work instead, up to the restart bound
   * ({@link waitForLater}). A row with no conversation yet, or of another
   * harness, has nothing of Claude's to carry. Answers the rows that moved,
   * what each move ended, and why each other did not.
   */
  const moveRowsToAccount = async (
    machineId: string,
    rows: readonly {
      harness: HarnessKind;
      id: string;
      sessionId?: string | null;
    }[],
    accountId: string | null,
    stop = false,
    stopped?: "limit" | "signin",
    laterSince?: number
  ): Promise<{
    ended: Map<string, MoveEnded>;
    kept: Map<string, Kept>;
    moved: string[];
  }> => {
    const endsLater =
      stopped !== undefined &&
      (laterSince === undefined || waitedOut(laterSince));
    const requests: CarrySessionRequest[] = rows.flatMap((row) =>
      traitsOf(row.harness).accountDir && row.sessionId
        ? [
            {
              instanceId: row.id,
              sessionId: row.sessionId,
              accountId,
              ...(stop ? { stop: true } : {}),
              ...(stop && (endsLater || endLaterNow.has(row.id))
                ? { endLater: true as const }
                : {}),
            },
          ]
        : []
    );
    const outcomes = await askCarry(machineId, requests);
    // Each caller says what became of a row left where it was, and what
    // happens next: only it knows.
    const kept = new Map<string, Kept>();
    const ended = new Map<string, MoveEnded>();
    const moved: string[] = [];
    for (const row of rows) {
      const outcome = outcomes.get(row.id);
      const why = requests.some((one) => one.instanceId === row.id)
        ? keptBecause(machineId, outcome)
        : undefined;
      if (why) {
        kept.set(row.id, why);
        // A stopped session's wait is its hold's (at-limit.ts `moveTo`).
        if (why.later && stopped === undefined) {
          waitForLater(row.id);
        }
        continue;
      }
      ctx.lifetime.cancel(laterWaits.get(row.id)?.timer);
      laterWaits.delete(row.id);
      if (outcome?.state === "carried") {
        keepEnded(row.id, outcome.ended, ended);
      }
      onAccount(row.id, accountId);
      moved.push(row.id);
    }
    return { moved, kept, ended };
  };

  /**
   * A carried move's word on what it ended with `instanceId`'s process,
   * kept (db `move_endings`) for its next launch to tell
   * ({@link tellEndedByMove}); what the hub kept of its background tasks is
   * the move's to tell now, never a cut's too ({@link tellCutTasks}).
   */
  const keepEnded = (
    instanceId: string,
    what: MoveEnded | undefined,
    into: Map<string, MoveEnded>
  ): void => {
    ctx.db.sessionTasks.clear(instanceId);
    if (what) {
      ctx.db.moveEndings.put(instanceId, what);
      into.set(instanceId, what);
    }
  };

  /**
   * The moves held only by work a session's process holds for later (a
   * background task, a one-time wake-up: {@link Kept.later}), by instance id:
   * since when each was first held, and its timer. Once it has waited out the
   * restart bound (core `waitedOut`, the rule auto-update waits by) it is
   * tried again with `endLater` ({@link endLaterNow}), which ends that work
   * with the process. A completion before then starts the turn whose end the
   * move takes, as it always has.
   */
  const laterWaits = new Map<string, { since: number; timer: HubTimer }>();
  /** The rows whose next carry ends what their process holds for later: their wait is over. */
  const endLaterNow = new Set<string>();

  /**
   * The move of running `instanceId` is held by work its process holds for
   * later: tried again, ending it, once its wait is over. A stopped
   * session's move never waits so ({@link moveRowsToAccount} `stopped`).
   */
  const waitForLater = (instanceId: string, since = Date.now()): void => {
    if (laterWaits.has(instanceId)) {
      return;
    }
    laterWaits.set(instanceId, {
      since,
      timer: ctx.lifetime.after(
        Math.max(0, since + RESTART_WAIT_CAP_MS - Date.now()),
        () => {
          laterWaits.delete(instanceId);
          if (waitedOut(since)) {
            detach(retryLaterMove(instanceId), "move past its wait");
          } else {
            waitForLater(instanceId, since);
          }
        }
      ),
    });
  };

  /**
   * The move owed by `instanceId` after its wait for the work it holds for
   * later ({@link waitForLater}), carried with `endLater` as any owed move
   * ({@link takeUpOwedMove}). Nothing when the move was dropped meanwhile.
   */
  const retryLaterMove = async (instanceId: string): Promise<void> => {
    const [row] = ctx.db.getInstancesByIds([instanceId]);
    const owed = ctx.owedMoves.get(instanceId);
    if (!(row && owed?.to !== undefined)) {
      return;
    }
    console.info(
      `[accounts] ${ctx.sessionName(row)}'s move waited ${RESTART_WAIT_CAP_MS / 60_000} minutes for the work its process holds for later; it is carried now, that work ending with the process, and the session is told what ended once it runs on the new account.`
    );
    endLaterNow.add(instanceId);
    try {
      await ctx.takeUpOwedMove(instanceId);
    } finally {
      endLaterNow.delete(instanceId);
    }
  };

  /**
   * Tells `row`, launched on its new account, what its move ended with its
   * old process (db `move_endings`, kept from the machine's answer across a
   * hub restart, taken here once): each background task, by its id,
   * description and the last of its output, and the one-time wake-ups. Its
   * first turn there reads it, so the session starts again what it still
   * needs. Every launch asks ({@link resumeSpawn}): the one after the move,
   * or, when that never came up, the next.
   */
  const tellEndedByMove = (row: { id: string; machineId: string }): void => {
    const ended = ctx.db.moveEndings.take(row.id);
    if (!ended || (ended.tasks.length === 0 && ended.wakeups === 0)) {
      return;
    }
    ctx.deliverSend(
      sessionWord(row, endedByMoveWords(ended), {
        kind: "system",
        name: LIMIT_ORIGIN,
        line: noticeWords.movedEnded(ended.tasks.length),
      })
    );
  };

  /**
   * What happens next to a move a carry left where it was ({@link keptBecause}):
   * held by work its process holds for later, it goes when that ends or past
   * its wait ({@link waitForLater}); held by a turn, at that turn's end;
   * otherwise it is dropped.
   */
  const keptNextWords = (why: Kept, toName: string): string => {
    if (why.later) {
      return `It moves when that work ends, or in ${RESTART_WAIT_CAP_MS / 60_000} minutes at the latest, ending it; the session is told on ${toName} what ended.`;
    }
    return why.running
      ? "It moves when its next turn ends."
      : "The move is dropped; it stays where it is until it is moved again.";
  };

  /** An ended task's output line: the last of it, or that its read went unanswered, apart from one there was none to read. */
  const endedTaskOutputWords = (task: MoveEnded["tasks"][number]): string => {
    if (task.output) {
      return `  The last of its output:\n${task.output
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n")}`;
    }
    if (task.outputUnread) {
      return `  Its output was asked for and didn't come within ${Math.ceil(task.outputUnread.after / 1000)} s, so the last of it isn't here.`;
    }
    return "  Its output couldn't be read.";
  };

  /**
   * The words a session reads on its new account about what its move ended
   * ({@link tellEndedByMove}): each background task by its id, kind and
   * description with its output line ({@link endedTaskOutputWords}), and the
   * one-time wake-ups.
   */
  const endedByMoveWords = (ended: MoveEnded): string =>
    [
      `You were moved to another account. Claude Code doesn't bring back background work when it resumes a session, so the move ended what your old process was still running. ${workWords.interrupted}`,
      ...ended.tasks.map((task) =>
        [
          `- Background task ${task.taskId} (${task.type}): ${task.description}.`,
          endedTaskOutputWords(task),
        ].join("\n")
      ),
      // code.claude.com/docs/en/scheduled-tasks: a resume restores "the tasks
      // scheduled with CronCreate, except … one-shot tasks whose scheduled
      // time has passed", but "A self-paced `/loop` isn't restored"; the
      // Stop hook's list doesn't say which a wake-up is, so neither is
      // promised lost.
      ...(ended.wakeups > 0
        ? [
            `- ${ended.wakeups} one-time wake-up(s) you had scheduled. One you set with CronCreate comes back if its time hasn't passed; a self-paced loop's next wake-up (ScheduleWakeup) doesn't. Check with CronList.`,
          ]
        : []),
      "Start again whatever you still need, then carry on.",
    ].join("\n");

  /**
   * The words a session reads of the background tasks its process took with
   * it ({@link tellCutTasks}): what cut them, each task by its id, kind and
   * description with its output line ({@link endedTaskOutputWords}),
   * interrupted with its outcome unknown.
   */
  const cutTasksWords = (how: string, cut: readonly EndedTask[]): string =>
    [
      `${how}, which ended ${cut.length === 1 ? "the background task" : `the ${cut.length} background tasks`} it was running; Claude Code doesn't bring them back. ${workWords.interrupted}`,
      ...cut.map((task) =>
        [
          `- Background task ${task.taskId} (${task.type}): ${task.description}.`,
          endedTaskOutputWords(task),
        ].join("\n")
      ),
      "Start again whatever you still need, then carry on.",
    ].join("\n");

  /** Why a carry left a row's data where it was ({@link moveRowsToAccount}); undefined when it is all in the new dir. */
  const keptBecause = (
    machineId: string,
    outcome: CarryOutcome | undefined
  ): Kept | undefined => {
    if (!outcome) {
      return {
        running: false,
        why: `${ctx.machineName(machineId)} didn't say whether it copied the conversation`,
      };
    }
    if (outcome.state === "carried") {
      return;
    }
    if (outcome.state === "live" && outcome.later) {
      return {
        later: outcome.why,
        running: true,
        why: `${outcome.why}, and Claude Code doesn't bring that back when it resumes a session on another account`,
      };
    }
    return outcome.state === "live"
      ? {
          running: true,
          why: `its Claude Code process is busy (${outcome.why}), and a conversation isn't copied while the process writing it runs`,
        }
      : {
          running: false,
          // The machine's own copy into the new account's dir failed, not the
          // call to it, nor another carry of the same conversation (a clash,
          // which passes: the same target is tried at the next look): another
          // account may take it.
          ...("machine" in outcome || outcome.clash
            ? {}
            : { target: true as const }),
          why: `copying its conversation on ${ctx.machineName(machineId)} failed: ${outcome.error}`,
        };
  };

  /** An account as a line names it: its email (or the name a person gave it); none is the machine's own login. */
  const accountWords = (accountId: string | null | undefined): string => {
    if (!accountId) {
      return "the machine's own Claude Code login";
    }
    const account = ctx.db.accounts.get(accountId);
    return account
      ? accountNameAmong(account, ctx.db.accounts.list())
      : "an account this hub no longer has";
  };

  /** The machine's word on each carry asked of it; one it never gave is a failure with its reason. */
  const askCarry = async (
    machineId: string,
    requests: CarrySessionRequest[]
  ): Promise<Map<string, CarryOutcome>> => {
    if (requests.length === 0) {
      return new Map();
    }
    const answer = await ctx.callAgent(
      machineId,
      CONTROL_CARRY_SESSIONS,
      [requests],
      CARRY_TIMEOUT_MS
    );
    // Unanswered or refused, every row stays where it is (moveRowsToAccount
    // `kept`), with why in the outcome's words.
    const none = (error: string) =>
      new Map(
        requests.map((one) => [
          one.instanceId,
          { state: "failed", error, machine: true } as const,
        ])
      );
    switch (answer.kind) {
      case "unanswered":
        return none(ctx.awayWords(machineId, answer));
      case "answered":
        if (!answer.value.ok) {
          return none(
            answer.value.error ?? `${ctx.machineName(machineId)} gave no reason`
          );
        }
        return new Map(
          Object.entries(
            answer.value.result as Record<string, CarrySessionOutcome>
          )
        );
      default:
        throw unreachable(answer);
    }
  };

  /**
   * Every Claude session with a conversation on `machineId`, with the
   * account its row runs on, for the machine to carry into that account's
   * dir as its agent starts ({@link RegisterAckPayload.sessions}). Rows that
   * share one conversation and disagree on its account are left out: their
   * data cannot be in both dirs. So is one whose row owes a move to another
   * account ({@link owedMoves}): the move carries it, behind this
   * ack ({@link takeUpMovesOn}), and a machine refuses a carry of a
   * conversation another carry is moving, so the sweep's would drop the
   * move (2026-10-21, a sleeping session moved while its machine was away).
   */
  const claudeSessionsOn = (machineId: string): CarrySessionRequest[] => {
    const bySession = new Map<string, CarrySessionRequest | null>();
    // The moves owed, read once: one read per conversation held the hub's
    // thread 63 ms for a machine's 2,277 at its register (hub-restart-load).
    const owed = new Map(ctx.owedMoves.list());
    for (const row of ctx.db.claudeConversationsOn(machineId)) {
      if (owed.get(row.id)?.to !== undefined) {
        bySession.set(row.sessionId, null);
        continue;
      }
      const accountId = row.accountId ?? null;
      const seen = bySession.get(row.sessionId);
      if (seen === undefined) {
        bySession.set(row.sessionId, {
          instanceId: row.id,
          sessionId: row.sessionId,
          accountId,
        });
      } else if (seen && seen.accountId !== accountId) {
        console.warn(
          `[accounts] ${ctx.sessionName(row)}'s conversation is claimed by sessions on ${accountWords(seen.accountId)} and on ${accountWords(accountId)}, so it is left where it is on ${ctx.machineName(machineId)}: it can't be in both accounts' stores. Moving one of those sessions to the other's account settles it.`
        );
        bySession.set(row.sessionId, null);
      }
    }
    return [...bySession.values()].filter(
      (one): one is CarrySessionRequest => one !== null
    );
  };

  /**
   * A row from before `cwd` was pinned to the launch directory may hold a
   * folder its CLI wandered into. Its conversation names where it started —
   * Claude keeps the first cwd it saw, OpenCode and pi the session's own
   * directory — so its machine is asked once, at register, before anything of
   * it is restored. A machine that cannot answer is asked again at its next.
   */
  const readLaunchDirs = async (machineId: string): Promise<void> => {
    const rows = ctx.db.unreadLaunchDirs(machineId);
    for (let at = 0; at < rows.length; at += 8) {
      await Promise.all(
        rows.slice(at, at + 8).map(async (row) => {
          const answer = await ctx.readAgent(
            machineId,
            CONTROL_GET_SESSION_INFO,
            [row.sessionId],
            READ_TIMEOUT_MS,
            row.harness
          );
          // Unanswered or refused: the launch dir stays unread (nothing is
          // written), and the machine is asked again at its next register.
          switch (answer.kind) {
            case "unanswered":
              return;
            case "answered":
              if (!answer.value.ok) {
                return;
              }
              break;
            default:
              throw unreachable(answer);
          }
          const info = answer.value.result as
            { cwd?: string } | null | undefined;
          ctx.db.settleLaunchDir(
            row.id,
            info?.cwd ? ctx.reportedMachinePath(machineId, info.cwd) : undefined
          );
        })
      );
    }
  };

  /**
   * An account removed while a machine was signing it in: that machine
   * forgets the dir (and login) it just made for it, as removing the account
   * would have, and the caller is told why in a sentence.
   */
  /** Has `machineId` forget an account's store: a Claude dir through Claude Code, any other through the agent. */
  /**
   * Signs `account` out of a machine and drops its store there. A Claude
   * account's dir carries each session that ran there out first: into
   * `into`'s dir when it is joined into that account, else into the dir of a
   * session on no account, which is what those rows then say
   * ({@link rowsLeave}).
   */
  const forgetOn = (
    account: Pick<Account, "id" | "provider">,
    machineId: string,
    into: string | null = null
  ) =>
    account.provider === CLAUDE_PROVIDER
      ? ctx.callAgent(
          machineId,
          CONTROL_FORGET_ACCOUNT,
          [account.id, into],
          SIGNIN_TIMEOUT_MS,
          "claude"
        )
      : ctx.callAgent(
          machineId,
          CONTROL_FORGET_PROVIDER_ACCOUNT,
          [account.id],
          SIGNIN_TIMEOUT_MS
        );

  /**
   * {@link forgetOn} on each of `machineIds`, one at a time: the machines
   * that refused (`failed`), the ones that did not answer in time, in words
   * (`silent`), and those not connected, which forget it when they next
   * connect (`later`).
   */
  const signOutEverywhere = async (
    account: Account,
    machineIds: string[]
  ): Promise<{ failed: string[]; later: string[]; silent: string[] }> => {
    const failed: string[] = [];
    const silent: string[] = [];
    const later: string[] = [];
    for (const machineId of machineIds) {
      const answer = await forgetOn(account, machineId);
      switch (answer.kind) {
        case "unanswered":
          if (answer.reason === "dead") {
            later.push(ctx.machineName(machineId));
          } else {
            silent.push(ctx.silentWords(machineId, answer));
          }
          break;
        case "answered":
          if (!answer.value.ok) {
            failed.push(ctx.machineName(machineId));
          }
          break;
        default:
          throw unreachable(answer);
      }
    }
    return { failed, silent, later };
  };

  /**
   * The rows on an account that is gone (from every machine, or from
   * `machines` alone) say where their sessions' data went with its dir
   * ({@link forgetOn}): the account it joined, else none. Every row kept,
   * however long ago it last ran: one a person wakes a month on starts
   * where its data is. A machine that was away carries the data out when it
   * next connects (its account sweep, then the carry of every session into
   * its row's dir).
   */
  const rowsLeave = (
    accountId: string,
    into: string | null,
    machines?: readonly string[],
    /** `at-rest`: only rows whose process is gone ({@link processMayRun}); a running one reads the store until its machine signs it out. */
    which: "all" | "at-rest" = "all"
  ): void => {
    const rows = ctx.db
      .instancesOnAccount(accountId)
      .filter(
        (row) =>
          (machines === undefined || machines.includes(row.machineId)) &&
          (which === "all" || !processMayRun(row))
      );
    for (const row of rows) {
      ctx.db.patchInstance(row.id, { accountId: into });
    }
    if (rows.length > 0) {
      const named = accountWords(accountId);
      console.log(
        `[accounts] ${rows.length} session${rows.length === 1 ? "" : "s"} that ran on ${named} ${rows.length === 1 ? "runs" : "run"} on ${accountWords(into)} now: ${named} left ${machines ? machines.map(ctx.machineName).join(", ") : "every machine"}, and its conversations went with its store. Each one's next start runs there.`
      );
      ctx.publishInstances("");
    }
  };

  /**
   * Whether a process of `row` may be running, or on its way: one an
   * account's store must not be signed out from under ({@link
   * leaveAccounts}). A stopping one too, whose machine has not yet said its
   * process is gone.
   */
  const processMayRun = (row: { id: string; status: string }): boolean =>
    ctx.mayRun(row.status) ||
    row.status === "stopping" ||
    row.status === "moving" ||
    ctx.launchInFlight(row.id) ||
    ctx.owedCarries.has(row.id);

  /**
   * Signs a removed account out of each machine that kept its store because
   * a process there still ran in it ({@link AccountsDb.leaves}), once none
   * does: Claude Code's `claude auth logout` would leave a running process
   * no credential to refresh from (it reads the store again before every
   * refresh), and the store's removal carries every conversation in it out
   * from under the process writing it (agent claude-sessions.ts
   * `carrySessions`: "The caller makes sure no process of a session runs
   * while its data moves"). A process that owes a move goes at its turn's
   * end ({@link oweMoveOff}); one that owes none is put to sleep at rest,
   * as a moved login's are ({@link sleepMovedFrom}). Then its rows there
   * name no account, as a removal's on a machine with nothing running do. A
   * machine away, or one whose sign-out fails, is asked again at the next
   * tick.
   */
  const leaveAccounts = async (): Promise<void> => {
    for (const leave of ctx.db.accounts.leaves()) {
      if (ctx.registry.agent(leave.machineId)) {
        await leaveOne(leave);
      }
    }
  };
  /** {@link leaveAccounts} on one machine. */
  const leaveOne = async (leave: AccountLeave): Promise<void> => {
    const { accountId, machineId } = leave;
    const running = ctx.db
      .listInstancesOn(machineId)
      .filter((row) => row.accountId === accountId && processMayRun(row));
    if (running.length > 0) {
      sleepUnmoved(machineId, running);
      return;
    }
    const answer = await forgetOn(
      { id: accountId, provider: leave.provider },
      machineId
    );
    if (answer.kind !== "answered" || !answer.value.ok) {
      return;
    }
    ctx.db.accounts.dropLeave(accountId, machineId);
    console.log(
      `[accounts] ${ctx.machineName(machineId)} signed out ${accountId}, removed while a session there still ran on it: none does now.`
    );
    rowsLeave(accountId, null, [machineId]);
    // A session it left on no account is stopped from now on.
    ctx.publishStalls();
  };
  /**
   * Each of `rows` that owes no move and whose process is up is asked to
   * sleep, which its machine does only at rest ({@link CONTROL_SLEEP}).
   */
  const sleepUnmoved = (
    machineId: string,
    rows: readonly { id: string; status: string }[]
  ): void => {
    for (const row of rows) {
      if (
        ctx.owedMoves.has(row.id) ||
        !ctx.mayRun(row.status) ||
        row.status === "unknown"
      ) {
        continue;
      }
      detach(
        ctx.callAgent(
          machineId,
          CONTROL_SLEEP,
          [],
          ctx.SLEEP_TIMEOUT_MS,
          undefined,
          row.id
        ),
        "sleep request"
      );
    }
  };
  /** Whether {@link leaveAccounts} is running: one at a time. */
  let leavingNow = false;
  let leaveTicker: HubTimer | undefined;
  /**
   * Starts the tick that signs removed accounts out where processes kept
   * them ({@link leaveAccounts}); it stops once none is left. A hub that
   * starts with one in its database starts it at once.
   */
  const tickLeaves = (): void => {
    leaveTicker ??= ctx.lifetime.every(ctx.MOVE_TICK_MS, () => {
      if (ctx.db.accounts.leaves().length === 0) {
        ctx.lifetime.cancel(leaveTicker);
        leaveTicker = undefined;
        return;
      }
      if (leavingNow) {
        return;
      }
      leavingNow = true;
      leaveAccounts()
        .catch(console.error)
        .finally(() => {
          leavingNow = false;
        });
    });
  };

  return {
    unstrand,
    moveRowsToAccount,
    tellEndedByMove,
    keptNextWords,
    cutTasksWords,
    accountWords,
    claudeSessionsOn,
    readLaunchDirs,
    forgetOn,
    signOutEverywhere,
    rowsLeave,
    processMayRun,
    tickLeaves,
  };
};
