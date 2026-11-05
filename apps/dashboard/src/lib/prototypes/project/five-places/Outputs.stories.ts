/**
 * Outputs (a working name) in a project of five places (Component Story
 * Format 3, live components): the shelf of what the work made, grouped by
 * the task that made it, on the hub's own records (records.ts). The meta's
 * args are every story's; a story's own args are what it changes.
 */
import FivePlaces from "./FivePlaces.svelte";
import { EMPTY, SWING } from "./records";
import { at, DESK, PHONE, press } from "./story-kit";

export default {
  title: "Five places/Outputs",
  component: FivePlaces,
  args: { records: SWING, place: "outputs" },
};

/** The shelf by task: two new post drafts first, then previews, files and a choice set. */
export const ByTask = at(DESK);

/** Post pressed: only the posts, each drawn as its words with its alternates. */
export const Posts = {
  ...at(DESK, { kind: "post" }),
  from: "ByTask",
  play: press("tab", /^Post$/u),
};

/** Newest first: every item with its task's name under it. */
export const Newest = {
  ...at(DESK, { grouping: "newest" }),
  from: "ByTask",
  play: press("tab", /^Newest$/u),
};

/** A post pressed: it opens whole. */
export const ItemOpen = {
  ...at(DESK, { output: "out-post-board" }),
  from: "ByTask",
  play: press("button", /^Post · 2 h ago · new Eight agents/u),
};

/** The first read: skeleton cards at their real size. */
export const Loading = at(DESK, { read: "loading" });

/** The hub is unreachable: the shelf kept, marked stale. */
export const Stale = at(DESK, { read: "stale" });

/** Nothing made yet: what lands here, and Ask Caw to start the first piece. */
export const Empty = at(DESK, { records: EMPTY });

/** A phone: two across, grouped by task. */
export const ByTaskPhone = at(PHONE);
