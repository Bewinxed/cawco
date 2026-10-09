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

const generated = `${JSON.stringify(document, null, 2)}\n`;
const check = process.argv.includes("--check");
if (!check) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, generated);
}
rmSync(scratch, { recursive: true, force: true });
if (check) {
  if (
    !(await Bun.file(OUT).exists()) ||
    (await Bun.file(OUT).text()) !== generated
  ) {
    console.error(
      "openapi.json is out of date — run `bun run openapi` in packages/hub"
    );
    process.exit(1);
  }
  console.log("openapi.json is up to date");
  process.exit(0);
}
console.log(
  `${operations.length} operations, ${Object.keys(components).length} schemas, ${unionsRewritten} null unions rewritten, ${madeOptional} properties made optional → ${OUT}`
);
process.exit(0);
