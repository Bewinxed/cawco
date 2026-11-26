import type { Bounded } from "@cawco/core/bounded";
import type { CommandQueue } from "@cawco/core/commands/controls";
import { type FsOp, SPAWN_REPLY } from "@cawco/core/control-replies";
import type { ControlArgs, ControlName } from "@cawco/core/control-table";
import { boundedRead } from "@cawco/core/effect/bounded";
import type { FrameEnvelope, HubEnvelope } from "@cawco/core/envelopes";
import { READ_SKILL_FOLDER } from "@cawco/core/fleet";
import type { HarnessKind } from "@cawco/core/harness/kinds";
import { recordLimitReading } from "@cawco/core/limit-readings";
import { machineLabel } from "@cawco/core/machine-names";
import type { ControlPayload, InstanceRow } from "@cawco/core/protocol";
import { CONTROL_ABANDON } from "@cawco/core/session/controls";
import { machineReadWords } from "@cawco/core/words/machine-reads";
import { Context, Deferred, Effect, Layer, Schema } from "effect";
import { SPAWN_START_TIMEOUT_MS } from "./config";
import { Db, type DbShape } from "./db";
import { HandoverState } from "./handover-state";
import type { SessionLocation } from "./hub-shapes";
import { HubLifetime, type HubLifetimeShape } from "./lifetime";
import {
  answerOf,
  type CallAnswer,
  type ControlAnswer,
  type ControlResult,
  type FsAnswer,
  fsAnswerOf,
  MACHINE_DISCONNECTED,
  parsedAs,
} from "./machine-answers";
import { BUSY_TIMEOUT_MS, READ_TIMEOUT_MS } from "./machine-read-timeouts";
import { MachineWords } from "./machine-words";
import { Registry, type RegistryShape } from "./registry";
import { sessionControl } from "./session-word";
import type { SkillFolderReader } from "./skills";
import { bindSkillSource, folderOf, readCheckedFolder } from "./skills";
import { unreachable } from "./unreachable";
import type { MachineSocket } from "./wire-socket";
import { caughtUp, sendToMachine as writeToMachine } from "./wire-socket";

/** How long a machine is given to hear that the hub let a read go (core `CONTROL_ABANDON`): one map lookup there. */
const ABANDON_MS = 5000;
/** Deduplicate recently orphaned replies without retaining every request forever. */
// @limit recording: hub.unrouted-replies-held until 2026-12-03
const UNROUTED_REPLY_LIMIT = 4096;

/** `answer` read with `timeoutMs` to come: the kit's bounded read, as {@link Bounded}. */
const answeredWithin = (
  timeoutMs: number,
  answer: Deferred.Deferred<ControlResult>
): Effect.Effect<Bounded<ControlResult>> =>
  boundedRead(timeoutMs, Deferred.await(answer)).pipe(
    Effect.map((value): Bounded<ControlResult> => ({
      kind: "answered",
      value,
    })),
    Effect.catchTag("Unanswered", ({ after, reason }) =>
      Effect.succeed<Bounded<ControlResult>>({
        kind: "unanswered",
        after,
        reason,
      })
    )
  );

/** A call's asker stopped waiting for its answer (its `letGo` signal aborted) before it came. */
class LetGo extends Schema.TaggedError<LetGo>()("LetGo", {}) {}

/** Fails with {@link LetGo} once `signal` aborts: at once when it has already. */
const whenLetGo = (signal: AbortSignal): Effect.Effect<never, LetGo> =>
  Effect.callback<never, LetGo>((resume) => {
    const go = () => resume(Effect.fail(new LetGo()));
    if (signal.aborted) {
      go();
      return;
    }
    signal.addEventListener("abort", go, { once: true });
    return Effect.sync(() => signal.removeEventListener("abort", go));
  });

/** What the machine calls read, each when it is called: the hub's services they are built from. */
interface MachineCallsDeps {
  db: DbShape;
  lifetime: HubLifetimeShape;
  machinePresence: HandoverState["Service"]["machinePresence"];
  registry: RegistryShape;
  words: Pick<
    MachineWords["Service"],
    "machineName" | "silentWords" | "unansweredError"
  >;
}

const make = ({
  db,
  lifetime,
  machinePresence,
  registry,
  words: { machineName, silentWords, unansweredError },
}: MachineCallsDeps) => {
  /**
   * A SEND NO PROCESS TOOK WAITS FOR THE SESSION'S NEXT PROCESS, NOT A TIMER.
   * When each session last had a process event: a start or attach sent to
   * its machine, its launch up, its machine listing it attached, or its
   * process ended (asleep, or settled by a beat). A send its machine hands
   * back (sends.ts `takeBack`) is owed; when no such event has come since it
   * was handed over, the session waits in {@link waitingForProcess} and
   * nothing owed to it goes until one does. Handed straight back out, one
   * send to a session no agent held went round 7,300 times in 40 minutes
   * (2026-10-13).
   */
  const processAt = new Map<string, number>();
  const waitingForProcess = new Set<string>();
  /** A process event for `instanceId`; whether its owed sends were waiting on one. */
  const processEvent = (instanceId: string): boolean => {
    processAt.set(instanceId, Date.now());
    return waitingForProcess.delete(instanceId);
  };
  /** The one way a command leaves this hub for a machine: a start or attach sent is a process event. */
  const sendToMachine = (socket: MachineSocket, frame: HubEnvelope): void => {
    const instanceId =
      frame.verb === "spawn"
        ? (frame.instanceId ?? frame.payload.instanceId)
        : undefined;
    if (instanceId) {
      processEvent(instanceId);
    }
    writeToMachine(socket, frame);
  };
  /**
   * Controls a REST call is waiting on, by `requestId`. A dashboard's control is
   * answered over the socket it asked on; a route has nothing to hold the reply
   * against but this.
   */
  const waiting = new Map<string, (frame: ControlResult) => void>();
  /**
   * Each call to a machine that waits in {@link waiting}: its machine, the
   * socket it went out on (none while the machine is away: it is held), and
   * the frame it went out as, sent again under the same id when the machine
   * is back ({@link resendHeld}).
   */
  const waitingMachines = new Map<
    string,
    {
      again: HubEnvelope | undefined;
      machineId: string;
      socketId: string | undefined;
    }
  >();
  /** A call to `machineId` now waits on the socket the machine has now. */
  const waitOn = (requestId: string, machineId: string): void => {
    waitingMachines.set(requestId, {
      machineId,
      socketId: registry.agent(machineId)?.id,
      again: undefined,
    });
  };
  /**
   * The machine registered again: every call held for it goes again, under
   * its own id, on the socket it has now. Sent once its register is
   * acknowledged, when it takes requests.
   */
  const resendHeld = (machineId: string): void => {
    const agent = registry.agent(machineId);
    if (!agent) {
      return;
    }
    let again = 0;
    for (const call of waitingMachines.values()) {
      if (
        call.machineId === machineId &&
        call.socketId !== agent.id &&
        call.again
      ) {
        call.socketId = agent.id;
        sendToMachine(agent, call.again);
        again += 1;
      }
    }
    if (again > 0) {
      console.info(
        `[hub] ${machineName(machineId)} is back: ${again} request(s) held for it sent again under their own ids`
      );
    }
  };
  /** Who hears a running command's slot waits, by the run id it was sent with. */
  const commandQueues = new Map<string, (queue: CommandQueue | null) => void>();
  /**
   * The hub's own calls whose deadline passed unanswered, by request id
   * ({@link awaitReply}): their callers were told no answer came, and an
   * answer that comes later is that call's, said as late
   * ({@link lateAnswer}), never as a reply nobody asked for.
   */
  const lapsed = new Map<
    string,
    { machineId: string; sentAt: number; timeoutMs: number; what?: string }
  >();
  const noteLapsed = (
    requestId: string,
    call: {
      machineId: string;
      sentAt: number;
      timeoutMs: number;
      what?: string;
    }
  ): void => {
    lapsed.set(requestId, call);
    recordLimitReading("hub.unrouted-replies-held", lapsed.size);
    if (lapsed.size > UNROUTED_REPLY_LIMIT) {
      const oldest = lapsed.keys().next().value;
      if (oldest !== undefined) {
        lapsed.delete(oldest);
      }
    }
  };
  /** Whether `message` answers a call of the hub's that lapsed: said once, as late, when it does. */
  const lateAnswer = (message: FrameEnvelope<"control_result">): boolean => {
    const requestId = message.requestId ?? message.payload.requestId;
    const call = requestId ? lapsed.get(requestId) : undefined;
    if (!(requestId && call)) {
      return false;
    }
    lapsed.delete(requestId);
    console.warn(
      machineReadWords.lateLine(
        machineName(call.machineId),
        call.what ?? "a request",
        requestId,
        Date.now() - call.sentAt - call.timeoutMs,
        call.timeoutMs
      )
    );
    return true;
  };
  const unroutedReplies = new Set<string>();
  const logUnroutedReply = (message: FrameEnvelope<"control_result">): void => {
    if (lateAnswer(message)) {
      return;
    }
    const requestId = message.requestId ?? message.payload.requestId;
    const instanceId = message.instanceId ?? message.payload.instanceId;
    const { kind } = message.payload;
    const key = `${message.machineId}:${instanceId}:${requestId}:${kind}`;
    if (unroutedReplies.has(key)) {
      return;
    }
    unroutedReplies.add(key);
    recordLimitReading("hub.unrouted-replies-held", unroutedReplies.size);
    if (unroutedReplies.size > UNROUTED_REPLY_LIMIT) {
      const oldest = unroutedReplies.values().next().value;
      if (oldest !== undefined) {
        unroutedReplies.delete(oldest);
      }
    }
    console.warn(
      `[hub] unrouted reply session=${instanceId ?? "none"} request=${requestId ?? "none"} kind=${kind} machine=${message.machineId}`
    );
  };

  /**
   * Where each conversation lives, once somebody has had to find out.
   *
   * `null` is a remembered "nobody holds this", which matters as much as a
   * hit: without it a mistyped or deleted id would sweep every connected
   * machine on every render that mentioned it. Cleared whenever a machine
   * joins, because a machine arriving is precisely the event that can turn a
   * `null` into an answer.
   */
  const locations = new Map<string, SessionLocation | null>();

  /**
   * Each machine's catalog of the conversations it keeps, by key, as its
   * last report in this hub's run said it: its register's `resumable`, and
   * the keys a beat's `resumableAt` dates (a harness server's catalog). A
   * machine that is away answers no locate, and this is what tells a
   * conversation it keeps (its machine away, `locateSession`) from one that
   * is nowhere.
   */
  const keptOn = new Map<string, Set<string>>();

  /** Sends `frame` on `socket` and gives it back: what {@link awaitReply} sends again. */
  const sendAnswerable = <T extends HubEnvelope>(
    socket: MachineSocket,
    frame: T
  ): T => {
    sendToMachine(socket, frame);
    return frame;
  };

  /**
   * Asks a machine something and waits for the frame that answers it. A
   * machine is asked as a send to it is delivered (core handover.ts
   * `presenceOf`): connected, the request goes now; reconnecting, inside the
   * window its last link's drop opened, it is held from now and goes on its
   * next register ({@link resendHeld}), as one in flight when its link
   * dropped is; offline, it is not sent (unanswered, reason "dead"). Asked
   * while away, a create's inputs write failed at once with "isn't
   * connected" while the machine was back 3 s later (2026-10-20). One that
   * will not answer is unanswered, reason "timeout"; an answered frame with
   * `ok: false` is the machine's refusal.
   */
  const askMachine = <K extends ControlName>(
    machineId: string,
    method: K,
    args: ControlArgs<K>,
    timeoutMs: number,
    harness?: HarnessKind,
    instanceId?: string
  ): Effect.Effect<Bounded<ControlAnswer<K>>> => {
    const agent = registry.agent(machineId);
    if (!agent && machinePresence(machineId).kind !== "reconnecting") {
      return Effect.succeed({ kind: "unanswered", reason: "dead", after: 0 });
    }

    const requestId = crypto.randomUUID();
    const payload: ControlPayload = {
      requestId,
      method,
      args,
      ...(harness && { harness }),
      ...(instanceId && { instanceId }),
    };
    return replyTo(machineId, method, requestId, timeoutMs, () => {
      const frame = {
        verb: "control",
        machineId,
        ...(instanceId && { instanceId }),
        payload,
      } satisfies HubEnvelope<"control">;
      // Away: held, with no socket, for its machine's next register.
      if (agent) {
        sendToMachine(agent, frame);
      }
      return frame;
    });
  };

  /** The promise edge of {@link askMachine}. */
  const callAgent = <K extends ControlName>(
    machineId: string,
    method: K,
    args: ControlArgs<K>,
    timeoutMs: number,
    harness?: HarnessKind,
    instanceId?: string
  ): Promise<Bounded<ControlAnswer<K>>> =>
    lifetime.run(
      askMachine(machineId, method, args, timeoutMs, harness, instanceId)
    );

  /**
   * A read's answer: one held past its deadline with its machine still away
   * (MACHINE_DISCONNECTED) is its machine not connected, unanswered "dead",
   * as a read asked of a machine already gone is, so the read's own words
   * for an offline machine say it and its route answers `awayProblem`.
   * A read runs nothing, so "whether it ran is not known" is never its to
   * say; a write keeps those words, which are true of it.
   *
   * Why: a dashboard's transcript read asked as the hub came back, its
   * machine 18 s behind it, toasted that sentence (j1-check-in, 2026-10-22).
   */
  const asRead = <T>(answer: Bounded<CallAnswer<T>>): Bounded<CallAnswer<T>> =>
    answer.kind === "answered" &&
    !answer.value.ok &&
    answer.value.error === MACHINE_DISCONNECTED
      ? { kind: "unanswered", reason: "dead", after: 0 }
      : answer;

  /** Asks a session's process `method` directly and reads its answer ({@link asRead}). The promise edge of {@link replyTo}. */
  const readSessionProcess = <K extends ControlName>(
    row: { id: string; machineId: string },
    method: K,
    args: ControlArgs<K>
  ): Promise<Bounded<ControlAnswer<K>>> => {
    const requestId = crypto.randomUUID();
    return lifetime.run(
      replyTo(row.machineId, method, requestId, READ_TIMEOUT_MS, () => {
        const agent = registry.agent(row.machineId);
        return agent
          ? sendAnswerable(agent, sessionControl(row, requestId, method, args))
          : undefined;
      }).pipe(Effect.map(asRead))
    );
  };

  /** {@link callAgent} for a method that only reads: its answer {@link asRead}. */
  const readAgent = async <K extends ControlName>(
    machineId: string,
    method: K,
    args: ControlArgs<K>,
    timeoutMs: number,
    harness?: HarnessKind,
    instanceId?: string
  ): Promise<Bounded<ControlAnswer<K>>> =>
    asRead(
      await callAgent(machineId, method, args, timeoutMs, harness, instanceId)
    );

  /**
   * The machine a skill folder's source names by its host (skills.ts
   * `bindSkillSource`): its machineId, its hostname, or that hostname as the
   * fleet shows it, case aside. Throws, in a sentence, for a name no machine
   * or several have.
   */
  const skillFolderMachine = (host: string): string => {
    const needle = host.toLowerCase();
    const matches = db
      .namedMachines()
      .filter(
        (machine) =>
          machine.machineId.toLowerCase() === needle ||
          machine.hostname.toLowerCase() === needle ||
          machineLabel(machine.hostname).toLowerCase() === needle
      );
    const [only] = matches;
    if (!only || matches.length > 1) {
      throw new Error(
        only
          ? `${matches.length} machines are called ${host}; install from the folder again from a session on the one that holds it`
          : `no machine in this fleet is called ${host}`
      );
    }
    return only.machineId;
  };

  /** A local skill source's own name for `machineId`: its fleet name, else its id when another machine shares that name. */
  const skillFolderHost = (machineId: string): string => {
    const machines = db.namedMachines();
    const machine = machines.find((one) => one.machineId === machineId);
    if (!machine) {
      return machineId;
    }
    const name = machineLabel(machine.hostname);
    return machines.some(
      (other) =>
        other.machineId !== machineId &&
        machineLabel(other.hostname).toLowerCase() === name.toLowerCase()
    )
      ? machineId
      : name;
  };

  /**
   * A skill install from a folder, bound before it is asked or run, in Full
   * Send too: the caller's machine named in its source (skills.ts
   * `bindSkillSource`), the folder read and checked through that machine's
   * agent, and the hash of the files read pinned as `contentHash`, so the
   * install stores only what was shown. A folder that can't be read or
   * checked throws its sentence: the call is refused before anyone is asked
   * and before anything is stored. Every other call comes back as given.
   */
  const bindFolderInstall = async (
    actor: InstanceRow,
    name: string,
    input: Record<string, unknown>
  ): Promise<Record<string, unknown>> => {
    if (
      name !== "admin_skills_write" ||
      input.action !== "install" ||
      typeof input.source !== "string"
    ) {
      return input;
    }
    const source = bindSkillSource(input.source, {
      hostname: skillFolderHost(actor.machineId),
      home: db
        .machineFacts()
        .find((agent) => agent.machineId === actor.machineId)?.home,
    });
    const folder = folderOf(source);
    if (!folder) {
      return { ...input, source };
    }
    const { hash } = await readCheckedFolder(
      folder.machine,
      folder.path,
      readSkillFolder
    );
    return { ...input, source, contentHash: hash };
  };

  /**
   * A skill folder's files, read off the machine `host` names through its
   * agent (agent fleet.ts `readSkillFolder`, which keeps the read inside the
   * folder and under core's `SKILL_FOLDER_LIMIT_BYTES`). Throws the
   * machine's own sentence when it will not.
   */
  const readSkillFolder: SkillFolderReader = async (host, path) => {
    const machineId = skillFolderMachine(host);
    const asked = await readAgent(
      machineId,
      READ_SKILL_FOLDER,
      [path],
      READ_TIMEOUT_MS
    );
    switch (asked.kind) {
      case "unanswered":
        throw unansweredError(machineId, asked, `reading ${path}`);
      case "answered":
        break;
      default:
        throw unreachable(asked);
    }
    if (!asked.value.ok) {
      throw new Error(
        asked.value.error ?? `${machineName(machineId)} could not read ${path}`
      );
    }
    return asked.value.result;
  };

  /**
   * {@link readAgent} for a read the machine stops once the hub stops
   * waiting for it (core `CONTROL_ABANDON`, agent session.ts
   * `declareRead`): when `timeoutMs` passes with no answer, or
   * `ask.signal` aborts (its asker typed on), the machine is told under the
   * read's own request id, and stops it where it runs. A deadline that
   * passes is logged with who asked, so a late answer's line (`lateAnswer`,
   * by the same id) is read back to its caller. Answers `null` when its asker
   * let it go.
   */
  const readStoppable = async <K extends ControlName>(
    machineId: string,
    method: K,
    args: ControlArgs<K>,
    timeoutMs: number,
    ask: { caller: string; signal?: AbortSignal | undefined }
  ): Promise<Bounded<ControlAnswer<K>> | null> => {
    if (
      !registry.agent(machineId) &&
      machinePresence(machineId).kind !== "reconnecting"
    ) {
      return { kind: "unanswered", reason: "dead", after: 0 };
    }
    if (ask.signal?.aborted) {
      return null;
    }
    const requestId = crypto.randomUUID();
    /** The machine is told the read was let go (core `CONTROL_ABANDON`), and the hub does not wait for it to hear. */
    const stop = () =>
      lifetime.fork(
        "a let-go read",
        askMachine(machineId, CONTROL_ABANDON, [requestId], ABANDON_MS).pipe(
          Effect.tap((answer) =>
            answer.kind === "unanswered"
              ? Effect.sync(() =>
                  console.warn(
                    `[find] ${silentWords(machineId, answer)}, so it did not hear that ${method} (request ${requestId}) was let go`
                  )
                )
              : Effect.void
          )
        )
      );
    const read = replyTo(
      machineId,
      method,
      requestId,
      timeoutMs,
      () => {
        const agent = registry.agent(machineId);
        const frame = {
          verb: "control",
          machineId,
          payload: {
            requestId,
            method,
            args,
          } satisfies ControlPayload,
        } satisfies HubEnvelope<"control">;
        if (agent) {
          sendToMachine(agent, frame);
        }
        return frame;
      },
      ask.signal ? whenLetGo(ask.signal) : undefined
    );
    return await lifetime.run(
      read.pipe(
        Effect.map((reply) => {
          const answer = asRead(reply);
          if (answer.kind === "unanswered" && answer.reason === "timeout") {
            console.warn(
              `[find] ${machineName(machineId)} didn't answer ${method} for ${ask.caller} within ${timeoutMs / 1000} s (request ${requestId}); it is told to stop it`
            );
            stop();
          }
          return answer;
        }),
        Effect.catchTag("LetGo", () =>
          Effect.sync(() => {
            stop();
            return null;
          })
        )
      )
    );
  };

  /**
   * Sends something a machine answers under `requestId`, and waits for that
   * answer, until `timeoutMs`. `send` sends it and gives the frame it sent:
   * the one sent again, under the same id, if the link drops before the
   * answer ({@link resendHeld}). A deadline that passes with the machine
   * away answers MACHINE_DISCONNECTED; one that passes with it there is
   * unanswered, a machine that did not answer.
   *
   * The answer is a {@link Deferred} parked in {@link waiting} under the
   * request id, claimed and sent before the wait's first step, and done by
   * the frame that answers (agent-socket/control-replies.ts). The deadline
   * is the kit's bounded read over it; past the deadline the Deferred is
   * still the answer when it came while the hub caught up with the socket.
   */
  const awaitFrame = Effect.fnUntraced(function* <E = never>(
    machineId: string,
    requestId: string,
    timeoutMs: number,
    send: () => HubEnvelope | undefined,
    letGo?: Effect.Effect<never, E>
  ): Effect.fn.Return<Bounded<ControlResult>, E> {
    const sentAt = Date.now();
    const { answer, forget } = park(machineId, requestId, send);
    const read = answeredWithin(timeoutMs, answer);
    const reply = yield* (letGo ? Effect.raceFirst(read, letGo) : read).pipe(
      Effect.tapError(() => Effect.sync(forget))
    );
    // How long a machine took to answer a read held to one of the shared
    // read deadlines (machine-read-timeouts.ts).
    if (timeoutMs === READ_TIMEOUT_MS) {
      recordLimitReading("hub.machine-read-ms", Date.now() - sentAt);
    } else if (timeoutMs === BUSY_TIMEOUT_MS) {
      recordLimitReading("hub.machine-busy-read-ms", Date.now() - sentAt);
    }
    if (reply.kind === "answered") {
      return reply;
    }
    if (reply.reason !== "timeout") {
      forget();
      return reply;
    }
    return yield* pastDeadline(
      { machineId, requestId, sentAt, timeoutMs },
      answer,
      forget,
      reply
    );
  });

  /**
   * Parks the answer to `requestId` in {@link waiting} and sends the call
   * ({@link awaitFrame}): `send`'s frame is kept to go again
   * ({@link resendHeld}). A `send` that throws leaves nothing waiting and
   * throws on. `forget` lets the call go.
   */
  const park = (
    machineId: string,
    requestId: string,
    send: () => HubEnvelope | undefined
  ): { answer: Deferred.Deferred<ControlResult>; forget: () => void } => {
    const answer = Deferred.makeUnsafe<ControlResult>();
    const forget = () => {
      waiting.delete(requestId);
      waitingMachines.delete(requestId);
    };
    waitOn(requestId, machineId);
    waiting.set(requestId, (frame) => {
      forget();
      Deferred.doneUnsafe(answer, Effect.succeed(frame));
    });
    try {
      const sent = send();
      const held = waitingMachines.get(requestId);
      if (held && sent) {
        held.again = sent;
      }
    } catch (error) {
      // Refused before it went: nothing will answer, so nothing waits.
      forget();
      throw error;
    }
    return { answer, forget };
  };

  /**
   * A call's deadline passed unanswered ({@link awaitFrame}). The hub
   * catches up with the machine's socket first (wire-socket.ts
   * `caughtUp`): after its thread was held, the deadline's timer runs
   * before the socket is read, and an answer read in time can wait in the
   * inbox behind the frames before it (2026-10-23, three machines' answers
   * to one configure logged as unrouted in the same second, while twenty
   * transcript reads came in). One that came meanwhile is the answer; else
   * the call lapses, MACHINE_DISCONNECTED when its machine is away.
   */
  const pastDeadline = Effect.fnUntraced(function* (
    call: {
      machineId: string;
      requestId: string;
      sentAt: number;
      timeoutMs: number;
    },
    answer: Deferred.Deferred<ControlResult>,
    forget: () => void,
    reply: Bounded<ControlResult>
  ): Effect.fn.Return<Bounded<ControlResult>> {
    const { requestId } = call;
    const held = waitingMachines.get(requestId);
    if (held?.socketId) {
      yield* caughtUp(held.socketId);
    }
    if (Deferred.isDoneUnsafe(answer)) {
      return {
        kind: "answered",
        value: yield* Deferred.await(answer),
      } satisfies Bounded<ControlResult>;
    }
    const awayAtDeadline =
      waitingMachines.get(requestId)?.socketId === undefined;
    forget();
    noteLapsed(requestId, {
      machineId: call.machineId,
      what:
        held?.again?.verb === "control"
          ? held.again.payload.method
          : held?.again?.verb,
      sentAt: call.sentAt,
      timeoutMs: call.timeoutMs,
    });
    return awayAtDeadline
      ? ({
          kind: "answered",
          value: {
            kind: "control_result",
            requestId,
            ok: false,
            error: MACHINE_DISCONNECTED,
          },
        } satisfies Bounded<ControlResult>)
      : reply;
  });

  /** `reply`'s frame read by `read` (machine-answers.ts `answerOf`), once it came. */
  const parsedReply = <T>(
    reply: Bounded<ControlResult>,
    read: (frame: ControlResult) => CallAnswer<T>
  ): Bounded<CallAnswer<T>> =>
    reply.kind === "answered"
      ? { kind: "answered", value: read(reply.value) }
      : reply;

  /**
   * {@link awaitFrame} for control `method`: its answer parsed against its
   * reply's schema where it arrives (machine-answers.ts `answerOf`), a reply
   * that is not its type failed on this call alone.
   */
  const replyTo = <K extends ControlName, E = never>(
    machineId: string,
    method: K,
    requestId: string,
    timeoutMs: number,
    send: () => HubEnvelope | undefined,
    letGo?: Effect.Effect<never, E>
  ): Effect.Effect<Bounded<ControlAnswer<K>>, E> =>
    awaitFrame(machineId, requestId, timeoutMs, send, letGo).pipe(
      Effect.map((reply) =>
        parsedReply(reply, (frame) =>
          answerOf(method, frame, machineName(machineId))
        )
      )
    );

  /**
   * The promise edge of {@link replyTo}. `letGo` aborts once its asker
   * stops waiting: the promise rejects there, with the abort's reason.
   */
  const awaitReply = <K extends ControlName>(
    machineId: string,
    method: K,
    requestId: string,
    timeoutMs: number,
    send: () => HubEnvelope | undefined,
    letGo?: AbortSignal
  ): Promise<Bounded<ControlAnswer<K>>> =>
    lifetime.run(
      replyTo(
        machineId,
        method,
        requestId,
        timeoutMs,
        send,
        letGo ? whenLetGo(letGo) : undefined
      ).pipe(Effect.catchTag("LetGo", () => Effect.die(letGo?.reason)))
    );

  /** {@link awaitFrame} for `fs` op `op`: its answer parsed against its reply's schema (machine-answers.ts `fsAnswerOf`). The promise edge. */
  const awaitFs = <O extends FsOp>(
    machineId: string,
    op: O,
    requestId: string,
    timeoutMs: number,
    send: () => HubEnvelope | undefined
  ): Promise<Bounded<FsAnswer<O>>> =>
    lifetime.run(
      awaitFrame(machineId, requestId, timeoutMs, send).pipe(
        Effect.map((reply) =>
          parsedReply(reply, (frame) =>
            fsAnswerOf(op, frame, machineName(machineId))
          )
        )
      )
    );

  /**
   * Each credential the hub revokes, named by its hash to every machine
   * connected ({@link CONTROL_FORGET_CREDENTIALS}): any of them may hold it
   * (a session moved keeps its old one on the machine it left), and a hash
   * gives nothing away. A machine that does not hear it now asks again as
   * it registers (`RegisterAckPayload.revokedCredentials`).
   */
  /** How long a machine gets to drop credentials from its store: one small file written. */
  // @limit recording: hub.forget-credentials-ms until 2026-12-26
  const FORGET_CREDENTIALS_TIMEOUT_MS = 30_000;

  /**
   * A session's start, waited on as {@link awaitReply} does, and on past
   * {@link SPAWN_START_TIMEOUT_MS} for as long as its machine has said the
   * start waits for memory since it was sent (a `room` line, core
   * `ROOM_HELD`): a start is never refused for the machine's room. The spawn
   * is sent once; a later wait listens for the same answer.
   */
  const awaitStart = (
    machineId: string,
    instanceId: string,
    requestId: string,
    send: () => HubEnvelope | undefined
  ): Promise<Bounded<CallAnswer<unknown>>> =>
    lifetime.run(
      Effect.gen(function* () {
        const sentAt = Date.now();
        let sent: HubEnvelope | undefined;
        let reply = yield* awaitFrame(
          machineId,
          requestId,
          SPAWN_START_TIMEOUT_MS,
          () => {
            sent = send();
            return sent;
          }
        );
        recordLimitReading("hub.spawn-start-ms", Date.now() - sentAt);
        while (
          reply.kind === "unanswered" &&
          db
            .machineLinesOf(instanceId)
            .some((line) => line.kind === "room" && line.at >= sentAt)
        ) {
          reply = yield* awaitFrame(
            machineId,
            requestId,
            SPAWN_START_TIMEOUT_MS,
            () => sent
          );
        }
        return parsedReply(reply, (frame) =>
          parsedAs(SPAWN_REPLY, frame, machineName(machineId), "its start")
        );
      })
    );

  return {
    waiting,
    waitingMachines,
    resendHeld,
    processAt,
    processEvent,
    sendToMachine,
    waitingForProcess,
    commandQueues,
    lateAnswer,
    logUnroutedReply,
    locations,
    keptOn,
    sendAnswerable,
    askMachine,
    callAgent,
    asRead,
    readSessionProcess,
    readAgent,
    bindFolderInstall,
    readSkillFolder,
    readStoppable,
    awaitReply,
    awaitFs,
    FORGET_CREDENTIALS_TIMEOUT_MS,
    awaitStart,
  };
};

/**
 * The hub's calls to its machines (`make`), as one of its services: built
 * once, from its layer, by `createServer` (hub-layer.ts).
 */
export class MachineCalls extends Context.Service<
  MachineCalls,
  ReturnType<typeof make>
>()("MachineCalls") {}

export const MachineCallsLayer = Layer.effect(MachineCalls)(
  Effect.gen(function* () {
    return make({
      db: yield* Db,
      lifetime: yield* HubLifetime,
      machinePresence: (yield* HandoverState).machinePresence,
      registry: yield* Registry,
      words: yield* MachineWords,
    });
  })
);
