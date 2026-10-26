/**
 * Layout read from the engine: boxes from getBoundingClientRect, styles from
 * getComputedStyle, and the plain arithmetic of gaps, alignment and overlap
 * over them. No pixel is read here.
 */
import type { Page } from "playwright-core";

export interface Box {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

/** The first element `selector` names: its box, or null when none is drawn. */
export function box(page: Page, selector: string): Promise<Box | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) {
      return null;
    }
    const r = el.getBoundingClientRect();
    return {
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
    };
  }, selector);
}

/** A computed colour as rgb, through a token: what `var(--token)` resolves to under `selector`. */
export function tokenColour(
  page: Page,
  token: string,
  under = "body"
): Promise<string> {
  return page.evaluate(
    ({ t, sel }) => {
      const swatch = document.createElement("span");
      swatch.style.color = `var(${t})`;
      (document.querySelector(sel) ?? document.body).append(swatch);
      const ink = getComputedStyle(swatch).color;
      swatch.remove();
      return ink;
    },
    { t: token, sel: under }
  );
}
