import type { Deleted } from "@cawco/core";
import { failureClause, hubRefusal } from "../hub-read";
import { refusals } from "../refusals.svelte";

/**
 * A config item's Undo the hub refused (its restore window ran out, its
 * name is taken): said on the section the item was deleted from
 * (SectionFrame), in words, with Try again, never a toast (DESIGN.md, The
 * Work Outlives Its Surface Rule). Kept in the tab's storage
 * (refusals.svelte.ts), so a reload says it again; it stands until a try
 * puts the item back.
 */
const KEY = "undo:";

/** What a kept refused Undo holds: the trash entry to ask for again. */
interface Asked {
  deleted: Deleted;
  name: string;
  section: string;
}

/** The refused Undo's key: its section, then its Undo's id. */
const keyOf = (section: string, id: string): string =>
  `${KEY}${section}\u0000${id}`;

/**
 * Where a restored row lands while this tab still holds the list it left
 * (by key); after a reload the section reads its list again instead.
 */
const landings = new Map<string, (row: unknown) => void>();

/** Asks the hub's trash to put the item back, answering its row. */
async function restoreDeleted<T>(deleted: Deleted): Promise<T> {
  const response = await fetch(`/api/trash/${deleted.restore}/restore`, {
    method: "POST",
  });
  if (!response.ok) {
    // The hub says why in a sentence: its window ran out, or its name is taken.
    throw await hubRefusal(response);
  }
  return ((await response.json()) as { row: T }).row;
}

/** Puts it back; a refusal is kept for its section to say, with Try again. */
export async function restore<T>(
  id: string,
  deleted: Deleted,
  where: { section: string; name: string },
  land: (row: T) => void
): Promise<void> {
  const key = keyOf(where.section, id);
  landings.set(key, land as (row: unknown) => void);
  try {
    land(await restoreDeleted<T>(deleted));
    refusals.delete(key);
    landings.delete(key);
  } catch (error) {
    refusals.set(key, {
      reason: `${where.name} was not put back: ${failureClause(error)}. It stays deleted.`,
      asked: { deleted, ...where } satisfies Asked,
    });
  }
}

/** A refused Undo said on a section, with its Try again. */
export interface Unrestored {
  again: () => Promise<void>;
  key: string;
  reason: string;
}

/**
 * The refused Undos `section` says. Try again lands the row where this tab
 * still holds its list, else `reread` reads the section's list again.
 */
export function unrestoredOn(
  section: string,
  reread: () => unknown
): Unrestored[] {
  return refusals.under(`${KEY}${section}\u0000`).map(([key, said]) => {
    const asked = said.asked as Asked;
    return {
      key,
      reason: said.reason,
      again: () =>
        restore(
          key.slice(key.indexOf("\u0000") + 1),
          asked.deleted,
          asked,
          landings.get(key) ??
            (() => {
              reread();
            })
        ),
    };
  });
}
