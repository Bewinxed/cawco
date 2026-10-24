/**
 * A reader's marker for this package's long synchronous steps: the agent's
 * loop watch (agent loop-watch.ts `syncSection`) names one that held its
 * loop. Unset, a step just runs.
 */
type Marker = <T>(name: string, run: () => T) => T;

let marker: Marker = (_name, run) => run();

/** Every long synchronous step of this package runs through `mark` from now. */
export function setSectionMarker(mark: Marker): void {
  marker = mark;
}

/** Runs `run`, one long synchronous step, under `name`. */
export function section<T>(name: string, run: () => T): T {
  return marker(name, run);
}
