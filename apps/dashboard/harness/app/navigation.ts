/**
 * `$app/navigation` on a harness page (harness/vite.config.ts aliases it
 * here). A harness page is one page with no routes: a navigation throws,
 * naming where it reached for, as the guard does for a request, so the
 * check fails on it. The lifecycle hooks register nothing: no navigation
 * ever happens to call them.
 */
const refuse = (what: string, url: unknown): never => {
  throw new Error(
    `A harness page has no routes: ${what} ${String(url)}. Show that state as its own entry instead.`
  );
};

export const goto = (url: string | URL): Promise<void> => refuse("goto", url);
export const replaceState = (url: string | URL): void =>
  refuse("replaceState", url);
export const pushState = (url: string | URL): void => refuse("pushState", url);
export const invalidate = (): Promise<void> => Promise.resolve();
export const invalidateAll = (): Promise<void> => Promise.resolve();
export const afterNavigate = (): void => undefined;
export const beforeNavigate = (): void => undefined;
export const onNavigate = (): void => undefined;
