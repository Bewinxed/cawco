/**
 * The root of an HTML decision page's dials (the kit's `{{DIALS}}`): the
 * element in their shadow root that stands where the dashboard's document
 * root stands. The decision host's dials sheet (`dials.css`, page-css.ts
 * `shadowSheet`) writes every rule of the house's on `:root` on it, its
 * tokens, its scheme and its `dark` and `light` variants, so the dials
 * draw on the house's sheet while the page's own root takes none of it.
 */
export const DIALS_ROOT = "data-cawco-dials-root";
