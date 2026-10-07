import type { InstanceRow, NeutralSessionInfo } from "@cawco/core";
import { catalogTitle, conversationHref, indexInstances } from "./links";

/** Which of the four groups a row belongs to — decides its icon and its cap. */
export type JumpKind = "project" | "machine" | "live" | "stored";

export interface JumpRow {
  detail: string;
  detailLower: string;
  hay: string;
  href: string;
  id: string;
  kind: JumpKind;
  label: string;
  labelLower: string;
}

/** A row that survived the query, carrying where the query matched it. */
export interface RankedRow extends JumpRow {
  /** Character ranges of the match inside `detail`; empty when it matched elsewhere. */
  detailRanges: Range[];
  /** Character ranges of the match inside `label`; empty when it matched elsewhere. */
  labelRanges: Range[];
}

/** A `[start, end)` slice of a string that the query matched. */
export type Range = [number, number];

export interface JumpGroup {
  name: string;
  rows: RankedRow[];
}

export interface JumpIndex {
  groups: { name: string; rows: JumpRow[] }[];
  recent: JumpGroup[];
  /** sessionId → its title, so a transcript hit can name the conversation it is in. */
  sessionTitles: Map<string, string>;
}

export interface JumpIndexInput {
  /** Sessions never listed (a project's lead): their stored transcripts are left out. */
  hidden: ReadonlySet<string>;
  instances: readonly InstanceRow[];
  onlineMachines: ReadonlyArray<{
    machineId: string;
    hostname: string;
    os: string;
  }>;
  projects: ReadonlyArray<{ id: string; name: string; cwd: string }>;
  /** Running sessions and threads as lists show them; `label` names a thread. */
  running: ReadonlyArray<{
    id: string;
    cwd: string;
    activityLabel: string;
    label?: string;
  }>;
  stored: ReadonlyArray<{
    machineId: string;
    hostname: string;
    catalog: NeutralSessionInfo[];
  }>;
}

const RECENT_PER_MACHINE = 8;
const GROUPS = ["Projects", "Machines", "Running sessions", "Recent sessions"];
const KINDS: JumpKind[] = ["project", "machine", "live", "stored"];
const CAPS: Record<string, number> = {
  Projects: 8,
  Machines: 8,
  "Running sessions": 10,
  "Recent sessions": 16,
};
/**
 * The empty-query view is a preview, not a listing. Uncapped it mounted every
 * running session on this fleet — 82 rows, and the long tasks that came with
 * them — before a key had been pressed.
 */
const PREVIEW_CAP = 8;
const leaf = (path: string) => path.split("/").filter(Boolean).pop() ?? path;

const preview = (rows: JumpRow[]): RankedRow[] =>
  rows.slice(0, PREVIEW_CAP).map(unranked);

/** A row shown without a query: nothing matched, so nothing is highlighted. */
const unranked = (row: JumpRow): RankedRow => ({
  ...row,
  labelRanges: [],
  detailRanges: [],
});

export function buildJumpIndex(input: JumpIndexInput): JumpIndex {
  const index = indexInstances(input.instances);
  const groups = GROUPS.map((name, i) => ({
    name,
    kind: KINDS[i],
    rows: [] as JumpRow[],
  }));
  const recentStored: JumpRow[] = [];
  const sessionTitles = new Map<string, string>();
  for (const project of input.projects) {
    groups[0].rows.push({
      id: `project:${project.id}`,
      kind: "project",
      label: project.name,
      detail: project.cwd,
      href: `/project/${project.id}`,
      hay: "",
      labelLower: "",
      detailLower: "",
    });
  }
  for (const machine of input.onlineMachines) {
    groups[1].rows.push({
      id: `machine:${machine.machineId}`,
      kind: "machine",
      label: machine.hostname,
      detail: `${machine.os} · start a session here`,
      href: `/session?spawn=${machine.machineId}`,
      hay: "",
      labelLower: "",
      detailLower: "",
    });
  }
  for (const instance of input.running) {
    groups[2].rows.push({
      id: `live:${instance.id}`,
      kind: "live",
      label: instance.label ?? (leaf(instance.cwd) || instance.id),
      detail: `${instance.cwd || "—"} · ${instance.activityLabel}`,
      href: conversationHref(instance.id, index),
      hay: "",
      labelLower: "",
      detailLower: "",
    });
  }
  const destinations = new Set(groups[2].rows.map((row) => row.href));
  for (const machine of input.stored) {
    for (const [i, info] of machine.catalog
      .filter((each) => !input.hidden.has(each.sessionId))
      .entries()) {
      const title = catalogTitle(info, index, machine.machineId);
      sessionTitles.set(info.sessionId, title);
      const href = conversationHref(info.sessionId, index, {
        machineId: machine.machineId,
        cwd: info.cwd,
      });
      if (destinations.has(href)) {
        continue;
      }
      destinations.add(href);
      const row: JumpRow = {
        id: `stored:${machine.machineId}:${info.sessionId}`,
        kind: "stored",
        label: title,
        detail: `${machine.hostname} · ${info.cwd ?? ""}`,
        href,
        hay: "",
        labelLower: "",
        detailLower: "",
      };
      groups[3].rows.push(row);
      if (i < RECENT_PER_MACHINE) {
        recentStored.push(row);
      }
    }
  }
  for (const group of groups) {
    for (const row of group.rows) {
      row.labelLower = row.label.toLowerCase();
      row.detailLower = row.detail.toLowerCase();
      row.hay = `${row.labelLower} ${row.detailLower}`;
    }
  }
  return {
    sessionTitles,
    groups: groups.filter((group) => group.rows.length > 0),
    recent: [
      ...groups
        .slice(0, 3)
        .map((g) => ({ name: g.name, rows: preview(g.rows) })),
      { name: GROUPS[3], rows: preview(recentStored) },
    ].filter((group) => group.rows.length > 0),
  };
}

function matches(haystack: string, needle: string): boolean {
  let at = 0;
  for (const char of needle) {
    const found = haystack.indexOf(char, at);
    if (found === -1) {
      return false;
    }
    at = found + 1;
  }
  return true;
}

/**
 * Where `needle` sits inside `text` — a contiguous run when the text contains
 * it outright, otherwise the individual characters a subsequence match walked
 * through, merged into runs. Empty when it is not in there at all.
 *
 * Computed only for rows that survived the cut, never for the whole catalogue.
 */
export function rangesOf(lower: string, needle: string): Range[] {
  const at = lower.indexOf(needle);
  if (at !== -1) {
    return [[at, at + needle.length]];
  }
  const ranges: Range[] = [];
  let cursor = 0;
  for (const char of needle) {
    const found = lower.indexOf(char, cursor);
    if (found === -1) {
      return [];
    }
    const last = ranges.at(-1);
    if (last && last[1] === found) {
      last[1] = found + 1;
    } else {
      ranges.push([found, found + 1]);
    }
    cursor = found + 1;
  }
  return ranges;
}

export function filterJumpIndex(index: JumpIndex, query: string): JumpGroup[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return index.recent;
  }
  return index.groups
    .map((group) => {
      const ranked: { row: JumpRow; tier: number }[] = [];
      for (const row of group.rows) {
        let tier: number;
        if (row.labelLower.startsWith(needle)) {
          tier = 0;
        } else if (row.labelLower.includes(needle)) {
          tier = 1;
        } else if (row.hay.includes(needle)) {
          tier = 2;
        } else if (matches(row.hay, needle)) {
          tier = 3;
        } else {
          continue;
        }
        ranked.push({ row, tier });
      }
      return {
        name: group.name,
        // Ranges are resolved after the cap, so highlighting costs the ~50
        // rows on screen rather than every row that matched.
        rows: ranked
          .sort((a, b) => a.tier - b.tier)
          .slice(0, CAPS[group.name])
          .map(({ row }) => ({
            ...row,
            labelRanges: rangesOf(row.labelLower, needle),
            detailRanges: rangesOf(row.detailLower, needle),
          })),
      };
    })
    .filter((group) => group.rows.length > 0);
}
