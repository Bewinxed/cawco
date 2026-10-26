/**
 * What a Configure list does to its rows (Hooks, Rules, MCP servers,
 * subagents, delegate types): a row's switch, its Delete, and a starter's
 * Add, each pending on its row while it runs and, refused, said under that
 * row. A delete's refusal is kept through a reload (refusals.svelte.ts)
 * under `delete:<page>:<key>`; Delete goes at once, with Undo in the toast
 * (deletes.ts).
 */
import { IconTrash } from "#lib/icons.js";
import { failureWords as message } from "../hub-read";
import { refusals } from "../refusals.svelte";
import { notDeleted } from "./deletes";

/** A row a Configure list switches and deletes. */
export interface ActedRow {
  name: string;
}

/** A row with a switch. */
export interface SwitchedRow extends ActedRow {
  enabled: boolean;
}

interface Acts<R> {
  /** The row's key in the list: its id, or its name where that is its key. */
  key: (row: R) => string;
  remove: (row: R) => Promise<unknown>;
  /** Saves the row switched on or off, and puts what was saved in the list. */
  toggle?: (row: R, enabled: boolean) => Promise<unknown>;
}

export class RowActs<R extends ActedRow> {
  /** Rows whose switch or delete is on its way, by key; a page's own acts may use it too. */
  busy = $state<Record<string, boolean>>({});
  /** The starter whose Add is on its way. */
  seeding = $state<string | null>(null);
  /** The starter whose last Add was refused, and why. */
  seedFailed = $state<{ title: string; reason: string } | null>(null);
  /** Why a row's switch did not take, by key. */
  toggleFailed = $state<Record<string, string>>({});
  readonly #page: string;
  readonly #acts: Acts<R>;

  constructor(page: string, acts: Acts<R>) {
    this.#page = page;
    this.#acts = acts;
  }

  key = (row: R): string => this.#acts.key(row);

  /** Where a delete the hub refused is said. */
  deleteKey = (row: R): string => `delete:${this.#page}:${this.key(row)}`;

  /** A row's Delete in its menu (SectionRow `actions`), named `label`, held while the row is busy. */
  deleteAction = (row: R, label: string) => ({
    label,
    icon: IconTrash,
    destructive: true,
    disabled: this.busy[this.key(row)] === true,
    onselect: () => this.remove(row),
  });

  toggle = async (row: R, enabled: boolean): Promise<void> => {
    const key = this.key(row);
    this.busy[key] = true;
    delete this.toggleFailed[key];
    try {
      await this.#acts.toggle?.(row, enabled);
    } catch (error) {
      this.toggleFailed[key] = message(error);
    } finally {
      delete this.busy[key];
    }
  };

  remove = async (row: R): Promise<void> => {
    const key = this.key(row);
    this.busy[key] = true;
    refusals.delete(this.deleteKey(row));
    try {
      await this.#acts.remove(row);
    } catch (error) {
      refusals.set(this.deleteKey(row), {
        reason: notDeleted(row.name, error),
      });
    } finally {
      delete this.busy[key];
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
