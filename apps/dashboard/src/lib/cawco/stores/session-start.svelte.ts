/**
 * Starting a session: a spawn and its first send, a send held until the
 * session it waits on is up, and a fork from a turn; each spawn answered by
 * the row the hub opens for it.
 */

import { type Bounded, readWithin } from "@cawco/core/bounded";
import { detach } from "@cawco/core/detach";
import type { MachineHarnessReport } from "@cawco/core/harness";
import type {
  EffortLevel,
  HarnessKind,
  PermissionMode,
} from "@cawco/core/harness/kinds";
import type { NamedSpawn, SpawnPayload } from "@cawco/core/protocol";
import { unhandled } from "@cawco/core/unhandled";
import { CONTROL_TIMEOUT_MS } from "#lib/config.js";
import { newId } from "#lib/platform/id.js";
import {
  ask,
  rereadHub,
  send,
  settle,
  standingBench,
} from "../hub/socket.svelte";
import { instanceForSession } from "../links";
import { unpickedMode } from "../permission-modes";
import type { SendExtras } from "../send-store";
import { subscribeSession } from "../stream";
import { boardState, instanceIndex } from "./board.svelte";
import {
  dropSendEcho,
  noteSendSubmitted,
  submitCommand,
} from "./commands.svelte";
import { streamHost, streamState } from "./ledger.svelte";
import { type SessionState, session, sessionsState } from "./sessions.svelte";

/**
 * Spawns the hub has not answered yet: the request each waits on, by the
 * instance it asked for. The hub refuses one with an error frame under that
 * request, and takes one by opening its row ({@link spawnSession}).
 */
const opening = new Map<string, string>();

/** A spawn the hub took is answered by the row it opened. */
export function settleOpenings(): void {
  for (const [id, requestId] of opening) {
    if (instanceIndex.byId.has(id)) {
      opening.delete(id);
      settle(requestId, (waiter) => waiter.resolve(undefined));
    }
  }
}

/**
 * Settles once `ready` reads true, read again whenever what it reads changes
 * (an effect, never a timer), or `unanswered` past `ms`.
 */
function whenTrue(ready: () => boolean, ms: number): Promise<Bounded<void>> {
  return readWithin(
    ms,
    (signal) =>
      new Promise<void>((resolve) => {
        const stop = $effect.root(() => {
          $effect(() => {
            if (ready()) {
              resolve();
              // Not from inside the effect it ends.
              queueMicrotask(() => stop());
            }
          });
        });
        signal.addEventListener("abort", () => stop(), { once: true });
      })
  );
}

/**
 * What `machineId` reports of `harness`, its permission modes among it. Which
 * modes a machine takes is its report's, so a start waits for the report (the
 * first fleet read, a machine whose report is on its way) up to {@link
 * CONTROL_TIMEOUT_MS}; one still missing then is the machine's own word.
 */
async function reportOf(
  machineId: string,
  harness: HarnessKind
): Promise<MachineHarnessReport | undefined> {
  await whenTrue(
    () =>
      boardState.fleetRead &&
      boardState.machines.find((row) => row.machineId === machineId)
        ?.harnesses !== undefined,
    CONTROL_TIMEOUT_MS
  );
  return boardState.machines
    .find((row) => row.machineId === machineId)
    ?.harnesses?.find((entry) => entry.harness === harness);
}

/**
 * A spawn as it leaves this dashboard: a model only when one was picked (none
 * runs on the harness's own default, never an empty string), and a permission
 * mode only when its harness has modes. What the path says stands: the New
 * Session form's choice, or the session's own on a revive, relaunch, rewind
 * or fork. A path that names none sends none, and the hub settles it
 * (`settleMode`): a session it has a row for runs on its own mode, else the
 * one last chosen for its harness on its machine, and anything else is
 * refused with why. Every new session's mode is chosen in the form (a start
 * with no form of its own opens it, a fork with none to carry too).
 */
export async function explicit(
  machineId: string,
  payload: NamedSpawn
): Promise<NamedSpawn> {
  const report = await reportOf(machineId, payload.harness);
  const { permissionMode, model, ...rest } = payload;
  // A harness with no permission modes (pi) is sent none, whatever the
  // path carried (a stored row's).
  const mode =
    report?.capabilities.permissionModes.length === 0
      ? undefined
      : permissionMode;
  return {
    ...rest,
    ...(model ? { model } : {}),
    ...(mode ? { permissionMode: mode } : {}),
  };
}

/**
 * Sends a spawn and returns the view it streams into once the hub has taken
 * it: its row is open. A spawn the hub refuses throws the hub's reason, and
 * nothing of it is kept here: no view, and no id for a caller to navigate to.
 * A spawn the hub did not answer in time is `unanswered`: whether it started
 * is not known, and nothing of it is kept here either.
 * Every session this dashboard starts, resumes or forks goes through here.
 */
async function start({
  machineId,
  instanceId = newId(),
  ...spawn
}: Omit<NamedSpawn, "instanceId"> & {
  machineId: string;
  /** The id it is asked under; one is minted when none is named. */
  instanceId?: string;
}): Promise<Bounded<SessionState>> {
  const requestId = newId();
  const payload = await explicit(machineId, { instanceId, ...spawn });
  let taken: Bounded<void>;
  const benchSpawn = standingBench()?.spawn;
  if (import.meta.env.DEV && benchSpawn) {
    // A bench's hub takes the start in place of the wire (dev only).
    await benchSpawn(machineId, payload);
    taken = { kind: "answered", value: undefined };
  } else {
    try {
      taken = await ask<void>(requestId, CONTROL_TIMEOUT_MS, () => {
        opening.set(instanceId, requestId);
        send({ verb: "spawn", machineId, instanceId, requestId, payload });
      });
    } finally {
      opening.delete(instanceId);
    }
  }
  switch (taken.kind) {
    case "unanswered":
      return taken;
    case "answered":
      break;
    default:
      unhandled("read", taken);
  }
  const created = session(instanceId);
  created.machineId = machineId;
  created.cwd = payload.cwd;
  created.harness = payload.harness;
  created.permissionMode = payload.permissionMode ?? null;
  // What was sent, so the header shows it during the wait for the first
  // init — which then corrects it to whatever the harness resolved it to.
  created.model = payload.model ?? null;
  created.scratch = Boolean(payload.scratch);
  return { kind: "answered", value: created };
}

/**
 * Starts a session on `machineId` and returns the id its route lives at, once
 * the hub has taken the spawn ({@link start}). A spawn the hub refuses throws
 * the hub's reason, and its first prompt is never sent.
 */
export async function spawnSession({
  instanceId,
  machineId,
  cwd,
  prompt,
  harness,
  permissionMode,
  model,
  effort,
  scratch,
  clean,
  bootstrap,
  projectId,
  account,
  extras = {},
  firstCommandId,
}: {
  /**
   * The id the session is asked for under, minted by the caller before it
   * asks, so a page reloaded while the hub answers finds it on the board
   * (spawn/parked); one is minted here when none is named.
   */
  instanceId?: string;
  machineId: string;
  cwd: string;
  prompt?: string;
  /** What rides the first message besides its words: its attachments and images, as a send carries them. */
  extras?: SendExtras;
  harness: HarnessKind;
  permissionMode?: PermissionMode;
  model?: string;
  effort?: EffortLevel;
  scratch?: SpawnPayload["scratch"];
  /** Start it clean, with no instruction context (core `SpawnPayload.clean`). */
  clean?: true;
  bootstrap?: SpawnPayload["bootstrap"];
  projectId?: string;
  /** The account picked for this session; absent: the hub places it. */
  account?: string;
  /** The id its first prompt goes under, drawn already ({@link drawFirstPrompt}). */
  firstCommandId?: string;
}): Promise<Bounded<string>> {
  const started = await start({
    ...(instanceId ? { instanceId } : {}),
    machineId,
    cwd,
    harness,
    permissionMode,
    model,
    effort,
    scratch,
    ...(clean ? { clean } : {}),
    bootstrap,
    projectId,
    ...(account ? { account } : {}),
  });
  switch (started.kind) {
    case "unanswered":
      // Whether it started is not known: no first prompt goes to a session nobody confirmed.
      return started;
    case "answered":
      break;
    default:
      unhandled("read", started);
  }
  sendFirstPrompt(
    started.value.instanceId,
    machineId,
    prompt,
    extras,
    firstCommandId
  );
  detach(rereadHub(), "rereadHub");
  return { kind: "answered", value: started.value.instanceId };
}

/**
 * A new session's first message, when it has words or files: sent once the
 * hub has taken the start, or once a page reloaded while it answered finds
 * the session on the board (spawn/parked).
 */
export function sendFirstPrompt(
  instanceId: string,
  machineId: string,
  prompt: string | undefined,
  extras: SendExtras,
  /** The row it goes as, drawn before its session was asked for ({@link drawFirstPrompt}). */
  commandId?: string
): void {
  const first = prompt?.trim() ?? "";
  if (first || extras.images?.length || extras.attachments?.length) {
    // Followed before its first message goes, on the socket that carries it:
    // that send's record is among the first frames the session's stream
    // carries, and a tab that joined after it would never hear it.
    subscribeSession(streamState, streamHost, instanceId);
    submitCommand(
      instanceId,
      machineId,
      { kind: "send", intent: { text: first, extras } },
      commandId
    );
  }
  // What the person sent while its start was still making it, after it, in
  // the order written, each under the row it was drawn as.
  const held = heldForStart.get(instanceId) ?? [];
  heldForStart.delete(instanceId);
  if (held.length > 0) {
    subscribeSession(streamState, streamHost, instanceId);
  }
  for (const one of held) {
    submitCommand(
      instanceId,
      machineId,
      { kind: "send", intent: { text: one.text, extras: one.extras } },
      one.commandId
    );
  }
}

/** A send written to a session its start is still making ({@link holdForStart}). */
export interface HeldSend {
  commandId: string;
  extras: SendExtras;
  text: string;
}

/**
 * The sends written to each session a start is still making, oldest first:
 * drawn as theirs, held in this tab, and sent after its first prompt once
 * its spawn has answered ({@link sendFirstPrompt}). The hub has no row to
 * hold them against yet, and refuses a send to an id it does not list.
 */
const heldForStart = new Map<string, HeldSend[]>();

/**
 * A new session's first message, drawn in its conversation before the
 * session is asked for (a project conversation's start, project/conversation.ts):
 * the person's words stand as theirs at once, the session at work after
 * them, as a send's own row stands (`noteSendSubmitted`). The send that
 * follows the spawn goes under `commandId` and takes this row; a start that
 * fails takes it back ({@link withdrawFirstPrompt}).
 */
export function drawFirstPrompt(
  instanceId: string,
  commandId: string,
  text: string,
  extras: SendExtras,
  /** Where it starts: its conversation can be written to before its row is listed. */
  where: { cwd: string; harness: HarnessKind; machineId: string }
): void {
  const target = session(instanceId);
  target.machineId ||= where.machineId;
  target.cwd ||= where.cwd;
  target.harness = where.harness;
  noteSendSubmitted(instanceId, text, extras, commandId);
}

/**
 * A send the person writes to a session its start is still making (its
 * pane `unborn`): drawn as theirs at once, as every send is, and held here
 * until its start answers, when it goes after the first prompt under the
 * same row ({@link sendFirstPrompt}). Never sent to an id the hub does not
 * list, which it would refuse.
 */
export function holdForStart(
  instanceId: string,
  text: string,
  extras: SendExtras,
  commandId: string
): string {
  noteSendSubmitted(instanceId, text, extras, commandId);
  heldForStart.set(instanceId, [
    ...(heldForStart.get(instanceId) ?? []),
    { commandId, text, extras },
  ]);
  return commandId;
}

/**
 * A start that failed, its words taken back: the first message drawn for
 * it and whatever was written to it while it started. Nothing of them went;
 * the held ones are answered, oldest first, for the caller to put back.
 */
export function withdrawFirstPrompt(
  instanceId: string,
  commandId: string
): HeldSend[] {
  const held = heldForStart.get(instanceId) ?? [];
  heldForStart.delete(instanceId);
  for (const drawn of [commandId, ...held.map((one) => one.commandId)]) {
    dropSendEcho(instanceId, drawn);
  }
  const target = sessionsState.sessions[instanceId];
  if (target) {
    target.busy = false;
  }
  return held;
}

/** Where a fork branches from: the conversation, its machine, folder and harness, and the answer it branches at. */
export interface ForkSource {
  at?: string;
  cwd: string;
  harness: HarnessKind;
  machineId: string;
  /**
   * The conversation itself goes on in the new session, where a fork
   * branches a copy of it into a spin-off: a transcript stored on a machine
   * that no session of the hub wraps, resumed as a session of CawCo's by
   * the person's first send on its page.
   */
  resumes?: true;
  sessionId: string;
}

/**
 * Branches a spin-off off a session (NEW.md §1): the same context carried into
 * a new SDK session, kept apart from mainline work until it is kept or
 * discarded. The hub reads the conversation it branches into the new view's
 * transcript. A fork the hub refuses throws the hub's reason ({@link start}).
 *
 * It runs on what its source runs on: the hub's row for the conversation
 * says what that is. A mode, model or effort given (the New Session form's
 * picks) stands over the source's. With no mode to run in (the source's row
 * records none) on a harness that has modes, nothing is sent and the answer
 * is `unchosen`: the New Session form opens on the fork, and Start waits for
 * a mode (spawn/new-session `startFork`).
 *
 * A source that `resumes` is started the same way with the conversation
 * itself: no branch and no spin-off, a session of CawCo's on the transcript
 * where it is stored, which its machine carries into the account it runs
 * on (agent claude.ts). It is given what the transcript ran with
 * ({@link resumeStored}), its mode among them, so it is never `unchosen`.
 * `commandId` is the row its first prompt was drawn as, when its sender
 * drew one.
 */
export async function forkSession({
  machineId,
  cwd,
  sessionId,
  harness,
  at,
  permissionMode,
  model,
  effort,
  prompt,
  extras = {},
  resumes,
  commandId,
  account,
}: ForkSource & {
  permissionMode?: PermissionMode;
  model?: string;
  effort?: EffortLevel;
  prompt?: string;
  extras?: SendExtras;
  commandId?: string;
  /** The account it starts on; absent: the hub places it. */
  account?: string;
}): Promise<Bounded<string> | { kind: "unchosen" }> {
  const source = instanceForSession(instanceIndex, sessionId, {
    machineId,
    cwd,
  });
  // A branch is a new session nobody picked a mode for, so a Full Send
  // source branches on Bypass (`unpickedMode`): Full Send is only ever a
  // confirmed choice, the form's.
  const mode =
    permissionMode ??
    (source?.permissionMode
      ? unpickedMode(source.permissionMode as PermissionMode)
      : undefined);
  if (!mode) {
    const report = await reportOf(machineId, harness);
    if (report?.capabilities.permissionModes.length !== 0) {
      return { kind: "unchosen" };
    }
  }
  const named = model || source?.model;
  const level = effort ?? source?.chosenEffort;
  const started = await start({
    machineId,
    cwd,
    harness,
    resume: {
      sessionKey: sessionId,
      ...(resumes ? {} : { fork: true }),
      ...(at ? { atMessage: at } : {}),
    },
    ...(resumes ? {} : { scratch: {} }),
    ...(account ? { account } : {}),
    ...(named ? { model: named } : {}),
    ...(mode ? { permissionMode: mode } : {}),
    ...(level ? { effort: level } : {}),
  });
  switch (started.kind) {
    case "unanswered":
      return started;
    case "answered":
      sendFirstPrompt(
        started.value.instanceId,
        machineId,
        prompt,
        extras,
        commandId
      );
      detach(rereadHub(), "rereadHub");
      return { kind: "answered", value: started.value.instanceId };
    default:
      unhandled("read", started);
  }
}
