// Core runs in the browser too, where Bun's compare is not: left alone.
declare const a: object;
declare const b: object;
export const same = JSON.stringify(a) === JSON.stringify(b);
