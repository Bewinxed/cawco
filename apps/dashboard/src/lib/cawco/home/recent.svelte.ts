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
 * person's last word) only while something of it waits on them (an ask, a
 * stop at its limit). A session that failed leaves with Done as a quiet one
 * does, and never without that press. A session a project or a task
 * started stands only while it needs the person.
 *
 * A transcript stored on a machine (its catalog, `cawco.catalogOf`) that was
 * run inside a project's folder there (core `projectAt`) is asked of the
 * hub, the whole list in one ask (`cawco.askStored`, core `StoredSessions`).
 * One a session of the hub wraps is that session: a row the board lists, or
 * one the hub answers with (`cawco.olderInstances`: the person's own
 * sessions the board no longer lists, and what nests under them), listed
 * by the one rule above, a delegate under its session. Only a transcript no
 * session wraps stands as a stored row, under its project: Your turn, never
 * unread, and no Done (the hub keeps nothing for a transcript it never ran
 * to archive it by). One outside every project's folder is found in Jump's
 * search.
 *
 * Order: the person's last message to it (`wroteAt`, a stored transcript's
 * read from it by its harness), else its start (`createdAt`): an agent's
 * reply never moves a row.
 */
import type { NeutralSessionInfo } from "@cawco/core/harness";
import { projectAt } from "@cawco/core/project-membership";
import { personsOwn } from "@cawco/core/protocol";
import { DAY_MS } from "@cawco/core/time";
import { sidebarWords } from "@cawco/core/words/sidebar";
import { untrack } from "svelte";
import { browser } from "$app/env";
import { epochOf } from "../board.svelte";
import {
  type BoardRow,
  cawco,
  isFailed,
  isStale,
  type ProjectRow,
} from "../client.svelte";
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
import { delegatesByTop } from "./session-branches";

export type RecentStatus = "working" | "needs" | "yours";
type Day = "today" | "yesterday" | "older";

/** What every row of the list says. */
interface EntryBase {
  /** When the person last wrote to it, else when it started: its place. */
  at: number;
  day: Day;
  /** The mark: its own status, or a failed delegate's dot under it. */
  mark: MarkStatus;
  status: RecentStatus;
  /** It ended a turn the person has not opened since (home-state `endedUnseen`). */
  unread: boolean;
}

/** One session the hub holds, with what its row says. */
export interface SessionEntry extends EntryBase {
  kind: "session";
  row: BoardRow;
  /** Every listed row under it, at any depth: its delegates. */
  under: BoardRow[];
}

/** One transcript stored on a machine, in a project's folder there. */
export interface StoredEntry extends EntryBase {
  info: NeutralSessionInfo;
  /** `machineId:sessionId`: unique across the fleet. */
  key: string;
  kind: "stored";
  machineId: string;
  /** The project whose folder holds it. */
  project: ProjectRow;
}

export type RecentEntry = SessionEntry | StoredEntry;

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

/** The person's own work: they started it, or wrote in it (the hub's rule too). */
const theirs = personsOwn;

/** Something of it waits on the person: an ask, or its stop at its account's limit. */
const waitsOnThem = (row: BoardRow): boolean =>
  cawco.activityOf(row.id) === "blocked" || !!row.stalled;

/** It waits on the person, or it failed. */
const needsThem = (row: BoardRow): boolean => waitsOnThem(row) || isFailed(row);

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

/**
 * The sessions Recent reads: the board's listed rows, then the older ones
 * the hub answered the stored transcripts with (`cawco.olderInstances`),
 * by id.
 */
class Sessions {
  readonly rows = $derived<BoardRow[]>([
    ...cawco.listedInstances,
    ...cawco.olderInstances,
  ]);
  readonly byId = $derived(
    new Map(this.rows.map((row) => [row.id, row] as const))
  );
}

const sessions = new Sessions();

/** Continued into a session the list reads: that one takes its row. */
const continued = (row: BoardRow): boolean =>
  !!row.continuedInto && sessions.byId.has(row.continuedInto);

/** Whether a session stands in Recent (see the module's head). */
function listedHere(row: BoardRow, from: BoardRow | undefined): boolean {
  if (isDelegate(row) || continued(row)) {
    return false;
  }
  if (waitsOnThem(row)) {
    return true;
  }
  // Done takes a failed session off as it takes a quiet one.
  if (done(row)) {
    return false;
  }
  return isFailed(row) || theirs(row) || (from !== undefined && theirs(from));
}

/**
 * The transcripts stored on the machines, each in a project's folder on
 * its machine: what Recent asks the hub of (`cawco.askStored`), and, of
 * them, the ones no session wraps, which stand as stored rows. Read again
 * only when a catalog, a machine or a project changes, never on a turn's
 * frames: a machine's catalog is a thousand and more. Their day is the
 * list's, read with the clock.
 */
class StoredTranscripts {
  /** The machines' ids, as text: the same text while none is added or removed. */
  readonly #machineIds = $derived(
    cawco.machines.map((machine) => machine.machineId).join("\n")
  );

  /** Every stored transcript in a project's folder, wrapped or not. */
  readonly #inProjects = $derived.by(() => {
    const out: Omit<StoredEntry, "day">[] = [];
    for (const machineId of this.#machineIds.split("\n")) {
      if (!machineId) {
        continue;
      }
      for (const info of cawco.catalogOf(machineId)) {
        const project = projectAt(cawco.projects, {
          machineId,
          cwd: info.cwd ?? "",
        });
        if (!project) {
          continue;
        }
        out.push({
          kind: "stored",
          key: `${machineId}:${info.sessionId}`,
          info,
          machineId,
          project,
          at: info.wroteAt ?? info.createdAt ?? 0,
          status: "yours",
          mark: "idle",
          unread: false,
        });
      }
    }
    return out;
  });

  /** Their harness keys, as text: the same text while the hub's answer for them holds. */
  readonly keys = $derived(
    [...new Set(this.#inProjects.map((entry) => entry.info.sessionId))]
      .sort()
      .join("\n")
  );

  /** The ones the hub said no session wraps. */
  readonly entries = $derived(
    this.#inProjects.filter((entry) => cawco.storedAlone(entry.info.sessionId))
  );
}

const stored = new StoredTranscripts();

// The hub is asked what it holds behind them once the catalogs are in, and
// again when the transcripts in the projects' folders change.
if (browser) {
  $effect.root(() => {
    $effect(() => {
      if (!cawco.catalogsRead) {
        return;
      }
      const { keys } = stored;
      untrack(() => cawco.askStored(keys ? keys.split("\n") : []));
    });
  });
}

/** Recent's rows, newest first: read only where the list is drawn. */
export function recentEntries(): RecentEntry[] {
  const listed = sessions.rows;
  const under = delegatesByTop(listed, sessions.byId);
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
      kind: "session",
      row,
      status,
      mark: markOf(row, status, delegates),
      unread: endedUnseen(row),
      at,
      day: dayOf(at, now),
      under: delegates,
    });
  }
  for (const entry of stored.entries) {
    entries.push({ ...entry, day: dayOf(entry.at, now) });
  }
  return entries.sort((a, b) => b.at - a.at || (keyOf(a) < keyOf(b) ? -1 : 1));
}

/** A row's key in the list: a session's id, a stored transcript's `machineId:sessionId`. */
const keyOf = (entry: RecentEntry): string =>
  entry.kind === "session" ? entry.row.id : entry.key;

/** The entry's project, if it is in one. */
const projectOf = (entry: RecentEntry) => {
  if (entry.kind === "stored") {
    return entry.project;
  }
  return entry.row.projectId ? cawco.project(entry.row.projectId) : null;
};

/** The machine a row is on. */
const machineOf = (entry: RecentEntry): string =>
  entry.kind === "session" ? entry.row.machineId : entry.machineId;

/** The group a session falls in, by one level: its key and its words. */
function groupOf(
  entry: RecentEntry,
  by: GroupBy
): { key: string; label: string } {
  switch (by) {
    case "day":
      return { key: entry.day, label: sidebarWords[entry.day] };
    case "project": {
      const project = projectOf(entry);
      return project
        ? { key: project.id, label: project.name }
        : { key: "", label: sidebarWords.noProject };
    }
    case "area": {
      const id = areaIdOf(projectOf(entry) ?? undefined);
      const name = id ? areas.nameOf(id) : null;
      return id && name
        ? { key: id, label: name }
        : { key: "", label: sidebarWords.noArea };
    }
    case "machine":
      return {
        key: machineOf(entry),
        label: machineName(machineOf(entry)),
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
