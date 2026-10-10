/**
 * `bun run openapi`: the OpenAPI document the native apps' Swift client is
 * generated from (apple/swift-openapi-generator), written to
 * apps/apple/Packages/CawCoKit/Sources/CawCoAPI/openapi.json.
 *
 * Every part of it comes from the hub's and core's own code:
 * - paths, parameters and request bodies: the routes' runtime schemas, read by
 *   `@elysia/openapi` off a hub built here on a scratch database. A route the
 *   dashboard does not call carries `detail: { hide: true }` and is left out.
 * - responses, per status code: the TypeScript checker's type for each route
 *   in the hub's `~Routes`, the route map Elysia builds from every handler's
 *   return. `@elysia/openapi`'s own `fromTypes` reads emitted declarations,
 *   where Elysia 2 keeps only the last route's response, so the checker is
 *   asked directly.
 * - the dashboard socket's frames: core's frame types.
 *
 * Responses and frames go through one typescript-json-schema generator, so a
 * type both use (an `InstanceRow`, a `NeutralMessage`) is one component.
 *
 * Run by hand; the live hub never generates any of this.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, parse, resolve } from "node:path";

const HUB = resolve(import.meta.dir, "..");
const CORE = resolve(HUB, "../core/src");
const OUT = resolve(
  HUB,
  "../../apps/apple/Packages/CawCoKit/Sources/CawCoAPI/openapi.json"
);

/**
 * The dashboard socket's frames, by the core file that declares them: the
 * Ledger Protocol's messages both ways, the transcript a session's stream
 * carries (blocks the hub built, and the events that change them), and the
 * envelope every other message rides in — `FramePayload` out, the verbs'
 * payloads in. The fleet types they carry come along as components.
 */
const FRAMES: Record<string, string[]> = {
  "stream.ts": ["StreamServerMessage", "StreamClientMessage"],
  "transcript-types.ts": [
    "TranscriptBlock",
    "TranscriptBranch",
    "TranscriptEvent",
    "TranscriptPage",
    "TranscriptStreamFrame",
  ],
  "index.ts": [
    "Envelope",
    "FramePayload",
    "SpawnPayload",
    "StopPayload",
    "ControlPayload",
    "FsPayload",
    "FsEntry",
    "FsMedia",
    "SendPayload",
    "ReposResult",
    "UpdateReport",
  ],
  // `NeutralSessionInfo`: what a machine's `listSessions` control answers,
  // the stored transcripts the home's Recent lists.
  "harness.ts": [
    "NeutralMessage",
    "NeutralSessionInfo",
    "ModelInfo",
    "McpServerStatus",
    "SupportedCommands",
    "AuthState",
    "NeutralTask",
  ],
  "tools.ts": ["ToolStatus"],
};

const scratch = mkdtempSync(join(tmpdir(), "cawco-openapi-"));
// Before the hub's modules load: config.ts reads it once, at import.
process.env.CAWCO_DB_PATH = join(scratch, "hub.db");

const { Effect, Layer } = await import("effect");
// The schema generator owns its compiler dependency. A Program built by the
// repository's newer TypeScript has different TypeFlags and cannot be handed
// to a generator interpreting them with its own TypeScript version.
const schemaRequire = createRequire(
  import.meta.resolve("typescript-json-schema")
);
const ts = schemaRequire("typescript") as typeof import("typescript");
const TJS = await import("typescript-json-schema");
const { toOpenAPISchema } = await import("@elysia/openapi");
const { CAWCO_HUB_PORT } = await import("@cawco/core");
const { HUB_VERSION } = await import("../src/config");
const { Db, DbLayer } = await import("../src/db");
const { HubLifetime, HubLifetimeLayer } = await import("../src/lifetime");
const { Pending, PendingLayer } = await import("../src/pending");
const { Registry, RegistryLayer } = await import("../src/registry");
const { createServer } = await import("../src/server");

type Schema = Record<string, unknown>;
interface Operation {
  operationId: string;
  requestBody?: { content: Record<string, unknown>; required?: boolean };
  responses?: Record<string, unknown>;
}

const { hub, lifetime } = await Effect.runPromise(
  Effect.provide(
    Effect.gen(function* () {
      const life = yield* HubLifetime;
      return {
        lifetime: life,
        hub: createServer(
          {
            build: { version: HUB_VERSION, startedAt: 0 },
            registry: yield* Registry,
            db: yield* Db,
            pending: yield* Pending,
            telegram: undefined,
            lifetime: life,
          },
          { resumeWorkflows: false }
        ),
      };
    }),
    PendingLayer.pipe(
      Layer.provideMerge(Layer.mergeAll(RegistryLayer, DbLayer)),
      Layer.provideMerge(HubLifetimeLayer)
    )
  )
);

// 3.1.0, the 3.1 the Swift generator names; `ws` is not an OpenAPI method.
const { paths } = toOpenAPISchema(
  hub,
  { methods: ["options", "ws"] },
  undefined,
  undefined,
  "3.1.0"
);

const operations: { path: string; method: string; op: Operation }[] = [];
for (const [path, item] of Object.entries(paths)) {
  for (const [method, op] of Object.entries(item ?? {})) {
    const operation = op as Operation;
    // Elysia's id keeps a path's hyphens (`getApiModel-windows`); camel-cased
    // across them it is an identifier in TypeScript and Swift alike.
    operation.operationId = operation.operationId.replace(
      /-(\w)/g,
      (_, letter: string) => letter.toUpperCase()
    );
    operations.push({ path, method, op: operation });
  }
}

/**
 * `@elysia/openapi` writes every request body as required. A route whose body
 * is `t.Optional(...)` (the schema carries `~optional`) can be called without
 * one, so its operation says so; keyed as `method path`, the path in
 * OpenAPI's `{param}` form.
 */
const optionalBodies = new Set(
  (
    hub.routes as {
      hooks?: { body?: Record<string, unknown> };
      method: string;
      path: string;
    }[]
  )
    .filter((route) => route.hooks?.body?.["~optional"] === true)
    .map(
      (route) =>
        `${route.method.toLowerCase()} ${route.path.replace(/:([^/]+)/g, "{$1}")}`
    )
);

// Everything the hub is read for has been read: its timers stop and its
// database closes now, before the type work below and the scratch's removal.
lifetime.close();

const ids = operations.map(({ op }) => op.operationId);
const repeated = ids.filter((id, i) => ids.indexOf(id) !== i);
if (repeated.length) {
  throw new Error(`operationIds repeat: ${repeated.join(", ")}`);
}

// One alias per operation, named by its operationId: the route's response
// map in `~Routes`, which nests by path segment (`:id`, as Elysia writes a
// parameter), then method.
const PARAMETER = /^\{(.+)\}$/;
const routesFile = join(scratch, "routes.ts");
writeFileSync(
  routesFile,
  [
    `import type { createServer } from ${JSON.stringify(join(HUB, "src/server"))};`,
    `type Routes = ReturnType<typeof createServer>["~Routes"];`,
    ...operations.map(({ path, method, op }) => {
      const keys = path
        .split("/")
        .filter(Boolean)
        .map((segment) => segment.replace(PARAMETER, ":$1"));
      const at = [...keys, method, "response"]
        .map((key) => `[${JSON.stringify(key)}]`)
        .join("");
      return `export type ${op.operationId} = Routes${at};`;
    }),
  ].join("\n")
);

const config = ts.getParsedCommandLineOfConfigFile(
  join(HUB, "tsconfig.json"),
  {},
  { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined }
);
if (!config) {
  throw new Error("packages/hub/tsconfig.json did not parse");
}
const frameFiles = Object.keys(FRAMES).map((file) => join(CORE, file));
const program = ts.createProgram([routesFile, ...frameFiles], {
  ...config.options,
  composite: false,
  declaration: false,
  noEmit: true,
  // TypeScript 6 defaults an unset rootDir to the tsconfig directory. This
  // no-emit program also owns generated aliases under tmpdir(), so its root
  // must explicitly include both the repository and the scratch directory.
  rootDir: parse(HUB).root,
});
const routeErrors = ts
  .getPreEmitDiagnostics(program, program.getSourceFile(routesFile))
  .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
if (routeErrors.length) {
  throw new Error(`~Routes lookups failed:\n${routeErrors.join("\n")}`);
}

const generator = TJS.buildGenerator(
  program,
  {
    ref: true,
    aliasRef: false,
    required: true,
    constAsEnum: true,
    ignoreErrors: true,
  },
  [routesFile, ...frameFiles]
);
if (!generator) {
  throw new Error("typescript-json-schema could not read the program");
}
// The generator reports every property initializer it reads; none is news.
const { warn } = console;
console.warn = () => undefined;
const { definitions = {} } = generator.getSchemaForSymbols([
  ...ids,
  ...Object.values(FRAMES).flat(),
]) as { definitions?: Record<string, Schema> };
console.warn = warn;

// Frame kinds are mutually exclusive already: required literal `kind` values.
// Emit the existing discriminant with named references, so Swift names cases
// from components instead of positions. This changes schemas, never JSON bytes.
const framePayload = definitions.FramePayload;
const frameMembers = framePayload.anyOf as Schema[] | undefined;
if (!frameMembers) {
  throw new Error("FramePayload must be a union of named frame schemas");
}
const mapping: Record<string, string> = {};
for (const member of frameMembers) {
  const ref = member.$ref;
  if (typeof ref !== "string" || !ref.startsWith("#/definitions/")) {
    throw new Error("Each FramePayload member must be a named component");
  }
  const name = decodeURIComponent(ref.slice("#/definitions/".length));
  const shape = definitions[name];
  const kind = (shape?.properties as Record<string, Schema> | undefined)?.kind;
  const values = kind?.enum as unknown[] | undefined;
  if (
    values?.length !== 1 ||
    typeof values[0] !== "string" ||
    !(shape.required as string[] | undefined)?.includes("kind")
  ) {
    throw new Error(`${name} must require one literal frame kind`);
  }
  if (Object.hasOwn(mapping, values[0])) {
    throw new Error(`Frame kind ${values[0]} has more than one schema`);
  }
  mapping[values[0]] = `#/components/schemas/${name}`;
}
const { anyOf: _frameUnion, ...frameMetadata } = framePayload;
definitions.FramePayload = {
  ...frameMetadata,
  oneOf: frameMembers,
  discriminator: { propertyName: "kind", mapping },
};

const DEFINITION = "#/definitions/";
const COMPONENT = "#/components/schemas/";
const RESPONSE = `${DEFINITION}Response`;
/** What OpenAPI allows a component to be called. */
const NAME = /^[A-Za-z0-9._-]+$/;

/**
 * Into the document's terms. A named type becomes a component ref. A type the
 * generator could only name by its text (`Record<string,number>`, a row's
 * `{ id: string; … }`) is no name at all, so it is written out where it is
 * used. And `default` goes: the generator reads it off the literal a handler
 * happened to return, which is not a default of anything.
 */
const toDocument = (
  value: unknown,
  key?: string,
  inlining: string[] = []
): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => toDocument(item, undefined, inlining));
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  const { $ref, ...rest } = value as Schema;
  let fields: Schema = Object.fromEntries(
    Object.entries(rest)
      .filter(([field]) => key === "properties" || field !== "default")
      .map(([field, item]) => [field, toDocument(item, field, inlining)])
  );
  // A tuple as the generator's draft-07 writes it (`items: [...]`) is
  // `prefixItems` in the 2020-12 dialect OpenAPI 3.1 speaks.
  if (key !== "properties" && Array.isArray(fields.items)) {
    const { items, additionalItems, ...others } = fields;
    fields = {
      ...others,
      prefixItems: items,
      ...(additionalItems === undefined ? {} : { items: additionalItems }),
    };
  }
  if (typeof $ref !== "string" || !$ref.startsWith(DEFINITION)) {
    return $ref === undefined ? fields : { $ref, ...fields };
  }
  const name = decodeURIComponent($ref.slice(DEFINITION.length));
  if (NAME.test(name)) {
    return { $ref: `${COMPONENT}${name}`, ...fields };
  }
  if (inlining.includes(name)) {
    throw new Error(`${name} contains itself and has no name to refer to`);
  }
  return {
    ...(toDocument(definitions[name], undefined, [
      ...inlining,
      name,
    ]) as Schema),
    ...fields,
  };
};

/** A `Response` a handler returns carries its own status; it is no body here. */
const withoutResponse = (schema: Schema): Schema | undefined => {
  if (schema.$ref === RESPONSE) {
    return undefined;
  }
  if (!Array.isArray(schema.anyOf)) {
    return schema;
  }
  const rest = (schema.anyOf as Schema[]).filter(
    (one) => one.$ref !== RESPONSE
  );
  return rest.length === 1 ? rest[0] : { ...schema, anyOf: rest };
};

/** Elysia sends a string as text/plain, whatever named type it has. */
const isText = (schema: Schema): boolean => {
  if (typeof schema.$ref === "string") {
    const named =
      definitions[
        decodeURIComponent(
          schema.$ref.replace(COMPONENT, "").replace(DEFINITION, "")
        )
      ];
    return named !== undefined && isText(named);
  }
  return (
    schema.type === "string" ||
    (Array.isArray(schema.anyOf) &&
      (schema.anyOf as Schema[]).every((one) => isText(one)))
  );
};

/** Elysia's 422 body (`ValidationErrorResponse`), by the literal it carries. */
const isValidationProblem = (schema: Schema): boolean => {
  const kind = (schema.properties as Record<string, Schema> | undefined)?.type;
  return Array.isArray(kind?.enum) && kind.enum[0] === "validation";
};

/**
 * The plugin's request schemas at 3.1 still carry TypeBox's 3.0 `nullable`
 * beside the `"null"` type that replaced it, and Elysia's own `~` keys.
 */
const clean = (value: unknown, key?: string): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => clean(item));
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([name]) =>
          key === "properties" || !(name.startsWith("~") || name === "nullable")
      )
      .map(([name, item]) => [name, clean(item, name)])
  );
};

const binary = {
  "application/octet-stream": { schema: { type: "string", format: "binary" } },
};

const components: Record<string, unknown> = {};
const untyped: string[] = [];
for (const { op, method, path } of operations) {
  const statuses = (definitions[op.operationId]?.properties ?? {}) as Record<
    string,
    Schema
  >;
  op.responses = {};
  for (const [status, returned] of Object.entries(statuses)) {
    const description = `${op.operationId} ${status}`;
    // No Content: whatever Elysia's type says, the answer has no body.
    if (status === "204") {
      op.responses[status] = { description };
      continue;
    }
    const bare = withoutResponse(returned);
    const schema = bare && (toDocument(bare) as Schema);
    if (!schema) {
      // Only a `Response`: the handler answers with bytes of its own.
      op.responses[status] = { description, content: binary };
      continue;
    }
    if (Object.keys(schema).length === 0) {
      untyped.push(description);
      continue;
    }
    // One status can answer words (text/plain) or a body (JSON), as a
    // workflow's 400 does: each part goes under its own content type.
    const parts = Array.isArray(schema.anyOf)
      ? (schema.anyOf as Schema[])
      : [schema];
    const text = parts.filter((part) => isText(part));
    const rest = parts.filter((part) => !isText(part));
    const content: Record<string, unknown> = {};
    if (text.length) {
      content["text/plain"] = { schema: { type: "string" } };
    }
    if (rest.length) {
      const body = rest.length === 1 ? rest[0] : { ...schema, anyOf: rest };
      // Elysia answers a failed validation with its own problem document; the
      // generator writes Elysia's type out wherever it meets it, so it is
      // known by its `type: "validation"` and kept as one component.
      const validation = isValidationProblem(body);
      // An anonymous body is named by its operation; a named type is its own.
      let name: string | undefined;
      if (validation) {
        name = "ValidationErrorResponse";
      } else if (!body.$ref) {
        name = `${op.operationId}${status}`;
      }
      if (name) {
        components[name] = body;
      }
      const ref = name ? `${COMPONENT}${name}` : (body.$ref as string);
      const type = validation ? "application/problem+json" : "application/json";
      content[type] = { schema: { $ref: ref } };
    }
    op.responses[status] = { description, content };
  }
  if (!Object.keys(op.responses).some((status) => status.startsWith("2"))) {
    untyped.push(`${op.operationId} 2xx`);
  }
  // The dashboard and the Swift client send JSON; the form encodings Elysia
  // also parses are not part of the contract.
  const json = op.requestBody?.content["application/json"];
  if (op.requestBody && json) {
    op.requestBody.content = { "application/json": clean(json) };
  }
  if (op.requestBody && optionalBodies.has(`${method} ${path}`)) {
    op.requestBody.required = false;
  }
  for (const parameter of (op as { parameters?: Schema[] }).parameters ?? []) {
    parameter.schema = clean(parameter.schema);
  }
}

for (const [name, schema] of Object.entries(definitions)) {
  if (!ids.includes(name) && NAME.test(name)) {
    components[name] = toDocument(schema);
  }
}

/**
 * swift-openapi-generator drops a `{type: "null"}` member of an anyOf/oneOf,
 * and with it the whole schema (apple/swift-openapi-generator#817: "rely on
 * the `required` property … If it's absent, it'll be optional"). So `X | null`
 * is written as `X`, and the property holding it leaves `required`: Swift reads
 * both a missing value and an explicit null as nil. A component that is only
 * `X | null` gives way to `X` wherever it is used.
 */
const isNull = (schema: unknown): boolean =>
  typeof schema === "object" &&
  schema !== null &&
  (schema as Schema).type === "null";
const UNIONS = ["anyOf", "oneOf"] as const;
/** The schema without its null member, or undefined when it has none. */
const withoutNull = (schema: Schema): Schema | undefined => {
  for (const union of UNIONS) {
    const members = schema[union];
    if (Array.isArray(members) && members.some(isNull)) {
      const { [union]: _, ...others } = schema;
      const kept = members.filter((member) => !isNull(member)) as Schema[];
      return kept.length === 1
        ? { ...others, ...kept[0] }
        : { ...others, [union]: kept };
    }
  }
  return undefined;
};
let unionsRewritten = 0;
let madeOptional = 0;
const nullable = new Set<string>();
const replaced = new Map<string, Schema>();
for (const [name, schema] of Object.entries(components)) {
  const kept = withoutNull(schema as Schema);
  if (kept) {
    unionsRewritten += 1;
    nullable.add(name);
    if (typeof kept.$ref === "string" && Object.keys(kept).length === 1) {
      replaced.set(name, kept);
      delete components[name];
    } else {
      components[name] = kept;
    }
  }
}
const isNullableRef = (schema: Schema): boolean =>
  typeof schema.$ref === "string" &&
  nullable.has(schema.$ref.slice(COMPONENT.length));
const dropNulls = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(dropNulls);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  const schema = value as Schema;
  if (typeof schema.$ref === "string") {
    const target = replaced.get(schema.$ref.slice(COMPONENT.length));
    if (target) {
      const { $ref: _, ...siblings } = schema;
      return { ...siblings, ...target };
    }
  }
  const out: Schema = Object.fromEntries(
    Object.entries(schema).map(([key, item]) => [
      key,
      key === "properties" ? item : dropNulls(item),
    ])
  );
  const properties = schema.properties as Record<string, Schema> | undefined;
  if (properties && typeof properties === "object") {
    const optional = new Set<string>();
    out.properties = Object.fromEntries(
      Object.entries(properties).map(([field, property]) => {
        const kept = withoutNull(property);
        if (kept) {
          unionsRewritten += 1;
        }
        if (kept || isNullableRef(property)) {
          optional.add(field);
        }
        return [field, dropNulls(kept ?? property)];
      })
    );
    const required = (schema.required as string[] | undefined) ?? [];
    const still = required.filter((field) => !optional.has(field));
    madeOptional += required.length - still.length;
    // Left undefined, an emptied `required` is not written at all.
    out.required = still.length ? still : undefined;
  }
  return out;
};
for (const [name, schema] of Object.entries(components)) {
  components[name] = dropNulls(schema);
}
for (const item of Object.values(paths)) {
  for (const op of Object.values(item ?? {})) {
    Object.assign(op as object, dropNulls(op));
  }
}

/**
 * swift-openapi-generator reads a schema whose `type` lists several value
 * types (`["string", "number"]`, a `string | number`) as its first one alone,
 * so a number arriving there fails to decode (a usage summary row's `key` is a
 * number when grouped by start). Such a schema is written as an `anyOf` with
 * one member per type, which the generator does read as either. Inside an
 * `anyOf` already, the members join it in place. A `"null"` in the list stays
 * with the first member, where the generator reads it as it did before.
 */
const typeMembers = (schema: Schema): Schema[] | undefined => {
  if (!Array.isArray(schema.type)) {
    return undefined;
  }
  const kinds = (schema.type as string[]).filter((kind) => kind !== "null");
  if (kinds.length < 2) {
    return undefined;
  }
  const includesNull = kinds.length < (schema.type as string[]).length;
  return kinds.map((kind, index) => ({
    type: includesNull && index === 0 ? ["null", kind] : kind,
  }));
};
const splitTypes = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(splitTypes);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  const schema = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      (UNIONS as readonly string[]).includes(key) && Array.isArray(item)
        ? item.flatMap((member) => {
            const members = typeMembers(member as Schema);
            return members ?? [splitTypes(member)];
          })
        : splitTypes(item),
    ])
  ) as Schema;
  const members = typeMembers(schema);
  if (!members) {
    return schema;
  }
  const { type: _, ...others } = schema;
  return { ...others, anyOf: members };
};
for (const [name, schema] of Object.entries(components)) {
  components[name] = splitTypes(schema);
}
for (const item of Object.values(paths)) {
  for (const op of Object.values(item ?? {})) {
    Object.assign(op as object, splitTypes(op));
  }
}

// Only what a path or a frame reaches: a type the converter met on the way
// (a `Response`'s internals) is not part of the contract.
const reached = new Set<string>(Object.values(FRAMES).flat());
const visit = (value: unknown): void => {
  if (typeof value === "string" && value.startsWith(COMPONENT)) {
    const name = value.slice(COMPONENT.length);
    if (!reached.has(name)) {
      reached.add(name);
      visit(components[name]);
    }
  } else if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value)) {
      visit(item);
    }
  }
};
visit(paths);
for (const name of Object.values(FRAMES).flat()) {
  visit(components[name]);
}
for (const name of Object.keys(components)) {
  if (!reached.has(name)) {
    delete components[name];
  }
}
if (untyped.length) {
  console.warn(`untyped: ${untyped.join(", ")}`);
}

/**
 * Open enums. The hub ships nightly and the apps ship through TestFlight
 * later, so the first hub that adds an enum value meets apps that do not know
 * it. A closed enum (swift-openapi-generator writes every enum closed, as
 * JSON Schema has them: apple/swift-openapi-generator#428, "We can't offer an
 * option to make enums open") throws on it and the whole message is lost.
 *
 * So every string enum the app receives is named as its own component and
 * the generator's `typeOverrides` (SOAR-0014, which takes named components
 * only) swaps in an enum written here, in Swift, with the same cases plus
 * `unrecognized(String)`: the generator's case names (its idiomatic naming,
 * ported below) keep every reader compiling. The JSON is unchanged.
 *
 * An enum that tells the branches of an undiscriminated anyOf/oneOf apart (a
 * property two branches declare differently, or the branch itself) stays
 * closed there: the generator picks branches by which ones decode, so an open
 * one would match them all.
 * What the app only sends (request bodies, parameters, its own socket
 * messages) stays as the generator writes it.
 */
const SENT = new Set([
  "StreamClientMessage",
  "Envelope",
  "SpawnPayload",
  "StopPayload",
  "ControlPayload",
  "FsPayload",
  "SendPayload",
]);
const isStringEnum = (value: unknown): value is Schema =>
  typeof value === "object" &&
  value !== null &&
  (value as Schema).type === "string" &&
  Array.isArray((value as Schema).enum) &&
  ((value as Schema).enum as unknown[]).length > 1 &&
  ((value as Schema).enum as unknown[]).every((v) => typeof v === "string");
const refName = (schema: Schema): string | undefined =>
  typeof schema.$ref === "string" && schema.$ref.startsWith(COMPONENT)
    ? schema.$ref.slice(COMPONENT.length)
    : undefined;

/** Components the app decodes: what a response or a received frame reaches. */
const received = new Set<string>();
const receive = (value: unknown): void => {
  if (typeof value === "string" && value.startsWith(COMPONENT)) {
    const name = value.slice(COMPONENT.length);
    if (!received.has(name)) {
      received.add(name);
      receive(components[name]);
    }
  } else if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value)) {
      receive(item);
    }
  }
};
for (const item of Object.values(paths)) {
  for (const op of Object.values(item ?? {})) {
    receive((op as Operation).responses);
  }
}
for (const name of Object.values(FRAMES).flat()) {
  if (!SENT.has(name)) {
    receive(`${COMPONENT}${name}`);
  }
}

/**
 * Enums that tell an undiscriminated union's branches apart stay closed
 * there: a property two branches both declare, differently, or a branch that
 * is itself an enum. A named one is copied inline at that place (which the
 * generator writes closed) and stays open everywhere else.
 */
const closedInline = new Set<Schema>();
/** Where a schema sits: the object or array holding it, and its key there. */
interface Slot {
  holder: Record<string | number, unknown>;
  key: string | number;
}
const schemaAt = (slot: Slot): Schema | undefined => {
  const schema = slot.holder[slot.key];
  return typeof schema === "object" && schema !== null
    ? (schema as Schema)
    : undefined;
};
/** A slot's schema with its ref followed. */
const resolved = (slot: Slot): Schema | undefined => {
  const schema = schemaAt(slot);
  const named = schema && refName(schema);
  return named ? (components[named] as Schema) : schema;
};
const close = (slot: Slot): void => {
  const schema = schemaAt(slot);
  if (!schema) {
    return;
  }
  const named = refName(schema);
  if (named) {
    const { $ref: _, ...siblings } = schema;
    const copy: Schema = {
      ...siblings,
      type: "string",
      enum: (components[named] as Schema).enum,
    };
    slot.holder[slot.key] = copy;
    closedInline.add(copy);
  } else {
    closedInline.add(schema);
  }
};
/** A property as two branches would compare it, and the slot of its enum if it is one. */
interface Declared {
  enumSlot?: Slot;
  signature: string;
}
/** A property's enum, itself or its array's items, as the slot holding it. */
const enumSlotOf = (slot: Slot): Slot | undefined => {
  const property = resolved(slot);
  if (isStringEnum(property)) {
    return slot;
  }
  if (property?.type !== "array") {
    return undefined;
  }
  const items = { holder: property as Slot["holder"], key: "items" };
  return isStringEnum(resolved(items)) ? items : undefined;
};
/** A branch's own properties, through refs and allOf. */
const declared = (
  branch: Slot,
  seen: Set<string>,
  out: Map<string, Declared>
): void => {
  const schema = schemaAt(branch);
  if (!schema) {
    return;
  }
  const named = refName(schema);
  if (named) {
    if (!seen.has(named)) {
      declared(
        { holder: components, key: named },
        new Set([...seen, named]),
        out
      );
    }
    return;
  }
  const members = (schema.allOf as Slot["holder"][] | undefined) ?? [];
  for (const index of members.keys()) {
    declared(
      { holder: members as unknown as Slot["holder"], key: index },
      seen,
      out
    );
  }
  const properties = schema.properties as Slot["holder"] | undefined;
  if (!properties) {
    return;
  }
  for (const field of Object.keys(properties)) {
    const enumSlot = enumSlotOf({ holder: properties, key: field });
    const signature = enumSlot
      ? JSON.stringify(
          [...((resolved(enumSlot)?.enum as string[] | undefined) ?? [])].sort()
        )
      : JSON.stringify(resolved({ holder: properties, key: field }) ?? null);
    out.set(field, { signature, enumSlot });
  }
};
/** One undiscriminated union: closes the enums its branches are told apart by. */
const closeDiscriminators = (branches: unknown[]): void => {
  const holder = branches as unknown as Slot["holder"];
  const fields = branches.map((_, index) => {
    if (isStringEnum(resolved({ holder, key: index }))) {
      close({ holder, key: index });
    }
    const out = new Map<string, Declared>();
    declared({ holder, key: index }, new Set(), out);
    return out;
  });
  const names = new Set(fields.flatMap((one) => [...one.keys()]));
  for (const field of names) {
    const declarations = fields
      .map((one) => one.get(field))
      .filter((one): one is Declared => one !== undefined);
    if (new Set(declarations.map((one) => one.signature)).size < 2) {
      continue;
    }
    for (const { enumSlot } of declarations) {
      if (enumSlot) {
        close(enumSlot);
      }
    }
  }
};
const findUnions = (value: unknown): void => {
  if (typeof value !== "object" || value === null) {
    return;
  }
  const schema = value as Schema;
  for (const union of UNIONS) {
    const branches = schema[union];
    if (Array.isArray(branches) && !schema.discriminator) {
      closeDiscriminators(branches);
    }
  }
  for (const item of Object.values(schema)) {
    findUnions(item);
  }
};
findUnions(components);

const pascal = (word: string): string =>
  word.replace(/(^|[^A-Za-z0-9]+)([A-Za-z0-9])/g, (_, __, c: string) =>
    c.toUpperCase()
  );
/** One open enum per value list, the first schema to use it naming it. */
const openByValues = new Map<string, string>();
const openEnums = new Map<string, { values: string[]; description?: string }>();
const valuesKey = (values: string[]): string =>
  JSON.stringify([...values].sort());
for (const name of [...received].sort()) {
  const schema = components[name];
  if (isStringEnum(schema)) {
    const values = schema.enum as string[];
    openEnums.set(name, {
      values,
      description: schema.description as string | undefined,
    });
    if (!openByValues.has(valuesKey(values))) {
      openByValues.set(valuesKey(values), name);
    }
  }
}
/**
 * An inline enum's name: its component's and its property's (`InstanceRow`'s
 * `titleSource` is `InstanceRowTitleSource`), never a bare word like `Type`
 * that Swift reads as something else.
 */
const nameFor = (owner: string, hint: string): string => {
  const base = `${pascal(owner)}${pascal(hint)}`;
  for (let n = 1; ; n += 1) {
    const candidate = n === 1 ? base : `${base}${n}`;
    if (!(candidate in components || openEnums.has(candidate))) {
      return candidate;
    }
  }
};
let hoisted = 0;
const openUp = (value: unknown, owner: string, hint: string): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => openUp(item, owner, hint));
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  const schema = value as Schema;
  if (isStringEnum(schema) && !closedInline.has(schema)) {
    const values = schema.enum as string[];
    const { type: _, enum: __, ...siblings } = schema;
    let name = openByValues.get(valuesKey(values));
    if (!name) {
      name = nameFor(owner, hint);
      openByValues.set(valuesKey(values), name);
      openEnums.set(name, { values });
    }
    hoisted += 1;
    return { $ref: `${COMPONENT}${name}`, ...siblings };
  }
  return Object.fromEntries(
    Object.entries(schema).map(([key, item]) => {
      if (key === "properties" && typeof item === "object" && item !== null) {
        return [
          key,
          Object.fromEntries(
            Object.entries(item).map(([field, property]) => [
              field,
              openUp(property, owner, field),
            ])
          ),
        ];
      }
      return [key, openUp(item, owner, hint)];
    })
  );
};
for (const name of [...received].sort()) {
  if (!openEnums.has(name)) {
    components[name] = openUp(components[name], name, `${name}Value`);
  }
}
for (const [name, { values, description }] of openEnums) {
  components[name] = {
    ...(description ? { description } : {}),
    type: "string",
    enum: values,
  };
}

/**
 * The case name swift-openapi-generator gives a raw value under
 * `namingStrategy: idiomatic` (IdiomaticSafeNameGenerator.swiftMemberName,
 * then DefensiveSafeNameGenerator for what is left), for the ASCII values
 * the hub's enums use.
 */
const SWIFT_KEYWORDS = new Set(
  "associatedtype class deinit enum extension func import init inout let operator precedencegroup protocol struct subscript typealias var fileprivate internal private public static defer if guard do repeat else for in while return break continue fallthrough switch case default where catch throw as Any false is nil rethrows super self Self true try throws yield String Error Int Bool Array Type type Protocol await".split(
    " "
  )
);
const SEPARATORS = new Set(["_", "-", " ", "/", "+"]);
const BETWEEN_WORDS = new Set(["_", "-", ".", "/", "+", "{", "}"]);
const ALNUM = /[A-Za-z0-9]/;
const LETTER = /[A-Za-z]/;
const UPPER = /[A-Z]/;
const LOWER = /[a-z]/;
const LEADING_DIGIT = /^[0-9]/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const isAlnum = (c: string): boolean => ALNUM.test(c);
const isUpper = (c: string): boolean => UPPER.test(c);
const isLower = (c: string): boolean => LOWER.test(c);

/** The generator's naming state machine, one character at a time. */
interface Naming {
  /** Lowering the first word's leading capitals ("HTTPProxy" → "httpProxy"). */
  accumulatingUpper: boolean;
  allUpper: boolean;
  chars: string[];
  out: string;
  state: "pre" | "first" | "word" | "waiting";
}
const namePre = (n: Naming, c: string): void => {
  n.out += LETTER.test(c) ? c.toLowerCase() : c;
  if (c === "_") {
    return;
  }
  n.state = "first";
  n.accumulatingUpper = isUpper(c);
};
/** A capital in the first word while lowering its leading capitals. */
const leadingCapital = (n: Naming, c: string, i: number): string => {
  const next = n.chars[i + 1];
  const second = n.chars[i + 2];
  if (next === undefined || second === undefined) {
    n.accumulatingUpper = false;
    return c.toLowerCase();
  }
  if ((isUpper(next) && isLower(second)) || SEPARATORS.has(next)) {
    n.accumulatingUpper = false;
    return c.toLowerCase();
  }
  if (isUpper(next)) {
    return c.toLowerCase();
  }
  n.accumulatingUpper = false;
  return c;
};
const nameFirst = (n: Naming, c: string, i: number): void => {
  if (isAlnum(c)) {
    if (n.allUpper) {
      n.out += c.toLowerCase();
    } else if (n.accumulatingUpper && isLower(c)) {
      n.out += c;
      n.accumulatingUpper = false;
    } else if (n.accumulatingUpper) {
      n.out += leadingCapital(n, c, i);
    } else {
      n.out += c;
    }
    return;
  }
  if (SEPARATORS.has(c)) {
    n.state = "waiting";
    return;
  }
  n.accumulatingUpper = false;
  if (c === ".") {
    n.out += "_";
  } else if (c !== "{" && c !== "}") {
    n.out += c;
  }
};
const nameWord = (n: Naming, c: string): void => {
  if (isAlnum(c)) {
    n.out += n.allUpper ? c.toLowerCase() : c;
  } else if (SEPARATORS.has(c)) {
    n.state = "waiting";
  } else if (c === ".") {
    n.out += "_";
  } else if (c !== "{" && c !== "}") {
    n.out += c;
  }
};
const nameWaiting = (n: Naming, c: string): void => {
  if (isAlnum(c)) {
    n.out += c.toUpperCase();
    n.state = "word";
  } else if (!BETWEEN_WORDS.has(c)) {
    n.out += c;
  }
};
const swiftCaseName = (raw: string): string => {
  if (raw === "") {
    return "_empty_";
  }
  const n: Naming = {
    accumulatingUpper: false,
    allUpper: [...raw].every((c) => !isLower(c)),
    chars: [...raw],
    out: "",
    state: "pre",
  };
  for (const [i, c] of n.chars.entries()) {
    if (n.state === "pre") {
      namePre(n, c);
    } else if (n.state === "first") {
      nameFirst(n, c, i);
    } else if (n.state === "word") {
      nameWord(n, c);
    } else {
      nameWaiting(n, c);
    }
  }
  // The defensive pass: a leading digit, as DefensiveSafeNameGenerator
  // writes it; any other character it would rewrite is not in the hub's values.
  const out = LEADING_DIGIT.test(n.out) ? `_${n.out}` : n.out;
  if (!IDENTIFIER.test(out)) {
    throw new Error(
      `enum value ${JSON.stringify(raw)} needs a name rule this port does not have`
    );
  }
  if (out === "_") {
    return "_underscore_";
  }
  return SWIFT_KEYWORDS.has(out) ? `_${out}` : out;
};
const UNRECOGNIZED = "unrecognized";
const swiftString = (text: string): string => JSON.stringify(text);
const swiftEnum = (name: string, values: string[]): string => {
  const cases = values.map((value) => ({ value, name: swiftCaseName(value) }));
  const names = cases.map((c) => c.name);
  if (new Set(names).size !== names.length || names.includes(UNRECOGNIZED)) {
    throw new Error(`${name}: case names collide: ${names.join(", ")}`);
  }
  const indent = (lines: string[], by: string) => lines.map((l) => `${by}${l}`);
  return [
    `    /// \`#/components/schemas/${name}\`.`,
    `    public enum ${name}: OpenEnum {`,
    ...cases.map((c) => `        case ${c.name}`),
    `        /// A value this app does not know: a newer hub's.`,
    `        case ${UNRECOGNIZED}(String)`,
    "",
    "        public init(rawValue: String) {",
    "            switch rawValue {",
    ...indent(
      cases.map((c) => `case ${swiftString(c.value)}: self = .${c.name}`),
      "            "
    ),
    `            default: self = .${UNRECOGNIZED}(rawValue)`,
    "            }",
    "        }",
    "",
    "        public var rawValue: String {",
    "            switch self {",
    ...indent(
      cases.map((c) => `case .${c.name}: ${swiftString(c.value)}`),
      "            "
    ),
    `            case let .${UNRECOGNIZED}(rawValue): rawValue`,
    "            }",
    "        }",
    "",
    "        public var isUnrecognized: Bool {",
    `            if case .${UNRECOGNIZED} = self { true } else { false }`,
    "        }",
    "",
    `        public static let allCases: [Self] = [${cases.map((c) => `.${c.name}`).join(", ")}]`,
    "",
    "        public init(from decoder: any Decoder) throws {",
    "            self = try Self.decodeOpen(from: decoder)",
    "        }",
    "",
    "        public func encode(to encoder: any Encoder) throws {",
    "            try encodeOpen(to: encoder)",
    "        }",
    "    }",
  ].join("\n");
};
const sortedOpen = [...openEnums].sort(([a], [b]) => (a < b ? -1 : 1));
const openNames = sortedOpen.map(([name]) => name);
const swiftEnums = [
  "// Generated by `bun run openapi` in packages/hub, with openapi.json; do not edit.",
  "// Every string enum the hub sends, open: a value this app does not know reads",
  "// as `unrecognized(raw)` and the rest of its message still reads (OpenEnum.swift).",
  "// openapi-generator-config.yaml's typeOverrides puts each in place of the",
  "// component the generator would write closed.",
  "",
  "public enum OpenEnums {",
  sortedOpen.map(([name, { values }]) => swiftEnum(name, values)).join("\n\n"),
  "}",
  "",
].join("\n");
const generatorConfig = [
  "# swift-openapi-generator (build plugin): the hub's wire types and HTTP client,",
  "# generated at build time from openapi.json beside this file.",
  "# Written by `bun run openapi` in packages/hub; do not edit.",
  "generate:",
  "  - types",
  "  - client",
  "accessModifier: public",
  "namingStrategy: idiomatic",
  "# Every string enum the hub sends, open (OpenEnums.swift).",
  "typeOverrides:",
  "  schemas:",
  ...openNames.map((name) => `    ${name}: OpenEnums.${name}`),
  "",
].join("\n");

const document = {
  openapi: "3.1.0",
  info: {
    title: "CawCo hub",
    version: HUB_VERSION,
    description:
      "The hub's HTTP API as the dashboard uses it, and the dashboard socket's frames (components only). Generated by `bun run openapi` in packages/hub; do not edit.",
  },
  // Each install's hub is its own; the app names it.
  servers: [
    {
      url: "http://{host}:{port}",
      variables: {
        host: { default: "localhost" },
        port: { default: String(CAWCO_HUB_PORT) },
      },
    },
  ],
  paths,
  components: { schemas: components },
};

// The Swift generator would drop each of these, so none may be written.
const leftNulls: string[] = [];
const findNulls = (value: unknown, at: string): void => {
  if (typeof value !== "object" || value === null) {
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (
      (UNIONS as readonly string[]).includes(key) &&
      Array.isArray(item) &&
      item.some(isNull)
    ) {
      leftNulls.push(`${at}/${key}`);
    }
    findNulls(item, `${at}/${key}`);
  }
};
findNulls(document, "#");
if (leftNulls.length) {
  throw new Error(`null left in a union:\n${leftNulls.join("\n")}`);
}

const outputs: [string, string][] = [
  [OUT, `${JSON.stringify(document, null, 2)}\n`],
  [join(dirname(OUT), "OpenEnums.swift"), swiftEnums],
  [join(dirname(OUT), "openapi-generator-config.yaml"), generatorConfig],
];
const check = process.argv.includes("--check");
if (!check) {
  mkdirSync(dirname(OUT), { recursive: true });
  for (const [path, text] of outputs) {
    writeFileSync(path, text);
  }
}
rmSync(scratch, { recursive: true, force: true });
if (check) {
  const current = await Promise.all(
    outputs.map(async ([path]) =>
      (await Bun.file(path).exists()) ? Bun.file(path).text() : undefined
    )
  );
  const stale = outputs.filter(([, text], index) => current[index] !== text);
  if (stale.length) {
    for (const [path] of stale) {
      console.error(
        `${parse(path).base} is out of date — run \`bun run openapi\` in packages/hub`
      );
    }
    process.exit(1);
  }
  console.log(
    "openapi.json, OpenEnums.swift and the generator config are up to date"
  );
  process.exit(0);
}
console.log(
  `${operations.length} operations, ${Object.keys(components).length} schemas, ${unionsRewritten} null unions rewritten, ${madeOptional} properties made optional, ${openEnums.size} open enums (${hoisted} inline uses named) → ${OUT}`
);
process.exit(0);
