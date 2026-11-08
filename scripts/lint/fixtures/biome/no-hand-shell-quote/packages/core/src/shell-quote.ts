// Its owner file: left alone.
export const shellQuote = (value: string): string =>
  `'${value.replaceAll("'", "'\\''")}'`;
