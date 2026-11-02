/**
 * Who decides' roster under review, as an agent would open it
 * (artifact_create `kind: "component"` with `file`, `group` and `edges`):
 * its own states file with his real members and kinds, in two machines.
 */

// biome-ignore lint/performance/noNamespaceImport: a states file is read whole: each of its exports is a story.
import * as RosterStates from "../decides/Roster.stories";
import rosterSource from "../decides/Roster.stories.ts?raw";
import type { ReviewInput } from "./model";

const FOLLOWING = "Following the fleet";
const HANDING = "Handing a kind over";

export const roster: ReviewInput = {
  file: "apps/dashboard/src/lib/cawco/decides/Roster.stories.ts",
  module: RosterStates as unknown as ReviewInput["module"],
  source: rosterSource,
  group: {
    FollowingDesk: FOLLOWING,
    FollowingTablet: "FollowingDesk",
    FollowingPhone: "FollowingDesk",
    ChangedDesk: HANDING,
    ChangedPhone: "ChangedDesk",
    FleetPage: FOLLOWING,
    OpenFirstColumn: HANDING,
    OpenLastColumn: HANDING,
    OpenPhone: "OpenFirstColumn",
    OpenOneMember: HANDING,
    OpenManyMembers: HANDING,
    ManyMembersDesk: FOLLOWING,
    Handing: HANDING,
    Refused: HANDING,
  },
  edges: [
    { from: "FollowingDesk", to: "OpenFirstColumn", label: "Press a tile" },
    { from: "OpenFirstColumn", to: "Handing", label: "Press a member" },
    { from: "Handing", to: "ChangedDesk", label: "Handed over" },
    { from: "Handing", to: "Refused", label: "Refused" },
    { from: "Refused", to: "Handing", label: "Try again" },
  ],
};
