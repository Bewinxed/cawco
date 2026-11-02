/**
 * One file a delegate handed in, drawn as what it is (Component Story
 * Format 3, live components), from where the hub serves its bytes (`src`):
 * here the cawco project's folder on the hub (folderRawHref), the route a
 * report's outputs and the file card read; a task's Made list reads its
 * task's own outputs route (outputUrl) the same way. A picture opens in
 * the lightbox; a plain file keeps its row with Open.
 */
import { folderRawHref } from "../project-tasks";
import TaskOutput from "./TaskOutput.svelte";

/** The cawco project, whose folder holds these files. */
const PROJECT = "70ac3d41-5a28-4a31-8e9e-3be2b03d1516";
const PICTURE = "assets/7e946561/check2-whole.png";
const LOG = "assets/task-sheet-captures-v2/live/iPhone-log.txt";

export default {
  title: "Tasks/Output",
  component: TaskOutput,
  args: {
    projectId: PROJECT,
    path: PICTURE,
    src: folderRawHref(PROJECT, PICTURE),
  },
};

/** A picture under its file row. */
export const Picture = {};

/** The same picture small, as the project's Made list draws it. */
export const PictureCompact = { args: { compact: true } };

/** Bare, as the file card draws it under its own path: no file row. */
export const PictureBare = { args: { bare: true } };

/** A plain file: its row and Open, even bare. */
export const File = {
  args: { path: LOG, src: folderRawHref(PROJECT, LOG), bare: true },
};
