import type { Bounded } from "@cawco/core/bounded";
import { readWithin } from "@cawco/core/bounded";
import type { CommandQueue } from "@cawco/core/commands/controls";
import { detach } from "@cawco/core/detach";
import type { FleetSkillMeta } from "@cawco/core/fleet";
import { READ_SKILL_FOLDER } from "@cawco/core/fleet";
import type { HarnessKind } from "@cawco/core/harness/kinds";
import { machineLabel } from "@cawco/core/machine-names";
import type {
  ControlPayload,
  Envelope,
  InstanceRow,
  SendPayload,
} from "@cawco/core/protocol";
import { CONTROL_ABANDON } from "@cawco/core/session/controls";
import { machineReadWords } from "@cawco/core/words/machine-reads";
import { SPAWN_START_TIMEOUT_MS } from "./config";
import { peek } from "./cut-turns";
import type { HubContext } from "./hub-context";
import type { FolderSkillBody, SessionLocation } from "./hub-shapes";
import type { ControlResult } from "./machine-answers";
import { machineSkillFiles } from "./machine-answers";
import { READ_TIMEOUT_MS } from "./machine-read-timeouts";
import { refusal } from "./refusal";
import { sessionControl } from "./session-word";
import type { CheckedFolder, SkillFolderReader } from "./skills";
import {
  bindSkillSource,
  FOLDER_CHANGED,
  folderOf,
  parseSkillSource,
  readCheckedFolder,
} from "./skills";
import { MACHINE_DISCONNECTED } from "./spawns";
import { unreachable } from "./unreachable";
import type { HubSocket } from "./wire-socket";
import { caughtUp } from "./wire-socket";

/** How long a machine is given to hear that the hub let a read go (core `CONTROL_ABANDON`): one map lookup there. */
const ABANDON_MS = 5000;
/** Deduplicate recently orphaned replies without retaining every request forever. */
const UNROUTED_REPLY_LIMIT = 4096;

export type MachineCallsContext = Pick<
  HubContext,
  | "db"
  | "fleetChanged"
  | "machineName"
  | "machinePresence"
  | "presenced"
  | "registry"
  | "sendFrame"
  | "silentWords"
  | "skillChoices"
  | "unansweredError"
>;

export const createMachineCalls = (ctx: MachineCallsContext) => {
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
      again: Envelope | undefined;
      machineId: string;
      socketId: string | undefined;
    }
  >();
  /** A call to `machineId` now waits on the socket the machine has now. */
  const waitOn = (requestId: string, machineId: string): void => {
    waitingMachines.set(requestId, {
      machineId,
      socketId: ctx.registry.agent(machineId)?.id,
      again: undefined,
    });
  };
  /**
   * The machine registered again: every call held for it goes again, under
   * its own id, on the socket it has now. Sent once its register is
   * acknowledged, when it takes requests.
   */
  const resendHeld = (machineId: string): void => {
    const agent = ctx.registry.agent(machineId);
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
        ctx.sendFrame(agent, call.again);
        again += 1;
      }
    }
    if (again > 0) {
      console.info(
        `[hub] ${ctx.machineName(machineId)} is back: ${again} request(s) held for it sent again under their own ids`
      );
    }
  };
  /**
   * The machine registered again: every send a session it runs was handed
   * and has not read goes again, in the order accepted, under its own
   * hand-off. One handed on a link that dropped may never have reached the
   * machine: on 2026-10-20 a delegate's brief, handed 143 ms before its
   * machine's link was cut, stayed pending while its session sat idle, and
   * its item never started (link-under-load lane 11). The agent takes a
   * send it had already as had, never as a second turn (session.ts
   * `#handedBefore`): taken, it says so; held by its process, it says that.
   * A send owed is not handed here: it goes when its hold ends. Nor is one
   * its harness has said it holds (`held`): a process has it. An agent that
   * restarted adopts a live Claude process and tells the hub which sends its
   * CLI holds (claude.ts `adopt`, MESSAGES_HELD), but keeps none of them as
   * its own hand-offs, so one handed again here would reach that CLI twice.
   */
  const handAgain = (machineId: string, instanceIds: string[]): void => {
    const agent = ctx.registry.agent(machineId);
    if (!agent) {
      return;
    }
    let again = 0;
    for (const instanceId of instanceIds) {
      for (const send of ctx.db.sendsIn(instanceId, ["pending"])) {
        if (send.owed || send.held || !(send.delivery && send.envelope)) {
          continue;
        }
        const { envelope } = send;
        ctx.sendFrame(
          agent,
          envelope.verb === "send"
            ? ctx.presenced(envelope as Envelope<SendPayload>)
            : envelope
        );
        again += 1;
      }
    }
    if (again > 0) {
      console.info(
        `[hub] ${ctx.machineName(machineId)} is back: ${again} unread send(s) handed to it again under their own hand-offs`
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
    if (lapsed.size > UNROUTED_REPLY_LIMIT) {
      const oldest = lapsed.keys().next().value;
      if (oldest !== undefined) {
        lapsed.delete(oldest);
      }
    }
  };
  /** Whether `message` answers a call of the hub's that lapsed: said once, as late, when it does. */
  const lateAnswer = (message: Envelope): boolean => {
    const requestId = message.requestId ?? peek(message.payload, "requestId");
    const call = requestId ? lapsed.get(requestId) : undefined;
    if (!(requestId && call)) {
      return false;
    }
    lapsed.delete(requestId);
    console.warn(
      machineReadWords.lateLine(
        ctx.machineName(call.machineId),
        call.what ?? "a request",
        requestId,
        Date.now() - call.sentAt - call.timeoutMs,
        call.timeoutMs
      )
    );
    return true;
  };
  const unroutedReplies = new Set<string>();
  const logUnroutedReply = (message: Envelope): void => {
    if (lateAnswer(message)) {
      return;
    }
    const requestId = message.requestId ?? peek(message.payload, "requestId");
    const instanceId =
      message.instanceId ?? peek(message.payload, "instanceId");
    const kind = peek(message.payload, "kind") ?? "unknown";
    const key = `${message.machineId}:${instanceId}:${requestId}:${kind}`;
    if (unroutedReplies.has(key)) {
      return;
    }
    unroutedReplies.add(key);
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
  const sendAnswerable = <T extends Envelope>(
    socket: HubSocket,
    frame: T
  ): T => {
    ctx.sendFrame(socket, frame);
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
  const callAgent = (
    machineId: string,
    method: string,
    args: unknown[],
    timeoutMs: number,
    harness?: HarnessKind,
    instanceId?: string
  ): Promise<Bounded<ControlResult>> => {
    const agent = ctx.registry.agent(machineId);
    if (!agent && ctx.machinePresence(machineId).kind !== "reconnecting") {
      return Promise.resolve({ kind: "unanswered", reason: "dead", after: 0 });
    }

    const requestId = crypto.randomUUID();
    const payload: ControlPayload = {
      requestId,
      method,
      args,
      ...(harness && { harness }),
      ...(instanceId && { instanceId }),
    };
    return awaitReply(machineId, requestId, timeoutMs, () => {
      const frame = {
        verb: "control",
        machineId,
        ...(instanceId && { instanceId }),
        payload,
      } satisfies Envelope<ControlPayload>;
      // Away: held, with no socket, for its machine's next register.
      if (agent) {
        ctx.sendFrame(agent, frame);
      }
      return frame;
    });
  };

  /**
   * A read's answer: one held past its deadline with its machine still away
   * (MACHINE_DISCONNECTED) is its machine not connected, unanswered "dead",
   * as a read asked of a machine already gone is, so the read's own words
   * for an offline machine say it and its route answers {@link awayStatus}.
   * A read runs nothing, so "whether it ran is not known" is never its to
   * say; a write keeps those words, which are true of it.
   *
   * Why: a dashboard's transcript read asked as the hub came back, its
   * machine 18 s behind it, toasted that sentence (j1-check-in, 2026-10-22).
   */
  const asRead = (answer: Bounded<ControlResult>): Bounded<ControlResult> =>
    answer.kind === "answered" &&
    !answer.value.ok &&
    answer.value.error === MACHINE_DISCONNECTED
      ? { kind: "unanswered", reason: "dead", after: 0 }
      : answer;

  /** Asks a session's process `method` directly and reads its answer ({@link asRead}). */
  const readSessionProcess = async (
    row: { id: string; machineId: string },
    method: string,
    args: unknown[]
  ): Promise<Bounded<ControlResult>> => {
    const requestId = crypto.randomUUID();
    return asRead(
      await awaitReply(row.machineId, requestId, READ_TIMEOUT_MS, () => {
        const agent = ctx.registry.agent(row.machineId);
        return agent
          ? sendAnswerable(agent, sessionControl(row, requestId, method, args))
          : undefined;
      })
    );
  };

  /** {@link callAgent} for a method that only reads: its answer {@link asRead}. */
  const readAgent = async (
    ...ask: Parameters<typeof callAgent>
  ): Promise<Bounded<ControlResult>> => asRead(await callAgent(...ask));

  /**
   * The machine a skill folder's source names by its host (skills.ts
   * `bindSkillSource`): its machineId, its hostname, or that hostname as the
   * fleet shows it, case aside. Throws, in a sentence, for a name no machine
   * or several have.
   */
  const skillFolderMachine = (host: string): string => {
    const needle = host.toLowerCase();
    const matches = ctx.db
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
    const machines = ctx.db.namedMachines();
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
   * A skill stored from a folder on a machine (`file://<machine>/<path>`),
   * read and checked through its agent before anything is stored: refused
   * in its words when it can't be, and when it no longer holds the files the
   * person approved (`contentHash`, skills.ts `FOLDER_CHANGED`). The PUT
   * route's way in for such a source, which answers its refusals; undefined
   * for any other source.
   */
  const installFromFolder = async (name: string, body: FolderSkillBody) => {
    if (parseSkillSource(body.source)?.kind !== "file") {
      return;
    }
    const folder = folderOf(body.source);
    if (!folder) {
      return refusal(
        400,
        "skill-folder-unnamed",
        `${body.source} names no machine: write it as file://<machine>/<path>`
      );
    }
    let read: CheckedFolder;
    try {
      read = await readCheckedFolder(
        folder.machine,
        folder.path,
        readSkillFolder
      );
    } catch (error) {
      return refusal(
        400,
        "skill-folder-unread",
        error instanceof Error ? error.message : String(error)
      );
    }
    if (body.contentHash !== undefined && body.contentHash !== read.hash) {
      return refusal(409, "skill-folder-changed", FOLDER_CHANGED);
    }
    const skill = ctx.db.putSkill({
      name,
      source: body.source,
      enabled: body.enabled,
      projectId: body.projectId,
      areaId: body.areaId,
      hash: read.hash,
      bytes: read.files.reduce(
        (total, file) =>
          total + Buffer.byteLength(file.contentBase64, "base64"),
        0
      ),
      files: read.files,
    });
    ctx.skillChoices.delete(name);
    ctx.fleetChanged();
    const installed: FleetSkillMeta = skill;
    return installed;
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
      home: ctx.db
        .listAgents()
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
        throw ctx.unansweredError(machineId, asked, `reading ${path}`);
      case "answered":
        break;
      default:
        throw unreachable(asked);
    }
    if (!asked.value.ok) {
      throw new Error(
        asked.value.error ??
          `${ctx.machineName(machineId)} could not read ${path}`
      );
    }
    return machineSkillFiles(asked.value.result);
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
  const readStoppable = async (
    machineId: string,
    method: string,
    args: unknown[],
    timeoutMs: number,
    ask: { caller: string; signal?: AbortSignal | undefined }
  ): Promise<Bounded<ControlResult> | null> => {
    if (
      !ctx.registry.agent(machineId) &&
      ctx.machinePresence(machineId).kind !== "reconnecting"
    ) {
      return { kind: "unanswered", reason: "dead", after: 0 };
    }
    if (ask.signal?.aborted) {
      return null;
    }
    const requestId = crypto.randomUUID();
    const stop = () =>
      detach(
        callAgent(machineId, CONTROL_ABANDON, [requestId], ABANDON_MS).then(
          (answer) => {
            if (answer.kind === "unanswered") {
              console.warn(
                `[find] ${ctx.silentWords(machineId, answer)}, so it did not hear that ${method} (request ${requestId}) was let go`
              );
            }
          }
        ),
        "a let-go read"
      );
    try {
      const answer = asRead(
        await awaitReply(
          machineId,
          requestId,
          timeoutMs,
          () => {
            const agent = ctx.registry.agent(machineId);
            const frame = {
              verb: "control",
              machineId,
              payload: {
                requestId,
                method,
                args,
              } satisfies ControlPayload,
            } satisfies Envelope<ControlPayload>;
            if (agent) {
              ctx.sendFrame(agent, frame);
            }
            return frame;
          },
          ask.signal
        )
      );
      if (answer.kind === "unanswered" && answer.reason === "timeout") {
        console.warn(
          `[find] ${ctx.machineName(machineId)} didn't answer ${method} for ${ask.caller} within ${timeoutMs / 1000} s (request ${requestId}); it is told to stop it`
        );
        stop();
      }
      return answer;
    } catch (error) {
      if (!ask.signal?.aborted) {
        throw error;
      }
      stop();
      return null;
    }
  };

  /**
   * Sends something a machine answers under `requestId`, and waits for that
   * answer, until `timeoutMs`. `send` sends it and gives the frame it sent:
   * the one sent again, under the same id, if the link drops before the
   * answer ({@link resendHeld}). A deadline that passes with the machine
   * away answers MACHINE_DISCONNECTED; one that passes with it there is
   * unanswered, a machine that did not answer.
   */
  const awaitReply = async (
    machineId: string,
    requestId: string,
    timeoutMs: number,
    send: () => Envelope | undefined,
    /** Aborts once its asker stops waiting: the wait ends there, thrown as the abort. */
    letGo?: AbortSignal
  ): Promise<Bounded<ControlResult>> => {
    let answered: ControlResult | undefined;
    const forget = () => {
      waiting.delete(requestId);
      waitingMachines.delete(requestId);
    };
    const sentAt = Date.now();
    const reply = await readWithin(
      timeoutMs,
      (signal) =>
        new Promise<ControlResult>((resolve, reject) => {
          if (letGo) {
            signal.addEventListener(
              "abort",
              () => {
                if (letGo.aborted) {
                  forget();
                  reject(letGo.reason);
                }
              },
              { once: true }
            );
          }
          waitOn(requestId, machineId);
          waiting.set(requestId, (frame) => {
            answered = frame;
            forget();
            resolve(frame);
          });
          try {
            const sent = send();
            const call = waitingMachines.get(requestId);
            if (call && sent) {
              call.again = sent;
            }
          } catch (error) {
            // Refused before it went: nothing will answer, so nothing waits.
            forget();
            throw error;
          }
        }),
      letGo ? { signal: letGo } : {}
    );
    if (reply.kind === "answered") {
      return reply;
    }
    if (reply.reason !== "timeout") {
      forget();
      return reply;
    }
    // The deadline passed. The hub catches up with the machine's socket
    // first (wire-socket.ts `caughtUp`): after its thread was held, the
    // deadline's timer runs before the socket is read, and an answer read in
    // time can wait in the inbox behind the frames before it (2026-10-23,
    // three machines' answers to one configure logged as unrouted in the
    // same second, while twenty transcript reads came in).
    const call = waitingMachines.get(requestId);
    if (call?.socketId) {
      await caughtUp(call.socketId);
    }
    if (answered) {
      return { kind: "answered", value: answered };
    }
    const awayAtDeadline =
      waitingMachines.get(requestId)?.socketId === undefined;
    forget();
    noteLapsed(requestId, {
      machineId,
      what: peek(call?.again?.payload, "method") ?? call?.again?.verb,
      sentAt,
      timeoutMs,
    });
    return awayAtDeadline
      ? {
          kind: "answered",
          value: {
            kind: "control_result",
            requestId,
            ok: false,
            error: MACHINE_DISCONNECTED,
          },
        }
      : reply;
  };

  /**
   * Each credential the hub revokes, named by its hash to every machine
   * connected ({@link CONTROL_FORGET_CREDENTIALS}): any of them may hold it
   * (a session moved keeps its old one on the machine it left), and a hash
   * gives nothing away. A machine that does not hear it now asks again as
   * it registers (`RegisterAckPayload.revokedCredentials`).
   */
  /** How long a machine gets to drop credentials from its store: one small file written. */
  const FORGET_CREDENTIALS_TIMEOUT_MS = 30_000;

  /**
   * A session's start, waited on as {@link awaitReply} does, and on past
   * {@link SPAWN_START_TIMEOUT_MS} for as long as its machine has said the
   * start waits for memory since it was sent (a `room` line, core
   * `ROOM_HELD`): a start is never refused for the machine's room. The spawn
   * is sent once; a later wait listens for the same answer.
   */
  const awaitStart = async (
    machineId: string,
    instanceId: string,
    requestId: string,
    send: () => Envelope | undefined
  ): Promise<Bounded<ControlResult>> => {
    const sentAt = Date.now();
    let sent: Envelope | undefined;
    let reply = await awaitReply(
      machineId,
      requestId,
      SPAWN_START_TIMEOUT_MS,
      () => {
        sent = send();
        return sent;
      }
    );
    while (
      reply.kind === "unanswered" &&
      ctx.db
        .machineLinesOf(instanceId)
        .some((line) => line.kind === "room" && line.at >= sentAt)
    ) {
      reply = await awaitReply(
        machineId,
        requestId,
        SPAWN_START_TIMEOUT_MS,
        () => sent
      );
    }
    return reply;
  };

  return {
    waiting,
    waitingMachines,
    resendHeld,
    handAgain,
    commandQueues,
    lateAnswer,
    logUnroutedReply,
    locations,
    keptOn,
    sendAnswerable,
    callAgent,
    asRead,
    readSessionProcess,
    readAgent,
    installFromFolder,
    bindFolderInstall,
    readSkillFolder,
    readStoppable,
    awaitReply,
    FORGET_CREDENTIALS_TIMEOUT_MS,
    awaitStart,
  };
};
