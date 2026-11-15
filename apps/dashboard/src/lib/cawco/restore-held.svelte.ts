/**
 * The rows a forgotten project's restore held back (hub db forget.ts:
 * values a migration since kept as not read, values that are not their
 * column's shape, keys a row made since holds, rows naming something gone,
 * and every row hanging off one), said on the restored project's page,
 * where the restore lands, until the person dismisses them. Kept in the
 * tab's own storage, so a reload says them again in the same place.
 */
import type { RestoreHeldRow } from "@cawco/core/forgotten-project";
import { SvelteMap } from "svelte/reactivity";
import { z } from "zod";
import { RestoreHeldRowSchema } from "#lib/cawco/stored-shapes.js";
import { readJson, writeJson } from "#lib/platform/storage.js";

const KEPT = "cawco:restore-held";

class RestoreHeld {
  readonly #held: SvelteMap<string, RestoreHeldRow[]>;

  constructor() {
    this.#held = new SvelteMap(
      readJson(
        KEPT,
        z.array(z.tuple([z.string(), z.array(RestoreHeldRowSchema)])),
        [],
        "session"
      )
    );
  }

  /** The rows held back by project `id`'s restore; none once dismissed. */
  of(id: string): RestoreHeldRow[] {
    return this.#held.get(id) ?? [];
  }

  /** What project `id`'s restore held back, said until dismissed; none says nothing. */
  set(id: string, rows: RestoreHeldRow[]): void {
    if (rows.length === 0) {
      this.#held.delete(id);
    } else {
      this.#held.set(id, rows);
    }
    this.#keep();
  }

  dismiss(id: string): void {
    this.set(id, []);
  }

  #keep(): void {
    writeJson(KEPT, [...this.#held], "session");
  }
}

export const restoreHeld = new RestoreHeld();
