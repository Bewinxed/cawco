/**
 * The sidebar's one Recent list (tsk-323), as a model the rail and the
 * phone's home both draw: every session the person started or wrote in,
 * newest first by their own last word, each with its status in the three
 * words the list knows, grouped by up to three levels (grouping.svelte.ts).
 *
 * - Working: the agent writes a reply, or work it started still runs (its
 *   delegates, its project moving it), or its turn ended with work of its
 *   own that will start it again (the hub's `wakesItself`, core
 *   `waitsOnItself`) or a send waiting for it (the hub's `queuedSends`).
 * - Needs you: an ask waits on the person, or it failed, or it stopped at
 *   its account's limit.
 * - Your turn: its turn ended and nothing will start it again.
 *
 * Who is listed: a session the person started (`origin: "person"`) or wrote
 * in (`wroteAt`), never a delegate (it folds under its session), a session
 * continued into another only as that other one (`continuedInto`: the
 * continuation takes its row), and one pressed Done (`doneAt` past the
 * person's last word) only while it needs them. A session a project or a
 * task started stands only while it needs the person.
 *
 * Order: the person's last message to it (`wroteAt`), else its start
 * (`createdAt`): an agent's reply never moves a row.
 */
import { topsIn } from "@cawco/core/project-membership";
import { DAY_MS } from "@cawco/core/time";
import { sidebarWords } from "@cawco/core/words/sidebar";
import { epochOf } from "../board.svelte";
import { type BoardRow, cawco, isFailed, isStale } from "../client.svelte";
import { markHue } from "../mark";
import { folderOf } from "../projects";
import type { MarkStatus } from "../TreeMark.svelte";
import { areaIdOf, areas } from "./areas.svelte";
import type { GroupBy } from "./grouping.svelte";
import {
  clock,
  endedUnseen,
  isDelegate,
  machineName,
} from "./home-state.svelte";

export type RecentStatus = "working" | "needs" | "yours";
type Day = "today" | "yesterday" | "older";

/** One session of the list, with what its row says. */
export interface RecentEntry {
  /** When the person last wrote to it, else when it started: its place. */
  at: number;
  day: Day;
  /** The mark: its own status, or a failed delegate's dot under it. */
  mark: MarkStatus;
  row: BoardRow;
  status: RecentStatus;
  /** Every listed row under it, at any depth: its delegates. */
  under: BoardRow[];
  /** It ended a turn the person has not opened since (home-state `endedUnseen`). */
  unread: boolean;
}

/** A group parent and what hangs under it: groups of the next level, or the sessions. */
export interface RecentGroup {
  by: GroupBy;
  entries: RecentEntry[];
  /** The next level's groups; null at the last level. */
  groups: RecentGroup[] | null;
  /** Its key at its level: a day, a project's id, an area's, a machine's ("" for none). */
  key: string;
  label: string;
  /** Its key and every key above it: unique in the list, its fold's name. */
  path: string;
}

/** A stamp the hub sent: neither absent nor null. */
const stamped = (value: unknown): boolean =>
  value !== null && value !== undefined;

/** The person's own work: they started it, or wrote in it. */
const theirs = (row: BoardRow): boolean =>
  row.origin === "person" || stamped(row.wroteAt);

/** An ask waits on the person, or it failed, or it stopped at its account's limit. */
const needsThem = (row: BoardRow): boolean =>
  cawco.activityOf(row.id) === "blocked" || isFailed(row) || !!row.stalled;

/** When the person last wrote to it, else when it started. */
const placeOf = (row: BoardRow): number =>
  stamped(row.wroteAt) ? epochOf(row, "wroteAt") : epochOf(row, "createdAt");

/** Pressed Done after the person's last word to it. */
const done = (row: BoardRow): boolean =>
  stamped(row.doneAt) && epochOf(row, "doneAt") >= epochOf(row, "wroteAt");

/** Its status in the list's three words. */
function statusOf(row: BoardRow): RecentStatus {
  if (needsThem(row)) {
    return "needs";
  }
  const live = row.status === "running" || row.status === "moving";
  if (
    row.status === "starting" ||
    row.status === "moving" ||
    cawco.activityOf(row.id) === "working" ||
    (live && (row.wakesItself === true || (row.queuedSends ?? 0) > 0))
  ) {
    return "working";
  }
  return "yours";
}

/** Its mark: needs you's dot, a failure's (its own or a delegate's), the echo, or nothing. */
function markOf(
  row: BoardRow,
  status: RecentStatus,
  under: BoardRow[]
): MarkStatus {
  if (isStale(row)) {
    return "idle";
  }
  if (status === "needs") {
    return isFailed(row) || row.stalled ? "fail" : "attn";
  }
  if (under.some(isFailed)) {
    return "fail";
  }
  return status === "working" ? "live" : "idle";
}

/** The day group `at` falls in, by the reader's own calendar. */
function dayOf(at: number, now: number): Day {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const start = today.getTime();
  if (at >= start) {
    return "today";
  }
  return at >= start - DAY_MS ? "yesterday" : "older";
}

/** Each listed top's delegates, at any depth. */
function delegatesByTop(listed: BoardRow[]): Map<string, BoardRow[]> {
  const topOf = topsIn(cawco.listedById);
  const under = new Map<string, BoardRow[]>();
  for (const row of listed) {
    const top = topOf(row);
    if (top !== row) {
      const held = under.get(top.id);
      if (held) {
        held.push(row);
      } else {
        under.set(top.id, [row]);
      }
    }
  }
  return under;
}

/** Continued into a listed session: that one takes its row. */
const continued = (row: BoardRow): boolean =>
  !!row.continuedInto && cawco.listedById.has(row.continuedInto);

/** Whether a session stands in Recent (see the module's head). */
function listedHere(row: BoardRow, from: BoardRow | undefined): boolean {
  if (isDelegate(row) || continued(row)) {
    return false;
  }
  const own = theirs(row) || (from !== undefined && theirs(from));
  return needsThem(row) || (own && !done(row));
}

/** Recent's sessions, newest first: read only where the list is drawn. */
export function recentEntries(): RecentEntry[] {
  const listed = cawco.listedInstances;
  const under = delegatesByTop(listed);
  /** The sessions continued into another listed one, by that one: theirs if the old was. */
  const continuedFrom = new Map<string, BoardRow>();
  for (const row of listed) {
    if (continued(row) && row.continuedInto) {
      continuedFrom.set(row.continuedInto, row);
    }
  }
  const { now } = clock;
  const entries: RecentEntry[] = [];
  for (const row of listed) {
    if (!listedHere(row, continuedFrom.get(row.id))) {
      continue;
    }
    const status = statusOf(row);
    const delegates = under.get(row.id) ?? [];
    const at = placeOf(row);
    entries.push({
      row,
      status,
      mark: markOf(row, status, delegates),
      unread: endedUnseen(row),
      at,
      day: dayOf(at, now),
      under: delegates,
    });
  }
  return entries.sort((a, b) => b.at - a.at || (a.row.id < b.row.id ? -1 : 1));
}

/** The row's project, if it is in one. */
const projectOf = (row: BoardRow) =>
  row.projectId ? cawco.project(row.projectId) : null;

/** The group a session falls in, by one level: its key and its words. */
function groupOf(
  entry: RecentEntry,
  by: GroupBy
): { key: string; label: string } {
  switch (by) {
    case "day":
      return { key: entry.day, label: sidebarWords[entry.day] };
    case "project": {
      const project = projectOf(entry.row);
      return project
        ? { key: project.id, label: project.name }
        : { key: "", label: sidebarWords.noProject };
    }
    case "area": {
      const id = areaIdOf(projectOf(entry.row) ?? undefined);
      const name = id ? areas.nameOf(id) : null;
      return id && name
        ? { key: id, label: name }
        : { key: "", label: sidebarWords.noArea };
    }
    case "machine":
      return {
        key: entry.row.machineId,
        label: machineName(entry.row.machineId),
      };
    default:
      return by satisfies never;
  }
}

/**
 * The entries under `levels`, each level a group parent in the order of its
 * newest session (the entries come newest first), so Today leads and a
 * project lately written in stands above one gone quiet.
 */
export function groupEntries(
  entries: RecentEntry[],
  levels: GroupBy[],
  above = ""
): RecentGroup[] {
  const [by, ...rest] = levels;
  if (!by) {
    return [];
  }
  const groups = new Map<string, RecentGroup>();
  for (const entry of entries) {
    const { key, label } = groupOf(entry, by);
    let group = groups.get(key);
    if (!group) {
      const path = `${above}${above ? "/" : ""}${by}:${key}`;
      group = { by, key, label, path, entries: [], groups: null };
      groups.set(key, group);
    }
    group.entries.push(entry);
  }
  const out = [...groups.values()];
  if (rest.length > 0) {
    for (const group of out) {
      group.groups = groupEntries(group.entries, rest, group.path);
    }
  }
  return out;
}

/** A project group's hue, the one its project's row wears. */
export function projectHue(key: string) {
  const project = key ? cawco.project(key) : null;
  return markHue(project ? folderOf(project) : "");
}

/** A machine group's operating system, for its mark. */
export const machineOs = (machineId: string): string =>
  cawco.machines.find((machine) => machine.machineId === machineId)?.os ?? "";
