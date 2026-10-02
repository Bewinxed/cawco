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
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const HUB = resolve(import.meta.dir, "..");
const CORE = resolve(HUB, "../core/src");
const OUT = resolve(
  HUB,
  "../../apps/apple/Packages/CawCoKit/Sources/CawCoAPI/openapi.json"
);

/**
 * The dashboard socket's frames, by the core file that declares them: the
 * Ledger Protocol's messages both ways, and the envelope every other message
 * rides in — `FramePayload` out (a session's `NeutralMessage`s among them),
 * the verbs' payloads in. The fleet types they carry come along as components.
 */
const FRAMES: Record<string, string[]> = {
  "stream.ts": ["StreamServerMessage", "StreamClientMessage"],
  "index.ts": [
    "Envelope",
    "FramePayload",
    "SpawnPayload",
    "StopPayload",
    "ControlPayload",
    "FsPayload",
  ],
  "harness.ts": ["NeutralMessage"],
};

const scratch = mkdtempSync(join(tmpdir(), "cawco-openapi-"));
// Before the hub's modules load: config.ts reads it once, at import.
process.env.CAWCO_DB_PATH = join(scratch, "hub.db");

const { Effect, Layer } = await import("effect");
const ts = (await import("typescript")).default;
const TJS = await import("typescript-json-schema");
const { toOpenAPISchema } = await import("@elysia/openapi");
const { CAWCO_HUB_PORT } = await import("@cawco/core");
const { HUB_VERSION } = await import("../src/config");
const { Db, DbLayer } = await import("../src/db");
const { Pending, PendingLayer } = await import("../src/pending");
const { Registry, RegistryLayer } = await import("../src/registry");
const { createServer } = await import("../src/server");

type Schema = Record<string, unknown>;
interface Operation {
  operationId: string;
  requestBody?: { content: Record<string, unknown> };
  responses?: Record<string, unknown>;
}

const hub = await Effect.runPromise(
  Effect.provide(
    Effect.gen(function* () {
      return createServer({
        build: { version: HUB_VERSION, startedAt: 0 },
        registry: yield* Registry,
        db: yield* Db,
        pending: yield* Pending,
        telegram: undefined,
      });
    }),
    Layer.mergeAll(RegistryLayer, DbLayer, PendingLayer)
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
  rootDir: undefined,
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
for (const { op } of operations) {
  const statuses = (definitions[op.operationId]?.properties ?? {}) as Record<
    string,
    Schema
  >;
  op.responses = {};
  for (const [status, returned] of Object.entries(statuses)) {
    const description = `${op.operationId} ${status}`;
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
  for (const parameter of (op as { parameters?: Schema[] }).parameters ?? []) {
    parameter.schema = clean(parameter.schema);
  }
}

for (const [name, schema] of Object.entries(definitions)) {
  if (!ids.includes(name) && NAME.test(name)) {
    components[name] = toDocument(schema);
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

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(document, null, 2)}\n`);
rmSync(scratch, { recursive: true, force: true });
console.log(
  `${operations.length} operations, ${Object.keys(components).length} schemas → ${OUT}`
);
process.exit(0);
