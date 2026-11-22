/**
 * The kit's Sheet (Component Story Format 3, live components) in a frame of
 * its own (sheet-fixture): open from the right and from the left over its
 * scrim. The meta's args are every story's; a story's own args are what it
 * changes.
 */
import SheetFixture from "./sheet-fixture.svelte";

export default {
  title: "Kit/Sheet",
  component: SheetFixture,
  args: {
    title: "Sessions on obelisk-of-light",
    side: "right",
    rows: [
      "Fix tray chip overflow",
      "Move the session list onto tabs",
      "Write the release notes for 0.42",
    ],
    height: 360,
  },
};

/** Open from the right, listing a machine's sessions. */
export const FromTheRight = {};

/** Open from the left, as the phone's navigation. */
export const FromTheLeft = {
  args: {
    title: "Navigation",
    side: "left",
    rows: ["Home", "Board", "Decisions", "Settings"],
  },
};
