import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge, validators } from "tailwind-merge";
import { createTV } from "tailwind-variants";
import theme from "./tokens/theme.css?raw";

/** The keys a namespace of the token theme holds (`--spacing-space-3` → `space-3`). */
const keys = (ns: string): string[] =>
  [...theme.matchAll(new RegExp(`^\\s*--${ns}-([a-z0-9-]+):`, "gm"))].map(
    ([, key]) => key
  );
/** The names of the theme's `@utility <prefix>-<name>` rules. */
const utilities = (prefix: string): string[] =>
  [
    ...theme.matchAll(new RegExp(`^@utility ${prefix}-([a-z0-9-]+) \\{`, "gm")),
  ].map(([, name]) => name);
const durations = keys("duration");
/** A value written in brackets or parentheses (`clip-path-(--clip)`). */
const arbitrary = [validators.isArbitraryVariable, validators.isArbitraryValue];

/**
 * tailwind-merge keeps the later of two classes that set the same thing, so
 * it has to know what each of the theme's names sets. Read from the theme
 * itself: a key it did not know would be kept beside its rival (`p-space-3`
 * and `p-space-1` both, the order in the stylesheet deciding), and a name it
 * misread would drop a class (`text-label` read as a colour drops the colour
 * beside it; `text-size-meta` too). `text-<role>` is a font size, as the
 * role it sets is.
 */
const twMergeConfig = {
  extend: {
    theme: {
      text: utilities("text").filter((name) => !name.startsWith("size-")),
      spacing: keys("spacing"),
      radius: keys("radius"),
      shadow: keys("shadow"),
      "drop-shadow": keys("drop-shadow"),
      leading: keys("leading"),
      tracking: keys("tracking"),
      ease: keys("ease"),
      font: keys("font").filter((key) => !key.startsWith("weight-")),
      "font-weight": keys("font-weight"),
      breakpoint: keys("breakpoint"),
      container: keys("container"),
    },
    classGroups: {
      "font-size": [{ "text-size": utilities("text-size") }],
      "bg-image": [{ bg: utilities("bg") }],
      // The theme's transition tokens, and app.css's `transition-off`.
      transition: [{ transition: [...utilities("transition"), "off"] }],
      duration: [{ dur: durations }],
      "animation-duration": [{ "anim-dur": durations }],
      "type-role": [{ type: utilities("type") }],
      // app.css's per-side shorthands, one group to a side, which
      // tailwind-merge would otherwise read as that side's colour and drop
      // beside the side's real colour. They sort after every border utility,
      // so they stand beside them.
      "border-none-t": ["border-t-none"],
      "border-none-b": ["border-b-none"],
      "border-none-l": ["border-l-none"],
      "border-none-r": ["border-r-none"],
      "border-none-s": ["border-s-none"],
      "border-style-t": ["border-t-dashed"],
      // app.css's `outline: none` and `background` shorthands, a group each
      // (`outline-off` would be read as an outline colour). They stand beside
      // the longhands' utilities, and the sheet's order decides: `background-*`
      // sorts after every `bg-*`, `outline-off` before Tailwind's outline
      // longhands.
      "outline-off": ["outline-off"],
      "background-shorthand": [{ background: [validators.isAny] }],
      // app.css's utilities for declarations Tailwind writes none for. Those
      // that set a property tailwind-merge has a group for join it, so they
      // replace a rival as it would; the rest are a group each.
      rounded: ["rounded-inherit"],
      "font-family": ["font-family-inherit"],
      gap: ["gap-inherit"],
      "color-scheme": ["scheme-inherit"],
      "pointer-events": ["pointer-events-all"],
      "max-h": ["max-h-inherit"],
      "align-items": ["items-box-start", "items-box-end", "items-unsafe-end"],
      "justify-content": ["justify-box-end"],
      "justify-self": ["justify-self-box-start"],
      "align-content": ["content-unsafe-end"],
      "border-color": ["border-suggest-tint"],
      "bg-color": ["bg-suggest-tint", "bg-suggest-tint-hover"],
      "font-shorthand": ["font-inherit", "font-mono-meta"],
      "line-clamp-undo": ["line-clamp-undo"],
      "translate-raw": [{ "translate-raw": arbitrary }],
      "clip-margin": [{ "clip-margin": [validators.isAny] }],
      "anim-delay": [{ "anim-delay": arbitrary }],
      "overflow-anchor": ["anchor-none"],
      "scroll-timeline": ["scroll-timeline-transcript-head"],
      // Recipes: each sets its own custom properties.
      "pane-tab-pads": ["pane-tab-pads"],
      "pane-tab-rims": ["pane-tab-rims"],
      "divider-chevron": ["divider-chevron"],
      "turn-pad": ["turn-pad"],
      // tailwind-merge's `break` group holds `break-words`, which Tailwind 4
      // writes as overflow-wrap: word-break's value is a group of its own.
      "word-break-word": ["break-word"],
      "animation-play-state": ["animation-paused"],
      "inks-strong": ["inks-strong"],
      "tap-highlight": ["tap-highlight-none"],
      "touch-callout": ["touch-callout-none"],
      "content-visibility": ["content-visibility-hidden"],
      "timeline-scope": ["timeline-scope-transcript-head"],
      "writing-mode": ["writing-vertical-rl"],
      direction: ["dir-rtl"],
      "clip-path": [{ "clip-path": arbitrary }],
      "grid-areas": [{ "grid-areas": arbitrary }],
      "line-clamp-std": [{ "line-clamp-std": [validators.isInteger] }],
      "ring-ground": [{ "ring-ground": [validators.isAny] }],
      // The custom-property setters, one group to a property.
      "hit-gap-x": [{ "hit-gap-x": [validators.isAny] }],
      "hit-gap-y": [{ "hit-gap-y": arbitrary }],
      "hit-gap-coarse": [{ "hit-gap-coarse": arbitrary }],
      "join-radius": [{ "join-radius": arbitrary }],
      "caw-neck": [{ "caw-neck": arbitrary }],
      "press-by": [{ "press-by": arbitrary }],
      "swap-away": [{ "swap-away": [validators.isInteger] }],
      "rail-step": [{ "rail-step": arbitrary }],
      "prompt-fs": [{ "prompt-fs": arbitrary }],
      "fade-inset-end": [{ "fade-inset-end": arbitrary }],
    },
  },
};
const twMerge = extendTailwindMerge<
  | "animation-duration"
  | "type-role"
  | "border-none-t"
  | "border-none-b"
  | "border-none-l"
  | "border-none-r"
  | "border-none-s"
  | "border-style-t"
  | "outline-off"
  | "background-shorthand"
  | "font-shorthand"
  | "line-clamp-undo"
  | "translate-raw"
  | "clip-margin"
  | "anim-delay"
  | "overflow-anchor"
  | "scroll-timeline"
  | "pane-tab-pads"
  | "pane-tab-rims"
  | "divider-chevron"
  | "turn-pad"
  | "word-break-word"
  | "animation-play-state"
  | "inks-strong"
  | "tap-highlight"
  | "touch-callout"
  | "content-visibility"
  | "timeline-scope"
  | "writing-mode"
  | "direction"
  | "clip-path"
  | "grid-areas"
  | "line-clamp-std"
  | "ring-ground"
  | "hit-gap-x"
  | "hit-gap-y"
  | "hit-gap-coarse"
  | "join-radius"
  | "caw-neck"
  | "press-by"
  | "swap-away"
  | "rail-step"
  | "prompt-fs"
  | "fade-inset-end"
>(twMergeConfig);

/** `tv` for kit recipes, merging with the same theme as `cn`. */
export const tv = createTV({ twMergeConfig });

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// biome-ignore lint/suspicious/noExplicitAny: structural check for a `child` prop of any shape, not its type
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, "child"> : T;
// biome-ignore lint/suspicious/noExplicitAny: structural check for a `children` prop of any shape, not its type
export type WithoutChildren<T> = T extends { children?: any }
  ? Omit<T, "children">
  : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & {
  ref?: U | null;
};
