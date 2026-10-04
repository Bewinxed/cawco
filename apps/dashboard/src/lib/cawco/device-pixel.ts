/**
 * One device pixel as a CSS length: `--dpx` on the root. A hairline drawn
 * outside a box (a session mark's rim) is sized in whole device pixels with
 * it (`round(1.5px, var(--dpx))`), so the browser's pixel grid moves each of
 * its edges by the same amount as the box's own. A measurement of the
 * screen, not a design value: it follows the zoom and the display the
 * window is on.
 */

/** Keeps `--dpx` at the window's device pixel. Returns the cleanup. */
export function trackDevicePixel(): () => void {
  const root = document.documentElement;
  let query: MediaQueryList | undefined;
  let ratio = 0;
  const sync = () => {
    if (devicePixelRatio === ratio) {
      return;
    }
    ratio = devicePixelRatio;
    root.style.setProperty("--dpx", `${1 / ratio}px`);
    // A resolution query matches one ratio: it fires once when the ratio
    // leaves it (a move to another display), and is asked again.
    query?.removeEventListener("change", sync);
    query = matchMedia(`(resolution: ${ratio}dppx)`);
    query.addEventListener("change", sync);
  };
  sync();
  // A zoom changes the ratio and the viewport's size together.
  window.addEventListener("resize", sync);
  return () => {
    query?.removeEventListener("change", sync);
    window.removeEventListener("resize", sync);
  };
}
