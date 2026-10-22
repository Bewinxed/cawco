/**
 * What the hub (or the browser) refused of an act, said in place where the
 * person acted (RowFault, a pane's line, the composer's), kept in the
 * tab's own storage so a reload says it again in the same place (DESIGN.md,
 * The Work Outlives Its Surface Rule: "A reload keeps it"; "It stands until
 * the reader acts on it"). A refusal goes when a try goes, or when the
 * place that says it is acted on again.
 *
 * Keyed by where it is said: the surface's own words and ids
 * (`delete:/config/hooks:<id>`, `view:<project>:<name>`). `asked` is what
 * the act asked for, as data, so Try again after a reload asks for it
 * again; a closure can't be kept.
 */
import { SvelteMap } from "svelte/reactivity";
import { readJson, writeJson } from "./storage";

const KEPT = "cawco:refusals";

export interface Refusal {
  /** What was asked, as data, for Try again to ask again. */
  asked?: unknown;
  /** The words said: what did not happen, why, what stands. */
  reason: string;
}

class Refusals {
  readonly #said: SvelteMap<string, Refusal>;

  constructor() {
    this.#said = new SvelteMap(
      readJson<[string, Refusal][]>(KEPT, [], "session")
    );
  }

  /** The refusal said at `key`, or undefined. */
  get(key: string): Refusal | undefined {
    return this.#said.get(key);
  }

  /** The words said at `key`, or null: what a RowFault's `reason` takes. */
  reason(key: string): string | null {
    return this.#said.get(key)?.reason ?? null;
  }

  /** Every refusal whose key starts with `prefix`, by key. */
  under(prefix: string): [string, Refusal][] {
    return [...this.#said].filter(([key]) => key.startsWith(prefix));
  }

  set(key: string, refusal: Refusal): void {
    this.#said.set(key, refusal);
    this.#keep();
  }

  delete(key: string): void {
    if (this.#said.delete(key)) {
      this.#keep();
    }
  }

  #keep(): void {
    writeJson(KEPT, [...this.#said], "session");
  }
}

export const refusals = new Refusals();
