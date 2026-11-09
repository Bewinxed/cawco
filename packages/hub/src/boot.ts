/**
 * The hub's wiring parts: a port for a dependency cycle's edge, filled once
 * by the service built later.
 */

/** An edge in the construction order's cycle: one fill, then read by name. */
export interface Port<T> {
  /** Filled once, by the service that closes the cycle. */
  fill: (value: T) => void;
  /** What was filled, or the port's silent default until then. */
  now: () => T;
}

/** A port reading `empty` until {@link Port.fill}. */
export const portOf = <T>(name: string, empty: T): Port<T> => {
  let value = empty;
  let filled = false;
  return {
    now: () => value,
    fill: (filling) => {
      if (filled) {
        throw new Error(`the hub's ${name} port was filled twice`);
      }
      filled = true;
      value = filling;
    },
  };
};

/** Something a hub that serves starts off its boot path, by name in its list. */
export interface BootStep {
  name: string;
  run: () => void;
}

/** Starts the serving hub's boot path, each step in the list's order. */
export const runBootSteps = (steps: readonly BootStep[]): void => {
  for (const { run } of steps) {
    run();
  }
};
