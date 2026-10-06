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
 * adds what only it can see ({@link setRestartSource}).
 *
 * The fence is named per owner and lapses on its own: whoever raises it says
 * for how long, so a restart that never comes cannot leave it up.
 */
import {
  mergeHolds,
  type RestartHold,
  type RestartHoldReason,
  type RestartReadiness,
} from "@cawco/core/binary-updates";

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

/** Each owner's fence, until when. */
const fences = new Map<string, number>();

/** Raises `owner`'s fence for `ms` from now, replacing what it had. */
export function raiseFence(owner: string, ms: number): void {
  fences.set(owner, Date.now() + ms);
}

export function lowerFence(owner: string): void {
  fences.delete(owner);
}

/** Whether any owner's fence stands: new work a restart would cut is refused. */
export function fenced(): boolean {
  const now = Date.now();
  for (const [owner, until] of fences) {
    if (until <= now) {
      fences.delete(owner);
    }
  }
  return fences.size > 0;
}

/**
 * What the supervisor alone can see: custody still being taken over, starts
 * and image generations in flight, each harness's own operations. Unset until
 * the daemon has a supervisor, and then nothing can be known yet: an agent
 * that is still starting is one taking custody.
 */
let source: (() => RestartHold[]) | undefined;
export function setRestartSource(read: (() => RestartHold[]) | undefined) {
  source = read;
}

export function restartReadiness(): RestartReadiness {
  const holding = mergeHolds(
    source?.() ?? [{ reason: "custody", ids: ["agent"] }],
    [...holds.values()].map(({ reason, id }) => ({ reason, ids: [id] }))
  );
  return { ready: holding.length === 0, holds: holding };
}
