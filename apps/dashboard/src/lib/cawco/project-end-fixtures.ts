/**
 * "Private office" as the hub held it on 2026-11-04: its Caw and three
 * delegates running on obelisk (Caw and one delegate mid-turn), its
 * checkout there and a second on kestrel. The end tray's stories and its
 * preview (`/dev/project-ends`) draw from it.
 */

import type { Activity } from "@cawco/core/activity";
import { type EndWords, projectEndWords } from "@cawco/core/words/project-ends";
import type { StopJob, StopRow } from "./stop-work.svelte";

export const NAME = "Private office";

export const MACHINES: Record<string, string> = {
  m1: "obelisk",
  m2: "kestrel",
};

const row = (
  id: string,
  title: string,
  over: Partial<StopRow["s"]> = {},
  state: StopRow["state"] = "running"
): StopRow => ({
  s: {
    cwd: "/home/bewinxed/office",
    id,
    machineId: "m1",
    offline: false,
    parentId: null,
    title,
    ...over,
  },
  view: {},
  state,
  owed: false,
  departed: state === "stopped",
  arrived: state === "stopped",
  gone: state === "stopped",
  error: null,
});

/** Caw and the three delegates he started, as the rail nests them. */
export const RUNNING: StopRow[] = [
  row("caw", "Caw"),
  row("d1", "Download HMC OneDrive BI and Documents", { parentId: "caw" }),
  row("d2", "Map Omar's HMC work mailbox", { parentId: "caw" }),
  row("d3", "Extract HMC Inbox 2020-2022", { parentId: "d2" }),
];

/** Caw mid-turn and one delegate working; the other two at rest. */
export const ACTIVITY: Record<string, Activity> = {
  caw: "working",
  d2: "working",
};

const PLACES: StopJob["places"] = [
  { machineId: "m1", path: "/home/bewinxed/office" },
  { machineId: "m2", path: "/Users/omar/Documents/office-archive-2026" },
];

const job = (over: Partial<StopJob>): StopJob => ({
  at: "head:office",
  fromDisk: false,
  kind: "forget",
  off: false,
  open: true,
  phase: "none",
  picked: [],
  places: PLACES,
  pressedAt: 0,
  projectId: "office",
  projectName: NAME,
  refusal: null,
  rows: [],
  total: 0,
  ...over,
});

/** Each row's stop part-way: two landed, two still stopping. */
export const partway = (rows: StopRow[]): StopRow[] =>
  rows.map((each) =>
    ["d1", "d3"].includes(each.s.id)
      ? { ...each, state: "stopped", departed: true, arrived: true, gone: true }
      : { ...each, state: "stopping" }
  );

/** A tray's args for StopTrayView: the job, and its end's words. */
export const tray = (
  over: Partial<StopJob>
): { job: StopJob; words: EndWords } => {
  const one = job(over);
  return {
    job: one,
    words:
      one.kind === "delete"
        ? projectEndWords.delete(
            one.projectName,
            one.fromDisk && one.places.length > 0
          )
        : projectEndWords.forget(one.projectName),
  };
};
