/**
 * The foundations the board draws, read off the theme itself
 * (lib/tokens/theme.css, imported as text): every token its `@theme static`
 * block declares, by the name Tailwind reads it by, sorted into the kinds
 * the board lays out. `static` writes every one of them into the shipped
 * stylesheet, so each is in the app as it ships. Their values are never
 * read here: the board draws each through `var()` and reads what the page
 * computes, in each scheme.
 */
/** The theme's own text, as the build reads it. */
const [THEME = ""] = Object.values(
  import.meta.glob<string>("../tokens/theme.css", {
    eager: true,
    import: "default",
    query: "?raw",
  })
);

/** The spacing base, the step every `--spacing(n)` counts in. */
const SPACING = "spacing";
const COMMENT = /\/\*[\s\S]*?\*\//gu;
/** A declaration at the start of a line: its custom property's name. */
const DECLARED = /^\s*(--[a-z0-9-]+)\s*:/gmu;
const STATIC_OPEN = "@theme static {";

/** The `@theme static` block's text: from its brace to the brace that closes it. */
function staticBlock(text: string): string {
  const start = text.indexOf(STATIC_OPEN);
  if (start < 0) {
    throw new Error("theme.css holds no `@theme static` block to read");
  }
  let depth = 0;
  for (let at = start + STATIC_OPEN.length - 1; at < text.length; at += 1) {
    if (text[at] === "{") {
      depth += 1;
    } else if (text[at] === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, at);
      }
    }
  }
  throw new Error("theme.css's `@theme static` block never closes");
}

/** Every token the static theme declares, in the order it declares them. */
const TOKENS = [
  ...new Set(
    [...staticBlock(THEME.replace(COMMENT, "")).matchAll(DECLARED)].map(
      ([, name]) => name
    )
  ),
];

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
  for (const name of named(starts("--color-"))) {
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
      shelf(
        "Faces",
        "face",
        named(
          (name) =>
            name.startsWith("--font-") && !name.startsWith("--font-weight-")
        )
      ),
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
