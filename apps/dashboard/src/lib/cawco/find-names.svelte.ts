import type { FindAnswer, FindKind, FindResult } from "@cawco/core";

/**
 * The hub's finding engine read for names alone (`/api/find?transcripts=0`,
 * the hub's find.ts): what the Jump palette lists and what the composer's
 * `@` offers, ranked at the hub as every find is, so a name found and a
 * name mentioned come from one ranking. It answers in milliseconds, so it
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

/** A `[start, end)` slice of a string that the query matched. */
export type Range = [number, number];

const SPACES = /\s+/;

/**
 * Where the query's words sit in `text`, merged into runs: what a row marks
 * to say why it is there. The hub ranked the row; this only shows it.
 */
export function wordRanges(text: string, query: string): Range[] {
  const lower = text.toLowerCase();
  const found: Range[] = [];
  for (const word of query.toLowerCase().split(SPACES).filter(Boolean)) {
    let at = lower.indexOf(word);
    while (at !== -1) {
      found.push([at, at + word.length]);
      at = lower.indexOf(word, at + word.length);
    }
  }
  found.sort((a, b) => a[0] - b[0]);
  const merged: Range[] = [];
  for (const range of found) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) {
      last[1] = Math.max(last[1], range[1]);
    } else {
      merged.push([range[0], range[1]]);
    }
  }
  return merged;
}
