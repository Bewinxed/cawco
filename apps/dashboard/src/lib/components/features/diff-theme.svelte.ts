/**
 * What every diff is drawn with, in one place, so no FileDiff falls back to
 * a library default: the house code theme (code-theme.ts) in place of the
 * library's own palette, the app's scheme in place of the OS's, and long
 * lines wrapped in place of scrolled (diffs.com: "Long line handling:
 * 'scroll' (default) or 'wrap'") — a diff stands in a column and never
 * scrolls sideways.
 */
import {
  FileDiff,
  type FileDiffOptions,
  registerCustomTheme,
} from "@pierre/diffs";
import { untrack } from "svelte";
import { theme } from "#lib/theme.svelte.js";
import { CODE_THEME, codeTheme } from "./code-theme";

registerCustomTheme(CODE_THEME, codeTheme);

type DiffLayout = Omit<
  FileDiffOptions<undefined, undefined>,
  "overflow" | "theme" | "themeType"
>;

/**
 * The house theme on both sides. Named alone, a theme brings its own scheme
 * (Shiki's css-variables theme calls itself dark) and the library ignores
 * `themeType`; as a pair, `themeType` picks the scheme, and the one theme's
 * variables resolve through light-dark() in it.
 */
const THEMES = { light: CODE_THEME, dark: CODE_THEME };

/**
 * The scheme `where` is drawn in: its own `color-scheme`, which it inherits
 * from the root's theme class in the app (app.css) and from its frame on a
 * component canvas, where a dark frame stands on a light page. "light dark"
 * follows the OS, as the browser does.
 */
function schemeAt(where: HTMLElement): "light" | "dark" {
  const named = getComputedStyle(where).colorScheme.split(" ");
  if (named.includes("dark") && !named.includes("light")) {
    return "dark";
  }
  if (named.includes("dark")) {
    return matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return "light";
}

/**
 * A FileDiff on the house theme, for drawing into `where`. The library's
 * shadow root says `color-scheme: light dark`, which follows the OS; the
 * diff is told the scheme of the box it is drawn in, and told again on every
 * switch of the app's theme. Call it inside an effect (an attachment): the
 * switch is followed for as long as that effect lives.
 */
export function houseDiff(
  layout: DiffLayout,
  where: HTMLElement
): FileDiff<undefined, undefined> {
  const diff = new FileDiff<undefined, undefined>({
    ...layout,
    overflow: "wrap",
    theme: THEMES,
    themeType: untrack(() => schemeAt(where)),
  });
  $effect(() => {
    // Read again after every switch of the app's theme.
    diff.setThemeType(theme.resolved && schemeAt(where));
  });
  return diff;
}
