/**
 * What a surface holds of work it started, kept in this tab's own storage so
 * a reload opens the surface again at the same step with the same details
 * (DESIGN.md, The Work Outlives Its Surface Rule): whether it is open, what
 * was typed and picked, and which of the hub's jobs it is following. The
 * job's own progress is never kept here; the surface reads it from the hub.
 * A secret is never put in one: the surface asks for it again.
 *
 * sessionStorage, as the minimized question bar (`minimized-asks.svelte.ts`):
 * it survives a reload in this tab and is told to no other, whose reader did
 * not start the work there. Every change is written as it happens.
 */
import { readJson, writeJson } from "./storage";

export class TabDraft<T extends object> {
  /** The surface's held state; change it in place, and it is kept. */
  value: T;
  readonly #key: string;
  readonly #blank: () => T;

  constructor(key: string, blank: () => T) {
    this.#key = key;
    this.#blank = blank;
    this.value = $state({
      ...blank(),
      ...readJson<Partial<T>>(key, {}, "session"),
    });
    $effect.root(() => {
      $effect(() => {
        writeJson(this.#key, $state.snapshot(this.value), "session");
      });
    });
  }

  /** The work it followed is over: the surface starts blank next time. */
  clear(): void {
    Object.assign(this.value, this.#blank());
  }
}
