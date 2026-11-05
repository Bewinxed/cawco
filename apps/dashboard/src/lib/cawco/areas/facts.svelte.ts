/**
 * What each area's folder sets, read from the hub per area: its Who
 * decides (how many kinds it hands over itself) and its own delegate types.
 * An area's page and its delegate types read them here; each is read again
 * when the hub says the projects changed (an area's every change says it).
 */
import type { DecidesTable } from "@cawco/core/decides";
import { readTable } from "../decides/decides-client";
import { failureWords } from "../hub-read";
import { type AreaTypes, readAreaTypes } from "./areas";

export interface FolderFacts {
  /** Its own table over the fleet's; null until read. */
  decides: DecidesTable | null;
  /** Why it could not be read; null when it was. */
  problem: string | null;
  /** Its own delegate types; null until read. */
  types: AreaTypes | null;
}

/** The kinds an area's own decides.md hands over, by id. */
export const ownKinds = (table: DecidesTable | null): string[] =>
  table
    ? Object.keys(table.from).filter((kind) => table.from[kind] === "area")
    : [];

export class AreaFacts {
  byArea = $state<Record<string, FolderFacts>>({});

  /** Reads area `id`'s folder facts, keeping what was read while it does. */
  async load(id: string): Promise<void> {
    try {
      const [decides, types] = await Promise.all([
        readTable({ area: id }),
        readAreaTypes(id),
      ]);
      this.byArea[id] = {
        decides: decides.decides,
        types,
        problem: null,
      };
    } catch (error) {
      this.byArea[id] = {
        decides: this.byArea[id]?.decides ?? null,
        types: this.byArea[id]?.types ?? null,
        problem: failureWords(error),
      };
    }
  }

  of(id: string): FolderFacts | undefined {
    return this.byArea[id];
  }
}
