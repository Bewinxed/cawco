// The helper itself doubles to its cap.
declare const tries: number;
export const step = Math.min(30_000, 1000 * 2 ** tries);
