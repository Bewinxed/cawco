// Planted: each shape no-serialise-compare refuses, then the ones it leaves alone.
declare const a: object;
declare const b: object;
declare const said: string;

export const same = JSON.stringify(a) === JSON.stringify(b);
export const moved = JSON.stringify(a) !== said;
export const again = said === JSON.stringify(b);

export const equal = Bun.deepEquals(a, b);
export const text = JSON.stringify(a);
export const sameText = text === said;
