/**
 * What a menu item that runs something does with its select: the menu stays
 * open and the item pending while the work runs (a second select is
 * swallowed), then the item selects itself once more, unprevented, and the
 * menu closes as it does on any select. Work that throws leaves the menu
 * open, with no check.
 */
export class PendingSelect {
  pending = $state(false);
  failed = $state(false);
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
    this.failed = false;
    try {
      await this.#run();
    } catch (error) {
      this.failed = true;
      throw error;
    } finally {
      this.pending = false;
    }
    this.#closing = true;
    this.#item()?.click();
  };
}
