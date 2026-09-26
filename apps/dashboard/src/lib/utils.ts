import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import { createTV } from "tailwind-variants";

/** The theme's type scale (app.css `--text-*`). Unknown, tailwind-merge reads
 *  `text-label` as a colour and drops the colour class beside it. */
const twMergeConfig = {
  extend: { theme: { text: ["meta", "label", "body", "title", "kpi"] } },
};
const twMerge = extendTailwindMerge(twMergeConfig);

/** `tv` for kit recipes, merging with the same type scale as `cn`. */
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
