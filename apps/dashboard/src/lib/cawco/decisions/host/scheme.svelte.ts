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
import { MediaQuery } from "svelte/reactivity";

const root = document.documentElement;
const reader = new MediaQuery("prefers-color-scheme: dark");
const named = $state<{ theme: string | undefined }>({
  theme: root.dataset.theme,
});
new MutationObserver(() => {
  named.theme = root.dataset.theme;
}).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

export const scheme = {
  get now(): "light" | "dark" {
    if (named.theme === "dark" || named.theme === "light") {
      return named.theme;
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
