/**
 * `value` without the keys it holds as `undefined`: what it reads as once it
 * goes as JSON, and what a patch leaves alone.
 */
export const withoutUndefined = <T extends object>(value: T): Partial<T> =>
  // Library gap: `Object.fromEntries` answers `{ [k: string]: V }`, never the keys it is given (https://github.com/microsoft/TypeScript/issues/35745). A `for…in` over `value` keeps them, and Biome's noForIn refuses it.
  Object.fromEntries(
    Object.entries(value).filter(([, one]) => one !== undefined)
  ) as Partial<T>;
