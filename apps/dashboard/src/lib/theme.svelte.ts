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
   * A switch the reader makes draws the new theme at once under a wash of the
   * old page's background, and fades the wash off it (app.css .theme-wash,
   * --dur-fade on --ease-out): one composited layer, nothing captured. With
   * reduced motion the theme flips at once, with no wash.
   */
  set(value: Theme) {
    const flip = () => {
      this.current = value;
      localStorage.setItem("whiffle-theme", value);
      applyTheme(value);
    };
    // The page's own colour transitions (a button's hover ink, a row's pill)
    // would start from the old theme: a second fade under the wash's, a fade
    // the reduced-motion switch promises not to have, and a style pass for
    // those elements every frame until they end. They are off for the flip,
    // and back once the new page is drawn (with the wash, once it has gone).
    const root = document.documentElement;
    if (!motionOk.current) {
      root.classList.add("theme-flip");
      flip();
      // The flip's frame is drawn with them off; the one after gets them back.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => root.classList.remove("theme-flip"))
      );
      return;
    }
    const wash = document.createElement("div");
    wash.className = "theme-wash";
    wash.style.backgroundColor = getComputedStyle(
      document.body
    ).backgroundColor;
    wash.addEventListener(
      "animationend",
      () => {
        wash.remove();
        root.classList.remove("theme-flip");
      },
      { once: true }
    );
    document.body.append(wash);
    root.classList.add("theme-flip");
    flip();
  }

  toggle() {
    this.set(this.current === "light" ? "dark" : "light");
  }
}

export const theme = new ThemeState();

export function toggleTheme() {
  theme.toggle();
}
