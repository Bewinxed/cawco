import { ASK_USER_QUESTION } from "@cawco/core/ask-tools";
import { sayNestedBoundaryFix } from "@cawco/core/boundary-nesting";
import type { CutCommand } from "@cawco/core/commands/controls";
import { detach } from "@cawco/core/detach";
import type { AsleepFrame } from "@cawco/core/frames";
import {
  CLI_OUTDATED,
  FRESH_START,
  LIMIT_REACHED,
  ROOM_HELD,
} from "@cawco/core/harness";
import type { HarnessKind } from "@cawco/core/harness/kinds";
import type {
  ControlPayload,
  Envelope,
  InstanceRow,
  SendPayload,
} from "@cawco/core/protocol";
import type { LastErrorKind } from "@cawco/core/relaunch";
import type { EndedTask } from "@cawco/core/session/controls";
import { workWords } from "@cawco/core/words/work";
import type { HubLineMessage } from "./compaction";
import type { PublicInstanceRow } from "./db/instances";
import type { MachineLineKind } from "./db/schema";
import type { SentMessageRow } from "./db/sends";
import { TURN_UNRECORDED } from "./db/sends";
import type { MachineLine } from "./db/session-lines";
import type { HubContext } from "./hub-context";
import { isKeepAlive } from "./keep-alive";
import { READ_TIMEOUT_MS } from "./machine-read-timeouts";
import { uuidOf } from "./named-uuid";
import { unreachable } from "./unreachable";

/** A clock time as a hand-back says it: `12:09 UTC`. */
const utcClock = (at: Date): string => `${at.toISOString().slice(11, 16)} UTC`;

/** What a hand-back asks of the session it goes to. */
const CARRY_ON_CUT = "Carry on from where it stopped.";

/** What a session restored after a restart is told of the turn that restart cut. */
const restartedWords = (restartedAt: Date): string =>
  `CawCo restarted this session's process at ${utcClock(restartedAt)} while your turn was running. ${CARRY_ON_CUT}`;

/**
 * Each shell command a death or a server's stop cut, said interrupted: with
 * what it had printed when its harness kept that, else that none was kept
 * (core `CutCommand`, workWords.commandInterrupted).
 */
export const cutCommandsWords = (
  cut: readonly CutCommand[] | undefined
): string =>
  (cut ?? [])
    .map((one) =>
      workWords.commandInterrupted(
        one.command,
        one.unkept ? undefined : one.output
      )
    )
    .join("\n\n");

const killedWords = (signal: string, killedAt: Date): string =>
  `Your process was killed (${signal}) at ${utcClock(killedAt)} while your turn was running, and CawCo started it again. ${CARRY_ON_CUT}`;

/**
 * The hub routes on envelope fields and is otherwise payload-opaque (NEW.md
 * §6); `hostname`/`os`/`tools` on register, `cwd`/`options.resume`/`scratch`/
 * `projectId`/`title`/`permissionMode`/`model` on spawn, `discard` on stop,
 * `kind` on a frame, `method`/`args` on a control and a `control_result`'s
 * `result` are the sanctioned peeks.
 */
export const peek = (payload: unknown, key: string): string | undefined => {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
};

/**
 * The hub's line where a session started again fresh (core `FRESH_START`,
 * `relaunchOf`), as its live stream and a later read both carry it. One per
 * session: a start refused again and started once more says it once, where
 * it last happened (the row keeps that moment).
 */
export const freshStartLine = (
  row: { id: string; sessionId: string | null },
  at: number
): HubLineMessage => ({
  type: "system",
  subtype: FRESH_START,
  uuid: `fresh-start-${row.id}`,
  session_id: row.sessionId ?? "",
  timestamp: new Date(at).toISOString(),
});

/** The subtype each line its machine says about a session is drawn as. */
export const MACHINE_LINE_SUBTYPE: Record<MachineLineKind, string> = {
  limit: LIMIT_REACHED,
  outdated: CLI_OUTDATED,
  room: ROOM_HELD,
};

/**
 * A line its machine said about a session, as the row keeps it: a limit its
 * keeper held it to (core `LIMIT_REACHED`), or its process on a Claude Code
 * other than the machine's (core `CLI_OUTDATED`). The same on the live
 * stream and a later transcript read, titled by its first sentence.
 */
export const machineLine = (
  row: { sessionId: string | null },
  note: MachineLine
): HubLineMessage => ({
  type: "system",
  subtype: MACHINE_LINE_SUBTYPE[note.kind],
  uuid: note.id,
  session_id: row.sessionId ?? "",
  content: note.content,
  timestamp: new Date(note.at).toISOString(),
});

export type CutTurnsContext = Pick<
  HubContext,
  | "SETTLED"
  | "asRead"
  | "atLimit"
  | "awaitReply"
  | "cutTasksWords"
  | "db"
  | "deliverSend"
  | "deliverToSession"
  | "escalateRoutedAsks"
  | "losePending"
  | "machineName"
  | "noteAtLimit"
  | "owedMoves"
  | "pending"
  | "planChanges"
  | "publishInstances"
  | "push"
  | "registry"
  | "sendAnswerable"
  | "sessionAsleep"
  | "sessionName"
  | "transcripts"
  | "turnOver"
  | "turnWaiters"
>;

export const createCutTurns = (ctx: CutTurnsContext) => {
  /**
   * A Claude session's CLI listed its background tasks (its
   * `background_tasks_changed`, the whole list each time): kept on the
   * hub's records, ambient ones left out, so what a restart or a kill of
   * its process cuts is known after it ({@link tellCutTasks}).
   */
  const keepTasks = (instanceId: string, message: unknown): void => {
    const frame = message as {
      subtype?: string;
      tasks?: {
        ambient?: boolean;
        description?: string;
        task_id?: string;
        task_type?: string;
      }[];
      type?: string;
    };
    if (
      frame.type !== "system" ||
      frame.subtype !== "background_tasks_changed" ||
      !Array.isArray(frame.tasks)
    ) {
      return;
    }
    ctx.db.sessionTasks.replace(
      instanceId,
      frame.tasks.flatMap((task) =>
        task.ambient || !task.task_id
          ? []
          : [
              {
                taskId: task.task_id,
                type: task.task_type ?? "task",
                description: task.description ?? "",
              },
            ]
      ),
      new Date()
    );
  };

  /** How long the hub waits for a session's next process to come up to read what a cut task printed. */
  const CUT_OUTPUT_WAIT_MS = 60_000;

  /**
   * The last of what background task `taskId` printed, read through the
   * session's process now (the CLI's `get_task_output`, which reads a task
   * of the session's whether running or ended), as a move's ended task
   * carries it: the output, that its read went unanswered, or neither.
   */
  const cutTaskOutput = async (
    row: InstanceRow,
    taskId: string
  ): Promise<Pick<EndedTask, "output" | "outputUnread">> => {
    const requestId = crypto.randomUUID();
    const answer = ctx.asRead(
      await ctx.awaitReply(row.machineId, requestId, READ_TIMEOUT_MS, () => {
        const agent = ctx.registry.agent(row.machineId);
        return agent
          ? ctx.sendAnswerable(agent, {
              verb: "control",
              machineId: row.machineId,
              instanceId: row.id,
              requestId,
              payload: {
                instanceId: row.id,
                requestId,
                method: "getTaskOutput",
                args: [taskId],
              },
            } satisfies Envelope<ControlPayload>)
          : undefined;
      })
    );
    switch (answer.kind) {
      case "unanswered":
        return { outputUnread: { after: answer.after } };
      case "answered": {
        const read = answer.value.ok
          ? (answer.value.result as { output?: unknown } | undefined)
          : undefined;
        return typeof read?.output === "string" && read.output
          ? { output: read.output }
          : {};
      }
      default:
        throw unreachable(answer);
    }
  };

  /** Resolves once `instanceId`'s process is up (running), or after `ms`; true when it is. */
  const untilUp = async (instanceId: string, ms: number): Promise<boolean> => {
    const until = Date.now() + ms;
    for (;;) {
      const [row] = ctx.db.getInstancesByIds([instanceId]);
      if (row?.status === "running" && ctx.registry.agent(row.machineId)) {
        return true;
      }
      if (
        Date.now() >= until ||
        !row ||
        row.status === "stopped" ||
        row.status === "discarded" ||
        row.status === "error"
      ) {
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  };

  /**
   * THE RULE THAT A CUT IS NEVER SILENT: the background tasks `row`'s
   * process was running before `before` (kept by {@link keepTasks}) went
   * with that process, cut by `how`: CawCo restarting it, or a signal
   * killing it. Claude Code brings none back on resume, so once its next
   * process is up the session is told each one, interrupted, its outcome
   * unknown, with the last of what it printed as that process reads it
   * ({@link cutTaskOutput}), in a message its transcript shows: the line
   * the person and the session both read. Once: the same cut says it under
   * one uuid. A move tells what it ended its own way ({@link tellEndedByMove}).
   */
  const tellCutTasks = (
    row: { id: string; machineId: string },
    before: Date,
    how: string
  ): void => {
    const cut = ctx.db.sessionTasks.takeBefore(row.id, before);
    if (cut.length === 0) {
      return;
    }
    console.info(
      `[hub] ${row.id}: ${cut.length} background task(s) went with its process (${how}); it is told each, interrupted, with its output so far`
    );
    detach(
      (async () => {
        const up = await untilUp(row.id, CUT_OUTPUT_WAIT_MS);
        const [now] = ctx.db.getInstancesByIds([row.id]);
        const told: EndedTask[] = [];
        for (const task of cut) {
          told.push({
            taskId: task.taskId,
            type: task.type,
            description: task.description,
            ...(up && now ? await cutTaskOutput(now, task.taskId) : {}),
          });
        }
        ctx.deliverSend({
          verb: "send",
          machineId: now?.machineId ?? row.machineId,
          instanceId: row.id,
          payload: {
            instanceId: row.id,
            message: {
              type: "user",
              uuid: uuidOf(`${row.id}\u0000cut\u0000${before.getTime()}`),
              message: { role: "user", content: ctx.cutTasksWords(how, told) },
              parent_tool_use_id: null,
              origin: { kind: "system", name: "restore" },
            },
          },
        } satisfies Envelope<SendPayload>);
      })(),
      "cut tasks"
    );
  };

  /**
   * A launch of `row`'s (its `init`, a register's restore, its server's
   * stop): what its last process ran in the background went with it, a turn
   * cut or not, told once its process is up ({@link tellCutTasks}).
   */
  const tellCutAtLaunch = (
    row: PublicInstanceRow | undefined,
    serverStopped?: Date
  ): void => {
    const launchedAt = serverStopped ?? row?.spawnedAt;
    if (row && launchedAt) {
      tellCutTasks(
        row,
        launchedAt,
        `CawCo restarted this session's process at ${utcClock(launchedAt)}`
      );
    }
  };

  /**
   * The send that hands a cut turn back, by a uuid its turn decides: one
   * made again for the same turn (a second register, a hub that died after
   * making it) is the same send, which {@link deliverSend} hands over once.
   * The hub's own word, never a person's, so it goes into the session itself.
   */
  const handTurnBack = (
    row: { id: string; machineId: string },
    turn: string,
    content: string
  ): SentMessageRow =>
    ctx.deliverToSession(
      {
        verb: "send",
        machineId: row.machineId,
        instanceId: row.id,
        payload: {
          instanceId: row.id,
          message: {
            type: "user",
            uuid: uuidOf(`${row.id}\u0000${turn}`),
            message: { role: "user", content },
            parent_tool_use_id: null,
            origin: { kind: "system", name: "restore" },
          },
        },
      } satisfies Envelope<SendPayload>,
      false
    );

  /**
   * The turn of `row` a restart or a kill cut and nothing has taken up
   * since, by when it was first heard ({@link instances.turnOpenAt});
   * nothing when there is none, or when something else answers for the
   * session's next turn. How it was cut (`how`):
   * - `restored`: its process was restored after a restart. The turn ran in
   *   the launch before (older than `spawnedAt`), and the hub recorded it
   *   ({@link TURN_UNRECORDED}: a restore of a session from before it did
   *   hands nothing back). The process is up (`running` or `starting`), and
   *   a send still pending, owed or handed is its turn instead (a keep-alive
   *   ping is no turn of its own).
   * - `serverStopped`: its harness said the server its turn ran in stopped
   *   before finishing it (its result's `serverStopped`), on a session it
   *   reattached to the server running now; cut whenever it was heard, the
   *   process up, a pending send its turn instead.
   * - `killed`: a signal killed its process just now ({@link diedOnSignal}),
   *   which filed it asleep: the turn it had open, recorded, goes first,
   *   ahead of what the dead process never read.
   * And whichever way, what rules it out:
   * - the session is being ended, or is a summariser (a continuation runs
   *   those);
   * - the at-limit controller has it, or its compaction after a move, or a
   *   continuation of it is under way, or it moves account at its turn's
   *   end: those send their own word;
   * - an ask of it is parked: its process is waiting on that ask, or, its
   *   process gone, the session is halted on its permit until the answer
   *   wakes it (asks.ts `keep`).
   */
  const cutTurnOf = (
    row: PublicInstanceRow,
    how: "restored" | "serverStopped" | "killed"
  ): number | undefined => {
    const owned = ctx.db.ownedInstance(row.id, row.machineId);
    const open = owned?.turnOpenAt ?? null;
    const launched = row.spawnedAt?.getTime();
    const cut =
      how === "serverStopped" ||
      (open !== TURN_UNRECORDED &&
        (how === "killed" ||
          (launched !== undefined && (open ?? 0) < launched)));
    const processUp = row.status === "running" || row.status === "starting";
    // A question its process took with it is asked again whatever else waits.
    if (
      open === null ||
      !cut ||
      (how === "killed" ? row.status !== "sleeping" : !processUp) ||
      (how !== "killed" &&
        awaitsSend(row.id) &&
        !withdrawnQuestions.has(row.id))
    ) {
      return undefined;
    }
    const ruledOut =
      !!owned?.endIntent ||
      row.kind === "summariser" ||
      ctx.atLimit.handling(row.id) ||
      ctx.db.atLimit.compaction(row.id) !== undefined ||
      ctx.owedMoves.has(row.id) ||
      ctx.db
        .continuationSlips()
        .some(
          (job) =>
            job.sourceInstanceId === row.id && !ctx.SETTLED.has(job.stage)
        ) ||
      ctx.pending.list().some((ask) => ask.instanceId === row.id);
    return ruledOut ? undefined : open;
  };

  /**
   * Questions a session had put to the person when its process went, by
   * session: the asks went with the process ("Question withdrawn"), nobody
   * answered them, and the turn handed back asks them again
   * ({@link askAgain}).
   */
  const withdrawnQuestions = new Map<string, string[]>();

  /** Keeps the questions `asks` put to the person, which go with their process unanswered. */
  const noteWithdrawn = (asks: readonly Envelope[]): void => {
    for (const ask of asks) {
      if (
        !ask.instanceId ||
        peek(ask.payload, "toolName") !== ASK_USER_QUESTION
      ) {
        continue;
      }
      const { input } = ask.payload as { input?: { questions?: unknown } };
      const asked: { question?: unknown }[] = Array.isArray(input?.questions)
        ? input.questions
        : [];
      const questions = asked.flatMap((one) =>
        typeof one.question === "string" ? [one.question] : []
      );
      if (questions.length > 0) {
        withdrawnQuestions.set(ask.instanceId, [
          ...(withdrawnQuestions.get(ask.instanceId) ?? []),
          ...questions,
        ]);
      }
    }
  };

  /** Asks that went with the process that parked them: off every screen, and a question asked again when its session next runs. */
  const goneWithProcess = (asks: readonly Envelope[]): void => {
    noteWithdrawn(asks);
    for (const parked of asks) {
      ctx.pending.resolve(parked.requestId ?? "", "cancelled");
    }
  };

  /** A cut turn's hand-back, with the questions its process took with it to be asked again. */
  const askAgain = (instanceId: string, words: string): string => {
    const questions = withdrawnQuestions.get(instanceId);
    withdrawnQuestions.delete(instanceId);
    return questions?.length
      ? `${words} The question${questions.length === 1 ? "" : "s"} you had asked the person (${questions.map((one) => `"${one}"`).join(", ")}) went with that process and ${questions.length === 1 ? "was" : "were"} never answered: ask again.`
      : words;
  };

  /**
   * A session up again whose question went with its last process, with no
   * cut turn handed back to say so (what it was sent took that turn's
   * place): told now, behind what it was owed, to ask it again. Once per
   * process: the same start says it once however often it is looked at.
   */
  const askWithdrawnAgain = (
    row: PublicInstanceRow | undefined,
    restartedAt: Date | null | undefined
  ): void => {
    if (
      !(row && restartedAt && withdrawnQuestions.has(row.id)) ||
      ctx.db.ownedInstance(row.id, row.machineId)?.endIntent ||
      !(row.status === "running" || row.status === "starting")
    ) {
      return;
    }
    ctx.deliverSend({
      verb: "send",
      machineId: row.machineId,
      instanceId: row.id,
      payload: {
        instanceId: row.id,
        message: {
          type: "user",
          uuid: uuidOf(`${row.id}\u0000asked\u0000${restartedAt.getTime()}`),
          message: {
            role: "user",
            content: askAgain(
              row.id,
              `CawCo restarted this session's process at ${utcClock(restartedAt)}.`
            ),
          },
          parent_tool_use_id: null,
          origin: { kind: "system", name: "restore" },
        },
      },
    } satisfies Envelope<SendPayload>);
  };

  /** Whether a send to the session is still pending, owed or handed, other than a keep-alive ping: that send is its next turn. */
  const awaitsSend = (instanceId: string): boolean =>
    ctx.db
      .sendsIn(instanceId, ["pending"])
      .some((send) => !isKeepAlive(send.body));

  /**
   * Hands a session restored after a restart the turn that restart cut, once
   * its process is up: one message, through the send path every message
   * takes, so it waits at the hub when the session cannot take it yet. The
   * hand-back is the session's open turn from then on: a restart before it is
   * read cuts it in its turn, and a register or a hub that sees the same cut
   * turn again sends nothing ({@link handTurnBack}).
   *
   * `serverStopped`: when its harness said the server its turn ran in had
   * stopped ({@link cutTurnOf}). A turn so cut that is not handed back ends
   * there, as the turn that result closes.
   */
  const resumeCutTurn = (
    instanceId: string,
    serverStopped?: Date,
    /** The commands the stop cut, in words ({@link cutCommandsWords}). */
    cutWords = ""
  ): void => {
    const [row] = ctx.db.getInstancesByIds([instanceId]);
    tellCutAtLaunch(row, serverStopped);
    const cut = row
      ? cutTurnOf(row, serverStopped ? "serverStopped" : "restored")
      : undefined;
    const restartedAt = serverStopped ?? row?.spawnedAt;
    if (!(row && cut !== undefined && restartedAt)) {
      if (serverStopped) {
        ctx.turnOver(instanceId);
      }
      askWithdrawnAgain(row, restartedAt);
      return;
    }
    const sent = handTurnBack(
      row,
      String(cut),
      askAgain(
        row.id,
        `${restartedWords(restartedAt)}${cutWords ? `\n\n${cutWords}` : ""}`
      )
    );
    if (sent.state === "failed") {
      ctx.turnOver(row.id);
      console.warn(
        `[hub] ${row.id}: the turn a restart cut was not handed back: ${sent.reason ?? "the send failed"}`
      );
      return;
    }
    if (ctx.db.handBackTurn(row.id, cut, Date.now())) {
      console.log(
        `[hub] ${row.id}: handed back the turn a restart cut (heard ${new Date(cut).toISOString()})`
      );
    }
  };

  /**
   * A session failed to start, or its process died of something the reader
   * should see: the row records it — and its live work item fails with it,
   * its parent told why, as every row in `error` takes its item
   * (work-items `followSessions`, on this publish) — and what it was sent
   * and never read waits, owed, for the session's next start, or fails with
   * it when its conversation is gone. The owner's own session pushes that
   * it failed (push.ts `sessionFailed`).
   */
  const processFailed = (
    machineId: string,
    instanceId: string,
    reason: string,
    kind?: LastErrorKind
  ): void => {
    ctx.turnWaiters.get(instanceId)?.reject(new Error(reason));
    ctx.db.failInstance(instanceId, reason, kind);
    sayNestedBoundaryFix(reason);
    ctx.losePending(instanceId, kind !== "conversation-gone", reason);
    // What it was told of the person's plan changes goes on to a new session.
    if (kind === "conversation-gone") {
      ctx.planChanges?.cannotGoOn(instanceId, reason);
    }
    ctx.escalateRoutedAsks(instanceId);
    ctx.push.sessionFailed(instanceId, reason);
    ctx.publishInstances(machineId);
  };

  /**
   * How close a second signal death may follow a session's last one and
   * still be started again (our call): a process killed again within two
   * minutes of the last kill is dying on its own, and starting it again
   * would only spin.
   */
  const SIGNAL_REPEAT_MS = 2 * 60_000;

  /** When each session's process was last killed by a signal and started again ({@link diedOnSignal}). */
  const signalDeaths = new Map<string, number>();

  /**
   * A session's process was killed by a signal while its machine ran it,
   * nothing of the machine's own stopping it (an OOM kill, a sessiond
   * restart, a stray `kill`). That is the process dying, not the session's
   * work: the row is filed asleep and its work item keeps running; what it
   * was sent and never read is owed to its next process; and the turn the
   * kill cut is handed back once ({@link resumeCutTurn}'s path), which
   * starts that process. A session killed again within
   * {@link SIGNAL_REPEAT_MS} of its last kill fails as any dead process
   * does, and so does a summariser, which a continuation runs.
   */
  const diedOnSignal = (
    machineId: string,
    instanceId: string,
    died: NonNullable<AsleepFrame["died"]>
  ): void => {
    const [row] = ctx.db.getInstancesByIds([instanceId]);
    const last = signalDeaths.get(instanceId);
    const now = Date.now();
    const cutWords = cutCommandsWords(died.cut);
    if (
      !row ||
      row.kind === "summariser" ||
      (last !== undefined && now - last < SIGNAL_REPEAT_MS)
    ) {
      signalDeaths.delete(instanceId);
      const again =
        last === undefined
          ? `Its process was ended by ${died.signal} from outside CawCo.`
          : `Its process was ended by ${died.signal} from outside CawCo again, ${Math.round((now - last) / 1000)} s after the last time, so it isn't started again: something on ${ctx.machineName(machineId)} keeps ending it.`;
      if (last !== undefined) {
        console.warn(
          `[hub] ${row ? ctx.sessionName(row) : "A session no longer recorded"}: ${again}`
        );
      }
      processFailed(
        machineId,
        instanceId,
        `${again}${cutWords ? `\n\n${cutWords}\n\n` : " "}A message to it starts it again once that is fixed.`
      );
      return;
    }
    signalDeaths.set(instanceId, now);
    ctx.sessionAsleep(machineId, instanceId);
    const resumes = resumeKilledTurn(
      instanceId,
      died.signal,
      new Date(now),
      cutWords
    );
    tellCutTasks(
      row,
      new Date(now),
      `Your process was killed (${died.signal}) at ${utcClock(new Date(now))}`
    );
    // Its own line: who ended it (no part of CawCo) and what starts it again.
    ctx.noteAtLimit(row, {
      kind: "ended",
      by: { kind: "outside", signal: died.signal, resumes },
    });
  };

  /**
   * Hands a session whose process a signal killed the turn that kill cut,
   * once: through the send path, which starts its process, ahead of what the
   * dead one never read. Nothing when no turn was open, or something else
   * answers for its next turn ({@link cutTurnOf}).
   */
  const resumeKilledTurn = (
    instanceId: string,
    signal: string,
    killedAt: Date,
    cutWords: string
  ): boolean => {
    const [row] = ctx.db.getInstancesByIds([instanceId]);
    const cut = row ? cutTurnOf(row, "killed") : undefined;
    if (!(row && cut !== undefined)) {
      return false;
    }
    const sent = handTurnBack(
      row,
      String(cut),
      askAgain(
        row.id,
        `${killedWords(signal, killedAt)}${cutWords ? `\n\n${cutWords}` : ""}`
      )
    );
    if (sent.state === "failed") {
      ctx.turnOver(row.id);
      console.warn(
        `[hub] ${ctx.sessionName(row)}: the turn its killed process was in couldn't be handed back: ${sent.reason ?? "the send failed"}. It starts again with its next message.`
      );
      return false;
    }
    console.log(
      `[hub] ${ctx.sessionName(row)}: the turn its killed process was in (heard ${new Date(cut).toISOString()}) is handed back, which starts it again.`
    );
    return true;
  };

  /**
   * A session starting again fresh under its id: its first start never
   * began, so there was no conversation to resume. Kept on its row, said in
   * its transcript now and at every later read ({@link readRowHistory}).
   */
  const noteFreshStart = (row: InstanceRow): void => {
    // One that went on from a summary starts its fresh conversation under
    // the "Continued" line already: that is no first start that never began.
    if (ctx.db.priorConversations(row.id).length > 0) {
      return;
    }
    const at = Date.now();
    ctx.db.noteFreshStart(row.id, at);
    console.log(
      `[hub] ${row.id} starts again fresh: its first start never began`
    );
    // Said again where it last happened: the line moves there.
    const line = freshStartLine(row, at);
    ctx.transcripts.removeLine(row.id, line.uuid);
    ctx.db.unanchorLine(row.id, line.uuid);
    ctx.transcripts.line(row.id, line, row.harness);
  };

  /**
   * A session started where its project was moved to for it (moves.ts): its
   * transcript opens on the move's ready line, kept on its row and said now.
   * Once: a Start retried after the line was written says nothing new.
   */
  /**
   * A line its machine said about a session: its keeper held it at a limit
   * (core `LIMIT_REACHED`), or its process runs a Claude Code other than the
   * machine's (core `CLI_OUTDATED`). Kept on its row once under its id and
   * folded into what its screens show now. One from a machine that does not
   * run the session is nobody's.
   */
  const noteMachineLine = (
    machineId: string,
    instanceId: string,
    harness: HarnessKind,
    kind: MachineLineKind,
    said: unknown
  ): void => {
    const { uuid, content } = said as { uuid?: unknown; content?: unknown };
    const [row] = ctx.db.getInstancesByIds([instanceId]);
    if (
      !row ||
      row.machineId !== machineId ||
      typeof uuid !== "string" ||
      typeof content !== "string"
    ) {
      return;
    }
    const note = { kind, at: Date.now(), id: uuid, content };
    if (!ctx.db.noteMachineLine(row.id, kind, note)) {
      return;
    }
    console.warn(`[hub] ${row.id}: ${content}`);
    ctx.transcripts.line(row.id, machineLine(row, note), harness);
  };

  return {
    awaitsSend,
    diedOnSignal,
    goneWithProcess,
    keepTasks,
    noteFreshStart,
    noteMachineLine,
    noteWithdrawn,
    processFailed,
    resumeCutTurn,
  };
};
