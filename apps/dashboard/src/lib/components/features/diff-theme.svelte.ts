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
 * A FileDiff on the house theme. The library's shadow root says
 * `color-scheme: light dark`, which follows the OS; the app's scheme is the
 * theme class (app.css), so the diff is told it, and told again on every
 * switch. Call it inside an effect (an attachment): the switch is followed for
 * as long as that effect lives.
 */
export function houseDiff(layout: DiffLayout): FileDiff<undefined, undefined> {
  const diff = new FileDiff<undefined, undefined>({
    ...layout,
    overflow: "wrap",
    theme: THEMES,
    themeType: untrack(() => theme.resolved),
  });
  $effect(() => {
    diff.setThemeType(theme.resolved);
  });
  return diff;
}
