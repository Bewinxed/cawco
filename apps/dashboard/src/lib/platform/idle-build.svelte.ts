/**
 * A part of the page built while nothing else is going on, a little at a
 * time, before anyone asks for it.
 *
 * Its parts open in stages (`has`), and its long lists come a row a stage
 * (`rows`): each stage is one slice of work, built in a task of its own,
 * from a few seconds after it is asked for, once the page is idle (`requestIdleCallback`; where there is none,
 * WebKit's case, in the task after a frame has painted, the yield every
 * engine has), so no slice holds the page for long (web.dev, "Optimize long
 * tasks"). The build ends once every stage is open and no list was cut
 * short in the last slice (`whole`); asked for meanwhile (`finish`), what
 * is left is built at once.
 */
import { flushSync } from "svelte";

/**
 * Rows a list takes a slice: one. A part built for the first time runs
 * code the page has not run yet, and four of the phone sidebar's rows (a
 * session row's tooltip, context menu and marks) took 104-186ms at 4x CPU
 * in Chromium (sidebar-lab settle, one tab).
 */
const CHUNK = 1;

/**
 * How long after it is asked for the build waits before its first slice,
 * ms: past the page's first seconds, which are its load's (the long tasks
 * of the first five, sidebar-lab load), so no slice lands among them.
 */
const START_MS = 5000;

/** Runs `then` once the page is idle; answers how to call it off. */
export function whenIdle(then: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(then);
    return () => cancelIdleCallback(handle);
  }
  let task: ReturnType<typeof setTimeout> | undefined;
  const frame = requestAnimationFrame(() => {
    task = setTimeout(then);
  });
  return () => {
    cancelAnimationFrame(frame);
    clearTimeout(task);
  };
}

export class IdleBuild {
  readonly #stages: number;
  #slices = $state(0);
  #whole = $state(false);
  /** How many times a list was cut short (`rows`): unchanged over a slice, none was. */
  #cuts = 0;
  #cancel: (() => void) | null = null;

  /** `stages`: the highest stage its parts open at (`has`). */
  constructor(stages: number) {
    this.#stages = stages;
  }

  /** Every part is built. */
  get whole(): boolean {
    return this.#whole;
  }

  /** Whether the parts of stage `at` are built (stage 0 with the first slice). */
  has(at: number): boolean {
    return this.#whole || this.#slices > at;
  }

  /** Of `rows`, those built so far: `CHUNK` more a slice from stage `from` on. */
  rows<T>(rows: readonly T[], from: number): readonly T[] {
    if (this.#whole) {
      return rows;
    }
    const built = Math.max(0, this.#slices - from) * CHUNK;
    if (built >= rows.length) {
      return rows;
    }
    this.#cuts += 1;
    return rows.slice(0, built);
  }

  /** Builds it slice by slice, each once the page is idle. */
  start(): void {
    if (this.#cancel || this.#whole) {
      return;
    }
    const slice = () => {
      const cuts = this.#cuts;
      this.#slices += 1;
      flushSync();
      if (this.#cuts === cuts && this.#slices > this.#stages) {
        this.finish();
        return;
      }
      this.#cancel = whenIdle(slice);
    };
    const wait = setTimeout(() => {
      this.#cancel = whenIdle(slice);
    }, START_MS);
    this.#cancel = () => clearTimeout(wait);
  }

  /** Builds what is left at once. */
  finish(): void {
    this.#cancel?.();
    this.#cancel = null;
    this.#whole = true;
  }

  /** Nothing is built: its parts are gone, to be built again from the start. */
  reset(): void {
    this.#cancel?.();
    this.#cancel = null;
    this.#whole = false;
    this.#slices = 0;
  }
}
