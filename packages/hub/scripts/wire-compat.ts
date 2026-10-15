/**
 * The wire a shipped app was built against, held to by every later hub on
 * the same WIRE_PROTOCOL.
 *
 * The hub ships nightly and the apps through TestFlight later, so a hub
 * newer than its app is the normal case. The app's Swift client is generated
 * from openapi.json; a change to it the old app cannot read cost 0.1.11 its
 * whole board (PreviewFrame's required `path`, dropped with preview ports
 * under the same protocol 6). This compares the openapi.json at the base the
 * change grows from with the one generated now, and names each place a
 * shipped app would break. Direction decides what breaks:
 *
 * - what the app receives (responses, frames other than its own): a property
 *   it requires that the hub may now leave out (removed, or made optional
 *   or nullable), a type that now admits a JSON kind it did not (a branch
 *   added to an undiscriminated union among them), a value added to an enum
 *   the app reads closed;
 * - what the app sends (request bodies and parameters, its own socket
 *   messages): a property the hub now requires that it did not, a type that
 *   no longer admits a kind it did, an enum value or union branch removed.
 *
 * A new kind on a discriminated union (a frame, a transcript block) is
 * additive: the app skips what it does not know by its discriminator. So is
 * a new optional property, a new value of an open enum, a new route.
 */

type Schema = Record<string, unknown>;
interface Document {
  paths?: Record<string, Record<string, Operation> | undefined>;
  components?: { schemas?: Record<string, Schema> };
}
interface Operation {
  operationId?: string;
  parameters?: Parameter[];
  requestBody?: { content?: Record<string, { schema?: Schema }> };
  responses?: Record<string, { content?: Record<string, { schema?: Schema }> }>;
}
interface Parameter {
  name: string;
  in: string;
  required?: boolean;
  schema?: Schema;
}

type Direction = "receives" | "sends";

export interface WireRoots {
  /** The socket's frame types by name, as openapi.ts's FRAMES lists them. */
  frames: string[];
  /** The frames only the app sends (openapi.ts's SENT). */
  sent: Set<string>;
  /** Enums the base's app reads open (the base's generator typeOverrides). */
  openBefore: Set<string>;
}

const COMPONENT = "#/components/schemas/";
const UNIONS = ["oneOf", "anyOf"] as const;

const isObject = (value: unknown): value is Schema =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Every place the base's app would break on the wire generated now. */
export const wireBreaks = (
  baseDocument: object,
  nextDocument: object,
  roots: WireRoots
): string[] => {
  // Both are openapi.json as openapi.ts writes it; only these parts are read.
  const base = baseDocument as Document;
  const next = nextDocument as Document;
  const baseSchemas = base.components?.schemas ?? {};
  const nextSchemas = next.components?.schemas ?? {};
  const breaks = new Set<string>();
  const compared = new Set<string>();

  interface Side {
    schema: Schema;
    /** The component it was reached by, when it was. */
    name?: string;
  }
  const resolve = (
    schema: Schema,
    schemas: Record<string, Schema>,
    name?: string
  ): Side | undefined => {
    let current = schema;
    let at = name;
    for (let hops = 0; typeof current.$ref === "string"; hops++) {
      if (!current.$ref.startsWith(COMPONENT) || hops > 32) {
        return undefined;
      }
      at = current.$ref.slice(COMPONENT.length);
      const target = schemas[at];
      if (!isObject(target)) {
        return undefined;
      }
      current = target;
    }
    return { schema: current, name: at };
  };

  /** The JSON kinds a schema admits ("any" for none named). */
  const kinds = (schema: Schema): Set<string> => {
    const out = new Set<string>();
    const type = schema.type;
    for (const kind of Array.isArray(type) ? type : type === undefined ? [] : [type]) {
      out.add(String(kind));
    }
    if (out.size === 0) {
      if (isObject(schema.properties) || schema.additionalProperties !== undefined) {
        out.add("object");
      } else if (schema.items !== undefined || schema.prefixItems !== undefined) {
        out.add("array");
      } else if (schema.enum !== undefined || schema.const !== undefined) {
        for (const value of (schema.enum as unknown[] | undefined) ?? [schema.const]) {
          out.add(value === null ? "null" : typeof value === "number" ? "number" : typeof value);
        }
      } else {
        out.add("any");
      }
    }
    return out;
  };
  /** Kinds in `wider` that `narrower` does not admit (an integer is a number). */
  const extraKinds = (wider: Set<string>, narrower: Set<string>): string[] => {
    if (narrower.has("any")) {
      return [];
    }
    return [...wider].filter(
      (kind) => !narrower.has(kind) && !(kind === "integer" && narrower.has("number"))
    );
  };

  const values = (schema: Schema): unknown[] | undefined =>
    Array.isArray(schema.enum)
      ? schema.enum
      : schema.const !== undefined
        ? [schema.const]
        : undefined;

  const branches = (schema: Schema): Schema[] | undefined => {
    for (const key of UNIONS) {
      const list = schema[key];
      if (Array.isArray(list)) {
        return list.filter(isObject);
      }
    }
    return undefined;
  };

  /** A discriminated union's branches by their tag's value. */
  const tagged = (
    schema: Schema,
    schemas: Record<string, Schema>
  ): Map<string, Schema> | undefined => {
    const discriminator = schema.discriminator;
    const list = branches(schema);
    if (!isObject(discriminator) || typeof discriminator.propertyName !== "string" || !list) {
      return undefined;
    }
    const tag = discriminator.propertyName;
    const out = new Map<string, Schema>();
    for (const branch of list) {
      const resolved = resolve(branch, schemas)?.schema;
      const property = isObject(resolved?.properties) ? resolved.properties[tag] : undefined;
      const tags = isObject(property) ? values(resolve(property, schemas)?.schema ?? property) : undefined;
      for (const value of tags ?? []) {
        out.set(String(value), branch);
      }
    }
    return out;
  };

  const say = (at: string, root: string, what: string): void => {
    breaks.add(`${at}: ${what} (reached from ${root})`);
  };

  /** A dry run: whether `a` and `b` compare without a break. */
  const fits = (
    a: Schema,
    b: Schema,
    direction: Direction
  ): boolean => {
    const before = new Set(breaks);
    const seen = new Set(compared);
    compare(a, b, "", "", direction);
    const clean = breaks.size === before.size;
    breaks.clear();
    for (const line of before) breaks.add(line);
    compared.clear();
    for (const key of seen) compared.add(key);
    return clean;
  };

  const compare = (
    baseSchema: Schema,
    nextSchema: Schema,
    at: string,
    root: string,
    direction: Direction
  ): void => {
    const was = resolve(baseSchema, baseSchemas);
    const now = resolve(nextSchema, nextSchemas);
    if (!was || !now) {
      return;
    }
    // A named component is said by its own name from here on.
    const here = now.name ?? at;
    if (was.name && now.name) {
      const key = `${was.name}|${now.name}|${direction}`;
      if (compared.has(key)) {
        return;
      }
      compared.add(key);
    }
    const before = was.schema;
    const after = now.schema;
    const receives = direction === "receives";

    // Unions, matched branch to branch.
    const wasBranches = branches(before);
    const nowBranches = branches(after);
    if (wasBranches || nowBranches) {
      const wasTags = tagged(before, baseSchemas);
      const nowTags = tagged(after, nextSchemas);
      if (wasTags && nowTags) {
        for (const [tag, branch] of wasTags) {
          const match = nowTags.get(tag);
          if (match) {
            compare(branch, match, here, root, direction);
          } else if (!receives) {
            say(here, root, `the hub no longer takes its "${tag}" kind`);
          }
        }
        return;
      }
      const from = wasBranches ?? [before];
      const to = nowBranches ?? [after];
      // What the reader must accept: every branch the writer may now send.
      const [writer, reader] = receives ? [to, from] : [from, to];
      for (const branch of writer) {
        // The base's schema goes first in every compare, whichever side reads.
        const pair = (other: Schema): [Schema, Schema] => (receives ? [other, branch] : [branch, other]);
        const ref = typeof branch.$ref === "string" ? branch.$ref : undefined;
        const match =
          (ref ? reader.find((other) => other.$ref === ref) : undefined) ??
          reader.find((other) => fits(...pair(other), direction));
        if (match) {
          compare(...pair(match), here, root, direction);
          continue;
        }
        const shown = ref
          ? ref.slice(COMPONENT.length)
          : [...kinds(resolve(branch, receives ? nextSchemas : baseSchemas)?.schema ?? branch)].join("|");
        say(
          here,
          root,
          receives
            ? `may now be ${shown}, which the shipped app does not read`
            : `no longer takes ${shown}, which the shipped app sends`
        );
      }
      return;
    }

    // Kinds: the reader must admit every kind the writer may send.
    const wasKinds = kinds(before);
    const nowKinds = kinds(after);
    const extra = receives ? extraKinds(nowKinds, wasKinds) : extraKinds(wasKinds, nowKinds);
    if (extra.length) {
      say(
        here,
        root,
        receives
          ? `may now be ${extra.join(" or ")}, which the shipped app does not read`
          : `no longer takes ${extra.join(" or ")}, which the shipped app sends`
      );
    }

    // Enums: an open one (the base's typeOverrides) reads any value.
    const wasValues = values(before);
    const nowValues = values(after);
    if (wasValues && receives) {
      const open = was.name !== undefined && roots.openBefore.has(was.name);
      const added = (nowValues ?? []).filter((value) => !wasValues.includes(value));
      if (!open && (added.length || !nowValues)) {
        say(
          here,
          root,
          nowValues
            ? `may now be ${added.map((value) => JSON.stringify(value)).join(", ")}, a value the shipped app reads closed`
            : "is no longer limited to the values the shipped app reads closed"
        );
      }
    }
    if (nowValues && !receives) {
      const removed = (wasValues ?? []).filter((value) => !nowValues.includes(value));
      if (removed.length || !wasValues) {
        say(
          here,
          root,
          wasValues
            ? `no longer takes ${removed.map((value) => JSON.stringify(value)).join(", ")}, which the shipped app sends`
            : "now takes only some values of what the shipped app sends"
        );
      }
    }

    // Objects, property by property.
    const wasProperties = isObject(before.properties) ? before.properties : undefined;
    const nowProperties = isObject(after.properties) ? after.properties : undefined;
    if (wasProperties || nowProperties) {
      const wasRequired = new Set((before.required as string[] | undefined) ?? []);
      const nowRequired = new Set((after.required as string[] | undefined) ?? []);
      if (receives) {
        for (const property of wasRequired) {
          if (!nowProperties || !(property in nowProperties)) {
            say(`${here}.${property}`, root, "the shipped app requires it, and the hub no longer sends it");
          } else if (!nowRequired.has(property)) {
            say(`${here}.${property}`, root, "the shipped app requires it, and the hub may now leave it out");
          }
        }
      } else {
        for (const property of nowRequired) {
          if (!wasRequired.has(property)) {
            say(`${here}.${property}`, root, "the hub now requires it, and the shipped app may not send it");
          }
        }
      }
      for (const [property, schema] of Object.entries(wasProperties ?? {})) {
        const match = nowProperties?.[property];
        if (isObject(schema) && isObject(match)) {
          compare(schema, match, `${here}.${property}`, root, direction);
        }
      }
    }
    if (isObject(before.additionalProperties) && isObject(after.additionalProperties)) {
      compare(before.additionalProperties, after.additionalProperties, `${here}[*]`, root, direction);
    }
    if (isObject(before.items) && isObject(after.items)) {
      compare(before.items, after.items, `${here}[*]`, root, direction);
    }
    if (Array.isArray(before.prefixItems) && Array.isArray(after.prefixItems)) {
      before.prefixItems.forEach((item, index) => {
        const match = (after.prefixItems as unknown[])[index];
        if (isObject(item) && isObject(match)) {
          compare(item, match, `${here}[${index}]`, root, direction);
        }
      });
    }
  };

  // The socket's frames.
  for (const name of roots.frames) {
    const was = baseSchemas[name];
    const now = nextSchemas[name];
    const direction: Direction = roots.sent.has(name) ? "sends" : "receives";
    if (isObject(was) && isObject(now)) {
      compare({ $ref: `${COMPONENT}${name}` }, { $ref: `${COMPONENT}${name}` }, name, name, direction);
    } else if (isObject(was) && direction === "sends") {
      say(name, name, "the hub no longer takes it, and the shipped app sends it");
    }
  }

  // The routes both documents have: their answers, and what the app sends them.
  const json = (content: Record<string, { schema?: Schema }> | undefined): Schema | undefined =>
    content?.["application/json"]?.schema;
  for (const [path, item] of Object.entries(base.paths ?? {})) {
    for (const [method, operation] of Object.entries(item ?? {})) {
      const match = next.paths?.[path]?.[method];
      if (!match) {
        continue;
      }
      const route = `${method.toUpperCase()} ${path}`;
      for (const [status, response] of Object.entries(operation.responses ?? {})) {
        const was = json(response.content);
        const now = json(match.responses?.[status]?.content);
        if (was && now) {
          compare(was, now, `${route} ${status}`, route, "receives");
        }
      }
      const wasBody = json(operation.requestBody?.content);
      const nowBody = json(match.requestBody?.content);
      if (wasBody && nowBody) {
        compare(wasBody, nowBody, `${route} body`, route, "sends");
      }
      for (const parameter of match.parameters ?? []) {
        const old = operation.parameters?.find((p) => p.name === parameter.name && p.in === parameter.in);
        if (parameter.required && !old?.required) {
          say(`${route} ${parameter.in} ${parameter.name}`, route, "the hub now requires it, and the shipped app may not send it");
        } else if (old?.schema && parameter.schema) {
          compare(old.schema, parameter.schema, `${route} ${parameter.in} ${parameter.name}`, route, "sends");
        }
      }
    }
  }
  return [...breaks].sort();
};

/** The typeOverrides names in an openapi-generator-config.yaml: the enums its app reads open. */
export const openEnumNames = (config: string): Set<string> =>
  new Set(
    [...config.matchAll(/^ {4}([A-Za-z0-9_]+): OpenEnums\./gm)].map((match) => match[1] as string)
  );
