/**
 * Writes the dashboard's Tailwind variants (src/lib/tokens/variants.css,
 * imported by app.css after theme.css): the house's own, and one named
 * variant per attribute state the components style.
 *
 * The house's own are the media and state conditions the components repeat:
 * hover only where a fine pointer can rest (Tailwind's own is `(hover:
 * hover)`), the pointer kinds, the two schemes, reduced transparency, and a
 * surface nobody can see (motion/rest.ts).
 *
 * The named ones: every `[data-<attr>="<value>"]` a component's selector
 * reads becomes `<attr>-<value>:` (`state-open:`, `tone-fail:`), so a class
 * names a state without an arbitrary variant. ARIA's true states are
 * Tailwind's own (`aria-expanded:`); each one the tree reads gets its false
 * branch here (`aria-expanded-false:`), and a non-boolean value its pair
 * (`aria-current-page:`). A variant once written is kept: the selectors
 * move from `<style>` into markup as the components are converted, and the
 * variant is what the markup then names.
 *
 *   bun run variants
 */
import { Glob } from "bun";

const OUT = "src/lib/tokens/variants.css";
/** The components, and the shared sheets beside them (spawn/ns-theme.css, workflows.css): every selector a state is read in. */
const SOURCES = new Glob("src/lib/**/*.{svelte,css}");
const ROUTES = new Glob("src/routes/**/*.svelte");
const PAIR = /\[(data|aria)-([a-z-]+)=["']?([a-z0-9-]+)["']?\]/g;
const WRITTEN =
  /@custom-variant [a-z0-9-]+ \(&\[(data|aria)-([a-z-]+)="([a-z0-9-]+)"\]\);/g;
/** Tailwind's own boolean ARIA variants, each `[aria-x="true"]`. */
const ARIA_STATIC = [
  "busy",
  "checked",
  "disabled",
  "expanded",
  "hidden",
  "pressed",
  "readonly",
  "required",
  "selected",
];

const HOUSE = `/* Hover only where a pointer can rest on it: a fine pointer that hovers.
   Tailwind's own asks (hover: hover) alone. group-hover: and peer-hover:
   follow it. */
@custom-variant hover {
  @media (hover: hover) and (pointer: fine) {
    &:hover {
      @slot;
    }
  }
}

/* Anything else that only a resting pointer may show. */
@custom-variant can-hover {
  @media (hover: hover) and (pointer: fine) {
    @slot;
  }
}

@custom-variant no-hover {
  @media not ((hover: hover) and (pointer: fine)) {
    @slot;
  }
}

/* A primary input that cannot hover at all (a finger), whatever else is
   attached: (hover: none), where no-hover: also takes a coarse pointer
   that can hover. */
@custom-variant hover-none {
  @media (hover: none) {
    @slot;
  }
}

@custom-variant coarse {
  @media (pointer: coarse) {
    @slot;
  }
}

@custom-variant fine {
  @media (pointer: fine) {
    @slot;
  }
}

/* shadcn-svelte's state variants, as its stylesheet (shadcn-svelte/tailwind.css,
   no longer imported) writes them, and where it stood: before the theme
   switch. Each matches the kit's two ways of saying a state, at no
   specificity of its own, so a state never outweighs hover: or focus:. */
@custom-variant data-open {
  &:where([data-state="open"]),
  &:where([data-open]:not([data-open="false"])) {
    @slot;
  }
}

@custom-variant data-closed {
  &:where([data-state="closed"]),
  &:where([data-closed]:not([data-closed="false"])) {
    @slot;
  }
}

@custom-variant data-checked {
  &:where([data-state="checked"]),
  &:where([data-checked]:not([data-checked="false"])) {
    @slot;
  }
}

@custom-variant data-unchecked {
  &:where([data-state="unchecked"]),
  &:where([data-unchecked]:not([data-unchecked="false"])) {
    @slot;
  }
}

@custom-variant data-disabled {
  &:where([data-disabled="true"]),
  &:where([data-disabled]:not([data-disabled="false"])) {
    @slot;
  }
}

@custom-variant data-active {
  &:where([data-state="active"]),
  &:where([data-active]:not([data-active="false"])) {
    @slot;
  }
}

@custom-variant data-horizontal {
  &:where([data-orientation="horizontal"]) {
    @slot;
  }
}

@custom-variant data-vertical {
  &:where([data-orientation="vertical"]) {
    @slot;
  }
}

/* The theme class is the one switch (lib/theme.svelte.ts). */
@custom-variant dark (&:where(.dark, .dark *));
@custom-variant light (&:where(:root:not(.dark), :root:not(.dark) *));

@custom-variant reduced-transparency {
  @media (prefers-reduced-transparency: reduce) {
    @slot;
  }
}

/* The workflow list's own width (routes/(app)/workflows): at 760px and
   under its table becomes cards. Off the phone/desk/wide ladder, so it is
   a named query of its own rather than a breakpoint every page would get. */
@custom-variant workflow-cards {
  @media (max-width: 760px) {
    @slot;
  }
}

/* A surface nobody can see (motion/rest.ts): a hidden tab, an element
   scrolled out of view, an inert surface parked behind the one in front. */
@custom-variant at-rest (&:where(:root[data-at-rest] *, [data-offscreen], [data-offscreen] *, [inert]:not([data-leaving]) *));`;

/** Names Tailwind or the house already give a variant, or begin a functional one. */
const RESERVED =
  /^(hover|can-hover|no-hover|hover-none|coarse|fine|dark|light|reduced-transparency|at-rest|workflow-cards|focus-within|focus-visible|placeholder-shown|read-only|in-range|out-of-range|user-valid|user-invalid|motion-safe|motion-reduce|contrast-more|contrast-less|forced-colors|inverted-colors|pointer-.*|any-pointer-.*|details-content|(group|peer|has|not|in|data|supports|max|min|nth|nth-last|nth-of-type|nth-last-of-type)-.*)$/;

interface Pair {
  attr: string;
  kind: "data" | "aria";
  value: string;
}

const variantName = ({ kind, attr, value }: Pair) =>
  kind === "data" ? `${attr}-${value}` : `aria-${attr}-${value}`;
const selector = ({ kind, attr, value }: Pair) =>
  `&[${kind}-${attr}="${value}"]`;

/** The pairs one component's selectors read; an ARIA true state stands for its false branch. */
const pairsIn = (text: string): Pair[] =>
  [...text.matchAll(PAIR)].map(([, kind, attr, value]) =>
    kind === "aria" && value === "true"
      ? { kind: "aria", attr, value: "false" }
      : { kind: kind as Pair["kind"], attr, value }
  );

/** The pairs the tree's selectors read. */
async function treePairs(): Promise<Pair[]> {
  const paths = [
    ...(await Array.fromAsync(SOURCES.scan("."))),
    ...(await Array.fromAsync(ROUTES.scan("."))),
  ].filter((path) => !path.startsWith("src/lib/tokens/"));
  const texts = await Promise.all(paths.map((path) => Bun.file(path).text()));
  return texts.flatMap(pairsIn);
}

/** The pairs the file already names: never dropped. */
async function writtenPairs(): Promise<Pair[]> {
  const file = Bun.file(OUT);
  if (!(await file.exists())) {
    return [];
  }
  const text = await file.text();
  return [...text.matchAll(WRITTEN)].map(([, kind, attr, value]) => ({
    kind: kind as Pair["kind"],
    attr,
    value,
  }));
}

const pairs = new Map<string, Pair>();
const add = (pair: Pair) => {
  const name = variantName(pair);
  const before = pairs.get(name);
  if (before && selector(before) !== selector(pair)) {
    throw new Error(
      `${selector(before)} and ${selector(pair)} would both be ${name}:`
    );
  }
  if (RESERVED.test(name)) {
    throw new Error(
      `${selector(pair)} would be ${name}:, a name Tailwind or the house already gives`
    );
  }
  pairs.set(name, pair);
};
for (const attr of ARIA_STATIC) {
  add({ kind: "aria", attr, value: "false" });
}
const [written, read] = await Promise.all([writtenPairs(), treePairs()]);
for (const pair of [...written, ...read]) {
  add(pair);
}

const named = [...pairs]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([name, pair]) => `@custom-variant ${name} (${selector(pair)});`);
await Bun.write(
  OUT,
  [
    "/* Generated by `bun run variants` (scripts/build-variants.ts). Do not edit:",
    "   change the script, or the selectors in the components, and rebuild. */",
    "",
    HOUSE,
    "",
    '/* One per attribute state a component styles: [data-tone="fail"] is',
    '   tone-fail:, [aria-expanded="false"] is aria-expanded-false:. */',
    ...named,
    "",
  ].join("\n")
);
console.log(`variants.css: ${pairs.size} named variants`);
