/**
 * Caw's own drawings: his Rive files (`*.riv`) and the Rive runtime
 * (`rive.wasm`) are files the build emits into this folder, which Caw
 * fetches the first time he is shown. The harness guard refuses every
 * fetch, so a page with Caw on it keeps the browser's own fetch for those
 * files alone: same origin, inside the folder, nothing else.
 *
 * Imported before the guard (main.ts's first import); `keepCawsFiles()`
 * runs after it is in place.
 */
const own = window.fetch.bind(window);
const CAWS_FILES = /\.(riv|wasm)$/;

const inFolder = (input: RequestInfo | URL): boolean => {
  const url = new URL(
    input instanceof Request ? input.url : String(input),
    location.href
  );
  return url.origin === location.origin && CAWS_FILES.test(url.pathname);
};

export function keepCawsFiles(): void {
  const guarded = window.fetch;
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) =>
    inFolder(input) ? own(input, init) : guarded(input, init);
}
