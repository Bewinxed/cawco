/**
 * The kit's OptionTiles (Component Story Format 3, live components), mounted
 * as itself: a pick among tiles, none picked, one picked, keyed by digit,
 * and disabled. The meta's args are every story's; a story's own args are
 * what it changes.
 */
import OptionTiles from "./option-tiles.svelte";

export default {
  title: "Kit/Option tiles",
  component: OptionTiles,
  args: {
    label: "Where the session runs",
    cols: 3,
    value: null,
    options: [
      { id: "obelisk", name: "obelisk-of-light", note: "Linux · 3 sessions" },
      { id: "studio", name: "studio-mac", note: "macOS · idle" },
      {
        id: "nimbus",
        name: "nimbus-build-02",
        note: "Linux · away",
        disabled: true,
      },
    ],
  },
};

/** Nothing picked yet. */
export const NonePicked = {};

/** One machine picked. */
export const Picked = { args: { value: "studio" } };

/** Picked by its digit key. */
export const Keyed = { args: { value: "obelisk", digits: true } };

/** The whole pick can't change while the session starts. */
export const Disabled = { args: { value: "obelisk", disabled: true } };
