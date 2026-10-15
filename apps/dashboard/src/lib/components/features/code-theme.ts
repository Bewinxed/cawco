/**
 * The one syntax theme every code surface paints with: a transcript's code
 * well (agent-code.ts) and a diff (@pierre/diffs, DiffView and DiffModal).
 * It is Shiki's css-variables theme, so a token's colour is a reference
 * (`var(--code-syntax-token-keyword)`), never a value; app.css points each of
 * those variables at a house code token (DESIGN.md: "Syntax colours code
 * blocks and diffs"), and those carry both appearances through light-dark().
 * Changing theme therefore repaints without tokenizing a line again, and a
 * diff's shadow root reads the same variables, since custom properties
 * inherit into it.
 */
import type { ThemeRegistration } from "shiki";

export const CODE_THEME = "cawco-code";

/** Shiki builds the theme; it is loaded only by the first surface that paints code. */
export const codeTheme = async (): Promise<ThemeRegistration> => {
  const { createCssVariablesTheme } = await import("shiki");
  return createCssVariablesTheme({
    name: CODE_THEME,
    variablePrefix: "--code-syntax-",
  });
};
