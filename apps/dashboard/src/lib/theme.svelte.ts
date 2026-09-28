import { browser } from "$app/environment";
import { dur } from "$lib/whiffle/motion/curves.svelte";

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

/**
 * A switch the reader makes cross-fades the whole page as one: the root
 * carries `theme-switching` (app.css) from the task that flips the theme until
 * the fade is over, so every colour turns on one --dur-fade curve instead of
 * each element's own timing. The class comes off a frame after the fade's
 * length, counted from the frame the new colours were first drawn: taking it
 * off sooner would cut the transitions it set short.
 */
let switching = 0;
function crossFade(apply: () => void) {
  const root = document.documentElement;
  switching += 1;
  const mine = switching;
  root.classList.add("theme-switching");
  apply();
  requestAnimationFrame(() => {
    setTimeout(() => {
      requestAnimationFrame(() => {
        if (switching === mine) {
          root.classList.remove("theme-switching");
        }
      });
    }, dur("--dur-fade"));
  });
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

  set(value: Theme) {
    this.current = value;
    if (browser) {
      localStorage.setItem("whiffle-theme", value);
      crossFade(() => applyTheme(value));
    }
  }

  toggle() {
    this.set(this.current === "light" ? "dark" : "light");
  }
}

export const theme = new ThemeState();

export function toggleTheme() {
  theme.toggle();
}
