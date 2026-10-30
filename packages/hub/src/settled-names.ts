/**
 * Picks settled before Who decides had members (migration 0343) name who
 * settled them by a route word, `advisor`, `practice` or `agent`, and carry
 * no name and no runs-on line. Once, as the hub starts, each is rewritten in
 * its page's doc to the member it was (core decides.ts `BUILT_IN`): `agent`
 * is the asker, the name is the built-in member's, `runs` is null. The
 * rewrite is the hub's own update, so every open view and the page's
 * record (`record.json`) take it as they take any pick.
 */
import type { ChoiceEntry, SettledBy } from "@cawco/core/choices";
import { BUILT_IN, type BuiltInMember } from "@cawco/core/decides";
import type { ArtifactRow } from "./db/artifacts";

/** The pass's name in `data_migrations`. */
const SETTLED_NAMES = "settled_member_names";

/** Each route word a pick was settled by before members, as the member it is. */
const WAS: Record<string, BuiltInMember> = {
  advisor: "advisor",
  practice: "practice",
  agent: "asker",
};

/** `settled` as a member's record, when it is one from before members; undefined when it needs nothing. */
const namedSettled = (settled: unknown): SettledBy | undefined => {
  const was = settled as Partial<SettledBy> | null | undefined;
  if (!was || typeof was !== "object" || typeof was.name === "string") {
    return;
  }
  const member = typeof was.by === "string" ? WAS[was.by] : undefined;
  if (!member) {
    return;
  }
  return {
    by: member,
    name: BUILT_IN[member].name,
    runs: null,
    session: was.session ?? "",
    why: was.why ?? "",
    sources: was.sources ?? [],
  };
};

export interface SettledNamesDeps {
  readonly dataMigrated: (name: string) => boolean;
  readonly markDataMigrated: (name: string) => void;
  /** Every page whose state took a change. */
  readonly pages: () => ArtifactRow[];
  /** The page's doc's `state`, read. */
  readonly state: (id: string) => Record<string, ChoiceEntry>;
  /** Writes `entries` into the page's `state`, as the hub's own update. */
  readonly write: (id: string, entries: Record<string, ChoiceEntry>) => void;
}

/** The pass, once: answers the picks it named, or null when it had run. */
export const nameSettledOnce = (deps: SettledNamesDeps): number | null => {
  if (deps.dataMigrated(SETTLED_NAMES)) {
    return null;
  }
  let named = 0;
  for (const page of deps.pages()) {
    const entries: Record<string, ChoiceEntry> = {};
    for (const [key, entry] of Object.entries(deps.state(page.id))) {
      const settled = namedSettled(entry.settled);
      if (settled) {
        entries[key] = { ...entry, settled };
      }
    }
    if (Object.keys(entries).length > 0) {
      deps.write(page.id, entries);
      named += Object.keys(entries).length;
    }
  }
  deps.markDataMigrated(SETTLED_NAMES);
  return named;
};
