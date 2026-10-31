/**
 * How a failed part's face knows that Try again can't help: the rebuild
 * threw the same way within a second of the press, so the data it reads is
 * what throws, and the way on is Reload page, which reads everything fresh
 * from the hub (a reload is safe: DESIGN.md, Update toast).
 */

/** What a part's fault face is handed: the error, and its two ways on. */
export interface Fault {
  /** The rebuild threw again at once: Reload page leads. */
  again: boolean;
  /** The error word for word, under Show details. */
  details: string;
  reload: () => void;
  retry: () => void;
}

/** How soon after Try again a throw counts as the rebuild's own. */
const AT_ONCE_MS = 1000;

export class Rebuild {
  /** The rebuild threw again at once: the face leads with Reload page. */
  again = $state(false);
  #triedAt = Number.NEGATIVE_INFINITY;
  #said = "";

  /** Try again was pressed: the rebuild starts now. */
  tried(): void {
    this.#triedAt = performance.now();
  }

  /** The part threw, as Show details words it. */
  threw(said: string): void {
    this.again =
      performance.now() - this.#triedAt < AT_ONCE_MS && said === this.#said;
    this.#said = said;
    this.#triedAt = Number.NEGATIVE_INFINITY;
  }
}

/**
 * The error a boundary holds, word for word. Under SvelteKit a boundary is
 * handed what the client `handleError` made of the throw, whose `message`
 * it sets to the throw's own words (hooks.client.ts).
 */
export function detailsOf(error: unknown): string {
  if (error instanceof Error) {
    return String(error);
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return String(error);
}

/** Reload page: the whole dashboard read fresh from the hub. */
export function reloadPage(): void {
  location.reload();
}
