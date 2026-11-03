/**
 * The design graph's own figures (the ruler's marks, the view's widths, the
 * count of differences past the lines shown) through `Intl.NumberFormat`,
 * in the language of the page they stand on: the nearest `lang` round the
 * surface (the platform's own mark for it; app.html's `<html lang>`), so a
 * figure reads as the words beside it do. Grouped from five digits on
 * (`useGrouping: "min2"`): a move of 1,800,000 ms groups its thousands,
 * where a width of 1440 or a mark at 2500 stands as a figure alone.
 */

const formats = new Map<string, Intl.NumberFormat>();

/** The language `node` stands in: its nearest `lang`, else the reader's own. */
export const langOf = (node: Element | null): string | undefined =>
  node?.closest("[lang]")?.getAttribute("lang") || undefined;

/** `n` as a figure in `lang`. */
export function figureOf(n: number, lang: string | undefined): string {
  const key = lang ?? "";
  let format = formats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(lang, { useGrouping: "min2" });
    formats.set(key, format);
  }
  return format.format(n);
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
