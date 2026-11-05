import { STALE_AT } from "./fixture";

/**
 * What a states file's `play` is handed on the canvas (component-canvas,
 * Moves): `update` sets the live instance's props in place, so its own
 * motion plays; `userEvent` waits between beats.
 */
export interface Play {
  update: (next: Record<string, unknown>) => Promise<void>;
  userEvent: { wait: (ms: number) => Promise<void> };
}

/** A move that sets the props it names, then lets its motion settle. */
export const moveTo =
  (next: Record<string, unknown>) =>
  async ({ update, userEvent }: Play): Promise<void> => {
    await update(next);
    await userEvent.wait(600);
  };

/** The first read: every group a skeleton at its size. */
export const LOADING = { read: "loading" } as const;

/** The hub unreachable since the last good read. */
export const STALE = { read: "stale", staleAt: STALE_AT } as const;
