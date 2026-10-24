/** A mark's size by its words' length. */
export const sizeOf = (text) => (text.length > 12 ? "wide" : "narrow");
