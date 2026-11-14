import type { Deleted } from "@cawco/core/fleet";
import { configureWords } from "@cawco/core/words/configure";
import type { Treaty } from "@elysia/eden";
import { z } from "zod";
import { hub } from "#lib/platform/hub.js";
import { failureClause, hubData } from "#lib/platform/hub-read.js";
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

/** What the hub's restore answers: the item back, under the kind it was deleted as. */
type Answer = Treaty.Data<ReturnType<typeof hub.api.trash>["restore"]["post"]>;

/** The kinds of trash entry a config delete leaves, as the hub's restore names them. */
export type TrashKind = Answer["kind"];

/** The row the hub restores for `K`, as its list reads it. */
export type RowOf<K extends TrashKind> = NonNullable<
  Extract<Answer, { kind: K }>["row"]
>;

/** The hub's answer as {@link isRestored} reads it. */
interface Restored {
  kind: TrashKind;
  row: unknown;
}

/** Whether the hub answered with the kind that was asked for; its row is null when it could not read the item back. */
const isRestored = <K extends TrashKind>(
  answer: Restored,
  kind: K
): answer is { kind: K; row: RowOf<K> | null } => answer.kind === kind;

/** Every kind, each named once: a kind the hub adds does not compile until it is here. */
const KINDS = {
  rule: "rule",
  hook: "hook",
  skill: "skill",
  plugin: "plugin",
  marketplace: "marketplace",
  agent: "agent",
  mcp: "mcp",
  delegateType: "delegateType",
  memory: "memory",
  memoryDoc: "memoryDoc",
  connection: "connection",
  harnessConfig: "harnessConfig",
} satisfies { [K in TrashKind]: K };

/** What a kept refused Undo holds: the trash entry to ask for again. */
const AskedSchema = z.object({
  kind: z.enum(KINDS),
  deleted: z.object({ restorableForMs: z.number(), restore: z.number() }),
  name: z.string(),
  section: z.string(),
});
type Asked = z.output<typeof AskedSchema>;

/** The refused Undo's key: its section, then its Undo's id. */
const keyOf = (section: string, id: string): string =>
  `${KEY}${section}\u0000${id}`;

/**
 * The Try again of a refused Undo while this tab still holds the list it
 * left (by key); after a reload the section reads its list again instead.
 */
const landings = new Map<string, () => Promise<void>>();

/** Asks the hub's trash to put the item back, answering its row; null when it was put back but could not be read back. */
async function restoreDeleted<K extends TrashKind>(
  kind: K,
  deleted: Deleted
): Promise<RowOf<K> | null> {
  // The hub says why in a sentence when it refuses: its window ran out, or its name is taken.
  const answer: Restored = await hubData(
    hub.api.trash({ id: deleted.restore }).restore.post()
  );
  if (!isRestored(answer, kind)) {
    throw new Error(`${configureWords.restoredNothing}.`);
  }
  return answer.row;
}

/**
 * Puts it back; a refusal is kept for its section to say, with Try again.
 * An item put back that the hub could not read back is `reread` from the
 * hub's own lists instead of landed.
 */
export async function restore<K extends TrashKind>(
  kind: K,
  id: string,
  deleted: Deleted,
  where: { section: string; name: string },
  land: (row: RowOf<K>) => void,
  reread: () => void
): Promise<void> {
  const key = keyOf(where.section, id);
  landings.set(key, () => restore(kind, id, deleted, where, land, reread));
  try {
    const row = await restoreDeleted(kind, deleted);
    if (row === null) {
      reread();
    } else {
      land(row);
    }
    refusals.delete(key);
    landings.delete(key);
  } catch (error) {
    refusals.set(key, {
      reason: `${where.name} was not put back: ${failureClause(error)}. It stays deleted.`,
      asked: { kind, deleted, ...where } satisfies Asked,
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
  return refusals.under(`${KEY}${section}\u0000`).flatMap(([key, said]) => {
    const read = AskedSchema.safeParse(said.asked);
    // A refusal this tab kept before Undo named its kind asks for nothing it can send again.
    if (!read.success) {
      return [];
    }
    const asked = read.data;
    const readAgain = () => {
      reread();
    };
    return [
      {
        key,
        reason: said.reason,
        again: () =>
          landings.get(key)?.() ??
          restore(
            asked.kind,
            key.slice(key.indexOf("\u0000") + 1),
            asked.deleted,
            asked,
            readAgain,
            readAgain
          ),
      },
    ];
  });
}
