/**
 * Every hub route answers a value Eden can type. Eden types a route's answer
 * from its handler's return type, so a handler that returns a `Response` or
 * `unknown` reaches every caller untyped: the dashboard, the CLI and the
 * agent all read the hub through Eden.
 *
 * This reads every Elysia route of `packages/hub/src` through the TypeScript
 * compiler API (the registrations Elysia's own `get`, `post`, `put`, `patch`,
 * `delete`, `all`, `head` and `options` make) and fails, naming the method,
 * path and file:line, any whose handler's return type holds a `Response`, or
 * is `unknown` or `any` (through a `Promise`, a union, a generator or an
 * `ElysiaStatus`). A route answers a Blob or text with its headers set on
 * Elysia's `set`, a JSON value as the value, and a failure with `problem()`.
 *
 * What stays a `Response` is a protocol endpoint whose client is not one of
 * ours, so Eden never reads its body: {@link PROTOCOL}, each with its
 * reason. There is no baseline. An entry that matches no route which would
 * fail otherwise fails too, so the list cannot hold a route that has since
 * been typed.
 *
 * Run by `bun run check`.
 */
import { join, relative } from "node:path";
import ts from "typescript";

// Read at run time beyond its imports; check.ts keys the check on them.
export const checkReads = [
  "packages/",
  "tsconfig.base.json",
  "tsconfig.paths.json",
];

const ROOT = join(import.meta.dir, "..");
const HUB = join(ROOT, "packages/hub");

/** Protocol endpoints whose client is not ours, by `METHOD path`, each with why it answers a `Response`. */
const PROTOCOL: Record<string, string> = {
  "GET /git/:repo/info/refs":
    "git smart-HTTP: git's own client reads the ref advertisement streamed from git http-backend",
  "POST /git/:repo/git-upload-pack":
    "git smart-HTTP: git's own client reads the pack stream",
  "POST /git/:repo/git-receive-pack":
    "git smart-HTTP: git's own client reads the receive-pack result stream",
  "POST /git/:repo/info/lfs/objects/batch":
    "git LFS: git-lfs reads the batch answer as application/vnd.git-lfs+json",
  "GET /git/:repo/info/lfs/objects/:oid":
    "git LFS: git-lfs downloads an object, ranged (200, 206, 416)",
  "PUT /git/:repo/info/lfs/objects/:oid":
    "git LFS: git-lfs uploads an object and reads an empty 200",
  "ALL /mcp/cawco":
    "MCP streamable HTTP: an MCP client reads the SDK transport's JSON or SSE stream",
  "ALL /mcp/fleet/:name":
    "MCP streamable HTTP: an MCP client reads a fleet server's answer, proxied through the relay",
  "ALL /ws/browser/:instance/:artifact/api/*":
    "the neko browser proxy: neko's own web client reads its REST answers, forwarded as they came",
  "GET /api/github-sign-in/app":
    "GitHub sign-in: a browser lands on this HTML page, which posts the app manifest to GitHub",
  "GET /api/github-sign-in/app/created":
    "GitHub sign-in: GitHub redirects the browser here, and it redirects on to the install page",
  "GET /api/github-sign-in/app/installed":
    "GitHub sign-in: GitHub redirects the browser here, and it reads one plain sentence",
  "GET /api/connections/oauth/callback":
    "OAuth sign-in: a provider redirects the browser here, and it reads one plain sentence",
  "POST /api/machines/ssh":
    "its 409 stays a plain Response for the frozen iOS client, whose generated client switches over the route's typed answers only (join.ts)",
};

const METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "all",
  "head",
  "options",
]);

const config = ts.getParsedCommandLineOfConfigFile(
  join(HUB, "tsconfig.json"),
  {},
  { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined }
);
if (!config) {
  throw new Error("packages/hub/tsconfig.json did not parse");
}
const SRC = join(HUB, "src/");
// Without the tsconfig's project references: their `.tsbuild` output does
// not exist in a fresh clone, and `tsconfig.paths.json` maps each
// `@cawco/*` import to source.
const program = ts.createProgram({
  rootNames: config.fileNames.filter((file) => file.startsWith(SRC)),
  options: {
    ...config.options,
    composite: false,
    declaration: false,
    emitDeclarationOnly: false,
    incremental: false,
    noEmit: true,
  },
});
const checker = program.getTypeChecker();

const isReference = (type: ts.Type): type is ts.TypeReference =>
  "target" in type;

/** What in an answer's type Eden cannot type, or undefined: `Response`, `unknown` or `any`, through a union, a `Promise`, a generator or an `ElysiaStatus`. */
const untyped = (type: ts.Type, depth = 0): string | undefined => {
  if (type === checker.getAnyType()) {
    return "any";
  }
  if (type === checker.getUnknownType()) {
    return "unknown";
  }
  if (type.isUnion()) {
    return type.types.map((member) => untyped(member, depth)).find(Boolean);
  }
  const name = type.symbol?.name;
  if (name === "Response") {
    return "Response";
  }
  if (
    depth < 4 &&
    isReference(type) &&
    (name === "Promise" ||
      name === "AsyncGenerator" ||
      name === "Generator" ||
      name === "ElysiaStatus")
  ) {
    return checker
      .getTypeArguments(type)
      .map((argument) => untyped(argument, depth + 1))
      .find(Boolean);
  }
  return undefined;
};

/** Whether `call` is made on an Elysia instance: its method is declared in the elysia package. */
const isElysiaRoute = (call: ts.CallExpression): boolean =>
  checker
    .getResolvedSignature(call)
    ?.declaration?.getSourceFile()
    .fileName.includes("/node_modules/elysia/") ?? false;

interface Found {
  at: string;
  key: string;
  what: string;
}

const found: Found[] = [];
for (const file of program.getSourceFiles()) {
  if (!file.fileName.startsWith(SRC)) {
    continue;
  }
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      METHODS.has(node.expression.name.text) &&
      node.arguments.length >= 2 &&
      isElysiaRoute(node)
    ) {
      const handler = node.arguments.at(-1);
      const path = checker.getTypeAtLocation(node.arguments[0] ?? node);
      const [signature] = handler
        ? checker.getTypeAtLocation(handler).getCallSignatures()
        : [];
      const what = signature
        ? untyped(checker.getReturnTypeOfSignature(signature))
        : undefined;
      if (what) {
        const at = file.getLineAndCharacterOfPosition(
          node.expression.name.getStart()
        );
        found.push({
          at: `${relative(ROOT, file.fileName)}:${at.line + 1}`,
          key: `${node.expression.name.text.toUpperCase()} ${path.isStringLiteral() ? path.value : `<${checker.typeToString(path)}>`}`,
          what,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
}

const problems: string[] = [];
for (const { at, key, what } of found) {
  if (!(key in PROTOCOL)) {
    problems.push(
      `${key} (${at}): its handler returns ${what}, which Eden cannot type; answer a Blob or text with its headers on \`set\`, a JSON value as the value, a failure with \`problem()\``
    );
  }
}
const foundKeys = new Set(found.map(({ key }) => key));
for (const key of Object.keys(PROTOCOL)) {
  if (!foundKeys.has(key)) {
    problems.push(
      `${key}: listed as a protocol endpoint, but no route of that method and path answers a Response, unknown or any now; remove it from PROTOCOL (scripts/route-answers-check.ts)`
    );
  }
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  console.error(
    `route answers: ${problems.length} problem${problems.length === 1 ? "" : "s"}; only a protocol endpoint whose client is not ours answers a Response (scripts/route-answers-check.ts)`
  );
  process.exit(1);
}
console.log(
  `route answers: every hub route answers a typed value, but the ${Object.keys(PROTOCOL).length} protocol endpoints`
);
