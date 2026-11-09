// Planted: the phone's line written out, in both its spellings, alone, in
// a compound query and in a template literal; then a query of another line
// and one composed from the constant, which pass.
export const one = matchMedia("(width < 640px)");
export const two = matchMedia("(max-width: 639px)");
export const joined = matchMedia("(width < 640px), (pointer: coarse)");
export const coarse = "(pointer: coarse)";
export const templated = matchMedia(`(max-width: 639px), ${coarse}`);
export const other = matchMedia("(width < 900px)");
const PHONE_QUERY = "(phone)";
export const composed = matchMedia(`${PHONE_QUERY}, ${coarse}`);
