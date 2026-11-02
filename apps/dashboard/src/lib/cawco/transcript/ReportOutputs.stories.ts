/**
 * A delegate's report's outputs under its closed card (Component Story
 * Format 3, live components): each file its finish copied into the
 * project's folder, drawn as what it is. The records are the cawco
 * project's own folder on the hub: a browser delegate's check screenshot
 * (`assets/7e946561/check2-whole.png`) and the task-sheet captures, read
 * through the folder's raw route. A picture opens in the lightbox with
 * the report's other pictures as one swipe set; any other file is a chip
 * to its file card.
 */
import ReportOutputs from "./ReportOutputs.svelte";

/** The cawco project, whose folder holds these files. */
const PROJECT = "70ac3d41-5a28-4a31-8e9e-3be2b03d1516";
const CAPTURES = "assets/task-sheet-captures-v2/live";

export default {
  title: "Transcript/Report outputs",
  component: ReportOutputs,
  args: {
    projectId: PROJECT,
    files: ["assets/7e946561/check2-whole.png"],
  },
};

/** One picture: the check's whole-view screenshot, inline under the headline. */
export const Picture = {};

/** Two pictures and the run's log and parts: the pictures a swipe set, the rest chips. */
export const PicturesAndFiles = {
  args: {
    files: [
      `${CAPTURES}/web-iPhone-sheet-light.png`,
      `${CAPTURES}/web-iPhone-sheet-dark.png`,
      `${CAPTURES}/iPhone-log.txt`,
      `${CAPTURES}/iPhone-parts.json`,
    ],
  },
};

/** Files only: chips, as before. */
export const FilesOnly = {
  args: {
    files: [`${CAPTURES}/iPad-log.txt`, `${CAPTURES}/iPad-parts.json`],
  },
};
