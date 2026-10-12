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

/** Every element `selector` names, drawn ones only: their boxes. */
export function boxes(page: Page, selector: string): Promise<Box[]> {
  return page.evaluate(
    (sel) =>
      [...document.querySelectorAll(sel)]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 || r.height > 0)
        .map((r) => ({
          left: r.left,
          top: r.top,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
        })),
    selector
  );
}

/** Computed style properties of the first element `selector` names (`pseudo` e.g. "::after"). */
export function styles(
  page: Page,
  selector: string,
  props: string[],
  pseudo?: string
): Promise<Record<string, string> | null> {
  return page.evaluate(
    ({ sel, list, ps }) => {
      const el = document.querySelector(sel);
      if (!el) {
        return null;
      }
      const s = getComputedStyle(el, ps ?? null);
      return Object.fromEntries(list.map((p) => [p, s.getPropertyValue(p)]));
    },
    { sel: selector, list: props, ps: pseudo }
  );
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

/** How far b starts after a ends, along an axis (negative where they overlap). */
export const gap = (a: Box, b: Box, axis: "x" | "y" = "y"): number =>
  axis === "y" ? b.top - a.bottom : b.left - a.right;

/** Whether every value lies within `tolerance` of the others. */
export const aligned = (values: number[], tolerance = 1): boolean =>
  values.length === 0 || Math.max(...values) - Math.min(...values) <= tolerance;

/** The spread of a set of values: how far apart the extremes land. */
export const spread = (values: number[]): number =>
  values.length === 0 ? 0 : Math.max(...values) - Math.min(...values);

/** The area two boxes share, px². */
export const overlap = (a: Box, b: Box): number =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
  Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

/** Whether `inner` lies inside `outer`, within `tolerance`. */
export const inside = (inner: Box, outer: Box, tolerance = 0.5): boolean =>
  inner.left >= outer.left - tolerance &&
  inner.right <= outer.right + tolerance &&
  inner.top >= outer.top - tolerance &&
  inner.bottom <= outer.bottom + tolerance;

export const r2 = (n: number): number => Math.round(n * 100) / 100;
