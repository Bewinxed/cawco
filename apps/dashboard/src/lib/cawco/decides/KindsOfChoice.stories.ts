/**
 * Kinds of choice, hung from Who decides' head, on his real fleet: the five
 * built-ins, Design reviewer and Release checker, the six built-in kinds and
 * two he added. Every write stays on the page. Light and dark are the
 * canvas's.
 */
import { decidesWords } from "@cawco/core/words/decides";
import KindsFixture from "./preview/KindsFixture.svelte";

export default {
  title: "Who decides/Kinds of choice",
  component: KindsFixture,
};

/** Every kind and who decides it across the fleet, two he added wearing the pen, on a phone. */
export const ListPhone = {
  parameters: { viewport: 390 },
};

/** Every kind and who decides it across the fleet, two he added wearing the pen, at the two-column width. */
export const ListTablet = {
  parameters: { viewport: 680 },
};

/** Every kind and who decides it across the fleet, two he added wearing the pen, four across. */
export const ListDesk = {
  parameters: { viewport: 1440 },
};

/** Every kind and who decides it across the fleet, two he added wearing the pen, on a wide screen. */
export const ListWide = {
  parameters: { viewport: 1540 },
};

/** The fleet's own page, Kinds of choice open from its head, on a phone. */
export const FleetPagePhone = {
  args: { project: null },
  parameters: { viewport: 390 },
};

/** The fleet's own page, Kinds of choice open from its head, at the two-column width. */
export const FleetPageTablet = {
  args: { project: null },
  parameters: { viewport: 680 },
};

/** The fleet's own page, Kinds of choice open from its head, four across. */
export const FleetPageDesk = {
  args: { project: null },
  parameters: { viewport: 1440 },
};

/** The fleet's own page, Kinds of choice open from its head, on a wide screen. */
export const FleetPageWide = {
  args: { project: null },
  parameters: { viewport: 1540 },
};

/** Add a kind, its first step: the name, on a phone. */
export const AddingNamePhone = {
  args: { adding: { reached: 0 } },
  parameters: { viewport: 390 },
};

/** Add a kind, its first step: the name, at the two-column width. */
export const AddingNameTablet = {
  args: { adding: { reached: 0 } },
  parameters: { viewport: 680 },
};

/** Add a kind, its first step: the name, four across. */
export const AddingNameDesk = {
  args: { adding: { reached: 0 } },
  parameters: { viewport: 1440 },
};

/** Add a kind, its first step: the name, on a wide screen. */
export const AddingNameWide = {
  args: { adding: { reached: 0 } },
  parameters: { viewport: 1540 },
};

/** Add a kind, its second step: the name folded with Change, what agents read open, on a phone. */
export const AddingExamplesPhone = {
  args: { adding: { reached: 1, name: "Release notes" } },
  parameters: { viewport: 390 },
};

/** Add a kind, its second step: the name folded with Change, what agents read open, at the two-column width. */
export const AddingExamplesTablet = {
  args: { adding: { reached: 1, name: "Release notes" } },
  parameters: { viewport: 680 },
};

/** Add a kind, its second step: the name folded with Change, what agents read open, four across. */
export const AddingExamplesDesk = {
  args: { adding: { reached: 1, name: "Release notes" } },
  parameters: { viewport: 1440 },
};

/** Add a kind, its second step: the name folded with Change, what agents read open, on a wide screen. */
export const AddingExamplesWide = {
  args: { adding: { reached: 1, name: "Release notes" } },
  parameters: { viewport: 1540 },
};

/** Add a kind, its last step: who decides it, and Add kind in Continue's place, on a phone. */
export const AddingWhoPhone = {
  args: {
    adding: {
      reached: 2,
      name: "Release notes",
      example: "what a changelog line says, which changes make the notes",
      to: "advisor",
    },
  },
  parameters: { viewport: 390 },
};

/** Add a kind, its last step: who decides it, and Add kind in Continue's place, at the two-column width. */
export const AddingWhoTablet = {
  args: {
    adding: {
      reached: 2,
      name: "Release notes",
      example: "what a changelog line says, which changes make the notes",
      to: "advisor",
    },
  },
  parameters: { viewport: 680 },
};

/** Add a kind, its last step: who decides it, and Add kind in Continue's place, four across. */
export const AddingWhoDesk = {
  args: {
    adding: {
      reached: 2,
      name: "Release notes",
      example: "what a changelog line says, which changes make the notes",
      to: "advisor",
    },
  },
  parameters: { viewport: 1440 },
};

/** Add a kind, its last step: who decides it, and Add kind in Continue's place, on a wide screen. */
export const AddingWhoWide = {
  args: {
    adding: {
      reached: 2,
      name: "Release notes",
      example: "what a changelog line says, which changes make the notes",
      to: "advisor",
    },
  },
  parameters: { viewport: 1540 },
};

/** Add a kind with no name: its words under the field, on a phone. */
export const NameMissingPhone = {
  args: { adding: { reached: 0, tried: true } },
  parameters: { viewport: 390 },
};

/** Add a kind with no name: its words under the field, at the two-column width. */
export const NameMissingTablet = {
  args: { adding: { reached: 0, tried: true } },
  parameters: { viewport: 680 },
};

/** Add a kind with no name: its words under the field, four across. */
export const NameMissingDesk = {
  args: { adding: { reached: 0, tried: true } },
  parameters: { viewport: 1440 },
};

/** Add a kind with no name: its words under the field, on a wide screen. */
export const NameMissingWide = {
  args: { adding: { reached: 0, tried: true } },
  parameters: { viewport: 1540 },
};

/** Data and migrations being renamed: its two fields open in place, with Done, on a phone. */
export const RenamingPhone = {
  args: { renaming: { kind: "data-and-migrations" } },
  parameters: { viewport: 390 },
};

/** Data and migrations being renamed: its two fields open in place, with Done, at the two-column width. */
export const RenamingTablet = {
  args: { renaming: { kind: "data-and-migrations" } },
  parameters: { viewport: 680 },
};

/** Data and migrations being renamed: its two fields open in place, with Done, four across. */
export const RenamingDesk = {
  args: { renaming: { kind: "data-and-migrations" } },
  parameters: { viewport: 1440 },
};

/** Data and migrations being renamed: its two fields open in place, with Done, on a wide screen. */
export const RenamingWide = {
  args: { renaming: { kind: "data-and-migrations" } },
  parameters: { viewport: 1540 },
};

/** The hub refused a rename: its words under the row, with Try again, on a phone. */
export const RefusedPhone = {
  args: {
    renaming: {
      kind: "data-and-migrations",
      name: "Data, schema and migrations",
    },
    refused: decidesWords.unknownKind("data-and-migrations"),
  },
  parameters: { viewport: 390 },
};

/** The hub refused a rename: its words under the row, with Try again, at the two-column width. */
export const RefusedTablet = {
  args: {
    renaming: {
      kind: "data-and-migrations",
      name: "Data, schema and migrations",
    },
    refused: decidesWords.unknownKind("data-and-migrations"),
  },
  parameters: { viewport: 680 },
};

/** The hub refused a rename: its words under the row, with Try again, four across. */
export const RefusedDesk = {
  args: {
    renaming: {
      kind: "data-and-migrations",
      name: "Data, schema and migrations",
    },
    refused: decidesWords.unknownKind("data-and-migrations"),
  },
  parameters: { viewport: 1440 },
};

/** The hub refused a rename: its words under the row, with Try again, on a wide screen. */
export const RefusedWide = {
  args: {
    renaming: {
      kind: "data-and-migrations",
      name: "Data, schema and migrations",
    },
    refused: decidesWords.unknownKind("data-and-migrations"),
  },
  parameters: { viewport: 1540 },
};

/** The kinds didn't load: the hub's words and Retry, on a phone. */
export const FailedToLoadPhone = {
  args: { failed: true },
  parameters: { viewport: 390 },
};

/** The kinds didn't load: the hub's words and Retry, at the two-column width. */
export const FailedToLoadTablet = {
  args: { failed: true },
  parameters: { viewport: 680 },
};

/** The kinds didn't load: the hub's words and Retry, four across. */
export const FailedToLoadDesk = {
  args: { failed: true },
  parameters: { viewport: 1440 },
};

/** The kinds didn't load: the hub's words and Retry, on a wide screen. */
export const FailedToLoadWide = {
  args: { failed: true },
  parameters: { viewport: 1540 },
};

/** A kind half added and closed: the button says so, one press brings it back, on a phone. */
export const ClosedWithDraftPhone = {
  args: { open: false, adding: { reached: 1, name: "Release notes" } },
  parameters: { viewport: 390 },
};

/** A kind half added and closed: the button says so, one press brings it back, at the two-column width. */
export const ClosedWithDraftTablet = {
  args: { open: false, adding: { reached: 1, name: "Release notes" } },
  parameters: { viewport: 680 },
};

/** A kind half added and closed: the button says so, one press brings it back, four across. */
export const ClosedWithDraftDesk = {
  args: { open: false, adding: { reached: 1, name: "Release notes" } },
  parameters: { viewport: 1440 },
};

/** A kind half added and closed: the button says so, one press brings it back, on a wide screen. */
export const ClosedWithDraftWide = {
  args: { open: false, adding: { reached: 1, name: "Release notes" } },
  parameters: { viewport: 1540 },
};
