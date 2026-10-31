/**
 * Who decides' roster, drawn from his real members and kinds as the hub
 * answers them. Press any tile to open who it can go to in its popover; a
 * press on a member moves the tile, here only.
 */
import { decidesWords } from "@cawco/core/words/decides";
import RosterFixture from "./preview/RosterFixture.svelte";
import {
  added,
  addedFacts,
  facts,
  fleetRoutes,
  kinds,
  members,
  project,
} from "./preview/records";

export default {
  title: "Who decides/Roster",
  component: RosterFixture,
  args: { facts, fleetRoutes, kinds, members, project, routes: fleetRoutes },
};

const handed = {
  ...fleetRoutes,
  look: "advisor",
  scope: "caw",
  tools: "asker",
};

/** Cawco-Dev following the fleet, four across. */
export const FollowingDesk = { parameters: { viewport: 1440 } };

/** Following the fleet, two across. */
export const FollowingTablet = { parameters: { viewport: 680 } };

/** Following the fleet, one card a line. */
export const FollowingPhone = { parameters: { viewport: 390 } };

/** Three kinds handed over in this project: washed, with the folder and the way back. */
export const ChangedDesk = {
  args: { routes: handed },
  parameters: { viewport: 1440 },
};

/** Three kinds handed over, on a phone. */
export const ChangedPhone = {
  args: { routes: handed },
  parameters: { viewport: 390 },
};

/** The fleet's own page: no scope glyphs and no way back. */
export const FleetPage = {
  args: { project: null },
  parameters: { viewport: 1440 },
};

/** Look and words' list open, from the first column. */
export const OpenFirstColumn = {
  args: { handing: "look" },
  parameters: { viewport: 1440 },
};

/** Tools and conventions' list open, from the last column. */
export const OpenLastColumn = {
  args: { handing: "tools" },
  parameters: { viewport: 1440 },
};

/** Approach's list open on a phone: one member a line, the screen's width. */
export const OpenPhone = {
  args: { handing: "approach" },
  parameters: { viewport: 390 },
};

/** Approach's list with one other member to go to. */
export const OpenOneMember = {
  args: {
    members: members.filter((one) => one.id === "you" || one.id === "advisor"),
    handing: "approach",
  },
  parameters: { viewport: 680 },
};

/** Approach's list with nine members to go to, agents and a person he added among them. */
export const OpenManyMembers = {
  args: { members: added, facts: addedFacts, handing: "approach" },
  parameters: { viewport: 1440 },
};

/** Many members on the grid, one unreachable and one that can't run. */
export const ManyMembersDesk = {
  args: { members: added, facts: addedFacts },
  parameters: { viewport: 1440 },
};

/** The hub writing Approach's hand-over: its glyph breathes. */
export const Handing = {
  args: {
    asking: {
      kinds: ["approach"],
      said: decidesWords.handing("Approach", "Caw"),
    },
  },
  parameters: { viewport: 680 },
};

/** The hub refused Approach's hand-over: its words stand under the tile, with Try again. */
export const Refused = {
  args: {
    fault: {
      kinds: ["approach"],
      reason: decidesWords.fileUnread(
        "“Looks” is not a kind; the kinds are Look and words, Behaviour, Scope, Approach, Rules and checks, Tools and conventions."
      ),
      again: () => Promise.resolve(false),
    },
  },
  parameters: { viewport: 680 },
};
