/**
 * The design graph's figures (the ruler's marks, the view's widths, the
 * count of differences past the lines shown, and every figure its words
 * say, which take a `Figure` alone) through `Intl.NumberFormat`, in the
 * page's language: the document's `lang` (app.html's `<html lang>`, the
 * platform's own mark for it), or the one the surface is handed, so a
 * figure reads as the words beside it do. Grouped from five digits on
 * (`useGrouping: "min2"`): a move of 1,800,000 ms groups its thousands,
 * where a width of 1440 or a mark at 2500 stands as a figure alone.
 */

import type { Figure } from "@cawco/core/words/graph";

const formats = new Map<string, Intl.NumberFormat>();

/** The page's language: the document's `lang`, else the reader's own. */
export const pageLang = (): string | undefined =>
  (typeof document === "undefined" ? "" : document.documentElement.lang) ||
  undefined;

/** `n` as a figure in `lang`. */
export function figureOf(n: number, lang: string | undefined): Figure {
  const key = lang ?? "";
  let format = formats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(lang, { useGrouping: "min2" });
    formats.set(key, format);
  }
  return format.format(n) as Figure;
}

let pen: CanvasRenderingContext2D | null = null;

/** How wide `text` draws in `el`'s type, px: its weight, size and face, as a canvas measures it. */
export function inkWidth(text: string, el: Element): number {
  pen ??= document.createElement("canvas").getContext("2d");
  if (!pen) {
    return 0;
  }
  const style = getComputedStyle(el);
  pen.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  return pen.measureText(text).width;
}
