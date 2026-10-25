/**
 * `$app/navigation` as the preview has it: the page is not a SvelteKit app
 * and goes nowhere, so a module the dashboard's components reach for it
 * finds a call that does nothing (build.ts names this module for it).
 */
export const goto = () => Promise.resolve();
export const replaceState = () => undefined;
export const pushState = () => undefined;
export const afterNavigate = () => undefined;
export const beforeNavigate = () => undefined;
export const onNavigate = () => undefined;
export const invalidate = () => Promise.resolve();
export const invalidateAll = () => Promise.resolve();
export const preloadData = () => Promise.resolve();
