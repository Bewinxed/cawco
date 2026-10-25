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
 * The file is made formatted as `bun fmt` writes it (scripts/fmt.ts
 * `formatText`), so what is written is final.
 *
 *   bun run variants
 *   bun scripts/build-variants.ts --check   (part of `bun run check`: writes
 *     nothing, and fails when the committed file, formatted alike on this
 *     machine's bun (fmt.ts `formattedAlike`), is not what the build makes,
 *     naming each variant it would add or drop)
 */
import { Glob } from "bun";
import { formatText, formattedAlike } from "../../../scripts/fmt";

const OUT = "src/lib/tokens/variants.css";
/** The components, and the shared sheets beside them (spawn/ns-theme.css): every selector a state is read in. */
const SOURCES = new Glob("src/lib/**/*.{svelte,css}");
const ROUTES = new Glob("src/routes/**/*.svelte");
const PAIR = /\[(data|aria)-([a-z-]+)=["']?([a-z0-9-]+)["']?\]/g;
/** A variant the committed file names, however a printer spaced it. */
const WRITTEN =
  /@custom-variant\s+[a-z0-9-]+\s*\(\s*&\[(data|aria)-([a-z-]+)=["']?([a-z0-9-]+)["']?\]\s*\)\s*;/g;
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
/**
 * State pairs a component reads only through a variant's name: written after
 * the source rule that named the selector was converted away (main's
 * NeedsCard `.row[data-kind="tailnet"] > .want`, read as `group-kind-tailnet/row:`).
 */
const DATA_STATIC: { attr: string; value: string }[] = [
  { attr: "kind", value: "tailnet" },
  // Files' list of artifacts, its floor one row or two (FilesList
  // `data-artifacts-floor`, read as `artifacts-floor-one:`), as the
  // attachments' floors are.
  { attr: "artifacts-floor", value: "one" },
  { attr: "artifacts-floor", value: "two" },
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

/* A control under a held press. \`:active\`, and \`[data-pressed]\` from the
   kit menu Trigger (dropdown-menu-trigger.svelte): its menu opens on the
   press and takes the focus into itself, and Chromium drops \`:active\` with
   it a frame in, so the press never painted. */
@custom-variant pressed (&:is(:active, [data-pressed]));

@custom-variant reduced-transparency {
  @media (prefers-reduced-transparency: reduce) {
    @slot;
  }
}


/* A surface nobody can see (motion/rest.ts): a hidden tab, an element
   scrolled out of view, an inert surface parked behind the one in front. */
@custom-variant at-rest (&:where(:root[data-at-rest] *, [data-offscreen], [data-offscreen] *, [inert]:not([data-leaving]) *));

/* A fluid tab held down by its own hit (components/ui/fluid-tabs TabItem):
   the press tints the whole segment, its trailing controls included; a
   press on a trailing control leaves it be. The hit is the tab's own child,
   and asked for as one: a press flips \`:active\` on every element up to the
   root, and a descendant asked for sent each of them up its ancestors to
   find the tab (tab-return 1c's press). */
@custom-variant hit-pressed (&:has(> [data-slot="hit"]:active:not(:disabled, [aria-disabled="true"])));

/* A primary input that can hover, whatever its pointer: (hover: hover)
   alone, the pair of hover-none (can-hover also asks for a fine pointer). */
@custom-variant hover-hover {
  @media (hover: hover) {
    @slot;
  }
}

/* A fluid track's segment while another tab stands under the hover ghost
   (TabsList): the ghost reads as the thing about to take over. The list's
   highlight says its ghost stands shown (\`data-ghost-shown\`: a tab under
   it and not the chosen one); as a \`:has()\` over the tabs, each choice
   scheduled the list's children to restyle. */
@custom-variant beside-ghost (:where([data-slot="ff-tabs-list"][data-ghost-shown]) > &);

/* Not under the pointer, whatever the pointer (Tailwind's \`not-hover:\`
   also matches wherever its hover cannot happen). */
@custom-variant unhovered (&:not(:hover));

/* A row whose link is held down (config SectionRow). */
@custom-variant has-link-active (&:has([data-link]:active));

/* Inside a tree mark whose own hit is held down (TreeMark): the tile gives
   a little under it. */
@custom-variant mark-pressed (&:is([data-tree-mark]:has([data-slot="hit"]:active) *));

/* Inside a live tree mark while its dot beats (TreeMark). At the weight of
   the selector it came from, so it outranks the mark's hole mask. */
@custom-variant mark-beating (&:is([data-tree-mark][data-dot="live"]:has([data-beating]) *));

/* Not hidden by its \`hidden\` attribute (a pane head's fitted controls). */
@custom-variant unhidden (&:not([hidden]));

/* A window too short for the Files lists' full floors, and one tall enough:
   560px of height. */
@custom-variant short-window {
  @media (height < 560px) {
    @slot;
  }
}
@custom-variant tall-window {
  @media (height >= 560px) {
    @slot;
  }
}

/* A filed task that needs you: its TaskNeedsFor stack stands inside it. */
@custom-variant has-needs-stack (&:has([data-slot="task-needs-needs-stack"]));

/* Under a theme switch (theme.svelte.ts marks the root): app.css stops the
   elements' transitions; a pseudo-element names it where it is styled. */
@custom-variant theme-flip (:root[data-theme-flip] &);

/* A <summary>'s marker in WebKit, which draws it as its own pseudo-element
   (Tailwind's \`marker:\` is ::marker). */
@custom-variant details-marker (&::-webkit-details-marker);

/* A tab in a strip while one of its tabs is dragged to a new place
   (tab-drag.svelte.ts sets \`data-reordering\` on the track). */
@custom-variant reordering (:where([data-slot="ff-tabs-list"][data-reordering]) > &);

/* Inside the session details card while it glides to another tab (PaneTabs
   sets \`data-morph\` on the card). */
@custom-variant details-gliding (&:where([data-session-details-popover][data-morph] *));

/* The rendered markdown under a wrapper that cannot pass Markdown's \`.prose\`
   root a class (ToolProse): the root, its blocks, its headings, a heading
   after the first block and a list item after the first. Each carries the
   wrapper and \`.prose\`, so it outranks app.css's \`.prose\` rules in the same
   layer by weight. */
@custom-variant prose-root (& .prose);
@custom-variant prose-block (& .prose > *);
@custom-variant prose-heading (& .prose :is(h1, h2, h3, h4, h5, h6):not(:where([class~="not-prose"], [class~="not-prose"] *)));
@custom-variant prose-block-heading (& .prose > :is(h1, h2, h3, h4):where(:not(:first-child)));
@custom-variant prose-item (& .prose li:where(:not(:first-child)));`;

/** Names Tailwind or the house already give a variant, or begin a functional one. */
const RESERVED =
  /^(hover|can-hover|no-hover|hover-none|coarse|fine|dark|light|pressed|reduced-transparency|at-rest|hit-pressed|hover-hover|beside-ghost|unhovered|has-link-active|mark-pressed|mark-beating|unhidden|short-window|tall-window|details-marker|reordering|details-gliding|prose-root|prose-block|prose-heading|prose-block-heading|prose-item|has-needs-stack|theme-flip|node-focus-visible|focus-within|focus-visible|placeholder-shown|read-only|in-range|out-of-range|user-valid|user-invalid|motion-safe|motion-reduce|contrast-more|contrast-less|forced-colors|inverted-colors|pointer-.*|any-pointer-.*|details-content|(group|peer|has|not|in|data|supports|max|min|nth|nth-last|nth-of-type|nth-last-of-type)-.*)$/;

interface Pair {
  attr: string;
  kind: "data" | "aria";
  value: string;
}

/**
 * A value as a variant name spells it: a leading minus as `minus-`, so
 * `data-delta="-1"` is `delta-minus-1:`, not `delta--1:`, which Biome
 * 2.6.2's Tailwind class parser rejects ("Expected a value but instead
 * found '-'").
 */
const valueName = (value: string): string =>
  value.startsWith("-") ? `minus-${value.slice(1)}` : value;
const variantName = ({ kind, attr, value }: Pair) =>
  kind === "data"
    ? `${attr}-${valueName(value)}`
    : `aria-${attr}-${valueName(value)}`;
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
for (const { attr, value } of DATA_STATIC) {
  add({ kind: "data", attr, value });
}
const [written, read] = await Promise.all([writtenPairs(), treePairs()]);
for (const pair of [...written, ...read]) {
  add(pair);
}

const named = [...pairs]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([name, pair]) => `@custom-variant ${name} (${selector(pair)});`);
const made = await formatText(
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
if (process.argv.includes("--check")) {
  const committed = await Bun.file(OUT).text();
  if (await formattedAlike(OUT, committed, made)) {
    console.log(
      `variants: ${pairs.size} named variants, as the committed file says them`
    );
    process.exit(0);
  }
  const lines = (text: string) => new Set(text.split("\n"));
  const [was, now] = [lines(committed), lines(made)];
  const changed = [
    ...[...now].filter((l) => !was.has(l)).map((l) => `  + ${l}`),
    ...[...was].filter((l) => !now.has(l)).map((l) => `  - ${l}`),
  ];
  console.error(
    `variants: ${OUT} is unlike what the build makes (run bun run variants):\n${changed.join("\n") || "  (whitespace or order)"}`
  );
  process.exit(1);
}
await Bun.write(OUT, made);
console.log(`variants.css: ${pairs.size} named variants`);
