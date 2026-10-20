/**
 * The scheme the page draws in: the host's, once the overlay names it on the
 * root (`data-theme`, preview-overlay page.ts `themeRoot`), else the
 * reader's. What the page draws by scheme and no token carries (Caw's
 * picture, a frame told its theme) reads it here, and the root carries the
 * `dark` class while it draws dark, as mode-watcher puts it on the
 * dashboard's: the house's `dark:` variant keys on it (variants.css
 * `@custom-variant dark`), so a kit part's dark look (the checkbox's fill)
 * holds on the page too.
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

$effect.root(() => {
  $effect(() => {
    root.classList.toggle("dark", scheme.now === "dark");
  });
});
