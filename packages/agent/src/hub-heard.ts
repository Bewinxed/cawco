/**
 * The hub's link as a wait on it hears it: each frame and each pong the
 * daemon reads off it is a sign of the hub's life, and its drop ends what
 * waits on it (daemon.ts tells both). A wait for something only the hub
 * brings (a lender's fresh sign-in, provider-accounts.ts `borrowFresh`)
 * lasts while the hub is heard (core bounded.ts `readWhileLive`), and is
 * `Gone` at the link's drop.
 */

/** One wait on the hub's link: told of each sign of its life, and of its drop. */
interface HubListener {
  readonly alive: () => void;
  readonly gone: () => void;
}

const listeners = new Set<HubListener>();

/** Something came from the hub: every wait on its link hears it. */
export const hubHeard = (): void => {
  for (const listener of listeners) {
    listener.alive();
  }
};

/** The hub's link dropped: every wait on it ends. */
export const hubDropped = (): void => {
  for (const listener of [...listeners]) {
    listener.gone();
  }
};

/** Hears the hub's link (`alive` at each frame or pong, `gone` at its drop) until the answer is called. */
export const hearHub = (listener: HubListener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
