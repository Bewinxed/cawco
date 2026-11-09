/**
 * The order openapi.ts writes its document in, and the check that the order
 * decides nothing a reader decodes.
 *
 * The schema generator lists properties, literals and union members in the
 * order the TypeScript checker made their types, which moves with which
 * module the program happened to read first. So the document is put in one
 * order read off what each schema says, and nothing of how it was read.
 */

type Schema = Record<string, unknown>;

const UNIONS = ["anyOf", "oneOf"] as const;
/** Keys whose value is a map from a name (a property, a component, a path, a status) to what it names. */
const NAMED = new Set([
  "definitions",
  "mapping",
  "paths",
  "properties",
  "responses",
  "schemas",
]);
/** Keys whose value is a list whose order says nothing. */
const SETS = new Set(["required", "enum"]);

const isSchema = (value: unknown): value is Schema =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const compare = (a: string, b: string): number => (a < b ? -1 : Number(a > b));

/** A schema's literal values (`const`, `enum`), when it holds only literals. */
const literals = (schema: unknown): unknown[] | undefined => {
  if (!isSchema(schema)) {
    return undefined;
  }
  if ("const" in schema) {
    return [schema.const];
  }
  return Array.isArray(schema.enum) ? schema.enum : undefined;
};

/**
 * What tells a union's member apart from the others: a ref by its
 * component's name; an `allOf` by its parts'; an inline schema by its JSON
 * type, its own literals, the literal each single-valued property holds,
 * and the names it requires.
 */
const memberKey = (member: unknown): string => {
  if (!isSchema(member)) {
    return JSON.stringify(member);
  }
  if (typeof member.$ref === "string") {
    return `0 ${member.$ref}`;
  }
  if (Array.isArray(member.allOf)) {
    return `1 ${member.allOf.map(memberKey).join(" & ")}`;
  }
  const values = literals(member);
  const fixed = Object.entries(
    isSchema(member.properties) ? member.properties : {}
  ).flatMap(([name, property]) => {
    const one = literals(property);
    return one?.length === 1 ? [`${name}=${JSON.stringify(one[0])}`] : [];
  });
  return [
    "2",
    JSON.stringify(member.type ?? null),
    JSON.stringify(values ?? null),
    ...fixed,
    `requires ${JSON.stringify(member.required ?? [])}`,
  ].join(" ");
};

/**
 * The one order (its rule): every name-keyed map (an object's `properties`,
 * the components, the paths, an operation's responses, a discriminator's
 * `mapping`) and every unordered list (`required`, `enum`) goes by name; a
 * union's members go by {@link memberKey}, their whole text only breaking a
 * tie. Each part is put in order before the union that holds it, so the keys
 * compare ordered parts. A `type` list stays as the generator writes it: its
 * kinds are the checker's own primitives, made in one order before any module
 * is read, and openapi.ts splits it by its order (`typeMembers`).
 */
export const inOneOrder = (value: unknown, key?: string): unknown => {
  if (Array.isArray(value)) {
    const items = value.map((item) => inOneOrder(item));
    if (key !== undefined && SETS.has(key)) {
      return items.toSorted((a, b) =>
        compare(JSON.stringify(a), JSON.stringify(b))
      );
    }
    if (key !== undefined && (UNIONS as readonly string[]).includes(key)) {
      return items
        .map((item) => ({
          item,
          key: memberKey(item),
          text: JSON.stringify(item),
        }))
        .toSorted((a, b) => compare(a.key, b.key) || compare(a.text, b.text))
        .map(({ item }) => item);
    }
    return items;
  }
  if (!isSchema(value)) {
    return value;
  }
  if (key !== undefined && NAMED.has(key)) {
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([a], [b]) => compare(a, b))
        .map(([name, item]) => [name, inOneOrder(item)])
    );
  }
  return Object.fromEntries(
    Object.entries(value).map(([field, item]) => [
      field,
      inOneOrder(item, field),
    ])
  );
};

/**
 * Where a `oneOf` has no discriminator, or has one that is not one literal of
 * its own on a property every member requires. swift-openapi-generator decodes
 * an `anyOf` by trying every member, so its order decides nothing; a `oneOf`
 * without a discriminator by trying its members in order, so {@link inOneOrder}
 * would choose what decodes. Each `oneOf` that fails is named by its path.
 */
export const unionsOrderDecides = (
  document: unknown,
  components: Record<string, unknown>
): string[] => {
  const resolve = (schema: unknown): Schema | undefined => {
    let at = schema;
    for (let hops = 0; isSchema(at) && typeof at.$ref === "string"; hops += 1) {
      if (hops > 32) {
        return undefined;
      }
      at = components[at.$ref.split("/").pop() ?? ""];
    }
    return isSchema(at) ? at : undefined;
  };
  /** The one literal a member requires of `name`. */
  const tagOf = (member: unknown, name: string): string | undefined => {
    const shape = resolve(member);
    const values =
      (shape?.required as string[] | undefined)?.includes(name) &&
      isSchema(shape?.properties)
        ? literals(shape.properties[name])
        : undefined;
    return values?.length === 1 ? JSON.stringify(values[0]) : undefined;
  };
  const problem = (union: Schema, at: string): string[] => {
    const tag = (union.discriminator as { propertyName?: string } | undefined)
      ?.propertyName;
    if (!tag) {
      return [`${at}: a oneOf with no discriminator`];
    }
    const tags = (union.oneOf as unknown[]).map((member) => tagOf(member, tag));
    return tags.includes(undefined) || new Set(tags).size !== tags.length
      ? [
          `${at}: its discriminator \`${tag}\` is not one literal of its own that every member requires`,
        ]
      : [];
  };
  const walk = (value: unknown, at: string): string[] => {
    if (Array.isArray(value)) {
      return value.flatMap((item, index) => walk(item, `${at}/${index}`));
    }
    if (!isSchema(value)) {
      return [];
    }
    return [
      ...(Array.isArray(value.oneOf) ? problem(value, at) : []),
      ...Object.entries(value).flatMap(([field, item]) =>
        walk(item, `${at}/${field}`)
      ),
    ];
  };
  return walk(document, "#");
};
