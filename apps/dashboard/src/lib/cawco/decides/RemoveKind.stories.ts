/**
 * Removing a kind he added, asked in its row in Kinds of choice: what waits
 * under it and where, and the kind its choices go to from now on. Its own
 * section: the question takes the focus as it stands, as it does on the
 * page.
 */
import KindsFixture from "./preview/KindsFixture.svelte";

export default {
  title: "Who decides/Removing a kind",
  component: KindsFixture,
};

/** Removing Data and migrations with 2 decisions waiting under it: the kinds they can move to, on a phone. */
export const RemovingWaitingPhone = {
  args: {
    removing: {
      kind: "data-and-migrations",
      count: 2,
      projects: ["Cawco-Dev", "Roost iOS"],
    },
  },
  parameters: { viewport: 390 },
};

/** Removing Data and migrations with 2 decisions waiting under it: the kinds they can move to, at the two-column width. */
export const RemovingWaitingTablet = {
  args: {
    removing: {
      kind: "data-and-migrations",
      count: 2,
      projects: ["Cawco-Dev", "Roost iOS"],
    },
  },
  parameters: { viewport: 680 },
};

/** Removing Data and migrations with 2 decisions waiting under it: the kinds they can move to, four across. */
export const RemovingWaitingDesk = {
  args: {
    removing: {
      kind: "data-and-migrations",
      count: 2,
      projects: ["Cawco-Dev", "Roost iOS"],
    },
  },
  parameters: { viewport: 1440 },
};

/** Removing Data and migrations with 2 decisions waiting under it: the kinds they can move to, on a wide screen. */
export const RemovingWaitingWide = {
  args: {
    removing: {
      kind: "data-and-migrations",
      count: 2,
      projects: ["Cawco-Dev", "Roost iOS"],
    },
  },
  parameters: { viewport: 1540 },
};

/** Removing Data and migrations, Approach picked for its decisions, on a phone. */
export const RemovingPickedPhone = {
  args: {
    removing: {
      kind: "data-and-migrations",
      count: 2,
      projects: ["Cawco-Dev", "Roost iOS"],
    },
    moveTo: "approach",
  },
  parameters: { viewport: 390 },
};

/** Removing Data and migrations, Approach picked for its decisions, at the two-column width. */
export const RemovingPickedTablet = {
  args: {
    removing: {
      kind: "data-and-migrations",
      count: 2,
      projects: ["Cawco-Dev", "Roost iOS"],
    },
    moveTo: "approach",
  },
  parameters: { viewport: 680 },
};

/** Removing Data and migrations, Approach picked for its decisions, four across. */
export const RemovingPickedDesk = {
  args: {
    removing: {
      kind: "data-and-migrations",
      count: 2,
      projects: ["Cawco-Dev", "Roost iOS"],
    },
    moveTo: "approach",
  },
  parameters: { viewport: 1440 },
};

/** Removing Data and migrations, Approach picked for its decisions, on a wide screen. */
export const RemovingPickedWide = {
  args: {
    removing: {
      kind: "data-and-migrations",
      count: 2,
      projects: ["Cawco-Dev", "Roost iOS"],
    },
    moveTo: "approach",
  },
  parameters: { viewport: 1540 },
};

/** Removing a kind with nothing waiting under it, on a phone. */
export const RemovingNonePhone = {
  args: {
    removing: {
      kind: "accessibility-and-keyboard-behaviour",
      count: 0,
      projects: [],
    },
  },
  parameters: { viewport: 390 },
};

/** Removing a kind with nothing waiting under it, at the two-column width. */
export const RemovingNoneTablet = {
  args: {
    removing: {
      kind: "accessibility-and-keyboard-behaviour",
      count: 0,
      projects: [],
    },
  },
  parameters: { viewport: 680 },
};

/** Removing a kind with nothing waiting under it, four across. */
export const RemovingNoneDesk = {
  args: {
    removing: {
      kind: "accessibility-and-keyboard-behaviour",
      count: 0,
      projects: [],
    },
  },
  parameters: { viewport: 1440 },
};

/** Removing a kind with nothing waiting under it, on a wide screen. */
export const RemovingNoneWide = {
  args: {
    removing: {
      kind: "accessibility-and-keyboard-behaviour",
      count: 0,
      projects: [],
    },
  },
  parameters: { viewport: 1540 },
};
