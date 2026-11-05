/** Money as the person reads it on a spend line: dollars and cents. */
export const money = (amount: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);

/** A share of a whole, 0 to 100, for a meter. */
export const share = (part: number, whole: number): number =>
  whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0;
