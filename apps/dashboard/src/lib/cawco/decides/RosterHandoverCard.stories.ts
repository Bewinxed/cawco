/**
 * Who decides' roster with the hand-over exactly under the pressed card,
 * sharing both its edges, drawn from his real members and kinds. Press any
 * tile to open its list; a press on a member moves the tile, here only.
 */
import RosterFixture from "./preview/RosterFixture.svelte";
import { facts, fleetRoutes, kinds, members, project } from "./preview/records";

export default {
  title: "Who decides/Hand-over under the card",
  component: RosterFixture,
  args: {
    facts,
    fleetRoutes,
    handing: "approach",
    kinds,
    members,
    placement: "card",
    project,
    routes: fleetRoutes,
  },
};

/** A desk, four across: Approach's list under the Advisor's card. */
export const UnderTheCardDesk = { parameters: { viewport: "desk" } };

/** A phone, one card a line: the list is the card's own width. */
export const UnderTheCardPhone = { parameters: { viewport: "phone" } };
