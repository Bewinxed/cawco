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
type Content = Record<string, { schema?: Schema }>;
interface Document {
  components?: { schemas?: Record<string, Schema> };
  paths?: Record<string, Record<string, Operation> | undefined>;
}
interface Operation {
  parameters?: Parameter[];
  requestBody?: { content?: Content };
  responses?: Record<string, { content?: Content }>;
}
interface Parameter {
  in: string;
  name: string;
  required?: boolean;
  schema?: Schema;
}

type Direction = "receives" | "sends";

export interface WireRoots {
  /** The socket's frame types by name, as openapi.ts's FRAMES lists them. */
  frames: string[];
  /** Enums the base's app reads open (the base's generator typeOverrides). */
  openBefore: Set<string>;
  /** The frames only the app sends (openapi.ts's SENT). */
  sent: Set<string>;
}

/** A schema with its refs followed, and the component it was reached by. */
interface Side {
  name?: string;
  schema: Schema;
}

/** Where a compare stands: its label, the root it came from, its direction. */
interface Place {
  at: string;
  direction: Direction;
  root: string;
}

const COMPONENT = "#/components/schemas/";
const UNIONS = ["oneOf", "anyOf"] as const;
const MAX_HOPS = 32;
const OPEN_ENUM = /^ {4}([A-Za-z0-9_]+): OpenEnums\./gm;

const isObject = (value: unknown): value is Schema =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const refOf = (schema: Schema): string | undefined =>
  typeof schema.$ref === "string" ? schema.$ref : undefined;

const resolveIn = (
  schema: Schema,
  schemas: Record<string, Schema>
): Side | undefined => {
  let current = schema;
  let name: string | undefined;
  for (let hops = 0; hops <= MAX_HOPS; hops += 1) {
    const ref = refOf(current);
    if (ref === undefined) {
      return { schema: current, name };
    }
    if (!ref.startsWith(COMPONENT)) {
      return undefined;
    }
    name = ref.slice(COMPONENT.length);
    const target = schemas[name];
    if (!isObject(target)) {
      return undefined;
    }
    current = target;
  }
  return undefined;
};

const valueKind = (value: unknown): string => {
  if (value === null) {
    return "null";
  }
  return typeof value;
};

const valuesOf = (schema: Schema): unknown[] | undefined => {
  if (Array.isArray(schema.enum)) {
    return schema.enum;
  }
  return schema.const === undefined ? undefined : [schema.const];
};

/** The JSON kinds a schema admits ("any" when it names none). */
const kindsOf = (schema: Schema): Set<string> => {
  const { type } = schema;
  if (Array.isArray(type)) {
    return new Set(type.map(String));
  }
  if (type !== undefined) {
    return new Set([String(type)]);
  }
  if (
    isObject(schema.properties) ||
    schema.additionalProperties !== undefined
  ) {
    return new Set(["object"]);
  }
  if (schema.items !== undefined || schema.prefixItems !== undefined) {
    return new Set(["array"]);
  }
  const values = valuesOf(schema);
  return new Set(values ? values.map(valueKind) : ["any"]);
};

/** Kinds in `wider` that `narrower` does not admit (an integer is a number). */
const extraKinds = (wider: Set<string>, narrower: Set<string>): string[] => {
  if (narrower.has("any")) {
    return [];
  }
  return [...wider].filter(
    (kind) =>
      !(narrower.has(kind) || (kind === "integer" && narrower.has("number")))
  );
};

const branchesOf = (schema: Schema): Schema[] | undefined => {
  for (const key of UNIONS) {
    const list = schema[key];
    if (Array.isArray(list)) {
      return list.filter(isObject);
    }
  }
  return undefined;
};

/** A discriminated union's branches by their tag's value. */
const taggedIn = (
  schema: Schema,
  schemas: Record<string, Schema>
): Map<string, Schema> | undefined => {
  const { discriminator } = schema;
  const list = branchesOf(schema);
  if (
    !(isObject(discriminator) && list) ||
    typeof discriminator.propertyName !== "string"
  ) {
    return undefined;
  }
  const tag = discriminator.propertyName;
  const out = new Map<string, Schema>();
  for (const branch of list) {
    const resolved = resolveIn(branch, schemas)?.schema;
    const property = isObject(resolved?.properties)
      ? resolved.properties[tag]
      : undefined;
    if (!isObject(property)) {
      continue;
    }
    const tagSchema = resolveIn(property, schemas)?.schema ?? property;
    for (const value of valuesOf(tagSchema) ?? []) {
      out.set(String(value), branch);
    }
  }
  return out;
};

const quoted = (values: unknown[]): string =>
  values.map((value) => JSON.stringify(value)).join(", ");

const contentSchema = (content: Content | undefined): Schema | undefined =>
  content?.["application/json"]?.schema;

class Comparer {
  readonly breaks = new Set<string>();
  private readonly compared = new Set<string>();
  private readonly base: Record<string, Schema>;
  private readonly next: Record<string, Schema>;
  private readonly openBefore: Set<string>;

  constructor(base: Document, next: Document, openBefore: Set<string>) {
    this.base = base.components?.schemas ?? {};
    this.next = next.components?.schemas ?? {};
    this.openBefore = openBefore;
  }

  say(at: string, root: string, what: string): void {
    this.breaks.add(`${at}: ${what} (reached from ${root})`);
  }

  /** The base's schema `was` against the one generated now. */
  compare(was: Schema, now: Schema, place: Place): void {
    const before = resolveIn(was, this.base);
    const after = resolveIn(now, this.next);
    if (!(before && after) || this.seen(before, after, place.direction)) {
      return;
    }
    // A named component is said by its own name from here on.
    const here: Place = { ...place, at: after.name ?? place.at };
    if (branchesOf(before.schema) || branchesOf(after.schema)) {
      this.compareUnion(before.schema, after.schema, here);
      return;
    }
    this.compareKinds(before.schema, after.schema, here);
    this.compareValues(before, after, here);
    this.compareProperties(before.schema, after.schema, here);
    this.compareChildren(before.schema, after.schema, here);
  }

  /** A pair of components compares once per direction. */
  private seen(before: Side, after: Side, direction: Direction): boolean {
    if (!(before.name && after.name)) {
      return false;
    }
    const key = `${before.name}|${after.name}|${direction}`;
    if (this.compared.has(key)) {
      return true;
    }
    this.compared.add(key);
    return false;
  }

  /** A dry run: whether the pair compares without a break. */
  private fits(was: Schema, now: Schema, direction: Direction): boolean {
    const breaks = new Set(this.breaks);
    const compared = new Set(this.compared);
    this.compare(was, now, { at: "", root: "", direction });
    const clean = this.breaks.size === breaks.size;
    this.breaks.clear();
    for (const line of breaks) {
      this.breaks.add(line);
    }
    this.compared.clear();
    for (const key of compared) {
      this.compared.add(key);
    }
    return clean;
  }

  private compareUnion(before: Schema, after: Schema, place: Place): void {
    const wasTags = taggedIn(before, this.base);
    const nowTags = taggedIn(after, this.next);
    if (wasTags && nowTags) {
      this.compareTagged(wasTags, nowTags, place);
      return;
    }
    this.compareBranches(
      branchesOf(before) ?? [before],
      branchesOf(after) ?? [after],
      place
    );
  }

  /** Branch to branch by tag: a new tag is additive, a lost one breaks what the app sends. */
  private compareTagged(
    wasTags: Map<string, Schema>,
    nowTags: Map<string, Schema>,
    place: Place
  ): void {
    for (const [tag, branch] of wasTags) {
      const match = nowTags.get(tag);
      if (match) {
        this.compare(branch, match, place);
      } else if (place.direction === "sends") {
        this.say(
          place.at,
          place.root,
          `the hub no longer takes its "${tag}" kind`
        );
      }
    }
  }

  /** Every branch the writer may now send finds one the reader reads. */
  private compareBranches(from: Schema[], to: Schema[], place: Place): void {
    const receives = place.direction === "receives";
    const writer = receives ? to : from;
    const reader = receives ? from : to;
    // The base's schema goes first in every compare, whichever side reads.
    const pair = (branch: Schema, other: Schema): [Schema, Schema] =>
      receives ? [other, branch] : [branch, other];
    for (const branch of writer) {
      const ref = refOf(branch);
      const match =
        (ref ? reader.find((other) => refOf(other) === ref) : undefined) ??
        reader.find((other) =>
          this.fits(...pair(branch, other), place.direction)
        );
      if (match) {
        this.compare(...pair(branch, match), place);
        continue;
      }
      const shown = ref
        ? ref.slice(COMPONENT.length)
        : [...kindsOf(branch)].join("|");
      this.say(
        place.at,
        place.root,
        receives
          ? `may now be ${shown}, which the shipped app does not read`
          : `no longer takes ${shown}, which the shipped app sends`
      );
    }
  }

  /** The reader admits every kind the writer may send. */
  private compareKinds(before: Schema, after: Schema, place: Place): void {
    const receives = place.direction === "receives";
    const extra = receives
      ? extraKinds(kindsOf(after), kindsOf(before))
      : extraKinds(kindsOf(before), kindsOf(after));
    if (extra.length === 0) {
      return;
    }
    const kinds = extra.join(" or ");
    this.say(
      place.at,
      place.root,
      receives
        ? `may now be ${kinds}, which the shipped app does not read`
        : `no longer takes ${kinds}, which the shipped app sends`
    );
  }

  /** Enum values: an open one (the base's typeOverrides) reads any value. */
  private compareValues(before: Side, after: Side, place: Place): void {
    const was = valuesOf(before.schema);
    const now = valuesOf(after.schema);
    if (place.direction === "receives") {
      const open =
        before.name !== undefined && this.openBefore.has(before.name);
      if (!was || open) {
        return;
      }
      const added = (now ?? []).filter((value) => !was.includes(value));
      if (!now) {
        this.say(
          place.at,
          place.root,
          "is no longer limited to the values the shipped app reads closed"
        );
      } else if (added.length) {
        this.say(
          place.at,
          place.root,
          `may now be ${quoted(added)}, a value the shipped app reads closed`
        );
      }
      return;
    }
    if (!now) {
      return;
    }
    const removed = (was ?? []).filter((value) => !now.includes(value));
    if (!was) {
      this.say(
        place.at,
        place.root,
        "now takes only some values of what the shipped app sends"
      );
    } else if (removed.length) {
      this.say(
        place.at,
        place.root,
        `no longer takes ${quoted(removed)}, which the shipped app sends`
      );
    }
  }

  private compareProperties(before: Schema, after: Schema, place: Place): void {
    const was = isObject(before.properties) ? before.properties : undefined;
    const now = isObject(after.properties) ? after.properties : undefined;
    if (!(was || now)) {
      return;
    }
    const wasRequired = new Set(
      (before.required as string[] | undefined) ?? []
    );
    const nowRequired = new Set((after.required as string[] | undefined) ?? []);
    if (place.direction === "receives") {
      this.lostRequired(wasRequired, nowRequired, now, place);
    } else {
      for (const property of nowRequired) {
        if (!wasRequired.has(property)) {
          this.say(
            `${place.at}.${property}`,
            place.root,
            "the hub now requires it, and the shipped app may not send it"
          );
        }
      }
    }
    for (const [property, schema] of Object.entries(was ?? {})) {
      const match = now?.[property];
      if (isObject(schema) && isObject(match)) {
        this.compare(schema, match, {
          ...place,
          at: `${place.at}.${property}`,
        });
      }
    }
  }

  /** What the app requires and the hub may now leave out. */
  private lostRequired(
    wasRequired: Set<string>,
    nowRequired: Set<string>,
    now: Schema | undefined,
    place: Place
  ): void {
    for (const property of wasRequired) {
      const at = `${place.at}.${property}`;
      if (!(now && property in now)) {
        this.say(
          at,
          place.root,
          "the shipped app requires it, and the hub no longer sends it"
        );
      } else if (!nowRequired.has(property)) {
        this.say(
          at,
          place.root,
          "the shipped app requires it, and the hub may now leave it out"
        );
      }
    }
  }

  /** Maps, arrays and tuples, element to element. */
  private compareChildren(before: Schema, after: Schema, place: Place): void {
    const element = { ...place, at: `${place.at}[*]` };
    if (
      isObject(before.additionalProperties) &&
      isObject(after.additionalProperties)
    ) {
      this.compare(
        before.additionalProperties,
        after.additionalProperties,
        element
      );
    }
    if (isObject(before.items) && isObject(after.items)) {
      this.compare(before.items, after.items, element);
    }
    if (
      !(Array.isArray(before.prefixItems) && Array.isArray(after.prefixItems))
    ) {
      return;
    }
    const later = after.prefixItems as unknown[];
    before.prefixItems.forEach((item, index) => {
      const match = later[index];
      if (isObject(item) && isObject(match)) {
        this.compare(item, match, { ...place, at: `${place.at}[${index}]` });
      }
    });
  }

  /** The socket's frames, each in its direction. */
  frames(roots: WireRoots): void {
    for (const name of roots.frames) {
      const direction: Direction = roots.sent.has(name) ? "sends" : "receives";
      const was = this.base[name];
      if (isObject(was) && isObject(this.next[name])) {
        const ref = { $ref: `${COMPONENT}${name}` };
        this.compare(ref, ref, { at: name, root: name, direction });
      } else if (isObject(was) && direction === "sends") {
        this.say(
          name,
          name,
          "the hub no longer takes it, and the shipped app sends it"
        );
      }
    }
  }

  /** One route both documents have: its answers, and what the app sends it. */
  route(route: string, was: Operation, now: Operation): void {
    for (const [status, response] of Object.entries(was.responses ?? {})) {
      const before = contentSchema(response.content);
      const after = contentSchema(now.responses?.[status]?.content);
      if (before && after) {
        this.compare(before, after, {
          at: `${route} ${status}`,
          root: route,
          direction: "receives",
        });
      }
    }
    const before = contentSchema(was.requestBody?.content);
    const after = contentSchema(now.requestBody?.content);
    if (before && after) {
      this.compare(before, after, {
        at: `${route} body`,
        root: route,
        direction: "sends",
      });
    }
    for (const parameter of now.parameters ?? []) {
      const old = was.parameters?.find(
        (p) => p.name === parameter.name && p.in === parameter.in
      );
      const at = `${route} ${parameter.in} ${parameter.name}`;
      if (parameter.required && !old?.required) {
        this.say(
          at,
          route,
          "the hub now requires it, and the shipped app may not send it"
        );
      } else if (old?.schema && parameter.schema) {
        this.compare(old.schema, parameter.schema, {
          at,
          root: route,
          direction: "sends",
        });
      }
    }
  }
}

/** Every place the base's app would break on the wire generated now. */
export const wireBreaks = (
  baseDocument: object,
  nextDocument: object,
  roots: WireRoots
): string[] => {
  // Both are openapi.json as openapi.ts writes it; only these parts are read.
  const base = baseDocument as Document;
  const next = nextDocument as Document;
  const comparer = new Comparer(base, next, roots.openBefore);
  comparer.frames(roots);
  for (const [path, item] of Object.entries(base.paths ?? {})) {
    for (const [method, operation] of Object.entries(item ?? {})) {
      const match = next.paths?.[path]?.[method];
      if (match) {
        comparer.route(`${method.toUpperCase()} ${path}`, operation, match);
      }
    }
  }
  return [...comparer.breaks].sort();
};

/** The typeOverrides names in an openapi-generator-config.yaml: the enums its app reads open. */
export const openEnumNames = (config: string): Set<string> =>
  new Set([...config.matchAll(OPEN_ENUM)].map((match) => match[1] as string));
