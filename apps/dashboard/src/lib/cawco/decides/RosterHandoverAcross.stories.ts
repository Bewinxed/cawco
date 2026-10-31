/**
 * Who decides' roster with the hand-over from the pressed card's edge and on
 * over the next column, two members a row, drawn from his real members and
 * kinds. Press any tile to open its list; a press on a member moves the tile,
 * here only.
 */
import RosterFixture from "./preview/RosterFixture.svelte";
import { facts, fleetRoutes, kinds, members, project } from "./preview/records";

export default {
  title: "Who decides/Hand-over two across",
  component: RosterFixture,
  args: {
    facts,
    fleetRoutes,
    handing: "approach",
    kinds,
    members,
    placement: "across",
    project,
    routes: fleetRoutes,
  },
};

/** A desk, four across: Approach's list from the Advisor's edge, two members a row. */
export const TwoAcrossDesk = { parameters: { viewport: "desk" } };

/** A phone, one card a line: no next column, so the list is the card's own width. */
export const TwoAcrossPhone = { parameters: { viewport: "phone" } };
