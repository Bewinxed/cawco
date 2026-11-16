/**
 * `record`'s own keys, each checked as one of its keys: `Object.keys`
 * answers `string[]` whatever it is handed (by design:
 * https://github.com/microsoft/TypeScript/issues/12253). For a table written
 * as a `Record<Key, …>` literal, whose keys are each `Key` and no other.
 */
export const keysOf = <Key extends string>(
  record: Readonly<Record<Key, unknown>>
): Key[] =>
  Object.keys(record).filter((key): key is Key => Object.hasOwn(record, key));
