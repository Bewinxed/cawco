/**
 * The project page whole (GovernedProjectPage), mounted by the live story's
 * fixture in the app's shell: one story for each situation the hub can put
 * the project in, and for the views its anchors open. The person's own
 * graph is the live story (GovernedCanvas.stories.ts).
 */
import { hubAs } from "#lib/cawco/hub-stand-in.js";
import { STATES } from "#lib/cawco/views/routines-fixture.js";
import { SITUATIONS } from "./fixtures";
import GovernedCanvasLive from "./governed-canvas-live.svelte";
import { ANSWERS } from "./mock-hub";

export default {
  title: "Project details/Option 1: Project page",
  component: GovernedCanvasLive,
  args: { situation: "As it stands", answer: "Takes it", view: "board" },
  argTypes: {
    situation: { control: "select", options: SITUATIONS },
    answer: { control: "select", options: ANSWERS },
  },
  decorators: [hubAs("connected", STATES.on)],
  parameters: { viewport: 1440 },
};

/** hyucksfield on an ordinary day, every standing fact on the page. */
export const AsItStands = {};

/** The folder on studio-mac is gone: its places say so by its name. */
export const FolderMissing = { args: { situation: "A folder is missing" } };

/** Studio Max is signed out everywhere: Caw's seat says so. */
export const AccountSignedOut = {
  args: { situation: "Its account is signed out" },
};

/** GitHub refused the last sync: the task home says so on the views strip. */
export const SyncRefused = { args: { situation: "GitHub refused the sync" } };

/** The rule file does not read: Who decides says every choice comes to me. */
export const RulesUnreadable = {
  args: { situation: "Its rule file does not read" },
};

/** The page just opened and the hub is still answering. */
export const StillReading = { args: { situation: "Still reading" } };

/** The hub is out of reach: what shows was read six minutes ago. */
export const HubAway = { args: { situation: "Hub out of reach" } };

/** A project of posts, no code: no repository, no landing. */
export const NoCode = { args: { situation: "A project with no code" } };

/** Who decides, opened: the rule stands at the top of Decisions. */
export const DecisionsOpen = { args: { view: "decisions" } };
