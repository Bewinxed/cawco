/**
 * Whether `value` is a JSON object (not null, not an array): its fields each
 * `unknown` until a read narrows them. The one guard a reader of a value from
 * outside (a frame off a socket, a machine's answer) starts from.
 */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
