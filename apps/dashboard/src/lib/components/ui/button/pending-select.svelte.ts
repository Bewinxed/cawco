import { failureWords } from "#lib/cawco/hub-read.js";

/**
 * What a menu item that runs something does with its select: the menu stays
 * open and the item pending while the work runs (a second select is
 * swallowed), then the item selects itself once more, unprevented, and the
 * menu closes as it does on any select. Work that throws leaves the menu
 * open with the item saying why under its label (`reason`), where the
 * person's attention already is; the failure ends there and is not thrown on.
 */
export class PendingSelect {
  pending = $state(false);
  /** Why the last run failed, in the words it threw; null while none has. */
  reason = $state<string | null>(null);
  /** The next select is the one this item makes to close its menu. */
  #closing = $state(false);
  readonly #run: () => Promise<unknown>;
  readonly #item: () => HTMLElement | null;

  constructor(run: () => Promise<unknown>, item: () => HTMLElement | null) {
    this.#run = run;
    this.#item = item;
  }

  select = async (event: Event): Promise<void> => {
    if (this.#closing) {
      this.#closing = false;
      return;
    }
    event.preventDefault();
    if (this.pending) {
      return;
    }
    this.pending = true;
    this.reason = null;
    try {
      await this.#run();
    } catch (error) {
      this.reason = failureWords(error);
      return;
    } finally {
      this.pending = false;
    }
    this.#closing = true;
    this.#item()?.click();
  };
}
