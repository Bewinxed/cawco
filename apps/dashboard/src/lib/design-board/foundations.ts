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
const exact =
  (...names: string[]) =>
  (name: string) =>
    names.includes(name);

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
  inUse?: "spacing" | "elevation" | "layout";
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
    title: "Colour roles",
    note: "24 semantic roles across light and dark: 6 surfaces, 3 inks (≥4.5:1), 3 borders, 4 coral accents, and 4 status pairs.",
    wide: true,
    shelves: [
      shelf("Surfaces", "colour", named(starts("--color-surface-"))),
      shelf("Inks", "colour", named(starts("--color-ink-"))),
      shelf("Borders", "colour", named(starts("--color-border-"))),
      shelf(
        "Accent (Caw coral)",
        "colour",
        named(
          exact(
            "--color-accent",
            "--color-accent-ink",
            "--color-accent-wash",
            "--color-on-accent"
          )
        )
      ),
      shelf("Status", "colour", named(starts("--color-status-"))),
    ],
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
    note: "Six steps on a 4px unit: 1, 2, 3, 4, 6 and 8 (4 to 32px). Each padding and gap is measured off the real piece and named by its step; red is off the scale.",
    wide: true,
    inUse: "spacing",
    shelves: [],
  },
];

/** Palette, shape, motion, and layout vocabulary supporting the roles. */
export const SCALES: Foundation[] = [
  {
    title: "Marks and brand art",
    note: "7 perceptually even categorical marks for accounts, tools, and syntax, plus 3 mascot/art pigments.",
    shelves: [
      shelf("Categorical marks", "colour", named(starts("--color-mark-"))),
      shelf(
        "Brand art pigments",
        "colour",
        named(exact("--color-spark", "--color-paper", "--color-crow-ink"))
      ),
    ],
  },
  {
    title: "Elevation",
    note: "One ladder. Each surface takes its level from the one it opens in: a panel one step, a popover, menu or dialog two. Light turns white at level 1 and lets the shadow carry the rest; dark lightens each level.",
    wide: true,
    inUse: "elevation",
    shelves: [],
  },

  {
    title: "Motion",
    note: "4 durations (120, 200, 320, 1000ms) and 3 easing curves.",
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
