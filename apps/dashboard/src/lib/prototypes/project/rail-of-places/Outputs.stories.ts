/**
 * Outputs (its working name), in "Places down the side" (Component Story
 * Format 3, live components): the shelf of what the project made, drawn as
 * what each is, grouped by the task that made it or newest first, with its
 * kind chips. Cawco's posts, pictures, clips and pages; Cawco-Dev's
 * reports, previews and canvas; nothing yet; reading; the hub unreachable.
 * At 1440 and 390.
 */
import { CAWCO_IN_SWING } from "./cawco-in-swing";
import { CAWCO_DEV_BUSY, JUST_MADE, LOADING, STALE } from "./fixtures";
import { LIVE } from "./model";
import { press } from "./play";
import ProjectScreen from "./ProjectScreen.svelte";

export default {
  title: "Rail of places/Outputs",
  component: ProjectScreen,
  args: { project: CAWCO_IN_SWING, read: LIVE, place: "outputs" },
};

/** Cawco's shelf by task: two new post drafts, the reply shortlist, the bookend kit, the parody clip and a master the hub can't serve. */
export const ByTask = { parameters: { viewport: 1440 } };

/** By task, on a phone: two across. */
export const ByTaskPhone = { parameters: { viewport: 390 } };

/** Newest first, each item naming its task and stage. */
export const Newest = { args: { group: "newest" }, parameters: { viewport: 1440 } };

/** Only posts, each drawn whole with its alternates and media plan. */
export const OnlyPosts = { args: { kind: "post" }, parameters: { viewport: 1440 } };

/** Cawco-Dev's shelf: reports, previews, a log, a choice set and a canvas. */
export const CawcoDev = {
  args: { project: CAWCO_DEV_BUSY },
  parameters: { viewport: 1440 },
};

/** Nothing made yet, and Ask Caw. */
export const NothingYet = {
  args: { project: JUST_MADE },
  parameters: { viewport: 1440 },
};

/** Nothing made yet, on a phone. */
export const NothingYetPhone = {
  args: { project: JUST_MADE },
  parameters: { viewport: 390 },
};

/** The first read is out. */
export const Reading = { args: { read: LOADING }, parameters: { viewport: 1440 } };

/** The hub unreachable: the shelf kept, marked. */
export const HubUnreachable = {
  args: { read: STALE },
  parameters: { viewport: 1440 },
};

/** The Post chip pressed: the shelf narrows to posts. */
export const PostChipPressed = {
  from: "ByTask",
  parameters: { viewport: 1440 },
  play: press(/^Post$/u),
};

/** A post's task name pressed: the task's pane over the shelf. */
export const TaskFromItem = {
  from: "ByTask",
  parameters: { viewport: 1440 },
  play: press(/^Post: answer an agent permission prompt/u),
};
