/**
 * Who decides' popovers drawn in place, as pictures of themselves standing
 * open: a component canvas's frame (the states files' fixtures), where a
 * floating layer standing open as its frame mounts is placed against the
 * canvas's window, not the frame, and moves the canvas to bring itself into
 * sight. A fixture calls {@link drawPopoversInPlace}; each popover then
 * draws its panel in the page's flow, under what opened it, with
 * `data-still-popover`, and every control in it works as it does on the
 * page.
 */
import { getContext, setContext } from "svelte";
import { frameObserver } from "#lib/platform/frame-observer.js";

const STILL = Symbol("decides:in-place");

export const drawPopoversInPlace = (): void => {
  setContext(STILL, true);
};

/** This popover draws in place (a fixture asked for it). */
export const drawnInPlace = (): boolean =>
  getContext<boolean | undefined>(STILL) === true;

/**
 * The panel under `anchor`, at its start (`align: "start"`) or its end, never
 * past the gutter (the page's padding) on either side of the page holding
 * it, as the popover keeps its collision padding.
 */
export const placeUnder =
  (anchor: () => HTMLElement | null, align: "start" | "end") =>
  (panel: HTMLElement) => {
    const place = () => {
      const page = panel.offsetParent;
      const at = anchor();
      if (!(at && page instanceof HTMLElement)) {
        return;
      }
      const ratio = page.getBoundingClientRect().width / page.offsetWidth || 1;
      const card = at.getBoundingClientRect();
      const box = page.getBoundingClientRect();
      // The page's own padding is the gutter it keeps from either side.
      const pad = Number.parseFloat(getComputedStyle(page).paddingInlineStart);
      const room = page.clientWidth - 2 * pad;
      panel.style.maxInlineSize = `${room}px`;
      const width = Math.min(panel.offsetWidth, room);
      const start =
        align === "start"
          ? (card.left - box.left) / ratio
          : (card.right - box.left) / ratio - width;
      const left = Math.min(start, page.clientWidth - pad - width);
      panel.style.insetInlineStart = `${Math.max(pad, left)}px`;
      panel.style.insetBlockStart = `${(card.bottom - box.top) / ratio + 4}px`;
    };
    place();
    const watch = frameObserver(place);
    watch.observe(panel);
    const at = anchor();
    if (at) {
      watch.observe(at);
    }
    return () => watch.disconnect();
  };

/** The page as tall as a panel drawn in place reaches, and its own padding past it. */
export function holdsPanels(page: HTMLElement) {
  const fit = () => {
    const panel = page.querySelector<HTMLElement>("[data-still-popover]");
    const pad = Number.parseFloat(getComputedStyle(page).paddingBlockEnd);
    page.style.minBlockSize = panel
      ? `${panel.offsetTop + panel.offsetHeight + pad}px`
      : "";
  };
  const watch = frameObserver(fit);
  let watched: Element | null = null;
  const seen = new MutationObserver(() => {
    const panel = page.querySelector("[data-still-popover]");
    if (panel !== watched) {
      if (watched) {
        watch.unobserve(watched);
      }
      if (panel) {
        watch.observe(panel);
      }
      watched = panel;
    }
    watch.request();
  });
  seen.observe(page, { childList: true, subtree: true });
  watch.observe(page);
  fit();
  return () => {
    watch.disconnect();
    seen.disconnect();
  };
}
