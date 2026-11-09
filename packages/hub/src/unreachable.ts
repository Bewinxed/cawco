/**
 * The `default` of a `switch` over a read's kinds: takes only `never`, so a
 * kind left unhandled fails the build.
 */
export const unreachable = (value: never): Error =>
  new Error(`unhandled read: ${JSON.stringify(value)}`);
