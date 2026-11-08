/**
 * The keys a zod parse found no place for: each `unrecognized_keys` issue
 * (a `z.strictObject` given a key it does not declare), as a dotted path
 * from the value's root. What the hub's 422s and a view's checks name
 * (hub unknown-fields.ts, openui.ts, views.ts).
 */
export const unrecognizedKeys = (issues: readonly unknown[]): string[] =>
  issues.flatMap((issue) => {
    if (!(
      typeof issue === "object" &&
      issue !== null &&
      "code" in issue &&
      issue.code === "unrecognized_keys" &&
      "keys" in issue &&
      Array.isArray(issue.keys)
    )) {
      return [];
    }
    const at =
      "path" in issue && Array.isArray(issue.path) && issue.path.length > 0
        ? `${issue.path.join(".")}.`
        : "";
    return issue.keys.map((key) => `${at}${String(key)}`);
  });
