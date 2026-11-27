/**
 * What an agent restart would cut right now, and the fence that keeps new such
 * work from starting while a restart is decided.
 *
 * A turn is not on the list. Every harness child (the Claude CLI, the OpenCode
 * server, the pi host) runs under the session keeper, and the next agent takes
 * each one over where it stands. What a restart does cut is what lives in this
 * process: the tool calls it relays, the image generations and commands it
 * runs, a session it is starting, a message it is handing to a harness. Each
 * is held here while it is in flight ({@link holdRestart}); the supervisor
 * adds what only it can see ({@link SupervisorHolds}).
 *
 * The fence is named per owner and stands while its owner holds it: the
 * owner raises it again each beat (core bounded.ts `BEAT_MS`), and it falls
 * one quiet spell (`QUIET_MS`) after the last raise, so a restart that never
 * comes, or an owner that died, cannot leave it up.
 */
import {
  mergeHolds,
  type RestartHold,
  type RestartHoldReason,
  type RestartReadiness,
} from "@cawco/core/binary-updates";
import { QUIET_MS } from "@cawco/core/bounded";

const holds = new Map<symbol, { id: string; reason: RestartHoldReason }>();

/** Holds a restart while the work runs; the answer lets go, once. */
export function holdRestart(reason: RestartHoldReason, id: string): () => void {
  const key = Symbol(reason);
  holds.set(key, { reason, id });
  return () => {
    holds.delete(key);
  };
}

export async function withRestartHold<T>(
  reason: RestartHoldReason,
  id: string,
  work: () => Promise<T>
): Promise<T> {
  const release = holdRestart(reason, id);
  try {
    return await work();
  } finally {
    release();
  }
}

/** Each owner's fence, when it was last raised (`performance.now()`: awake time). */
const fences = new Map<string, number>();

/** Raises `owner`'s fence, or raises it again: it stands {@link QUIET_MS} from now. */
export function raiseFence(owner: string): void {
  fences.set(owner, performance.now());
}

/**
 * Raises `owner`'s fence again only while it still stands: a holder's next
 * beat never puts up a fence on an agent that restarted under it.
 */
export function renewFence(owner: string): boolean {
  const raised = fences.get(owner);
  if (raised === undefined || performance.now() - raised >= QUIET_MS) {
    fences.delete(owner);
    return false;
  }
  fences.set(owner, performance.now());
  return true;
}

export function lowerFence(owner: string): void {
  fences.delete(owner);
}

/** Whether any owner's fence stands: new work a restart would cut is refused. */
export function fenced(): boolean {
  const now = performance.now();
  for (const [owner, raised] of fences) {
    if (now - raised >= QUIET_MS) {
      fences.delete(owner);
    }
  }
  return fences.size > 0;
}

/**
 * What the supervisor alone can see: custody still being taken over, starts
 * and image generations in flight, each harness's own operations. Nothing
 * while the daemon has no supervisor, and then nothing can be known yet: an
 * agent that is still starting is one taking custody.
 */
export type SupervisorHolds = () => RestartHold[] | undefined;

export function restartReadiness(
  supervisorHolds: SupervisorHolds
): RestartReadiness {
  const holding = mergeHolds(
    supervisorHolds() ?? [{ reason: "custody", ids: ["agent"] }],
    [...holds.values()].map(({ reason, id }) => ({ reason, ids: [id] }))
  );
  return { ready: holding.length === 0, holds: holding };
}
