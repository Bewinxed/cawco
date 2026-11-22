/**
 * The system's structure as the board presents it, read live off Tailwind's
 * theme (`lib/tokens/theme.css`) through `readTailwindTheme`: Layer 1 primitive
 * scales first, then Layer 2 semantic roles. Every specimen draws through
 * `var()` and reads what the page computes in each scheme; no token value is
 * duplicated here.
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

/** How the board draws a token: what property it sets and how it previews it. */
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

/** Layer 1 — Primitive scales: raw steps from which semantic roles are bound. */
export const SCALES: Foundation[] = [
  {
    title: "Colour scales",
    note: "Warm paper neutrals, Caw coral, eight perceptually even categorical marks, and brand art pigments.",
    wide: true,
    shelves: [
      shelf("Warm neutrals", "colour", named(starts("--color-neutral-"))),
      shelf("Caw coral", "colour", named(starts("--color-coral-"))),
      shelf("Categorical marks", "colour", named(starts("--color-mark-"))),
      shelf(
        "Brand art pigments",
        "colour",
        named(exact("--color-spark", "--color-paper", "--color-crow-ink"))
      ),
    ],
  },
  {
    title: "Spacing scale",
    note: "One 4px base unit (`--spacing`) and the rhythm ladder.",
    shelves: [
      shelf(
        "4px rhythm ladder",
        "space",
        named(
          (name) => name === "--spacing" || name.startsWith("--spacing-space-")
        )
      ),
    ],
  },
  {
    title: "Type scale",
    note: "House faces, two UI weights (never above 500), six sizes, five leadings, and three trackings.",
    shelves: [
      shelf("Faces", "face", THEME.names.TokenFont),
      shelf("Sizes", "size", named(starts("--text-"))),
      shelf("Weights", "weight", named(starts("--font-weight-"))),
      shelf("Line heights", "leading", named(starts("--leading-"))),
      shelf("Tracking", "tracking", named(starts("--tracking-"))),
    ],
  },
  {
    title: "Radii",
    note: "Seven corner steps from 2px hairline to full pill, nested concentrically.",
    shelves: [shelf("Corners", "radius", named(starts("--radius-")))],
  },
  {
    title: "Motion",
    note: "Seven durations and four easing curves; every transition and animation composes from these.",
    shelves: [
      shelf("Durations", "duration", named(starts("--duration-"))),
      shelf("Curves", "ease", named(starts("--ease-"))),
    ],
  },
  {
    title: "Breakpoints and z-layers",
    note: "Three screen breakpoints, six container tiers, and six semantic stacking planes.",
    shelves: [
      shelf("Screen", "breakpoint", named(starts("--breakpoint-"))),
      shelf("Containers", "breakpoint", named(starts("--container-"))),
      shelf("Z-index planes", "layer", named(starts("--layer-"))),
    ],
  },
];

/** Layer 2 — Semantic roles: tokens named for the job they perform across both schemes. */
export const ROLES: Foundation[] = [
  {
    title: "Colour roles",
    note: "Surfaces, inks (≥4.5:1), borders, coral brand/action/focus, and four status triads.",
    wide: true,
    shelves: [
      shelf(
        "Surfaces",
        "colour",
        named(
          (name) =>
            name.startsWith("--color-surface-") || name === "--color-scrim"
        )
      ),
      shelf(
        "Inks",
        "colour",
        named(
          (name) => name.startsWith("--color-ink-") || name === "--color-on-ink"
        )
      ),
      shelf(
        "Borders and seam",
        "colour",
        named(
          (name) =>
            name.startsWith("--color-border-") || name === "--color-seam"
        )
      ),
      shelf(
        "Brand, action and selection",
        "colour",
        named(
          (name) =>
            name.startsWith("--color-brand-") ||
            name.startsWith("--color-action-") ||
            name === "--color-on-action" ||
            name === "--color-selected-bg" ||
            name === "--color-focus-ring" ||
            name === "--color-selection"
        )
      ),
      shelf("Status", "colour", named(starts("--color-status-"))),
    ],
  },
  {
    title: "Type roles",
    note: "Eight font shorthands pairing face, weight, size, and leading by job.",
    shelves: [shelf("Roles", "type", named(starts("--type-")))],
  },
  {
    title: "Semantic sizes",
    note: "Icons, controls, rows (stepping to 44px on coarse pointers or phones), and reading measures.",
    shelves: [
      shelf("Icons", "space", named(starts("--spacing-icon-"))),
      shelf("Controls", "space", named(starts("--spacing-control-"))),
      shelf("Rows", "space", named(starts("--spacing-row"))),
      shelf("Measures", "measure", named(starts("--spacing-measure"))),
    ],
  },
  {
    title: "Elevations",
    note: "Four shadow tiers from hairline lift to modal overlay, ringed softly in dark.",
    shelves: [shelf("Shadows", "shadow", named(starts("--shadow-")))],
  },
];
