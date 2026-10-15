/**
 * What a person asked of one session, said on that session's own rows until
 * the system answers (DESIGN.md, The Stay In Context Rule). Keyed by the id a
 * row names its session by (the instance id, or a stored transcript's session
 * id), so every list that draws the session says the same thing:
 *
 * - `pending`: the word for what is on its way ("Archiving…"), set at the ask
 *   and cleared on the answer, never on the hope. A stop has none: the hub's
 *   `stopping` status says it, on every client (SessionRow);
 * - `fault`: why it did not go, with the way on (RowFault under the row);
 * - `note`: what it came to when the result is elsewhere (a continuation
 *   that started in a new session), with the place to go.
 *
 * Nothing here throws: a failure is the fault on the row.
 */
import type { NeutralSessionInfo } from "@cawco/core";
import { SvelteMap } from "svelte/reactivity";
import {
  cawco,
  loadCatalog,
  machineControl,
  renameInstance,
  stopSession,
} from "./client.svelte";
import { failureWords as messageOf } from "./hub-read";
import { instanceForSession } from "./links";

export interface RowFaultState {
  again?: () => unknown;
  againLabel?: string;
  reason: string;
}

export interface SessionAct {
  fault?: RowFaultState;
  note?: { href: string; text: string };
  pending?: string;
}

const acts = new SvelteMap<string, SessionAct>();

/** What is said on `id`'s rows now. */
export function sessionAct(id: string): SessionAct | undefined {
  return acts.get(id);
}

function put(id: string, change: Partial<SessionAct>): void {
  const next: SessionAct = { ...acts.get(id), ...change };
  for (const key of Object.keys(next) as (keyof SessionAct)[]) {
    if (next[key] === undefined) {
      delete next[key];
    }
  }
  if (Object.keys(next).length === 0) {
    acts.delete(id);
  } else {
    acts.set(id, next);
  }
}

/** Says `fault` under `id`'s rows; undefined takes it away. */
export function faultOn(id: string, fault: RowFaultState | undefined): void {
  put(id, { fault });
}

/** Says `pending` on `id`'s rows while something runs elsewhere; undefined ends it. */
export function pendingOn(id: string, pending: string | undefined): void {
  put(
    id,
    pending ? { pending, fault: undefined, note: undefined } : { pending }
  );
}

/** Says `note` under `id`'s rows; undefined takes it away. */
export function noteOn(id: string, note: SessionAct["note"]): void {
  put(id, { note });
}

/**
 * Runs `work` for the session `id`, saying `pending` on its rows until it
 * answers. A refusal stays on the rows as a fault with `again` beside it.
 * Resolves whether it went; never throws.
 */
export async function onRow(
  id: string,
  pending: string,
  work: () => Promise<unknown>,
  again?: () => unknown
): Promise<boolean> {
  put(id, { pending, fault: undefined, note: undefined });
  try {
    await work();
    return true;
  } catch (error) {
    put(id, { fault: { reason: messageOf(error), again } });
    return false;
  } finally {
    put(id, { pending: undefined });
  }
}

/**
 * Stops a running session. Its rows say "Stopping…" from the hub's own
 * status (`stopping`, published the moment the stop is recorded, on every
 * client) and "Stopped" once its machine confirms; this only puts a refusal
 * under them, with the hub's words and Try again (an away machine's "Stop is
 * recorded, but the machine is offline" among them).
 */
export function stopOnRow(instanceId: string, machineId: string): void {
  put(instanceId, { fault: undefined, note: undefined });
  stopSession(instanceId, machineId).catch((error: unknown) => {
    put(instanceId, {
      fault: {
        reason: messageOf(error),
        again: () => stopOnRow(instanceId, machineId),
      },
    });
  });
}

/** Which session a row renames: one the hub keeps, or a transcript only its machine has. */
export type RenameTarget =
  { instanceId: string } | { info: NeutralSessionInfo; machineId: string };

/**
 * The owner's name for a session. One the hub keeps is named there, the one
 * place every listing reads; a transcript the hub never ran is named in the
 * transcript itself, on its machine. Throws the refusal, in its words.
 */
export async function renameSession(
  target: RenameTarget,
  title: string
): Promise<void> {
  if ("instanceId" in target) {
    await renameInstance(target.instanceId, title);
    return;
  }
  const { info, machineId } = target;
  const row = instanceForSession(cawco.instanceIndex, info.sessionId, {
    machineId,
    cwd: info.cwd,
  });
  if (row) {
    await renameInstance(row.id, title);
    return;
  }
  await machineControl(
    machineId,
    "renameSession",
    [info.sessionId, title, { dir: info.cwd || undefined }],
    undefined,
    info.harness
  );
  await loadCatalog(machineId);
}
