/**
 * An editor's form: Save, Cancel and Delete as every config editor runs
 * them, and which fields say their problem. Saving keeps the editor open
 * on what it saved, the Save button saying so in place; a new row shows the
 * same, then returns to the list, where it is marked. Cancel leaves the
 * edits behind. Delete goes at once, with Undo in the toast (deletes.ts),
 * back to the list first so the row is seen leaving it; a refusal stands in
 * the editor's head, the row kept. Made as its editor starts.
 */
import { detach } from "@cawco/core/detach";
import { goto } from "$app/navigation";
import { failureWords as message } from "../hub-read";
import { savedShown } from "./EditorFooter.svelte";

/** `said` when `name`, trimmed, is another row's: two rows of one name cannot be told apart. */
export const takenName = (
  name: string,
  taken: string[],
  said: string
): string | undefined => {
  const trimmed = name.trim();
  return trimmed !== "" && taken.includes(trimmed) ? said : undefined;
};

export class EditorForm {
  /** Save's request is out. */
  busy = $state(false);
  /** Delete's request is out. */
  deleting = $state(false);
  /** Why the hub refused the last Save or Delete. */
  failed = $state<string | undefined>(undefined);
  /** The fields left once: each says its problem from then on. */
  touched = $state<Record<string, boolean>>({});
  /** Save was pressed: every field says its problem. */
  attempted = $state(false);
  /** A new row was just created: its draft is over, and a second Save would make a second one. */
  #created = false;
  readonly #list: string;
  readonly #kept: { drop: () => void };
  readonly #store: { mark: (key: string) => void };

  /** `list`: the section's list, where Cancel, Delete and a new row go back to. */
  constructor(
    list: string,
    kept: { drop: () => void },
    store: { mark: (key: string) => void }
  ) {
    this.#list = list;
    this.#kept = kept;
    this.#store = store;
  }

  /** `field` says its problem: it was left once, or Save was pressed. */
  seen(field: string): boolean {
    return this.attempted || this.touched[field] === true;
  }

  /** The fields hold another version now: none of them was left yet. */
  reset(): void {
    this.touched = {};
    this.attempted = false;
  }

  /**
   * Save, when the form is `ready`: `write` saves and answers the new row's
   * key when it made one, or null when it saved the row in place.
   */
  async save(
    ready: boolean,
    write: () => Promise<string | null>
  ): Promise<void> {
    this.attempted = true;
    if (!ready || this.busy || this.#created) {
      return;
    }
    this.busy = true;
    this.failed = undefined;
    let made: string | null = null;
    try {
      made = await write();
      if (made !== null) {
        this.#created = true;
        this.#kept.drop();
      }
    } catch (error) {
      this.failed = message(error);
    } finally {
      this.busy = false;
    }
    if (made !== null) {
      await savedShown();
      this.#store.mark(made);
      await goto(this.#list);
    }
  }

  cancel = (): void => {
    this.#kept.drop();
    detach(goto(this.#list), "goto");
  };

  /** Delete by `ask`, which calls `gone` once the row is let go: back to the list. */
  async remove(
    ask: (gone: () => Promise<void>) => Promise<unknown>
  ): Promise<void> {
    this.deleting = true;
    this.failed = undefined;
    try {
      await ask(() => {
        this.#kept.drop();
        return goto(this.#list);
      });
    } catch (error) {
      this.deleting = false;
      this.failed = message(error);
    }
  }
}
