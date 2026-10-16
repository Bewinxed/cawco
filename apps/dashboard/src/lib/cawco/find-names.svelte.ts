import type { FindAnswer, FindKind, FindResult } from "@cawco/core";

/**
 * The hub's finding engine read for names alone (`/api/find?transcripts=0`,
 * the hub's find.ts): what the composer's `@` offers, ranked at the hub as
 * every find is, so a name mentioned and a name found (the finder,
 * find/finder.svelte.ts) come from one ranking. It answers in milliseconds, so it
 * runs on every key: each new query aborts the one in flight, and the last
 * answer stands until the next lands, so a list never blanks between keys.
 */
export class FindNames {
  /** The hub's results for the last query answered, best first. */
  results = $state.raw<FindResult[]>([]);
  /** Why the last query got no answer, in a sentence; null when it did. */
  failure = $state<string | null>(null);
  readonly #kinds: string;
  readonly #limit: string;
  #controller: AbortController | undefined;
  #asked: string | null = null;

  constructor(kinds: readonly FindKind[], limit: number) {
    this.#kinds = kinds.join(",");
    this.#limit = String(limit);
  }

  /** Asks for `q`'s names (no words: what moved last); the same words twice ask once. */
  update(q: string) {
    const words = q.trim();
    if (words === this.#asked) {
      return;
    }
    this.#asked = words;
    this.#controller?.abort();
    const controller = new AbortController();
    this.#controller = controller;
    const params = new URLSearchParams({
      q: words,
      kinds: this.#kinds,
      limit: this.#limit,
      transcripts: "0",
    });
    fetch(`/api/find?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            (await response.text()).trim() ||
              `The hub answered ${response.status}.`
          );
        }
        return (await response.json()) as FindAnswer;
      })
      .then((answer) => {
        if (!controller.signal.aborted) {
          this.results = answer.results;
          this.failure = null;
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        this.results = [];
        this.failure = `Couldn't find names: ${error instanceof Error ? error.message : String(error)}`;
        // The same words asked again try again.
        this.#asked = null;
      });
  }

  /** Nothing in flight, and the next query asks afresh. */
  stop() {
    this.#controller?.abort();
    this.#controller = undefined;
    this.#asked = null;
  }
}
