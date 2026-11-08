/** `value` as one POSIX shell word, read back unchanged whatever it holds. */
export const shellQuote = (value: string): string =>
  `'${value.replaceAll("'", "'\\''")}'`;
