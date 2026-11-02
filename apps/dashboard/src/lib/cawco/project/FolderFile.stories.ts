/**
 * A file of the project's folder at its address on the project page
 * (Component Story Format 3, live components): the card `?file=` opens,
 * drawn as what it is. The records are the cawco project's own folder on
 * the hub: a browser delegate's check screenshot, read from the folder's
 * bytes and opening in the lightbox, and a capture run's log, read as text.
 * The meta's args are every story's; a story's own are what it changes.
 */
import FolderFile from "./FolderFile.svelte";

/** The cawco project, whose folder holds these files. */
const PROJECT = "70ac3d41-5a28-4a31-8e9e-3be2b03d1516";

export default {
  title: "Project/Folder file",
  component: FolderFile,
  args: {
    projectId: PROJECT,
    path: "assets/7e946561/check2-whole.png",
    onclose: () => null,
  },
};

/** A PNG: the picture itself, opening in the lightbox. */
export const Picture = {};

/** The same PNG on its own page under 900px, with Back. */
export const PicturePage = {
  args: { page: true },
  parameters: { viewport: 390 },
};

/** A text file: its words as the hub's text route reads them. */
export const Text = {
  args: { path: "assets/task-sheet-captures-v2/live/iPhone-log.txt" },
};
