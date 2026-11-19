/**
 * Options every `<Markdown>` under a component inherits (its plugins, its
 * snippets, its URL policy), each prop a `<Markdown>` is given overriding
 * them.
 */
import { createContext } from "svelte";
import type { MarkdownOptions } from "./types.js";

const [get, set, has] = createContext<MarkdownOptions>();

/** The options inherited here: none outside any provider. */
export const markdownDefaults = (): MarkdownOptions => (has() ? get() : {});

/**
 * Provide `defaults` to every `<Markdown>` under this component, over those
 * an ancestor provides. Call it while the component initialises.
 */
export const setMarkdownDefaults = (
  defaults: MarkdownOptions
): MarkdownOptions => {
  const above = markdownDefaults();
  return set({
    ...above,
    ...defaults,
    options: { ...above.options, ...defaults.options },
  });
};
