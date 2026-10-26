/**
 * What a Configure list does to its rows (Hooks, Rules): a row's switch, its
 * Delete, and a starter's Add, each pending on its row while it runs and,
 * refused, said under that row. A delete's refusal is kept through a reload
 * (refusals.svelte.ts) under `delete:<page>:<id>`; Delete goes at once, with
 * Undo in the toast (deletes.ts).
 */
import { failureWords as message } from "../hub-read";
import { refusals } from "../refusals.svelte";
import { notDeleted } from "./deletes";

/** A row a Configure list switches and deletes. */
export interface ActedRow {
  enabled: boolean;
  id: string;
  name: string;
}

interface Acts<R> {
  remove: (row: R) => Promise<unknown>;
  toggle: (row: R, enabled: boolean) => Promise<unknown>;
}

export class RowActs<R extends ActedRow> {
  /** Rows whose switch or delete is on its way. */
  busy = $state<Record<string, boolean>>({});
  /** The starter whose Add is on its way. */
  seeding = $state<string | null>(null);
  /** The starter whose last Add was refused, and why. */
  seedFailed = $state<{ title: string; reason: string } | null>(null);
  /** Why a row's switch did not take, by row. */
  toggleFailed = $state<Record<string, string>>({});
  readonly #page: string;
  readonly #acts: Acts<R>;

  constructor(page: string, acts: Acts<R>) {
    this.#page = page;
    this.#acts = acts;
  }

  /** Where a delete the hub refused is said. */
  deleteKey = (id: string): string => `delete:${this.#page}:${id}`;

  toggle = async (row: R, enabled: boolean): Promise<void> => {
    this.busy[row.id] = true;
    delete this.toggleFailed[row.id];
    try {
      await this.#acts.toggle(row, enabled);
      row.enabled = enabled;
    } catch (error) {
      this.toggleFailed[row.id] = message(error);
    } finally {
      delete this.busy[row.id];
    }
  };

  remove = async (row: R): Promise<void> => {
    this.busy[row.id] = true;
    refusals.delete(this.deleteKey(row.id));
    try {
      await this.#acts.remove(row);
    } catch (error) {
      refusals.set(this.deleteKey(row.id), {
        reason: notDeleted(row.name, error),
      });
    } finally {
      delete this.busy[row.id];
    }
  };

  /** A starter's Add: `add` saves it and puts its new row, marked, in the list. */
  seed = async (title: string, add: () => Promise<void>): Promise<void> => {
    this.seeding = title;
    this.seedFailed = null;
    try {
      await add();
    } catch (error) {
      this.seedFailed = { title, reason: message(error) };
    } finally {
      this.seeding = null;
    }
  };
}
