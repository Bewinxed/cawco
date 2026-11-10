/**
 * Every act the person sends a session, on the ledger (ledger.svelte.ts):
 * its wire payload, the failure each kind says and where, the answers to
 * parked asks, and a send that failed or was never taken kept to be sent
 * again, restored to its composer, or withdrawn.
 */

import { ASK_USER_QUESTION, RESOLVE_PERMISSION } from "@cawco/core/ask-tools";
import type { SendAttachment } from "@cawco/core/attachments";
import { detach } from "@cawco/core/detach";
import {
  EFFORT_LEVELS,
  type EffortLevel,
  type PermissionMode,
  WIRE_PERMISSION_MODES,
} from "@cawco/core/harness/kinds";
import { traitsOf } from "@cawco/core/harness/traits";
import type { ControlPayload, SendPayload } from "@cawco/core/protocol";
import { questionsOf } from "@cawco/core/question";
import type { PermissionResult } from "@cawco/core/session-messages";
import type { CommandKind } from "@cawco/core/stream";
import { unhandled } from "@cawco/core/unhandled";
import { SvelteMap } from "svelte/reactivity";
import { z } from "zod";
import { failureWords as messageOf } from "#lib/platform/hub-read.js";
import { newId } from "#lib/platform/id.js";
import { currentClientId } from "../client-id";
import type { FrameOf } from "../hub/frames";
import { standingBench } from "../hub/socket.svelte";
import { presenceClientId } from "../presence";
import { type CommandRefusal, refusals } from "../refusals.svelte";
import {
  forgetSend,
  keepSend,
  keptSends,
  refuseSend,
  type SendExtras,
} from "../send-store";
import {
  type CommandRecord,
  failLocally,
  SETTLED_COMMAND_LIMIT,
  SETTLED_COMMAND_TTL_MS,
  type SettleStage,
  type StreamEffects,
  submitCommand as submitTrackedCommand,
  sweepCommands,
} from "../stream";
import {
  answeredNote,
  localUserMessage,
  withdrawnNote,
} from "../transcript/local";
import { routedToParent } from "../transcript/present";
import { speakerName } from "../transcript/speaker";
import type { Message } from "../types";
import { hearSettled } from "./asks.svelte";
import { instanceIndex } from "./board.svelte";
import {
  commandRecord,
  sendFailureNotices,
  streamHost,
  streamState,
} from "./ledger.svelte";
import { detailsOpen, persistSettings } from "./session-detail.svelte";
import {
  clearTurnPhase,
  session,
  sessionsState,
  trackWorking,
} from "./sessions.svelte";
import { addNote, place, take } from "./transcripts.svelte";

export function takePermissionSettled(
  frame: FrameOf<"permission_settled">
): void {
  // The hub's word that the ask is over, whoever settled it: the card goes,
  // and a read already on its way cannot bring it back.
  hearSettled(frame.requestId);
  const target = sessionsState.sessions[frame.instanceId];
  const parked = target?.pending.find((p) => p.requestId === frame.requestId);
  if (target && parked) {
    target.pending = target.pending.filter(
      (p) => p.requestId !== frame.requestId
    );
    trackWorking(target);
  }
  // Withdrawn, not answered: the composer folds back, and the transcript
  // says why the ask is gone. One the hub could not show anyone was never
  // parked here, and its reason is the only word of it.
  if (target && frame.outcome === "cancelled" && (parked || frame.reason)) {
    const question = parked
      ? questionsOf(parked.toolName, parked.input) !== null
      : frame.toolName === ASK_USER_QUESTION;
    addNote(target, withdrawnNote(frame.instanceId, question, frame.reason));
  }
  // Answered somewhere else while this tab held the card (another tab, the
  // app, a session, the harness): it says what won and where.
  // With an answer of this tab's still out, the winner may be that answer
  // or another device's: the line waits for the hub's word on ours, said
  // if it was refused (`streamEffectsFor`, `permission.answer`).
  if (target && parked && frame.outcome === "answered" && frame.answer) {
    const note = answeredNote(
      frame.instanceId,
      questionsOf(parked.toolName, parked.input) !== null,
      frame.answer,
      speakerName(target.harness)
    );
    if (answeredHere(frame.requestId)) {
      answeredWhileOurs.set(frame.requestId, note);
    } else {
      addNote(target, note);
    }
  }
}

/** The kinds the session's details card asks for, and says the failure of. */
const SETTINGS_KINDS: ReadonlySet<CommandKind> = new Set([
  "set-model",
  "set-effort",
  "set-permission-mode",
]);

/** A reason's closing stop, dropped so it sits inside the sentence. */
const REASON_STOP = /\.$/u;

/**
 * A failed command in the error formula (DESIGN.md, Voice): what did not happen, the
 * hub's why, what stands meanwhile; the way on (Try again, or the control
 * itself) stands beside it. The operator's terms, never the wire's.
 */
function failureNotice(record: CommandRecord): string {
  const why = (record.reason ?? "the hub didn't say why").replace(
    REASON_STOP,
    ""
  );
  switch (record.kind) {
    case "interrupt":
      return `The turn was not stopped: ${why}. It goes on.`;
    case "set-model":
      return `The model was not changed: ${why}. The session keeps the one it runs.`;
    case "set-effort":
      return `The effort was not changed: ${why}. The session keeps the one it runs.`;
    case "set-permission-mode":
      return `The permission mode was not changed: ${why}. The session keeps the one it runs.`;
    case "permission.answer":
      return `Your answer was not sent: ${why}. The ask has since closed, so nothing waits on it.`;
    case "send.withdraw":
      return `The message was not taken back: ${why}. It stays queued.`;
    case "send":
      return `Your message was not sent: ${why}.`;
    default:
      return `That didn't go through: ${why}. (${String(record.kind)})`;
  }
}

/** What a refused command asked, kept with its words, so Try again asks again after a reload. */
const CommandAskedSchema = z.object({
  /** The control's argument: the model, the effort, the mode. */
  arg: z.unknown().optional(),
  /** When it was refused: the composer says the latest. */
  at: z.number(),
  kind: z.union([
    z.literal("send"),
    z.literal("send.withdraw"),
    z.literal("permission.answer"),
    z.literal("interrupt"),
    z.literal("set-model"),
    z.literal("set-permission-mode"),
    z.literal("set-effort"),
  ]),
  machineId: z.string().optional(),
});
type CommandAsked = z.output<typeof CommandAskedSchema>;

/** What a refusal kept of the command it came from, when it is still the shape this writes. */
const askedOf = (said: CommandRefusal): CommandAsked | null => {
  const parsed = CommandAskedSchema.safeParse(said.asked);
  return parsed.success ? parsed.data : null;
};

/** Where a session's refused command of `kind` is kept. */
const commandKey = (sessionId: string, kind: CommandKind | "") =>
  `command:${sessionId}:${kind}`;

/**
 * The same command again, as it went: its kind, its machine and what it
 * asked. None for an answer, whose ask has gone, or for a command that
 * never got an envelope.
 */
function againOf(
  sessionId: string,
  asked: CommandAsked
): (() => void) | undefined {
  const { machineId, arg } = asked;
  if (!machineId) {
    return;
  }
  switch (asked.kind) {
    case "interrupt":
      return () => {
        submitCommand(sessionId, machineId, { kind: "interrupt", intent: {} });
      };
    case "set-model": {
      const model = arg;
      if (typeof model !== "string") {
        return;
      }
      return () => {
        submitCommand(sessionId, machineId, {
          kind: "set-model",
          intent: {
            model,
          },
        });
      };
    }
    case "set-effort": {
      const effort = EFFORT_LEVELS.find((level) => level === arg);
      if (!effort) {
        return;
      }
      return () => {
        submitCommand(sessionId, machineId, {
          kind: "set-effort",
          intent: { effort },
        });
      };
    }
    case "set-permission-mode": {
      const mode = WIRE_PERMISSION_MODES.find((one) => one === arg);
      if (!mode) {
        return;
      }
      return () => {
        submitCommand(sessionId, machineId, {
          kind: "set-permission-mode",
          intent: { mode },
        });
      };
    }
    // An answer's ask has gone; a send says itself on its row and composer.
    case "permission.answer":
    case "send.withdraw":
    case "send":
      return;
    default:
      unhandled("Try again command kind", asked.kind);
  }
}

/** A refused command's words and its Try again, where its session says it. */
export interface CommandFault {
  again?: () => void;
  kind: CommandKind;
  words: string;
}

const faultOf = (
  sessionId: string,
  said: CommandRefusal,
  asked: CommandAsked
): CommandFault => ({
  kind: asked.kind,
  words: said.reason,
  again: againOf(sessionId, asked),
});

/**
 * What `instanceId`'s composer says of a refused command: the latest one
 * no details card is saying, over the field, with Try again, until the
 * next command of that session goes. Kept through a reload.
 */
export function commandFault(instanceId: string): CommandFault | null {
  const shown = detailsOpen.has(instanceId);
  const [latest] = refusals
    .under(commandKey(instanceId, ""))
    .flatMap(([, said]) => {
      const asked = askedOf(said);
      return asked && !(shown && SETTINGS_KINDS.has(asked.kind))
        ? [{ asked, said }]
        : [];
    })
    .toSorted((a, b) => b.asked.at - a.asked.at);
  return latest ? faultOf(instanceId, latest.said, latest.asked) : null;
}

/** What a session's details card says of its refused `kind` change, under that control. */
export function settingFault(
  instanceId: string,
  kind: CommandKind
): CommandFault | null {
  const said = refusals.get(commandKey(instanceId, kind));
  const asked = said && askedOf(said);
  return said && asked ? faultOf(instanceId, said, asked) : null;
}

/**
 * What each control command asked, by command id, from its submit: the
 * ledger lets a record's envelope go once it settles, before its failure
 * is noted, and Try again needs the machine and the argument.
 */
const controlAsks = new Map<string, { arg?: unknown; machineId: string }>();

/** Keeps what a control command asked, dropping what settled long ago. */
function rememberControlAsk(
  commandId: string,
  machineId: string,
  arg?: unknown
): void {
  for (const known of [...controlAsks.keys()]) {
    if (!streamState.commands[known]) {
      controlAsks.delete(known);
    }
  }
  controlAsks.set(commandId, { arg, machineId });
}

function sayCommandFault(
  record: CommandRecord,
  /** The session whose composer says it: the command's own, unless its card stood in another's. */
  sessionId = record.sessionId
): void {
  const asked = controlAsks.get(record.commandId);
  controlAsks.delete(record.commandId);
  refusals.set(commandKey(sessionId, record.kind), {
    reason: failureNotice(record),
    asked: {
      at: Date.now(),
      arg: asked?.arg,
      kind: record.kind,
      machineId:
        asked?.machineId ?? instanceIndex.byId.get(sessionId)?.machineId,
    } satisfies CommandAsked,
  });
}

/**
 * The failure port of the ledger: every command that ever reaches `failed`,
 * on either dialect, is heard exactly once here.
 *
 * The rule is "nothing goes unsaid, and nothing is said TWICE", and never
 * in a toast (DESIGN.md, The Work Outlives Its Surface Rule). A kind whose
 * own surface renders the failure inline claims it; everything else, and
 * every claim whose surface has since vanished, is said over the session's
 * composer ({@link sayCommandFault}), in the error formula, with Try again
 * where a try can go. That way a command kind added next year is loud by
 * default rather than silent by default, which is the failure mode this
 * whole port exists to close.
 */
export function noteCommandFailure(record: CommandRecord): void {
  if (record.kind === "send") {
    // A send's failure is said over the composer it left (the session's
    // notice) and on its row — stamped rather than kept only on the command
    // record, which is swept after five minutes, where a message that never
    // sent must not fade back to looking sent. It is never a toast.
    announceSendFailure(record);
    markUnreached(record);
    return;
  }
  // A withdraw is a queued message's edit, and the composer it was edited
  // in says what became of it, over the field that holds the words again
  // (transcript/lift.svelte.ts).
  if (record.kind === "send.withdraw") {
    return;
  }
  // A parked permission card renders its own refusal (`Couldn't send that
  // answer.`) against the very command id it holds. It only does so while it
  // is still on screen: answering removes the request from `pending`, so an
  // answer that fails after the card has gone has no inline surface at all
  // and is said over the composer of the session the card was drawn in:
  // its own, or, for an ask parked under a proposal of its (a memory or
  // design proposal, `originInstanceId`), the session that proposed it.
  if (record.kind === "permission.answer") {
    const surface = answerSurfaces.get(record.commandId);
    if (answerCardStillParked(record)) {
      return;
    }
    sayCommandFault(record, surface?.origin ?? record.sessionId);
    return;
  }
  // Kept for its session (refusals.svelte.ts): a model, effort or mode
  // change is said on the details card's own line for it while that card
  // stands, and over the composer otherwise; anything else over the
  // composer. A reload says it again in the same place.
  sayCommandFault(record);
}

/** A new command of the session answers what was said of its last ones. */
function clearCommandFaults(instanceId: string): void {
  for (const [key] of refusals.under(commandKey(instanceId, ""))) {
    refusals.delete(key);
  }
}

/**
 * A send whose command the hub never took — the socket was down, went down,
 * or no answer came: this tab's row for it did not go, with why, and offers
 * Try again and Edit. A send the hub has a record of is not this tab's to
 * say anything about (its row is the record's), and neither is a retry of a
 * failed send, which draws no row of its own until the hub takes it.
 */
function markUnreached(record: CommandRecord): void {
  const target = sessionsState.sessions[record.sessionId];
  const row = target?.local.find((message) => message.id === record.commandId);
  if (!(target && row)) {
    return;
  }
  row.state = "unreached";
  row.metadata = {
    ...row.metadata,
    sendFailed: record.reason ?? "The hub never took it.",
  };
  target.rev += 1;
}

/**
 * Whether the card that asked is still on screen to render its own refusal.
 * The link is kept here because the wire payload correlates on the PERMISSION's
 * request id while the ledger correlates on the COMMAND's — nothing else joins
 * the two.
 */
const answerSurfaces = new Map<
  string,
  {
    instanceId: string;
    /** The session a proposal's card is drawn in (`originInstanceId`), when it is not `instanceId`. */
    origin?: string;
    requestId: string;
  }
>();

/**
 * Kept only as long as the ledger keeps the record it belongs to: an answer
 * that succeeded is never asked about again, so its link would otherwise be a
 * slow leak on the busiest control path there is.
 */
function rememberAnswerSurface(
  commandId: string,
  instanceId: string,
  requestId: string
): void {
  for (const known of [...answerSurfaces.keys()]) {
    if (!streamState.commands[known]) {
      answerSurfaces.delete(known);
    }
  }
  for (const [asked, known] of [...answers]) {
    if (!streamState.commands[known]) {
      answers.delete(asked);
    }
  }
  const origin = sessionsState.sessions[instanceId]?.pending.find(
    (parked) => parked.requestId === requestId
  )?.originInstanceId;
  answerSurfaces.set(commandId, {
    instanceId,
    requestId,
    ...(origin ? { origin } : {}),
  });
}

/**
 * Whether a card holding this command is STILL RENDERED, re-derived from the
 * same predicate the pane renders by rather than from anything this file
 * wishes were true — `session.pending`, minus the delegate asks a parent's
 * queue filters out (`parked` in SessionPane; `routedToParent` in
 * transcript/present.ts).
 *
 * Checked against both dialects, because they answer it differently and both
 * answers are right:
 *
 * - LEGACY. The control dialect puts the answer on the wire and clears
 *   `pending` only afterwards, so a socket that throws leaves the card exactly
 *   where it was. The card renders "Couldn't send that answer." off the very
 *   record that failed — so this returns true and the composer stays quiet. That
 *   is the double report this rule exists to prevent, and it only works
 *   because the surface is now registered BEFORE the submit that can fail
 *   inside it; registered afterwards there was nothing here to find.
 * - STREAM. The answer's effect clears `pending` only once the hub has taken
 *   it, so a refused answer leaves the ask parked: the session's card and the
 *   Needs row (`answerFor`) both read the refusal off the record, and this
 *   returns true. It returns false only when the ask has gone some other way
 *   meanwhile, and then the composer's line is the report.
 */
function answerCardStillParked(record: CommandRecord): boolean {
  const surface = answerSurfaces.get(record.commandId);
  answerSurfaces.delete(record.commandId);
  if (!surface) {
    return false;
  }
  return (
    sessionsState.sessions[surface.instanceId]?.pending.some(
      (parked) =>
        parked.requestId === surface.requestId && !routedToParent(parked)
    ) ?? false
  );
}

/** The last command sweep, so a busy socket does not re-scan the tracker per frame. */
let lastSweep = 0;

/**
 * Ages the command tracker on inbound traffic rather than on a timer: a
 * connected dashboard receives a pulse about once a second, and a dashboard
 * receiving nothing at all is one whose disconnect has already called its
 * commands off.
 */
export function sweepOnTraffic(): void {
  const now = Date.now();
  if (now - lastSweep < 1000) {
    return;
  }
  lastSweep = now;
  // With the host: a sweep without it fails records that
  // {@link StreamHost.noteFailure} never hears about — silence, by omission.
  sweepCommands(streamState, now, streamHost);
  // The outbox ages on the same beat as the ledger it shadows. Pruning only
  // when a NEW send arrives — which is what it did — meant a Try again could
  // outlive the payload behind it by however long the operator stayed quiet.
  pruneOutbox();
}

/**
 * The last answer sent to each parked ask, by the ask's request id: any
 * surface showing the ask (its session's card, its Needs row) reads that
 * answer's stage, whichever of them sent it. Kept as long as the ledger
 * keeps the record.
 */
const answers = new SvelteMap<string, string>();

/** The record of the last answer sent to the ask `requestId`, if the ledger still keeps it. */
export function answerFor(requestId: string): CommandRecord | null {
  const commandId = answers.get(requestId);
  return commandId ? commandRecord(commandId) : null;
}

/**
 * The "Already answered" line of an ask that settled while an answer of this
 * tab's to it was still out, by request id: said if the hub refuses ours (it
 * lost to another device), dropped once ours is the one applied.
 */
const answeredWhileOurs = new Map<string, Message>();

/** Whether this tab answered the ask `requestId` itself, with an answer the hub has not refused. */
function answeredHere(requestId: string): boolean {
  const record = answerFor(requestId);
  return record !== null && record.stage !== "failed";
}

/** What each command kind carries, in the shape the caller already has to hand. */
interface CommandIntents {
  interrupt: Record<string, never>;
  "permission.answer": { requestId: string; result: PermissionResult };
  /** `replaces`: the failed send this one retries, which the hub then retires. */
  send: { text: string; extras?: SendExtras; replaces?: string };
  /**
   * Takes back a queued or failed send. `replace`: the words that go in its
   * place once it is withdrawn (a queued message's edit), under
   * `replacementId`, known before it goes so the words can fly into its row;
   * none, the message is removed (Remove from queue, a failed send's Remove).
   */
  "send.withdraw": {
    sendId: string;
    replace?: {
      extras: SendExtras;
      replacement: string;
      replacementId: string;
    };
  };
  "set-effort": { effort: EffortLevel };
  "set-model": { model: string };
  "set-permission-mode": { mode: PermissionMode };
}

/** One command to submit: its kind, and the intent that kind takes. */
export type CommandRequest = {
  [K in CommandKind]: { kind: K; intent: CommandIntents[K] };
}[CommandKind];

/**
 * The wire payload for a kind: exactly what the hub's relay operation for it
 * takes. `requestId` is the command id — the correlation the control path
 * already has, reused rather than a second one invented alongside it.
 */
function wirePayload(
  request: CommandRequest,
  instanceId: string,
  commandId: string
): SendPayload | ControlPayload | { sendId: string } {
  const controlPayload = (method: string, args: unknown[]): ControlPayload => ({
    instanceId,
    requestId: commandId,
    method,
    args,
  });
  switch (request.kind) {
    case "send.withdraw":
      return { sendId: request.intent.sendId };
    case "send": {
      const { text, extras, replaces } = request.intent;
      // The command's id is the message's: one identity from the press on. A
      // retry names the failed send it stands in for.
      return {
        instanceId,
        message: {
          ...userMessage(text, commandId),
          ...(replaces ? { replaces } : {}),
        },
        ...extras,
      };
    }
    case "permission.answer": {
      const { requestId, result } = request.intent;
      return {
        instanceId,
        requestId,
        method: RESOLVE_PERMISSION,
        args: [requestId, result],
      };
    }
    case "interrupt":
      return controlPayload("interrupt", []);
    case "set-model":
      return controlPayload("setModel", [request.intent.model]);
    case "set-permission-mode":
      return controlPayload("setPermissionMode", [request.intent.mode]);
    case "set-effort":
      return controlPayload("setEffort", [request.intent.effort]);
    default:
      // A kind the contract grew and this map did not: the type check names
      // it here, and a kind off the wire throws rather than being sent as
      // whatever the last branch happened to be.
      return unhandled("command kind", request);
  }
}

/**
 * Submits an operator action as an acknowledged transaction and returns the id
 * its stages are readable under ({@link commandRecord},
 * {@link latestCommandFor}). The envelope goes to the hub and the hub's acks
 * move the stages, so nothing local is fabricated on the way.
 */
export function submitCommand(
  instanceId: string,
  machineId: string,
  request: CommandRequest,
  /**
   * Minted by the caller when it has to know the id before the command goes
   * out — the composer, whose text flies into the row a send's id keys.
   * Otherwise minted here, FIRST, before anything that can throw, so there is
   * an id to fail under.
   */
  commandId = newId()
): string {
  const { kind } = request;
  // A bench's hub answers it in place of the wire (dev only).
  const bench = standingBench();
  if (import.meta.env.DEV && bench) {
    bench(instanceId, kind, request.intent);
    return commandId;
  }
  // Everything below either reaches the ledger or becomes a record in it;
  // nothing reaches the caller as an exception.
  const settlesAt = SETTLES_AT[kind];
  // A new command answers what was said of the last ones.
  clearCommandFaults(instanceId);
  switch (request.kind) {
    case "set-model":
      rememberControlAsk(
        commandId,
        machineId,
        request.intent.model ?? undefined
      );
      break;
    case "set-effort":
      rememberControlAsk(
        commandId,
        machineId,
        request.intent.effort ?? undefined
      );
      break;
    case "set-permission-mode":
      rememberControlAsk(
        commandId,
        machineId,
        request.intent.mode ?? undefined
      );
      break;
    case "interrupt":
      rememberControlAsk(commandId, machineId, undefined);
      break;
    case "send":
    case "send.withdraw":
    case "permission.answer":
      break;
    default:
      unhandled("command kind", request);
  }

  // REGISTERED BEFORE ANYTHING THAT CAN FAIL, and that ordering is the whole
  // point of these two lines being here rather than after the submit.
  //
  // `noteFailure` fires SYNCHRONOUSLY from inside the ledger — a refused
  // dispatch, a payload that could not be built —
  // so anything the failure reporter needs in order to know who owns the
  // failure has to already exist when the submit is called. Registered
  // afterwards, as these were, the reporter saw an empty registry on every
  // synchronous failure and announced a toast for a failure a card was
  // already rendering: one failure, two reports. And the outbox, written
  // afterwards, held nothing at all when the throw happened before the wire —
  // the operator got a toast and their typed words were gone, which is the
  // original defect wearing a different hat.
  if (request.kind === "send") {
    const { text, extras, replaces } = request.intent;
    rememberSend(commandId, instanceId, machineId, text, extras ?? {});
    // Kept past a reload too, until it settles (send-store.ts).
    keepSend({
      at: Date.now(),
      commandId,
      extras: extras ?? {},
      instanceId,
      machineId,
      text,
      ...(replaces ? { replaces } : {}),
    }).catch((error: unknown) =>
      console.warn(`[cawco] send ${commandId} not kept for a reload`, error)
    );
  }
  if (request.kind === "permission.answer") {
    const { requestId } = request.intent;
    rememberAnswerSurface(commandId, instanceId, requestId);
    answers.set(requestId, commandId);
  }

  let payload: object;
  let effects: StreamEffects | undefined;
  try {
    // `provenance` rides inside the payload rather than as a new envelope field —
    // CommandEnvelope.payload is already `unknown` on the wire, so this needs no
    // protocol change, and the hub's `command()` spreads it straight through to
    // `relaySend` untouched. No `viewId` here — it would just repeat the
    // envelope's own `instanceId`. `clientId` is this page's; `presenceId` is
    // the tab's presence (presence.ts), whose log says what it had in front,
    // so a send is read against what its own tab showed.
    const provenance = {
      clientId: currentClientId(),
      presenceId: presenceClientId(),
    };
    payload = {
      ...wirePayload(request, instanceId, commandId),
      provenance,
    };
    effects = streamEffectsFor(instanceId, request, commandId);
  } catch (error) {
    // THE CONTRACT THIS FUNCTION SHARES WITH THE LEDGER: it never throws.
    //
    // `submitCommand` in stream.ts documents "never throws: the stage IS the
    // report" — but the assembly above runs BEFORE that function is reached,
    // and a throw here escapes the ledger entirely. That is not hypothetical:
    // `currentClientId()` reached `crypto.randomUUID`, which does not exist on
    // a plain-http origin, so every operator action on a tailnet address threw
    // out of this line and vanished. Converting the throw into a failed record
    // makes the whole CLASS impossible — a bug in payload assembly is now a
    // failed command wearing its own exception, for all six kinds, instead of
    // a dead composer.
    //
    // The row goes in FIRST, and only here: on every other path the effects'
    // `submitted` draws it, and that did not run. Without it a
    // payload-assembly bug leaves the reason with no row to stamp, no Try
    // again, and no Edit — recoverable text
    // nobody can reach. It is wrapped because it is the one thing left that
    // could throw, and a throw from a catch block is the silence this whole
    // function exists to abolish.
    if (request.kind === "send") {
      const { text, extras, replaces } = request.intent;
      try {
        noteSendSubmitted(instanceId, text, extras ?? {}, commandId, replaces);
      } catch {
        // The composer's notice is then the whole report, which is a worse
        // outcome than a failed ghost but an infinitely better one than nothing.
      }
    }
    return failLocally(
      streamState,
      streamHost,
      { commandId, sessionId: instanceId, kind, settlesAt },
      messageOf(error)
    );
  }

  const id = submitTrackedCommand(streamState, streamHost, {
    commandId,
    // NOTE: carries instanceId, not a harness session id.
    sessionId: instanceId,
    machineId,
    kind,
    settlesAt,
    payload,
    streamEffects: effects,
  });
  return id;
}

/**
 * Where each kind's protocol stops talking. Declared once, here, because the
 * question "what is this kind's last word?" has exactly one right answer per
 * kind and re-deriving it at each call site is how a delivered message gets
 * retro-declared a failure. See {@link SettleStage}: the hub answers a `send`
 * with `accepted` and never with `applied`; the control kinds get a second
 * word when their `control_result` comes back.
 */
const SETTLES_AT: Record<CommandKind, SettleStage> = {
  "send.withdraw": "applied",
  send: "accepted",
  "permission.answer": "applied",
  interrupt: "applied",
  "set-model": "applied",
  "set-permission-mode": "applied",
  "set-effort": "applied",
};

/* ---- the outbox: what makes a refused send recoverable ----------------- */

/** One unsent message, whole — the payload a retry needs and the echo cannot hold. */
interface OutboxEntry {
  at: number;
  extras: SendExtras;
  instanceId: string;
  machineId: string;
  text: string;
}

/**
 * Every send this tab has dispatched and not yet seen taken, with its FULL
 * payload.
 *
 * The transcript echo is not enough to resend from: `localUserMessage` keeps
 * attachments as name+length and images as display data URIs — a deliberate
 * thumbnail economy — so a retry built from the echo would quietly drop what
 * was attached. The bytes live here instead, and only here.
 *
 * Bounds are OUR CHOICE, deliberately aligned to the ledger's own
 * ({@link SETTLED_COMMAND_LIMIT} = 50, {@link SETTLED_COMMAND_TTL_MS} = 5min):
 * an entry whose record the sweep has already forgotten can no longer be
 * offered a Try again, so retaining it past that point is dead weight holding
 * base64 image data alive.
 */
const sendOutbox = new Map<string, OutboxEntry>();

/**
 * Bumped on every mutation of the Map above, and read by {@link canResend}.
 *
 * A plain Map is not reactive, and the affordance it backs has to DISAPPEAR
 * the moment the payload behind it is pruned. Rendered off the Map alone,
 * "Try again" and "Edit" were painted once — when the failure landed — and
 * then kept standing after the outbox had aged the payload out five minutes
 * later, so pressing either did nothing at all and said nothing about it.
 * A dead button is a silent failure with a cursor on it. This is the cheapest
 * honest fix: one number, rather than deep-proxying every base64 image in the
 * outbox through `$state` just to be told when a key was deleted.
 */
let outboxVersion = $state(0);

/**
 * Whether a failed send can still actually be re-sent or edited — i.e. whether
 * the full payload (attachments and image bytes included, which the transcript
 * echo does not keep) is still in hand. The row asks before offering the
 * affordance, so the answer is "no button" rather than "a button that lies".
 */
export function canResend(commandId: string): boolean {
  // Reading the version is what subscribes the caller's `$derived` to the Map.
  return outboxVersion >= 0 && sendOutbox.has(commandId);
}

function rememberSend(
  commandId: string,
  instanceId: string,
  machineId: string,
  text: string,
  extras: SendExtras
): void {
  sendOutbox.set(commandId, {
    instanceId,
    machineId,
    text,
    extras,
    at: Date.now(),
  });
  outboxVersion += 1;
  pruneOutbox();
}

/**
 * Drops what can no longer be retried: anything the hub has taken custody of
 * (the daemon holds the real payload from `accepted` on), anything whose record
 * the ledger has already forgotten, and anything older or more numerous than
 * the ledger's own bounds. A `failed` entry is the one thing kept — that is the
 * entry Try again and Edit exist for.
 */
function pruneOutbox(): void {
  const before = sendOutbox.size;
  const now = Date.now();
  for (const [commandId, entry] of sendOutbox) {
    const record = streamState.commands[commandId];
    if (record?.stage === "submitted") {
      continue;
    }
    const stale = now - entry.at >= SETTLED_COMMAND_TTL_MS;
    // A MISSING record is not evidence of anything and must not be read as
    // custody. The entry is now written before the submit that creates the
    // record — it has to be, or a throw during payload assembly leaves nothing
    // to recover — so for one instant every fresh entry has no record, and
    // treating that as "the hub has it" deleted the payload the moment it was
    // stored. The absent-record case is covered by `stale` anyway: a record the
    // ledger has already forgotten is at least as old as the TTL below.
    const taken = record ? record.stage !== "failed" : false;
    if (stale || taken) {
      sendOutbox.delete(commandId);
    }
  }
  if (sendOutbox.size > SETTLED_COMMAND_LIMIT) {
    const oldest = [...sendOutbox.entries()]
      .filter(([id]) => streamState.commands[id]?.stage !== "submitted")
      .sort((a, b) => a[1].at - b[1].at);
    for (const [commandId] of oldest.slice(
      0,
      Math.max(0, oldest.length - SETTLED_COMMAND_LIMIT)
    )) {
      sendOutbox.delete(commandId);
    }
  }
  // Only when something actually went, so the common no-op sweep does not
  // invalidate every row's derivation once a second.
  if (sendOutbox.size !== before) {
    outboxVersion += 1;
  }
}

/** Removes the row a send that never reached the hub left behind. */
export function dropSendEcho(instanceId: string, commandId: string): void {
  const target = sessionsState.sessions[instanceId];
  if (!target) {
    return;
  }
  target.local = target.local.filter((message) => message.id !== commandId);
  place(target);
}

/**
 * Sends again, from the outbox, a message that never reached the hub — under
 * its own uuid, on its own row, which goes back to sending where it stands.
 * The uuid is what makes it safe: a hub that did take the first one after
 * all has its record, answers with that, and hands the machine nothing twice.
 * No-op if the outbox entry has aged out. Never throws.
 */
export function retrySend(commandId: string): void {
  const entry = sendOutbox.get(commandId);
  if (!entry) {
    return;
  }
  // Through `submitCommand`, not around it: a new command record under the
  // same id, whose stages the row reads.
  submitCommand(
    entry.instanceId,
    entry.machineId,
    { kind: "send", intent: { text: entry.text, extras: entry.extras } },
    commandId
  );
}

/**
 * The retry out for each failed send, by that send's uuid: the command its
 * row reads for whether the retry is still on its way, or did not go either.
 */
const retries = $state<Record<string, string>>({});

/** The command retrying the failed send `uuid`, while this tab knows of one. */
export function retryOf(uuid: string): CommandRecord | null {
  const commandId = retries[uuid];
  return commandId ? commandRecord(commandId) : null;
}

/**
 * What a sent row carried, as a send carries it again: its texts, and its
 * files by the hub's reference (a row drawn from the hub's record names
 * every file it carried by one).
 */
function resentAttachments(message: Message): SendPayload["attachments"] {
  return message.metadata?.attachments?.flatMap<SendAttachment>(
    (attachment) => {
      if (attachment.kind === "text") {
        return [attachment];
      }
      const { name, mediaType, size, ref } = attachment;
      return ref ? [{ kind: "file" as const, name, mediaType, size, ref }] : [];
    }
  );
}

/**
 * A failed send as a send carries it — its words, texts, files and pictures,
 * from its record — for sending it again or starting a session with it.
 */
export async function failedSendPayload(
  message: Message
): Promise<{ text: string; extras: SendExtras }> {
  const images = await Promise.all(
    (message.metadata?.images ?? []).flatMap(({ src, mediaType }) =>
      src ? [imageBytes(src, mediaType)] : []
    )
  );
  return {
    text: message.content,
    extras: { attachments: resentAttachments(message), images },
  };
}

/**
 * Sends again, as a new send that replaces it, a send the hub failed — from
 * any screen, after any reload: the words and pictures are the row's own,
 * from its record. The hub retires the failed one (`replaced`) as it takes
 * this one, and every screen folds the old row away as the new one arrives.
 */
export async function retryFailed(message: Message): Promise<void> {
  const { text, extras } = await failedSendPayload(message);
  retries[message.id as string] = submitCommand(
    message.instanceId,
    session(message.instanceId).machineId,
    { kind: "send", intent: { text, extras, replaces: message.id } }
  );
}

/** A picture's bytes as a send carries them: base64, with no `data:` prefix. */
async function imageBytes(
  src: string,
  mediaType: string
): Promise<{ mediaType: string; data: string }> {
  if (src.startsWith("data:")) {
    return { mediaType, data: src.slice(src.indexOf(",") + 1) };
  }
  const bytes = new Uint8Array(await (await fetch(src)).arrayBuffer());
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return { mediaType, data: btoa(binary) };
}

/**
 * Hand a failed message's payload back to the composer for editing: drops the
 * failed echo, writes { text, extras } into the session's restore slot. The
 * pane consumes the slot in an $effect (binding `draft` and calling
 * Composer.restore(extras)) and clears it. No-op if the outbox entry is gone.
 * Never throws.
 */
export function restoreDraft(commandId: string): void {
  const entry = sendOutbox.get(commandId);
  if (!entry) {
    return;
  }
  sendOutbox.delete(commandId);
  outboxVersion += 1;
  forgetSend(commandId).catch(() => undefined);
  dropSendEcho(entry.instanceId, commandId);
  restoreComposer(entry.instanceId, entry.text, entry.extras);
}

/**
 * The sends an earlier load of this page kept and the hub never took
 * (send-store.ts), sent again under their own ids, oldest first, as this
 * page starts: each draws its row again and waits, as any send does, for
 * the socket (`resumePendingSends`). The hub takes a repeat of an id as
 * the same send. One the hub refused is drawn refused again, in its words,
 * with Try again and Edit, and goes only when the person sends it; past
 * the time those stand (the ledger's own), it is let go.
 */
export async function resumeKeptSends(): Promise<void> {
  for (const kept of await keptSends()) {
    if (streamState.commands[kept.commandId]) {
      continue;
    }
    if (kept.refused) {
      if (Date.now() - kept.refused.at >= SETTLED_COMMAND_TTL_MS) {
        forgetSend(kept.commandId).catch(() => undefined);
        continue;
      }
      rememberSend(
        kept.commandId,
        kept.instanceId,
        kept.machineId,
        kept.text,
        kept.extras
      );
      noteSendSubmitted(
        kept.instanceId,
        kept.text,
        kept.extras,
        kept.commandId,
        kept.replaces
      );
      failLocally(
        streamState,
        streamHost,
        {
          commandId: kept.commandId,
          sessionId: kept.instanceId,
          kind: "send",
          settlesAt: SETTLES_AT.send,
        },
        kept.refused.reason
      );
      continue;
    }
    submitCommand(
      kept.instanceId,
      kept.machineId,
      {
        kind: "send",
        intent: {
          text: kept.text,
          extras: kept.extras,
          ...(kept.replaces ? { replaces: kept.replaces } : {}),
        },
      },
      kept.commandId
    );
  }
}

function restoreComposer(
  instanceId: string,
  text: string,
  extras: SendExtras
): void {
  // Exactly one slot is ever waiting. A slot holds the whole payload — base64
  // image data included — and it is only ever emptied by the pane that mounts
  // to consume it, so an "Edit" pressed on a session the reader then closes
  // would otherwise pin those bytes for the life of the tab. Keeping only the
  // newest bounds it at one without needing anyone to come back and collect.
  for (const held of Object.keys(restoreSlots)) {
    if (held !== instanceId) {
      delete restoreSlots[held];
    }
  }
  restoreSlots[instanceId] = { text, extras };
}

/** A pending send can be taken back only from a harness that queues sends. */
export function canWithdraw(message: Message): boolean {
  return (
    message.state === "pending" &&
    traitsOf(sessionsState.sessions[message.instanceId]?.harness).queuesSends
  );
}

/**
 * Puts new words in place of a queued send: withdraws it, and once the hub
 * says it was withdrawn, sends the words with its pictures and files. Returns
 * the withdraw's command id, whose record says how it went (`applied` with
 * the outcome `withdrawn`, or the session read the send first), and the id
 * the replacement goes out under.
 */
export async function replaceQueued(
  message: Message,
  replacement: string
): Promise<{ withdraw: string; replacement: string }> {
  if (!canWithdraw(message)) {
    throw new Error("This message can no longer be edited in the queue.");
  }
  const images = await Promise.all(
    (message.metadata?.images ?? []).flatMap(({ src, mediaType }) =>
      src ? [imageBytes(src, mediaType)] : []
    )
  );
  const replacementId = newId();
  const withdraw = submitCommand(
    message.instanceId,
    session(message.instanceId).machineId,
    {
      kind: "send.withdraw",
      intent: {
        sendId: message.id,
        replace: {
          extras: {
            attachments: resentAttachments(message),
            images,
          },
          replacement,
          replacementId,
        },
      },
    }
  );
  return { withdraw, replacement: replacementId };
}

/**
 * Takes a queued send out of the queue, or a failed send out of the
 * conversation, with nothing in its place. Returns the withdraw's command id,
 * whose record says how it went: `applied` with the outcome `withdrawn` (its
 * row folds away on every screen), or the session read it first.
 */
export function removeSend(message: Message): string {
  return submitCommand(
    message.instanceId,
    session(message.instanceId).machineId,
    { kind: "send.withdraw", intent: { sendId: message.id } }
  );
}

/**
 * Lets go of a send that never reached the hub, from this tab's outbox and
 * its row: nothing of it was ever said. Never throws.
 */
export function discardUnreached(commandId: string): void {
  const entry = sendOutbox.get(commandId);
  if (entry) {
    sendOutbox.delete(commandId);
    outboxVersion += 1;
    dropSendEcho(entry.instanceId, commandId);
  }
  forgetSend(commandId).catch(() => undefined);
}

/**
 * A failed send's words, texts, files and pictures back in its session's
 * composer to be written again, and the failed send taken out of the
 * conversation: the composer holds it now. Its pictures are read from the
 * hub first; one that can't be read throws, and nothing moves.
 */
export async function editFailed(message: Message): Promise<string> {
  const { text, extras } = await failedSendPayload(message);
  restoreComposer(message.instanceId, text, extras);
  return removeSend(message);
}

/**
 * What a pane owes its composer, per session. A slot rather than a call
 * because the row that offers "Edit" is two components away from the state
 * that holds the draft — the store is the only channel they share, and
 * threading a prop through the transcript for this would make the transcript a
 * conduit for something it has no part in.
 */
const restoreSlots = $state<
  Record<string, { text: string; extras: SendExtras } | null>
>({});

/** The payload waiting to go back into this session's composer, if any. */
export function pendingRestore(
  instanceId: string
): { text: string; extras: SendExtras } | null {
  return restoreSlots[instanceId] ?? null;
}

/** Consumed exactly once by the pane that took it. */
export function clearRestore(instanceId: string): void {
  restoreSlots[instanceId] = null;
}

function announceSendFailure(record: CommandRecord): void {
  // A notice is a sentence about a session, so it dies with the session. These
  // are small, but "small and unbounded" is still unbounded on a board a
  // reader leaves open for a week.
  for (const held of Object.keys(sendFailureNotices)) {
    if (held !== record.sessionId && !sessionsState.sessions[held]) {
      delete sendFailureNotices[held];
    }
  }
  sendFailureNotices[record.sessionId] = record.reason
    ? `Message not sent: ${record.reason}`
    : "Message not sent.";
}

/**
 * The LOCAL half of each command kind — everything around the wire call. Only
 * the envelope goes out, and skipping the local half is how a sent message
 * ended up with no row until the hub answered, an answered permission stayed
 * on screen, and a stopped session kept reading "working". These closures are
 * that half, run by the tracker at the submit and settle transitions.
 *
 * Honest gap, carried to protocol v2: a command does not revive a dead
 * session — it fails with the hub's own reason instead. The revive belongs on
 * the hub side of the command, not in every client.
 */
function streamEffectsFor(
  instanceId: string,
  request: CommandRequest,
  commandId: string
): StreamEffects | undefined {
  const target = session(instanceId);
  switch (request.kind) {
    case "send.withdraw": {
      const { sendId, replace } = request.intent;
      return {
        settled: (stage) => {
          if (
            stage === "applied" &&
            commandRecord(commandId)?.outcome === "withdrawn"
          ) {
            const block = target.messages.find(
              (message) => message.id === sendId
            );
            if (block) {
              take(target, block, "removed");
              place(target);
            }
            if (replace) {
              submitCommand(
                instanceId,
                target.machineId,
                {
                  kind: "send",
                  intent: {
                    text: replace.replacement,
                    extras: replace.extras,
                    replaces: sendId,
                  },
                },
                replace.replacementId
              );
            }
          }
        },
      };
    }
    case "send": {
      const { text, extras, replaces } = request.intent;
      // The row is keyed by the id of the command it IS, which is the whole
      // join between a rendered message and the ledger's word on it.
      return {
        submitted: () =>
          noteSendSubmitted(
            instanceId,
            text,
            extras ?? {},
            commandId,
            replaces
          ),
        // Taken: no reload sends it again. Refused: kept with the hub's
        // words, so a reload draws it refused, Try again and Edit standing.
        settled: (stage, reason) => {
          (stage === "failed"
            ? refuseSend(commandId, reason ?? "The hub refused it.")
            : forgetSend(commandId)
          ).catch(() => undefined);
        },
      };
    }
    case "interrupt":
      return {
        submitted: () => {
          target.busy = false;
          clearTurnPhase(target);
          trackWorking(target);
        },
      };
    case "permission.answer": {
      const { requestId } = request.intent;
      // The ask stands, its pressed answer pending, until the hub has taken
      // the answer; refused, it stands still, the refusal under its buttons
      // (the session's card, the Needs row), and can be answered again.
      return {
        settled: (stage) => {
          const elsewhere = answeredWhileOurs.get(requestId);
          answeredWhileOurs.delete(requestId);
          if (stage === "failed") {
            // The hub refused ours after the ask settled: another device's
            // answer won, and the line says what won and where. A socket
            // that dropped with ours out leaves it unknown whose won, so
            // nothing is said of it.
            if (elsewhere && commandRecord(commandId)?.refusedByHub) {
              addNote(target, elsewhere);
            }
            return;
          }
          target.pending = target.pending.filter(
            (p) => p.requestId !== requestId
          );
          trackWorking(target);
        },
      };
    }
    case "set-model": {
      const { model } = request.intent;
      const previous = target.model;
      return {
        submitted: () => {
          target.model = model;
        },
        settled: (stage) => {
          if (stage === "failed") {
            target.model = previous;
          } else {
            detach(persistSettings(instanceId, { model }), "persistSettings");
          }
        },
      };
    }
    case "set-permission-mode": {
      const { mode } = request.intent;
      const previous = target.permissionMode;
      return {
        submitted: () => {
          target.permissionMode = mode;
        },
        settled: (stage) => {
          if (stage === "failed") {
            target.permissionMode = previous;
          } else {
            detach(
              persistSettings(instanceId, { permissionMode: mode }),
              "persistSettings"
            );
          }
        },
      };
    }
    case "set-effort": {
      const { effort } = request.intent;
      const previous = target.effort;
      return {
        submitted: () => {
          target.effort = effort;
        },
        // A switch that lands is followed by the agent's reading of it, which
        // the hub writes on the row; only a refused one is undone here.
        settled: (stage) => {
          if (stage === "failed") {
            target.effort = previous;
          }
        },
      };
    }
    default:
      return undefined;
  }
}

function userMessage(text: string, uuid: string): SendPayload["message"] {
  return {
    type: "user",
    uuid,
    message: { role: "user", content: text },
    parent_tool_use_id: null,
    // Stamped, not implied. The SDK treats an unstamped message as
    // unattributed and fails it closed at the gates that ask whether a human
    // said this — so a typed sentence has to say that it was typed.
    origin: { kind: "human" },
  };
}

/**
 * What a send does to the LOCAL store: the row it draws under the message's
 * own uuid (`sending`, at the end, until the hub's record for it lands on the
 * same row), the busy flip, the working clock.
 */
export function noteSendSubmitted(
  instanceId: string,
  text: string,
  extras: SendExtras,
  commandId: string,
  /**
   * The failed send this one retries. It draws no row until the hub takes
   * it: then its record's row arrives as the failed one folds away.
   */
  replaces?: string
): void {
  const target = session(instanceId);
  const drawn = target.local.find((message) => message.id === commandId);
  if (drawn) {
    // Try again on a send that never reached the hub: the same row, on its
    // way again.
    const { sendFailed: _failed, ...kept } = drawn.metadata ?? {};
    drawn.state = "sending";
    drawn.metadata = kept;
  } else if (
    replaces === undefined &&
    // A send the hub already placed is drawn by the hub's row for it.
    !target.messages.some((message) => message.id === commandId)
  ) {
    target.local.push(localUserMessage(instanceId, commandId, text, extras));
    place(target);
  }
  // A new attempt replaces the last one's announcement rather than stacking on
  // it: the live region says what is true now, not what was true before.
  sendFailureNotices[instanceId] = "";
  target.busy = true;
  // Before any frame: the whole point of the clock is the wait for the first one.
  trackWorking(target);
}
