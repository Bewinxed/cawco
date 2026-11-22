/**
 * The foundations the board draws, read off the theme as Tailwind reads it:
 * lib/tokens/theme.css, the text the build bundles, loaded by Tailwind itself
 * through `readTailwindTheme`, the product's one reader of a theme. Every
 * theme variable it holds is sorted into the kinds the board lays out by its
 * name. The theme is `static`, so each is written into the shipped
 * stylesheet. Their values are never read here: the board draws each through
 * `var()` and reads what the page computes, in each scheme.
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

/** The spacing base, the step every `--spacing(n)` counts in. */
const SPACING = "spacing";
/** Every theme variable, in the order the theme declares it. */
const TOKENS = THEME.tokens;

const named = (test: (name: string) => boolean) => TOKENS.filter(test);
const starts =
  (...prefixes: string[]) =>
  (name: string) =>
    prefixes.some((prefix) => name.startsWith(prefix));

/** How the board draws a token: what it sets with it, and how it shows it. */
export type Kind =
  | "colour"
  | "face"
  | "size"
  | "leading"
  | "tracking"
  | "weight"
  | "space"
  | "length"
  | "radius"
  | "shadow"
  | "drop"
  | "blur"
  | "saturate"
  | "duration"
  | "ease"
  | "breakpoint";

interface Shelf {
  kind: Kind;
  names: string[];
  /** Its heading. */
  title: string;
}

export interface Foundation {
  shelves: Shelf[];
  title: string;
  /** It takes a row of its own. */
  wide?: boolean;
}

/** The colours by their family: `--color-surface-raised` stands under "surface". */
function colourShelves(): Shelf[] {
  const families = new Map<string, string[]>();
  for (const name of THEME.names.TokenColor) {
    const family = name.split("-")[3] ?? name;
    families.set(family, [...(families.get(family) ?? []), name]);
  }
  return [...families].map(([family, names]) => ({
    title: family,
    kind: "colour" as const,
    names,
  }));
}

const shelf = (title: string, kind: Kind, names: string[]): Shelf => ({
  title,
  kind,
  names,
});

export const FOUNDATIONS: Foundation[] = [
  { title: "Colour", wide: true, shelves: colourShelves() },
  {
    title: "Type",
    shelves: [
      shelf("Faces", "face", THEME.names.TokenFont),
      shelf(
        "Sizes",
        "size",
        named(
          (name) => name.startsWith("--text-") && !name.slice(2).includes("--")
        )
      ),
      shelf("Line heights", "leading", named(starts("--leading-"))),
      shelf("Tracking", "tracking", named(starts("--tracking-"))),
      shelf("Weights", "weight", named(starts("--font-weight-"))),
    ],
  },
  {
    title: "Spacing",
    shelves: [
      shelf(
        "Steps",
        "space",
        named(
          (name) =>
            name === `--${SPACING}` ||
            name.startsWith("--spacing-space-") ||
            name.startsWith("--spacing-icon-")
        )
      ),
      shelf("Component sizes", "length", named(starts("--spacing-c-"))),
    ],
  },
  {
    title: "Radii",
    shelves: [shelf("Corners", "radius", named(starts("--radius-")))],
  },
  {
    title: "Shadows and materials",
    shelves: [
      shelf("Shadows", "shadow", named(starts("--shadow-"))),
      shelf("Drop shadows", "drop", named(starts("--drop-shadow-"))),
      shelf(
        "Material blur",
        "blur",
        named((name) => name.startsWith("--material-") && name.endsWith("blur"))
      ),
      shelf(
        "Material saturation",
        "saturate",
        named(
          (name) => name.startsWith("--material-") && name.endsWith("saturate")
        )
      ),
    ],
  },
  {
    title: "Motion",
    shelves: [
      shelf("Durations", "duration", named(starts("--duration-"))),
      shelf("Curves", "ease", named(starts("--ease-"))),
    ],
  },
  {
    title: "Breakpoints",
    shelves: [
      shelf("Screen", "breakpoint", named(starts("--breakpoint-"))),
      shelf("Containers", "breakpoint", named(starts("--container-"))),
    ],
  },
];
