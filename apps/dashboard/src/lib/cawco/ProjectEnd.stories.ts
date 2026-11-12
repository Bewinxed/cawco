/**
 * Ending a project (Component Story Format 3, live): the tray that unfolds
 * under the project's head, or under its row in the rail, when More's
 * "Forget project…" or "Delete project…" is pressed. StopTrayView draws it
 * from its job in stop-work.svelte.ts; these are its steps with the records the
 * hub held for "Private office" on 2026-11-04 (its Caw and three delegates
 * running on obelisk, its checkout and a second on kestrel).
 */

import type { Activity } from "@cawco/core/activity";
import { projectTrashWords } from "@cawco/core/words/project-trash";
import {
  ACTIVITY,
  MACHINES,
  NAME,
  partway,
  RUNNING,
  tray,
} from "./project-end-fixtures";
import StopTrayView from "./StopTrayView.svelte";
import type { StopRow } from "./stop-work.svelte";

export default {
  title: "Project/End a project",
  component: StopTrayView,
  args: {
    ...tray({}),
    share: "stop-tray:story",
    fillOf: (row: StopRow) => `var(--color-mark-${(row.s.id.length % 8) + 1})`,
    trailOf: () => "",
    onconfirm: () => undefined,
    oncancel: () => undefined,
    onkeep: () => undefined,
    onfromdisk: () => undefined,
    onstopone: () => undefined,
    onarrive: () => undefined,
    ondepart: () => undefined,
    ongone: () => undefined,
    activityOf: (id: string): Activity => ACTIVITY[id] ?? "idle",
    nameOf: (id: string) => MACHINES[id] ?? id,
  },
  /* Its width under the project's head on a desk: the head's tray column (max-w-128). */
  parameters: { viewport: 512 },
};

/** Delete with its files: both checkouts listed by machine and path, one press. */
export const DeleteWithFiles = {
  args: tray({ kind: "delete", fromDisk: true }),
};

/** Forget with nothing running: one press, and it waits in Forgotten projects. */
export const Forget = {};

/** Forget with four running: they stop first. */
export const ForgetRunning = {
  args: tray({ phase: "list", rows: RUNNING }),
};

/** Two are mid-turn: the first press armed, the line says what the second does. */
export const ForgetArmed = {
  args: tray({ phase: "armed", rows: RUNNING }),
};

/** The stops landing: two in, two still stopping. */
export const ForgetStopping = {
  args: tray({
    phase: "stopping",
    rows: partway(RUNNING),
    total: 4,
    pressedAt: Date.now(),
  }),
};

/** Forgotten: held where it was asked, before the page goes home and the toast offers Bring back. */
export const Forgotten = {
  args: tray({
    phase: "done",
    rows: RUNNING.map((each) => ({
      ...each,
      state: "stopped" as const,
      departed: true,
      arrived: true,
      gone: true,
    })),
    total: 4,
  }),
};

/** Delete with nothing running, its files kept: what stays is said. */
export const Delete = {
  args: tray({ kind: "delete" }),
};

/** Delete with four running: they stop first, the files box under them. */
export const DeleteRunning = {
  args: tray({ kind: "delete", phase: "list", rows: RUNNING }),
};

/** Deleting: the press went, the box holds what was chosen. */
export const Deleting = {
  args: tray({ kind: "delete", fromDisk: true, phase: "ending" }),
};

/** Deleted: held where it was asked, before the page goes home. */
export const Deleted = {
  args: tray({ kind: "delete", fromDisk: true, phase: "done" }),
};

/** Refused: a session started meanwhile still runs. */
export const RefusedRunning = {
  args: tray({
    kind: "delete",
    refusal: projectTrashWords.stillRuns(NAME, 1),
  }),
};

/** Refused: kestrel holds a checkout and is away; nothing was removed. */
export const RefusedAway = {
  args: tray({
    kind: "delete",
    fromDisk: true,
    refusal: projectTrashWords.machinesAway(NAME, ["kestrel"]),
  }),
};

/** Refused: its checkout is another project's place too. */
export const RefusedShared = {
  args: tray({
    kind: "delete",
    fromDisk: true,
    refusal: projectTrashWords.placeShared(
      NAME,
      "/home/bewinxed/office",
      "obelisk",
      "Cawco"
    ),
  }),
};

/** Refused: obelisk's agent predates deleting a workspace, so its clone stayed. */
export const RefusedOldAgent = {
  args: tray({
    kind: "delete",
    refusal: projectTrashWords.notRemoved(
      NAME,
      "Workspace 3d062e2d",
      "obelisk",
      "its machine kept the clone: its agent predates deleting a project for good"
    ),
  }),
};

/** A project whose only place is its folder on the hub: nothing on a machine to remove. */
export const DeleteHubOnly = {
  args: tray({ kind: "delete", fromDisk: true, places: [] }),
};

/** Under its row in the rail: the same tray in the rail's 228px. */
export const DeleteInRail = {
  args: tray({
    kind: "delete",
    fromDisk: true,
    phase: "list",
    rows: RUNNING,
    at: "rail:office",
  }),
  parameters: { viewport: 228 },
};

/** On a phone: delete with its files and four running, under the head. */
export const DeletePhone = {
  args: tray({ kind: "delete", fromDisk: true, phase: "list", rows: RUNNING }),
  parameters: { viewport: 390 },
};

/** On a phone: two mid-turn, armed. */
export const ForgetArmedPhone = {
  args: tray({ phase: "armed", rows: RUNNING }),
  parameters: { viewport: 390 },
};
