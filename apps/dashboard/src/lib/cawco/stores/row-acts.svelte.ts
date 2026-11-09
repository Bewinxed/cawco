/**
 * The acts on a session's row: stop, discard, keep a spin-off, rename, move
 * to another account; and what the session is resumed under.
 */

import type { Bounded } from "@cawco/core/bounded";
import { detach } from "@cawco/core/detach";
import type { HarnessKind } from "@cawco/core/harness/kinds";
import type { StopRequest } from "@cawco/core/protocol";
import { unhandled } from "@cawco/core/unhandled";
import { accountsWords } from "@cawco/core/words/accounts";
import { sidebarWords } from "@cawco/core/words/sidebar";
import { CONTROL_TIMEOUT_MS, DISCARD_TIMEOUT_MS } from "#lib/config.js";
import { hub } from "#lib/platform/hub.js";
import { hubDone, hubRefusal } from "#lib/platform/hub-read.js";
import { newId } from "#lib/platform/id.js";
import { ask, rereadHub, send } from "../hub/socket.svelte";
import { instanceIndex } from "./board.svelte";
import { loadCatalog } from "./catalog.svelte";
import { machineControl } from "./machines";
import {
  clearTurnPhase,
  session,
  sessionsState,
  trackWorking,
} from "./sessions.svelte";

/**
 * The other half of durability: a message to a dead session revives it first.
 * The daemon respawns the same instance with `resume`, then the text goes
 * through as usual — the reader never has to know the process died.
 */
/**
 * Brings a dead-but-resumable session back before anything is asked of it.
 * A process can die between one action and the next — a daemon restart, a
 * crash — and the reader should not have to know which of their actions
 * happens to revive it. Returns once the session can take work again.
 */
/**
 * The harness key a spawn resumes an instance under. The hub row is the one
 * authority: it holds what the daemon recorded when the session named itself,
 * and a view id — a CawCo instance id — is never a key, whatever shape it
 * has. A row without a key has nothing to resume by, and this says so rather
 * than guessing: two opencode sessions were lost to a resume that sent the
 * instance id in the key's place. Only an id the hub does not hold at all — a
 * stored transcript browsed under its own key — answers from the store, which
 * by then carries what the transcript read's header or the catalog entry named.
 */
export function resumeKeyFor(instanceId: string): string | null {
  const row = instanceIndex.byId.get(instanceId);
  if (row) {
    return row.sessionId ?? null;
  }
  return sessionsState.sessions[instanceId]?.sessionId ?? null;
}

/** The harness a session's conversation is one of: its row's, else its view's; a throw while neither has said. */
export function harnessOfSession(instanceId: string): HarnessKind {
  const harness =
    instanceIndex.byId.get(instanceId)?.harness ??
    sessionsState.sessions[instanceId]?.harness;
  if (!harness) {
    throw new Error(
      "This session has not said what runs it yet. Try again in a moment."
    );
  }
  return harness;
}

/**
 * Stops a running session. Nothing about it changes here until its machine
 * answers: then it is stopped (its turn, tool and parked asks settle), and a
 * refusal is thrown in the machine's words for the row that asked to say. A
 * stop nobody answered in time is `unanswered`: the session is left as it is.
 */
export async function stopSession(
  instanceId: string,
  machineId: string
): Promise<Bounded<void>> {
  const requestId = newId();
  const payload: StopRequest = { instanceId, requestId };
  try {
    const stopped = await ask<void>(requestId, CONTROL_TIMEOUT_MS, () =>
      send({ verb: "stop", machineId, instanceId, requestId, payload })
    );
    switch (stopped.kind) {
      case "answered":
        settleStopped(instanceId);
        return stopped;
      case "unanswered":
        return stopped;
      default:
        unhandled("read", stopped);
    }
  } finally {
    detach(rereadHub(), "rereadHub");
  }
}

/**
 * Throws a spin-off away: the session stops and the agent tears down whatever
 * the spawn created for it. Resolves once the agent confirms the teardown, so a
 * worktree that could not be removed is reported rather than silently left.
 */
export async function discardSession(
  instanceId: string,
  machineId: string
): Promise<Bounded<void>> {
  const requestId = newId();
  const payload: StopRequest = { instanceId, discard: true, requestId };
  try {
    const discarded = await ask<void>(requestId, DISCARD_TIMEOUT_MS, () =>
      send({ verb: "stop", machineId, instanceId, requestId, payload })
    );
    switch (discarded.kind) {
      case "answered":
        // Gone on the machine's word, not before: a refused discard, or one
        // nobody answered, leaves the session as it was.
        settleStopped(instanceId);
        delete sessionsState.sessions[instanceId];
        return discarded;
      case "unanswered":
        return discarded;
      default:
        unhandled("read", discarded);
    }
  } finally {
    await rereadHub();
  }
}

/**
 * Moves a session whole to another account of its provider
 * (`POST /api/instances/:id/account`): now when it is at rest, else at its
 * next turn boundary. A refusal is thrown in the hub's own sentence; an
 * answer that is not a sentence (a route's JSON) is named by its status.
 */
export async function moveInstanceAccount(
  instanceId: string,
  accountId: string
): Promise<void> {
  await hubDone(
    hub.api.instances({ id: instanceId }).account.post({ accountId }),
    (refused) => hubRefusal(refused, accountsWords.notMovedThen)
  );
}

/**
 * The owner's name for a session the hub keeps. It outranks the name the
 * session gives itself (`set_title`), which the hub refuses from then on;
 * the new name reaches every dashboard through the instance-update frame.
 */
export async function renameInstance(
  instanceId: string,
  title: string
): Promise<void> {
  await hubDone(
    hub.api.instances({ id: instanceId }).patch({ title }),
    (refused) => hubRefusal(refused, sidebarWords.notRenamedThen)
  );
}

/**
 * Promotes a spin-off to mainline work: the UI stops setting it apart, and
 * the tag that kept its transcript out of the machine's catalog comes off, so
 * the session joins the history it was being hidden from. `unanswered` when
 * the hub kept it and its machine did not answer for the tag in time.
 */
export async function keepSession(instanceId: string): Promise<Bounded<void>> {
  const target = session(instanceId);
  await hubDone(
    hub.api.instances({ id: instanceId }).patch({ kind: "mainline" }),
    (refused) => hubRefusal(refused, sidebarWords.notKeptThen)
  );

  target.scratch = false;
  if (target.sessionId && target.machineId) {
    // `null` is how the harness clears a tag; the catalog is re-read for the
    // entry that has just stopped being hidden.
    const untagged = await machineControl<void>(
      target.machineId,
      "tagSession",
      [target.sessionId, null, { dir: target.cwd || undefined }],
      CONTROL_TIMEOUT_MS,
      harnessOfSession(instanceId)
    );
    await loadCatalog(target.machineId);
    return untagged;
  }
  return { kind: "answered", value: undefined };
}

/** The view state a session leaves behind once it is no longer running. */
export function settleStopped(instanceId: string): void {
  const target = session(instanceId);
  target.busy = false;
  target.currentTool = null;
  clearTurnPhase(target);
  // Its parked asks leave on the hub's word (`permission_settled`): the hub
  // settles a stopped process's asks, and keeps a relaunch's own.
  trackWorking(target);
}
