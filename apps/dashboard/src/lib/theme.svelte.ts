import { browser } from "$app/environment";
import { motionOk } from "$lib/whiffle/motion/curves.svelte";

type Theme = "light" | "dark" | "system";

function getInitialTheme(): Theme {
  if (!browser) {
    return "light";
  }
  const stored = localStorage.getItem("whiffle-theme") as Theme | null;
  return stored || "light";
}

function applyTheme(themeValue: Theme) {
  if (!browser) {
    return;
  }

  const root = document.documentElement;

  if (themeValue === "system") {
    const systemPrefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    if (systemPrefersDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  } else if (themeValue === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

class ThemeState {
  current = $state<Theme>(getInitialTheme());

  constructor() {
    if (browser) {
      applyTheme(this.current);

      // Listen for system theme changes
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      mediaQuery.addEventListener("change", () => {
        if (this.current === "system") {
          applyTheme("system");
        }
      });
    }
  }

  /**
   * A switch the reader makes cross-fades the whole page as one: a view
   * transition snapshots the page, flips the theme, and fades the new page in
   * over the old one (app.css, --dur-fade on --ease-out). One composited fade,
   * so every colour on the page turns together at no cost per element. With
   * reduced motion the theme flips at once.
   */
  set(value: Theme) {
    const flip = () => {
      this.current = value;
      localStorage.setItem("whiffle-theme", value);
      applyTheme(value);
    };
    if (!motionOk.current) {
      flip();
      return;
    }
    // Under the fade the page's own colour transitions (a button's hover
    // ink, a row's pill) would start from the old theme and play inside the
    // new snapshot: a second fade, and a style pass every frame for it. They
    // are off for the flip, and back once the new page is drawn.
    const root = document.documentElement;
    const transition = document.startViewTransition(() => {
      root.classList.add("theme-flip");
      flip();
    });
    transition.ready.finally(() => root.classList.remove("theme-flip"));
  }

  toggle() {
    this.set(this.current === "light" ? "dark" : "light");
  }
}

export const theme = new ThemeState();

export function toggleTheme() {
  theme.toggle();
}
