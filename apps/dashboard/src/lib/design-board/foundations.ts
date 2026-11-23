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
    note: "6 type roles built from 4 sizes (12, 14, 18, 24px), 3 line-heights on the 4px grid (16, 20, 24px), 3 faces, and 2 weights (≤500).",
    wide: true,
    shelves: [
      shelf("Roles", "type", [
        "type-meta",
        "type-code",
        "type-body",
        "type-label",
        "type-title",
        "type-kpi",
      ]),
      shelf("Sizes", "size", named(starts("--text-"))),
      shelf("Line heights (4px grid)", "leading", named(starts("--leading-"))),
      shelf("Faces", "face", THEME.names.TokenFont),
      shelf("Weights", "weight", named(starts("--font-weight-"))),
      shelf("Tracking", "tracking", named(starts("--tracking-"))),
    ],
  },
  {
    title: "Spacing and sizes",
    note: "One 4px unit (`--spacing`), 6 rhythm steps (4–32px), and 9 semantic sizes (rows step to 44px on touch/phone).",
    wide: true,
    shelves: [
      shelf(
        "4px rhythm ladder",
        "space",
        named(
          (name) => name === "--spacing" || name.startsWith("--spacing-space-")
        )
      ),
      shelf("Icons", "space", named(starts("--spacing-icon-"))),
      shelf("Controls", "space", named(starts("--spacing-control-"))),
      shelf("Rows", "space", named(starts("--spacing-row"))),
      shelf("Measure", "measure", named(starts("--spacing-measure"))),
    ],
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
    title: "Shape and elevation",
    note: "5 radii on the 4px grid (4, 8, 12, 16px, pill) and 3 shadows softly ringed in dark.",
    shelves: [
      shelf("Radii", "radius", named(starts("--radius-"))),
      shelf("Shadows", "shadow", named(starts("--shadow-"))),
    ],
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
    note: "2 screen breakpoints, 4 container tiers, and 4 z-index planes.",
    shelves: [
      shelf("Screen", "breakpoint", named(starts("--breakpoint-"))),
      shelf("Containers", "breakpoint", named(starts("--container-"))),
      shelf("Z-index planes", "layer", named(starts("--layer-"))),
    ],
  },
];
