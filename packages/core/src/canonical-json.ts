/**
 * Deterministic JSON: object keys sorted at every level and undefined
 * members left out, so two values that say the same hash the same whatever
 * order their keys were written or read in. A value read through a schema
 * comes back with its keys in the schema's order, not the text's: anything
 * that hashes JSON to name or compare a value hashes this form.
 */
export const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const members = new Map(Object.entries(value));
    return `{${[...members.keys()]
      .sort()
      .filter((key) => members.get(key) !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(members.get(key))}`)
      .join(",")}}`;
  }
  return value === undefined ? "null" : JSON.stringify(value);
};
