// What as-unknown-as must count.
declare const value: { a: 1 };
export const through = value as unknown as string;
export const plain = value as { a: 1 };
export const toUnknown = value as unknown;
