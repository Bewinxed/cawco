/**
 * Outputs (a working name) in a project of five places (Component Story
 * Format 3, live components): the shelf of what the work made, grouped by
 * the task that made it, on the hub's own records (records.ts). The meta's
 * args are every story's; a story's own args are what it changes.
 */
import FivePlaces from "./FivePlaces.svelte";
import { EMPTY, SWING } from "./records";
import { press } from "./story-kit";

export default {
  title: "Five places/Outputs",
  component: FivePlaces,
  args: { records: SWING, place: "outputs" },
};

/** The shelf by task: two new post drafts first, then previews, files and a choice set. */
export const ByTask = {
  args: { place: "outputs", height: 920 },
  parameters: { viewport: 1440 },
};

/** Post pressed: only the posts, each drawn as its words with its alternates. */
export const Posts = {
  args: { place: "outputs", height: 920, kind: "post" },
  parameters: { viewport: 1440 },
  from: "ByTask",
  play: press("tab", /^Post$/u),
};

/** Newest first: every item with its task's name under it. */
export const Newest = {
  args: { place: "outputs", height: 920, grouping: "newest" },
  parameters: { viewport: 1440 },
  from: "ByTask",
  play: press("tab", /^Newest$/u),
};

/** A post pressed: it opens whole. */
export const ItemOpen = {
  args: { place: "outputs", height: 920, output: "out-post-board" },
  parameters: { viewport: 1440 },
  from: "ByTask",
  play: press("button", /Eight agents, four machines, one board/u),
};

/** The first read: skeleton cards at their real size. */
export const Loading = {
  args: { place: "outputs", height: 920, read: "loading" },
  parameters: { viewport: 1440 },
};

/** The hub is unreachable: the shelf kept, marked stale. */
export const Stale = {
  args: { place: "outputs", height: 920, read: "stale" },
  parameters: { viewport: 1440 },
};

/** Nothing made yet: what lands here, and Ask Caw to start the first piece. */
export const Empty = {
  args: { place: "outputs", height: 920, records: EMPTY },
  parameters: { viewport: 1440 },
};

/** A phone: two across, grouped by task. */
export const ByTaskPhone = {
  args: { place: "outputs", height: 844 },
  parameters: { viewport: 390 },
};
