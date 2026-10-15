/**
 * The reader's colour scheme pick: `system`, `light` or `dark`, kept in this browser under
 * THEME_KEY. `system` is the absence of a pick.
 */
export const THEME_KEY = 'cawco-theme';

export type Theme = 'system' | 'light' | 'dark';

export const isTheme = (value: unknown): value is Theme =>
  value === 'system' || value === 'light' || value === 'dark';

/**
 * Puts the page in a scheme: `data-theme` on the root, which styles.css turns into
 * `color-scheme` so every `light-dark()` on the page follows it, and the browser's theme
 * colour to match. `system` removes both overrides.
 *
 * It uses nothing from outside its own body: the build also writes it into each page's head
 * (vite.config.ts), where it runs before the stylesheet so the first paint is in the pick.
 */
export function applyTheme(theme: string): void {
  const root = document.documentElement;
  const forced = theme === 'light' || theme === 'dark';
  if (forced) root.dataset.theme = theme;
  else delete root.dataset.theme;
  for (const meta of document.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"][data-scheme]',
  )) {
    const scheme = meta.dataset.scheme;
    meta.media = forced
      ? scheme === theme
        ? 'all'
        : 'not all'
      : `(prefers-color-scheme: ${scheme})`;
  }
}
