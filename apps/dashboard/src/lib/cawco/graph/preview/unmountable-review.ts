/**
 * A states file whose one story hands its component no records: the
 * component throws as it mounts, and the design graph says so in the
 * stage's place, in the error formula.
 */
import type { ReviewInput } from "../model";
import Unmountable from "./Unmountable.svelte";

const SOURCE = `/** The roster with its members unread: the story passes none. */
export const MembersUnread = {};
`;

export const unmountable: ReviewInput = {
  file: "apps/dashboard/src/lib/cawco/graph/preview/unmountable-review.ts",
  module: {
    default: {
      title: "Roster",
      component:
        Unmountable as unknown as ReviewInput["module"]["default"]["component"],
      args: { members: null },
    },
    MembersUnread: {},
  },
  source: SOURCE,
};
