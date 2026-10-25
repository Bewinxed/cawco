/**
 * The canvas page's scheme, one source for all that draws on it: the frames
 * drawn in the page's own scheme and the page's sheet (its tokens'
 * `light-dark()`, through the root's `color-scheme`).
 * The host's theme when the overlay said one (`html[data-theme]`, which it
 * keeps in step with the dashboard's), else the system's.
 */
export type PageScheme = "light" | "dark";

const OS_DARK = "(prefers-color-scheme: dark)";

/** The scheme the page draws in now. */
export function pageScheme(): PageScheme {
  const { theme } = document.documentElement.dataset;
  if (theme) {
    return theme === "dark" ? "dark" : "light";
  }
  return window.matchMedia(OS_DARK).matches ? "dark" : "light";
}

/**
 * Calls `changed` with the new scheme whenever it changes: the host's theme
 * set or changed, or the system's turning while the host has said none.
 */
export function onPageScheme(changed: (scheme: PageScheme) => void): void {
  let said = pageScheme();
  const heard = () => {
    const now = pageScheme();
    if (now !== said) {
      said = now;
      changed(now);
    }
  };
  window.matchMedia(OS_DARK).addEventListener("change", heard);
  new MutationObserver(heard).observe(document.documentElement, {
    attributeFilter: ["data-theme"],
  });
}
