/**
 * `bun run route-types`: what every hub route takes, as TypeScript, written
 * to packages/core/src/hub-routes.gen.ts for core's request door
 * (hub-request.ts) to hold each caller to.
 *
 * Read off the hub's own route table: a hub built in this process
 * (hub-in-process.ts), each `hub.routes` entry (hidden ones included, the
 * agent's and the CLI's) with its path parameters, query and JSON body, the
 * same schemas the hub refuses a request by (server.ts `normalize: false`,
 * unknown-fields.ts). Each route is one schema in an OpenAPI 3.1 document
 * built in memory, keyed `METHOD /path` as the hub declares it (`:name` for
 * a parameter), and `openapi-typescript` prints the document's types: "The
 * Node API may be useful if dealing with dynamically-created schemas"
 * (openapi-ts.dev/node).
 *
 *   bun scripts/route-types.ts           write the file
 *   bun scripts/route-types.ts --check   fail when the file is stale
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import type { SchemaObject } from "openapi-typescript";
import { hubInProcess } from "./hub-in-process";

const check = process.argv.includes("--check");
const ROOT = resolve(import.meta.dir, "../../..");
const OUT = join(ROOT, "packages/core/src/hub-routes.gen.ts");
const started = performance.now();

type Schema = Record<string, unknown>;
interface Route {
  hooks?: { body?: unknown; params?: unknown; query?: unknown };
  method: string;
  path: string;
}

/** A route a request names: an HTTP method's, not a socket's (\`WS\`) or any method's (\`*\`, the MCP endpoints). */
const HTTP = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

const isSchema = (value: unknown): value is Schema =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * A route schema as plain JSON Schema: a Standard Schema (zod: core
 * `viewToolInput`) by its own converter, as the input it takes; a TypeBox
 * schema, which is JSON Schema already, without its own `~` keys.
 */
const jsonSchemaOf = async (schema: unknown): Promise<Schema> => {
  if (isSchema(schema) && "~standard" in schema && "_zod" in schema) {
    const { z } = await import("zod");
    return z.toJSONSchema(schema as never, { io: "input" }) as Schema;
  }
  const plain: unknown = JSON.parse(
    JSON.stringify(schema, (key, value: unknown) =>
      key.startsWith("~") ? undefined : value
    )
  );
  if (!isSchema(plain)) {
    throw new Error(
      `route-types: a route schema is no object: ${String(plain)}`
    );
  }
  return plain;
};

const PARAMETER = /^:(.+)$/u;

/** What a route takes, as one object schema: `path`, `query` and `body`, each required when the route needs it. */
const requestOf = async (route: Route): Promise<Schema> => {
  const { hooks = {} } = route;
  const properties: Record<string, Schema> = {};
  const required: string[] = [];
  const names = route.path
    .split("/")
    .flatMap((segment) => PARAMETER.exec(segment)?.[1] ?? []);
  if (names.length > 0) {
    const declared = hooks.params ? await jsonSchemaOf(hooks.params) : {};
    const own = isSchema(declared.properties) ? declared.properties : {};
    // A parameter the route declares no schema for is any segment: a
    // number fills one as well as a string (hub-request.ts encodes either).
    properties.path = {
      type: "object",
      properties: Object.fromEntries(
        names.map((name) => [name, own[name] ?? { type: ["string", "number"] }])
      ),
      required: names,
    };
    required.push("path");
  }
  if (hooks.query) {
    const query = await jsonSchemaOf(hooks.query);
    properties.query = query;
    if (Array.isArray(query.required) && query.required.length > 0) {
      required.push("query");
    }
  }
  if (hooks.body) {
    properties.body = await jsonSchemaOf(hooks.body);
    if (!(isSchema(hooks.body) && hooks.body["~optional"] === true)) {
      required.push("body");
    }
  }
  return { type: "object", properties, required };
};

const scratch = mkdtempSync(join(tmpdir(), "cawco-route-types-"));
const { hub, lifetime } = await hubInProcess(join(scratch, "hub.db"), scratch);
const routes = (hub.routes as Route[])
  .filter((route) => HTTP.has(route.method))
  .sort((a, b) =>
    `${a.path} ${a.method}`.localeCompare(`${b.path} ${b.method}`)
  );
const schemas: Record<string, Schema> = {};
for (const route of routes) {
  schemas[`${route.method} ${route.path}`] = await requestOf(route);
}
lifetime.close();
rmSync(scratch, { recursive: true, force: true });
const read = performance.now();

const { default: openapiTS, astToString } = await import("openapi-typescript");
// The compiler openapi-typescript prints with: the repository's own.
const { default: ts } = await import("typescript");
// The document's `components` alone: its `paths`, `webhooks`, `$defs` and
// `operations` are empty here, and no caller reads them.
const printed = astToString(
  (
    await openapiTS(
      {
        openapi: "3.1.0",
        info: { title: "CawCo hub requests", version: "1" },
        paths: {},
        // Each is JSON Schema as the hub validates by (jsonSchemaOf).
        components: { schemas: schemas as Record<string, SchemaObject> },
      },
      { alphabetize: true }
    )
  ).filter(
    (node) => ts.isInterfaceDeclaration(node) && node.name.text === "components"
  )
);

// The repository's formatter (scripts/fmt.ts), outside this package's
// project, so loaded by its path at run time.
const fmt = (await import(join(ROOT, "scripts/fmt.ts"))) as {
  formattedAlike: (path: string, a: string, b: string) => Promise<boolean>;
  formatText: (path: string, text: string) => Promise<string>;
};
const text = await fmt.formatText(
  OUT,
  `/**
 * Generated by packages/hub/scripts/route-types.ts from the hub's own route
 * table (\`bun run route-types\` in packages/hub); never edited by hand.
 *
 * What each hub route takes, keyed \`METHOD /path\` as the hub declares it:
 * its path parameters, query and JSON body. Read through hub-request.ts.
 */
${printed}`
);
const printedAt = performance.now();
const where = relative(ROOT, OUT);
const timing = `${routes.length} route(s), ${text.length} bytes; hub ${Math.round(read - started)} ms, printed ${Math.round(printedAt - read)} ms`;

if (check) {
  let kept = "";
  try {
    kept = readFileSync(OUT, "utf8");
  } catch {
    // Not written yet.
  }
  if (!(await fmt.formattedAlike(OUT, kept, text))) {
    console.error(
      `route-types: ${where} is not what the hub's routes take; run \`bun run route-types\` in packages/hub`
    );
    process.exit(1);
  }
  console.log(`route-types: ${where} is current: ${timing}`);
} else {
  writeFileSync(OUT, text);
  console.log(`route-types: wrote ${where}: ${timing}`);
}
process.exit(0);
