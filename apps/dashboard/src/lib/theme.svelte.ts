import { flushSync } from "svelte";
import { motionOk } from "#lib/cawco/motion/curves.svelte.js";
import { browser } from "$app/env";

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

  /** The switch in flight: a later one takes `theme-flip` over from it. */
  #flips = 0;

  /**
   * A switch the reader makes cross-fades the whole page as one: a view
   * transition takes the old page, flips the theme, and fades the new page
   * in as the old one fades out (app.css, --dur-fade on --ease-out). With
   * reduced motion the theme flips at once, with no transition.
   */
  set(value: Theme) {
    // Flushed, so everything the theme draws (the switch's own icon) is in
    // the new page the transition takes, not a frame behind it.
    const flip = () =>
      flushSync(() => {
        this.current = value;
        localStorage.setItem("cawco-theme", value);
        this.resolved = applyTheme(value);
      });
    // The page's own colour transitions (a button's hover ink, a row's pill)
    // would start from the old theme: a second fade under the cross-fade, a
    // fade the reduced-motion switch promises not to have, and a style pass
    // for those elements every frame until they end. They are off from
    // before the flip until the switch is over.
    const root = document.documentElement;
    this.#flips += 1;
    const mine = this.#flips;
    const done = () => {
      if (mine === this.#flips) {
        root.classList.remove("theme-flip");
      }
    };
    root.classList.add("theme-flip");
    if (!motionOk.current) {
      flip();
      // The flip's frame is drawn with them off; the one after gets them back.
      requestAnimationFrame(() => requestAnimationFrame(done));
      return;
    }
    document.startViewTransition(flip).finished.finally(done);
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
