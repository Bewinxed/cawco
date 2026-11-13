/**
 * The acts on a session's turns: what each of the person's own turns offers
 * (edit, retry, withdraw, rewind, fork), the rewind point behind a turn, an
 * edit sent again from there, and a relaunch.
 */

import type { Bounded } from "@cawco/core/bounded";
import { detach } from "@cawco/core/detach";
import type { PermissionMode } from "@cawco/core/harness/kinds";
import { traitsOf } from "@cawco/core/harness/traits";
import { relaunchOf } from "@cawco/core/relaunch";
import { HOUR_MS } from "@cawco/core/time";
import { unhandled } from "@cawco/core/unhandled";
import { CONTROL_TIMEOUT_MS } from "#lib/config.js";
import { newId } from "#lib/platform/id.js";
import { ask, rereadHub, send } from "../hub/socket.svelte";
import type { Message } from "../types";
import { instanceIndex, machineConnected } from "./board.svelte";
import { canResend, canWithdraw, submitCommand } from "./commands.svelte";
import {
  harnessOfSession,
  resumeKeyFor,
  settleStopped,
} from "./row-acts.svelte";
import { harnessCan } from "./session-detail.svelte";
import { explicit, type ForkSource } from "./session-start.svelte";
import { type SessionState, session, sessionsState } from "./sessions.svelte";
import { readOlderPage } from "./transcript-reads.svelte";

/** One action table for every surface that draws the reader's own turns. */
export function userTurnActions(message: Message): {
  edit: "queued" | "resend" | "restore" | null;
  fork: boolean;
  retry: boolean;
} {
  const target = sessionsState.sessions[message.instanceId];
  if (!target || message.type !== "user") {
    return { edit: null, fork: false, retry: false };
  }
  const delivered =
    message.type === "user" &&
    machineConnected(target.machineId) &&
    !!target.sessionId &&
    harnessCan(target, "rewind") &&
    rewindableTurns(target).has(message.id);
  const table = {
    pending: {
      edit: canWithdraw(message) ? ("queued" as const) : null,
      fork: false,
      retry: false,
    },
    sending: { edit: null, fork: false, retry: false },
    failed: { edit: null, fork: false, retry: true },
    unreached: {
      edit: canResend(message.id) ? ("restore" as const) : null,
      fork: false,
      retry: canResend(message.id),
    },
    cancelled: { edit: null, fork: false, retry: false },
    read: {
      edit:
        delivered && !target.busy && !target.relaunching
          ? ("resend" as const)
          : null,
      fork: delivered && harnessCan(target, "fork"),
      retry: false,
    },
  };
  return table[message.state ?? "read"];
}

/**
 * How long a start again asked during a turn waits for its answer: the
 * machine gives it once that turn has ended and the session runs again, and
 * a turn may run long.
 */
const RELAUNCH_AT_TURN_END_MS = HOUR_MS;

/**
 * `bypassPermissions` is a launch decision — the SDK refuses to switch a running
 * session into it — and so is `fullSend`, which runs the CLI in bypass. A
 * session that wants either from another mode is started again in place:
 * same instance id, same hub row, its own SDK session resumed, so the new
 * process reads the whole conversation back, once the turn it is in has
 * ended. A spin-off relaunches the same way; the agent keeps it in the
 * checkout it was already working in.
 */
export async function relaunchSession(
  instanceId: string,
  machineId: string,
  permissionMode: PermissionMode
): Promise<Bounded<void>> {
  const target = session(instanceId);
  // The one rule for starting a session again (core `relaunchOf`): on its
  // conversation when it has one, fresh under its id when its harness never
  // began one (a session switched before its first message), and not at all
  // when its conversation is gone.
  const plan = relaunchOf({
    sessionId: resumeKeyFor(instanceId),
    lastErrorKind: instanceIndex.byId.get(instanceId)?.lastErrorKind ?? null,
  });
  if (plan.kind === "refused") {
    throw new Error(plan.reason);
  }

  const requestId = newId();
  const payload = await explicit(machineId, {
    instanceId,
    cwd: target.cwd,
    harness: harnessOfSession(instanceId),
    ...(plan.kind === "resume"
      ? { resume: { sessionKey: plan.sessionKey } }
      : {}),
    // The process is replaced, on its own conversation: without this, a
    // resume for a session its machine runs is a recovery of that process,
    // which its machine keeps, and the new mode never reached it.
    relaunch: true,
    // A relaunch is a spawn like any other, so it has to say what it is: a spin-off
    // that stayed silent about it would come back as mainline work, untagged.
    scratch: target.scratch ? {} : undefined,
    permissionMode,
    // Only the mode is being changed, so the model the session was answering on
    // carries over, and the hub starts it at the effort chosen for it.
    model: target.model ?? undefined,
    requestId,
  });

  const previous = target.permissionMode;
  // A turn is never cut for it: its machine starts it again once the turn
  // running now has ended (agent session.ts `#turnEnded`), and answers then.
  const inTurn = target.busy || target.pending.length > 0;
  target.permissionMode = permissionMode;
  target.relaunching = true;
  try {
    const relaunched = await ask<void>(
      requestId,
      inTurn ? RELAUNCH_AT_TURN_END_MS : CONTROL_TIMEOUT_MS,
      () => send({ verb: "spawn", machineId, instanceId, requestId, payload })
    );
    switch (relaunched.kind) {
      case "unanswered":
        // Not known to run on the new mode: the view shows the last confirmed one.
        target.permissionMode = previous;
        return relaunched;
      case "answered":
        return relaunched;
      default:
        unhandled("read", relaunched);
    }
  } catch (error) {
    target.permissionMode = previous;
    throw error;
  } finally {
    target.relaunching = false;
    detach(rereadHub(), "rereadHub");
  }
}

/**
 * Where a rewind lands: the assistant frame `resumeSessionAt` names.
 *
 * The SDK resumes "up to and including" an `SDKAssistantMessage.uuid`, so the
 * anchor has to be an assistant frame — and one that ended in words. A frame
 * whose blocks include a tool call would resume into a `tool_use` with no
 * result behind it, which the API refuses outright, so the search walks past
 * those to the last turn that closed.
 */
function rewindPoint(target: SessionState, id: string): string | null {
  const edited = target.messages.findIndex((message) => message.id === id);
  if (edited < 0) {
    return null;
  }
  const calls = toolFrames(target.messages);
  for (let index = edited - 1; index >= 0; index -= 1) {
    const { type, sdkUuid: uuid } = target.messages[index];
    if (type !== "assistant" || !uuid || calls.has(uuid)) {
      continue;
    }
    return uuid;
  }
  return null;
}

/**
 * Where a rewind lands, read back to when the rows held do not reach it. A
 * view holds the newest page and what its reader scrolled up to, so the
 * answered turn before one of its first messages can be on a page not read
 * yet: the pages before are read, one at a time, until one holds it. Null
 * only once the conversation's start is in hand, or a page could not be read.
 */
async function rewindPointBehind(
  target: SessionState,
  id: string
): Promise<string | null> {
  let point = rewindPoint(target, id);
  while (!point && target.cursor && !target.loading) {
    const { cursor } = target;
    await readOlderPage(target.instanceId);
    point = rewindPoint(target, id);
    // The cursor did not move: the page failed, or its answer was dropped.
    if (target.cursor === cursor) {
      break;
    }
  }
  return point;
}

/** The uuids of assistant frames that asked for a tool — never a rewind anchor. */
function toolFrames(messages: Message[]): Set<string | undefined> {
  return new Set(
    messages
      .filter(
        (message) =>
          message.type === "tool.use" || message.type === "tool.handoff"
      )
      .map((message) => message.sdkUuid)
  );
}

/**
 * Each session's rewindable turns as last read, by the revision they were
 * read at (`SessionState.rev`, which moves with every change to its
 * messages). Every reader's turn asks as its row mounts, and read afresh
 * each time, a wheel bringing in a few of them walked the whole session for
 * each (1ms of a wheel's task, transcript-holds' steady wheel, profiled).
 */
const rewindable = new WeakMap<
  SessionState,
  { cursor: string | null; length: number; rev: number; turns: Set<string> }
>();

function rewindableTurns(target: SessionState): Set<string> {
  const { cursor, rev } = target;
  const { length } = target.messages;
  const kept = rewindable.get(target);
  if (
    kept &&
    kept.rev === rev &&
    kept.cursor === cursor &&
    kept.length === length
  ) {
    return kept.turns;
  }
  const turns = readRewindable(target);
  rewindable.set(target, { cursor, length, rev, turns });
  return turns;
}

function readRewindable(target: SessionState): Set<string> {
  const turns = new Set<string>();
  const calls = toolFrames(target.messages);
  // An anchor on an older page is resolved by rewindPointBehind on demand.
  let anchored = target.cursor !== null;
  for (const message of target.messages) {
    if (
      message.type === "user" &&
      anchored &&
      message.state !== "sending" &&
      message.state !== "pending" &&
      message.state !== "failed" &&
      message.state !== "unreached"
    ) {
      turns.add(message.id);
    }
    if (
      message.type === "assistant" &&
      message.sdkUuid &&
      !calls.has(message.sdkUuid)
    ) {
      anchored = true;
    }
  }
  return turns;
}

/** Where a fork from message `id` of `instanceId` branches: at the answer behind it (spawn/new-session `startFork` starts it). */
export async function forkPointOf(
  instanceId: string,
  id: string
): Promise<ForkSource> {
  const target = session(instanceId);
  const sessionKey = resumeKeyFor(instanceId);
  if (!(target.machineId && sessionKey)) {
    throw new Error(
      "This session has not named itself yet. Try again in a moment."
    );
  }
  const point = await rewindPointBehind(target, id);
  if (!point) {
    throw new Error(
      "There is no answered turn behind this message to branch from."
    );
  }
  return {
    machineId: target.machineId,
    cwd: target.cwd,
    sessionId: sessionKey,
    harness: harnessOfSession(instanceId),
    at: point,
  };
}

/**
 * Says a turn again, differently. The session is started back up in place at
 * the answer before the edited message — same instance id, same SDK session,
 * `resumeSessionAt` cutting the conversation there — and the new wording goes
 * through as an ordinary turn, so everything the old one led to is gone from
 * both the screen and the session the next process reads back.
 */
export async function editAndResend(
  instanceId: string,
  id: string,
  content: string
): Promise<Bounded<void>> {
  const target = session(instanceId);
  const { machineId } = target;
  if (!machineId) {
    throw new Error(
      "This session has not named itself yet. Try again in a moment."
    );
  }
  const sessionKey = resumeKeyFor(instanceId);
  if (!sessionKey) {
    throw new Error(
      `no session key on record for ${instanceId}; cannot resume`
    );
  }
  // OpenCode reverts the selected user turn; Claude resumes through the
  // preceding completed assistant frame.
  const point =
    traitsOf(target.harness).rewindAnchor === "user-turn"
      ? target.messages.find((message) => message.id === id)?.sdkUuid
      : await rewindPointBehind(target, id);
  if (!point) {
    throw new Error("This message has no stored rewind point.");
  }

  const requestId = newId();
  const payload = await explicit(machineId, {
    instanceId,
    cwd: target.cwd,
    harness: harnessOfSession(instanceId),
    resume: { sessionKey, atMessage: point },
    // What a relaunch carries: a rewind changes what the session has said, not
    // what it is. Its effort is the one chosen for it, which the hub supplies.
    scratch: target.scratch ? {} : undefined,
    permissionMode: target.permissionMode ?? undefined,
    model: target.model ?? undefined,
    requestId,
  });

  // The hub cuts the transcript back to the answer the rewind lands on as it
  // starts the process, and puts it back whole if the spawn never lands; every
  // screen reads the cut from it.
  // Whatever was in flight belongs to the process being replaced.
  settleStopped(instanceId);
  target.relaunching = true;
  try {
    const rewound = await ask<void>(requestId, CONTROL_TIMEOUT_MS, () =>
      send({ verb: "spawn", machineId, instanceId, requestId, payload })
    );
    switch (rewound.kind) {
      case "unanswered":
        // Not known to have restarted at the rewind point: the new wording is not sent.
        return rewound;
      case "answered":
        submitCommand(instanceId, machineId, {
          kind: "send",
          intent: { text: content },
        });
        return rewound;
      default:
        unhandled("read", rewound);
    }
  } finally {
    target.relaunching = false;
    detach(rereadHub(), "rereadHub");
  }
}
