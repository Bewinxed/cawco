/**
 * The scheme the page draws in: the host's, once the overlay names it on the
 * root (`data-theme`, preview-overlay page.ts `themeRoot`), else the
 * reader's. What the page draws by scheme and no token carries (Caw's
 * picture, a frame told its theme) reads it here.
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
