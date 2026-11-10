/** What `value` holds under `key`, when it is an object that has one; undefined for anything else. */
export const fieldOf = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null
    ? Reflect.get(value, key)
    : undefined;
