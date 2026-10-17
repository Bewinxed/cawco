import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
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
      transition: [{ transition: utilities("transition") }],
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
