import {
  type EffortLevel,
  isEffortLevel,
  type ModelInfo,
} from "@cawco/core/harness/kinds";
import { modelNameIn, modelRun, providerOf } from "@cawco/core/model-names";
import type { ModelUse } from "./modelUse.svelte";

export interface ModelEntry {
  aliases: string[];
  /** Tokens of context the harness reports for this model; absent is unknown. */
  contextWindow?: number;
  defaultEffort?: EffortLevel | null;
  effort: EffortLevel[];
  id: string;
  isCustom: boolean;
  isDefault: boolean;
  lastUsedAt?: string;
  mono?: boolean;
  name: string;
  provider: string | null;
  released?: string;
}

const ID_SHAPE = /^[\w.\-/[\]:]+$/u;

export function deriveModelEntries(
  rows: ModelInfo[],
  use: ModelUse
): ModelEntry[] {
  const merged = new Map<string, ModelInfo[]>();
  for (const row of rows) {
    const id = modelRun(row);
    const group = merged.get(id) ?? [];
    group.push(row);
    merged.set(id, group);
  }
  return [...merged].map(([id, group]) => {
    const name = modelNameIn(rows, id);
    const dates = group
      .flatMap((row) => (row.released ? [row.released] : []))
      .sort();
    // The harness's own effort words, kept to the levels CawCo can send: a
    // level a later release lists is not offered until CawCo knows it.
    const measured = group.find(
      (row) => row.defaultEffort !== undefined
    )?.defaultEffort;
    return {
      id,
      name: name ?? id,
      provider: providerOf(id) ?? null,
      mono: name === null,
      released: dates.at(-1),
      lastUsedAt: use.lastUsedAt[id],
      isDefault: group.some((row) => row.value === "default"),
      contextWindow: group.find((row) => row.contextWindow)?.contextWindow,
      defaultEffort:
        measured === null || isEffortLevel(measured) ? measured : undefined,
      isCustom: false,
      effort: [
        ...new Set(
          group.flatMap((row) =>
            (row.supportedEffortLevels ?? []).filter(isEffortLevel)
          )
        ),
      ],
      aliases: [
        ...new Set(
          group.filter((row) => row.value !== id).map((row) => row.value)
        ),
      ],
    };
  });
}

export function groupModelEntries(
  entries: ModelEntry[],
  use: ModelUse,
  typed: string[]
): { group: "new" | "recent" | "all" | "typed"; entries: ModelEntry[] }[] {
  const groups: ReturnType<typeof groupModelEntries> = [
    { group: "new", entries: [] },
    { group: "recent", entries: [] },
    { group: "all", entries: [] },
    { group: "typed", entries: [] },
  ];
  for (const entry of entries) {
    const fallback = entry.lastUsedAt ? 1 : 2;
    const index =
      use.lastSpawnAt &&
      entry.released &&
      Date.parse(entry.released) > Date.parse(use.lastSpawnAt)
        ? 0
        : fallback;
    groups[index].entries.push(entry);
  }
  for (const group of groups) {
    group.entries.sort((a, b) =>
      (group.group === "recent"
        ? (b.lastUsedAt ?? "")
        : (b.released ?? "")
      ).localeCompare(
        group.group === "recent" ? (a.lastUsedAt ?? "") : (a.released ?? "")
      )
    );
  }
  groups[3].entries = [...new Set(typed)]
    .filter(
      (id) =>
        !entries.some((entry) => entry.id === id || entry.aliases.includes(id))
    )
    .map((id) => ({
      id,
      name: id,
      provider: null,
      isDefault: false,
      isCustom: true,
      effort: [],
      aliases: [],
      mono: true,
      lastUsedAt: use.lastUsedAt[id],
    }));
  return groups.filter((group) => group.entries.length > 0);
}

export function matchesQuery(entry: ModelEntry, q: string): boolean {
  return [entry.name, entry.id, ...entry.aliases, entry.provider ?? ""].some(
    (text) => text.toLowerCase().includes(q.trim().toLowerCase())
  );
}

export function isIdShaped(q: string): boolean {
  return ID_SHAPE.test(q);
}
