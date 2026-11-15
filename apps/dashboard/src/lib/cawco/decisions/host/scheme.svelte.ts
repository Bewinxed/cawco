/**
 * The scheme the page draws in: the host's, once the overlay names it on the
 * root (`data-theme`, preview overlay/page.ts `themeRoot`), else the
 * reader's. What the page draws by scheme and no token carries (Caw's
 * picture, a frame told its theme) reads it here. A program's page has its
 * root carry the `dark` class while it draws dark (`darkOn`), as
 * mode-watcher puts it on the dashboard's: the house's `dark:` variant keys
 * on it (variants.css `@custom-variant dark`), so a kit part's dark look
 * (the checkbox's fill) holds on the page too. An HTML page's dials put it
 * on their own root, never the page's (DialsRoot.svelte).
 */
import { createSubscriber, MediaQuery } from "svelte/reactivity";

const reader = new MediaQuery("prefers-color-scheme: dark");

/**
 * The root's `data-theme` followed while an effect reads the scheme
 * (`createSubscriber`, as `MediaQuery` follows the reader's): importing
 * this module starts nothing and reads no document, and the last reader
 * gone stops the watch. Every page that draws by it (a decision page, a
 * canvas frame, the dashboard) reads its own root with no start of its own.
 */
const subscribe = createSubscriber((update) => {
  const watcher = new MutationObserver(update);
  watcher.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => watcher.disconnect();
});

export const scheme = {
  get now(): "light" | "dark" {
    if (typeof document !== "undefined") {
      subscribe();
      const named = document.documentElement.dataset.theme;
      if (named === "dark" || named === "light") {
        return named;
      }
    }
    return reader.current ? "dark" : "light";
  },
};

/** `node` carries the `dark` class while the page draws dark, from now on. */
export const darkOn = (node: Element): void => {
  $effect.root(() => {
    $effect(() => {
      node.classList.toggle("dark", scheme.now === "dark");
    });
  });
};
