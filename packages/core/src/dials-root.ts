/**
 * The root of an HTML decision page's dials (the kit's `{{DIALS}}`): the
 * element in their shadow root that stands where the dashboard's document
 * root stands. The decision host's dials sheet (`dials.css`, page-css.ts
 * `shadowSheet`) writes every rule of the house's on `:root` on it, its
 * tokens, its scheme and its `dark` and `light` variants, so the dials
 * draw on the house's sheet while the page's own root takes none of it.
 */
export const DIALS_ROOT = "data-cawco-dials-root";

/**
 * The length one `rem` stands for in the dials (dials.css writes each
 * `<n>rem` as `calc(<n> * var(--cawco-dials-rem))`): the browser's own
 * font size, read off the dials' host (`all: initial`), so the page's
 * `html { font-size }` sizes none of their type or spacing, while the
 * person's own font size still does.
 */
export const DIALS_REM = "--cawco-dials-rem";
