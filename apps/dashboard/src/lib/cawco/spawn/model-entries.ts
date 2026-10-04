import type { EffortLevel, ModelInfo } from "@cawco/core";
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

const CLAUDE_PREFIX = /^claude-/;
const CONTEXT_SUFFIX = /\[1m\]$/i;
const VERSION = /^v?\d+(?:\.\d+)*$/;
const VERSION_PREFIX = /^v/;
const ID_SHAPE = /^[\w.\-/[\]:]+$/;

/** A model's display name as the picker lists it, e.g. "Opus 5.5 · 1M". */
export function modelName(id: string, displayName?: string) {
  const slash = id.lastIndexOf("/");
  const provider = slash < 0 ? null : id.slice(0, slash);
  const raw = id.slice(slash + 1);
  const claude = raw.startsWith("claude-");
  const tokens = raw
    .replace(CLAUDE_PREFIX, "")
    .replace(CONTEXT_SUFFIX, "")
    .split("-");
  const family = tokens.shift() ?? "";
  const known =
    claude ||
    [
      "opus",
      "sonnet",
      "haiku",
      "deepseek",
      "gpt",
      "gemini",
      "qwen",
      "llama",
      "mistral",
      "grok",
    ].includes(family);
  if (!known) {
    return { name: displayName || id, provider, mono: !displayName };
  }
  const title = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
  const labels: Record<string, string> = { deepseek: "DeepSeek", gpt: "GPT" };
  const label = labels[family] ?? title(family);
  const version: string[] = [];
  while (tokens.length && VERSION.test(tokens[0])) {
    version.push(tokens.shift() as string);
  }
  const suffix = tokens.map(title).join(" ");
  const number = version.join(".").replace(VERSION_PREFIX, "V");
  return {
    name: `${label}${number ? `${family === "gpt" ? "-" : " "}${number}` : ""}${suffix ? ` ${suffix}` : ""}${CONTEXT_SUFFIX.test(raw) ? " · 1M" : ""}`,
    provider,
  };
}

export function deriveModelEntries(
  rows: ModelInfo[],
  use: ModelUse
): ModelEntry[] {
  const merged = new Map<string, ModelInfo[]>();
  for (const row of rows) {
    const id = row.resolvedModel ?? row.value;
    const group = merged.get(id) ?? [];
    group.push(row);
    merged.set(id, group);
  }
  return [...merged].map(([id, group]) => {
    const named =
      group.find((row) => row.value === id) ??
      group.find((row) => row.value !== "default");
    const dates = group
      .flatMap((row) => (row.released ? [row.released] : []))
      .sort();
    return {
      id,
      ...modelName(id, named?.displayName),
      released: dates.at(-1),
      lastUsedAt: use.lastUsedAt[id],
      isDefault: group.some((row) => row.value === "default"),
      contextWindow: group.find((row) => row.contextWindow)?.contextWindow,
      defaultEffort: group.find((row) => row.defaultEffort !== undefined)
        ?.defaultEffort,
      isCustom: false,
      effort: [
        ...new Set(group.flatMap((row) => row.supportedEffortLevels ?? [])),
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
