/**
 * The system's structure as the board presents it, read live off Tailwind's
 * theme (`lib/tokens/theme.css`) through `readTailwindTheme`. Every specimen
 * draws through `var()` or its `type-*` utility and reads what the page
 * computes in each scheme; no token value is duplicated here.
 */
import { readTailwindTheme } from "@cawco/design-tokens/tailwind-theme";

const ENTRY = "theme.css";
/** The theme's stylesheets as the build bundles them, by path from lib/tokens. */
const SHEETS = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>("../tokens/*.css", {
      eager: true,
      import: "default",
      query: "?raw",
    })
  ).map(([path, text]) => [path.slice("../tokens/".length), text])
);

const THEME = await readTailwindTheme(ENTRY, (path) =>
  Promise.resolve(SHEETS[path])
);

/** Every theme variable, in the order theme.css declares it. */
const TOKENS = THEME.tokens;

const named = (test: (name: string) => boolean) => TOKENS.filter(test);
const starts =
  (...prefixes: string[]) =>
  (name: string) =>
    prefixes.some((prefix) => name.startsWith(prefix));

/** How the board draws a specimen: what property it sets and how it previews it. */
export type Kind =
  | "colour"
  | "face"
  | "size"
  | "leading"
  | "tracking"
  | "weight"
  | "type"
  | "space"
  | "measure"
  | "radius"
  | "shadow"
  | "duration"
  | "ease"
  | "breakpoint"
  | "layer";

interface Shelf {
  kind: Kind;
  names: string[];
  /** Its heading. */
  title: string;
}

export interface Foundation {
  /** Drawn in use, on real pieces, in place of its shelves. */
  inUse?: "colour" | "spacing" | "elevation" | "layout";
  /** Short line stating what this group decides. */
  note: string;
  shelves: Shelf[];
  title: string;
  /** Takes a full row of the board. */
  wide?: boolean;
}

const shelf = (title: string, kind: Kind, names: string[]): Shelf => ({
  title,
  kind,
  names,
});

/** Semantic roles: what a screen reaches for first across light and dark. */
export const ROLES: Foundation[] = [
  {
    title: "Colour",
    note: "Flexoki's model on a neutral base: 8 base roles (bg, bg-2, ui, ui-2, ui-3, tx-3, tx-2, tx), Flexoki's 8 inks, and Caw coral. No tinted fills.",
    wide: true,
    inUse: "colour",
    shelves: [],
  },
  {
    title: "Typography",
    note: "Six roles. A component sets its text with one of them and nothing else.",
    wide: true,
    shelves: [
      shelf("Roles", "type", [
        "type-kpi",
        "type-title",
        "type-label",
        "type-body",
        "type-meta",
        "type-code",
      ]),
    ],
  },
  {
    title: "Spacing",
    note: "Six steps on a 4px unit: 4, 8, 12, 16, 24 and 32px. Every padding and gap in the pieces below is one of them; the graph's guides measure any of it.",
    wide: true,
    inUse: "spacing",
    shelves: [],
  },
];

/** Palette, shape, motion, and layout vocabulary supporting the roles. */
export const SCALES: Foundation[] = [
  {
    title: "Elevation",
    note: "One ladder. Each surface takes its level from the one it opens in: a panel one step, a popover, menu or dialog two. Light turns white at level 1 and lets the shadow carry the rest; dark lightens each level.",
    wide: true,
    inUse: "elevation",
    shelves: [],
  },

  {
    title: "Motion",
    note: "Six durations: fast, base and slow for a move, loop for a cycle, hold for an outcome shown, arm for a confirm's window. Seven curves: out, in-out and drawer, the spring (Apple's, no bounce, as Family moves), the elastic (a 5% overshoot, an arrival), and the two fades a glyph's slide takes. Each plays.",
    shelves: [
      shelf("Durations", "duration", named(starts("--duration-"))),
      shelf("Curves", "ease", named(starts("--ease-"))),
    ],
  },
  {
    title: "Layout and layers",
    note: "Four planes, two breakpoints (640, 900) and four container tiers (320, 448, 640, 900).",
    wide: true,
    inUse: "layout",
    shelves: [],
  },
];
