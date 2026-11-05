/**
 * The fields of a request no route schema takes. The hub's root runs
 * Elysia with `normalize: false` (server.ts), so every body, query and
 * params schema is closed (Elysia's `nonAdditionalProperties`): a field the
 * route does not declare is refused, never dropped. Elysia's own issues for
 * it say "schema is false", and inside a union they also name fields that
 * are another branch's own. This reads the request's value against the
 * route's schema instead: a field is unknown when no branch at its place
 * declares it, so the 422 names exactly what the caller sent wrong.
 */

import { ValidationError } from "elysia";

/** A JSON Schema node as TypeBox builds one, read loosely. */
type Node = Record<string, unknown>;

const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** `schema`'s alternatives, its unions and intersections opened. */
const leavesOf = (schema: unknown): Node[] => {
  if (!isNode(schema)) {
    return [];
  }
  const parts = [schema.anyOf, schema.oneOf, schema.allOf].flatMap((one) =>
    Array.isArray(one) ? one : []
  );
  return parts.length > 0 ? parts.flatMap(leavesOf) : [schema];
};

/** Whether a leaf takes keys it does not list: a record, `t.Any`, a `$ref` this does not follow. */
const open = (leaf: Node): boolean =>
  "$ref" in leaf ||
  isNode(leaf.patternProperties) ||
  isNode(leaf.additionalProperties) ||
  leaf.additionalProperties === true ||
  !(
    "type" in leaf ||
    "properties" in leaf ||
    "const" in leaf ||
    "enum" in leaf
  );

/** The fields of `value` that no branch of `schema` declares, as dotted paths under `at`. */
const unknownFields = (schema: unknown, value: unknown, at = ""): string[] => {
  const leaves = leavesOf(schema);
  if (Array.isArray(value)) {
    const items = leaves.flatMap((leaf) =>
      isNode(leaf.items) ? [leaf.items] : []
    );
    return items.length === 0
      ? []
      : value.flatMap((item, index) =>
          unknownFields({ anyOf: items }, item, `${at}${index}.`)
        );
  }
  if (!isNode(value)) {
    return [];
  }
  const objects = leaves.filter(
    (leaf) => leaf.type === "object" || isNode(leaf.properties)
  );
  if (objects.length === 0 || leaves.some(open)) {
    return [];
  }
  return Object.entries(value).flatMap(([key, child]) => {
    const declared = objects.flatMap((leaf) =>
      isNode(leaf.properties) && key in leaf.properties
        ? [leaf.properties[key]]
        : []
    );
    return declared.length === 0
      ? [`${at}${key}`]
      : unknownFields({ anyOf: declared }, child, `${at}${key}.`);
  });
};

/** What a request carried that its route doesn't take, by where it came: its body, its query. */
export const unknownFieldsOf = (
  error: unknown
): { fields: string[]; on: string } | null => {
  if (!(error instanceof ValidationError) || error.status !== 422) {
    return null;
  }
  const fields = unknownFields(error.schema, error.value);
  return fields.length > 0 ? { fields, on: error.type ?? "body" } : null;
};
