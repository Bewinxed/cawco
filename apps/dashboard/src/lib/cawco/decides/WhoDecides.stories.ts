/**
 * Who decides, in the situations he meets it: his fleet as it stands, a
 * kind being handed to someone else, a member's card, an agent or a kind
 * being added, a project that set kinds of its own, and the page when
 * something fails. Each draws the whole page.
 */
import PageFixture from "./preview/PageFixture.svelte";
import { added, fleetRoutes } from "./preview/records";
import { harnessesNoOpenCode } from "./preview/setup-records";

export default {
  title: "Who decides/Page",
  component: PageFixture,
};

/** His fleet as it stands: who answers each kind of choice. */
export const YourFleet = {
  name: "Your fleet as it stands",
};

/** He pressed Scope's face: everyone who could take it, him ticked. */
export const HandingScopeOver = {
  name: "Handing Scope to someone else",
  args: { handing: "scope" },
};

/** The advisor's card from the team row: what it runs on, its instructions, its month and its calls. */
export const AdvisorsCard = {
  name: "The advisor's card, with its record",
  args: { open: "advisor" },
};

/** Add an agent pressed: a new card, its name, what it runs on and its instructions to fill. */
export const AddingAnAgent = {
  name: "Adding an agent",
  args: { open: "new" },
};

/** Add agent pressed with nothing filled in: each field says what it needs. */
export const AddingWithNothingFilledIn = {
  name: "Adding an agent with nothing filled in",
  args: { open: "new", tried: true },
};

/** Cawco-Dev sends look and scope elsewhere than the fleet does. */
export const ProjectHandedKindsOver = {
  name: "Cawco-Dev handed two kinds over",
  args: {
    project: "Cawco-Dev",
    routes: { ...fleetRoutes, look: "design-reviewer", scope: "caw" },
  },
};

/** Caw's card on Cawco-Dev: whether he leads it, and his project's harness and model. */
export const CawsCard = {
  name: "Caw's card on Cawco-Dev",
  args: { project: "Cawco-Dev", open: "caw" },
};

/** The release checker runs on OpenCode, which no machine runs today. */
export const AgentCantRun = {
  name: "An agent that can't run",
  args: {
    members: added.slice(0, 7),
    offers: harnessesNoOpenCode,
    routes: {
      ...fleetRoutes,
      look: "design-reviewer",
      rules: "release-checker",
    },
  },
};

/** Add a kind pressed and half typed: its fields hang from the tile. */
export const AddingAKind = {
  name: "Adding a kind",
  args: {
    addingKind: {
      name: "Data and migrations",
      example: "a schema change, a backfill",
    },
  },
};

/** Removing a kind he added, with two decisions waiting under it. */
export const RemovingAKind = {
  name: "Removing a kind you added",
  args: { extraKind: true, removingKind: "data" },
};

/** The hub couldn't be read: its words, and Try again. */
export const DidntLoad = {
  name: "Who decides didn't load",
  args: { read: "failed" },
};

/** Cawco-Dev's decides.md has a line the hub can't read: every kind is his until it does. */
export const FileDoesntRead = {
  name: "Cawco-Dev's decides.md doesn't read",
  args: {
    project: "Cawco-Dev",
    problems: ['Line 4: "Scope: the intern" names no member.'],
  },
};
