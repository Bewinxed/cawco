import { browser } from "$app/env";
import { motionOk } from "#lib/cawco/motion/curves.svelte.js";

type Theme = "light" | "dark" | "system";
type Scheme = "light" | "dark";

/** No stored choice follows the OS: neither scheme is the default. */
function getInitialTheme(): Theme {
  if (!browser) {
    return "system";
  }
  const stored = localStorage.getItem("cawco-theme") as Theme | null;
  return stored || "system";
}

function resolve(themeValue: Theme): Scheme {
  if (themeValue !== "system") {
    return themeValue;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Sets the class app.html also sets before first paint; returns the scheme drawn. */
function applyTheme(themeValue: Theme): Scheme {
  const scheme = resolve(themeValue);
  document.documentElement.classList.toggle("dark", scheme === "dark");
  return scheme;
}

class ThemeState {
  current = $state<Theme>(getInitialTheme());
  /** The scheme on screen, whichever choice produced it. */
  resolved = $state<Scheme>("light");

  constructor() {
    if (browser) {
      this.resolved = applyTheme(this.current);

      // A reader on "system" follows the OS as it changes.
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      mediaQuery.addEventListener("change", () => {
        if (this.current === "system") {
          this.resolved = applyTheme("system");
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
      localStorage.setItem("cawco-theme", value);
      this.resolved = applyTheme(value);
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

  /** Flips the scheme on screen, so the first press always changes it. */
  toggle() {
    this.set(this.resolved === "light" ? "dark" : "light");
  }
}

export const theme = new ThemeState();

export function toggleTheme() {
  theme.toggle();
}
