/**
 * Whether `value` is one of `members`: the guard that narrows a string read
 * from outside (a file's line, a flag, a stored column) to the literal union a
 * const tuple names.
 */
export const isOneOf = <const T>(
  members: readonly T[],
  value: unknown
): value is T => members.some((member) => member === value);
