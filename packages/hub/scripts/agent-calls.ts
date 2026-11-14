/**
 * What a machine's agent calls on its hub, read from the agent's source at
 * any commit: every string the agent builds a hub path from (`/api/…`,
 * `/ws…`, `/mcp…`, `/health`), every chain it asks the hub's typed client
 * along (`client.api.lfs.projects({ id }).get()`), and every route literal
 * an older agent named to core's request door, since deleted
 * (`"GET /api/agents/:machineId"`, nightlies up to 7813), as a path pattern,
 * with where it is built.
 *
 * A path built from pieces is folded where its pieces are consts of the same
 * file: nightly 4670 asked `${hub}/api/binary-updates/${path}`, `path` a
 * `const` of `"latest"` or `"release"`, and that is two calls, each of which
 * a hub must still answer. A piece that is not a const string is a segment
 * any value may fill (`*`).
 *
 * Read off the source, not a running agent, so an agent shipped before this
 * file existed is read the same way as one built now (openapi.ts holds the
 * hub to every published nightly's agent).
 */
// The compiler openapi.ts reads the hub with: the schema generator's own,
// which has the classic parser API (the repository's TypeScript 7 does not).
import { ts } from "typescript-json-schema";
import { NOT_HUB } from "./not-hub";

/** The agent's source, from the repository's root. */
export const AGENT_SOURCE = "packages/agent/src";
const TEST_FILE = /\.(test|spec)\.ts$|\/__tests__\//u;
/** Where a hub path starts in a built string: at its start, or right after a piece (`${hub}`). */
const HUB_PATH = /(?:^|\0)(\/(?:api|ws|mcp|health)(?=[/?#\0]|$)[^\s"'`?#]*)/gu;
/** A piece of a path that is not a known string. */
const PIECE = "\0";
/** No string folds to more paths than this: past it, the piece is any value. */
const MAX_VARIANTS = 16;
const MAX_DEPTH = 4;

export interface SourceFile {
  path: string;
  text: string;
}

/** Every call: its pattern, and each place (`file:line`) that builds it. */
export type AgentCalls = Map<string, string[]>;

/** The initializer of the `const` that `name` names where `at` reads it: the nearest block's, outward. */
const constAt = (at: ts.Node, name: string): ts.Expression | undefined => {
  for (let scope = at.parent; scope; scope = scope.parent) {
    if (!(ts.isBlock(scope) || ts.isSourceFile(scope))) {
      continue;
    }
    for (const statement of scope.statements) {
      if (!(
        ts.isVariableStatement(statement) &&
        statement.declarationList.getFirstToken()?.kind ===
          ts.SyntaxKind.ConstKeyword
      )) {
        continue;
      }
      const declared = statement.declarationList.declarations.find(
        (one) => ts.isIdentifier(one.name) && one.name.text === name
      );
      if (declared) {
        return declared.initializer;
      }
    }
  }
};

/** The const string values the identifier holds, or undefined when it is not one. */
const constValues = (
  file: ts.SourceFile,
  node: ts.Identifier,
  depth: number
): string[] | undefined => {
  const initializer = constAt(node, node.text);
  if (!initializer) {
    return;
  }
  const values = render(file, initializer, depth + 1);
  return values.some((value) => value.includes(PIECE)) ? undefined : values;
};

/** What an expression may be as a string: each value, a piece (`\0`) where it is not known. */
function render(
  file: ts.SourceFile,
  node: ts.Expression,
  depth: number
): string[] {
  if (depth > MAX_DEPTH) {
    return [PIECE];
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return [node.text];
  }
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node)
  ) {
    return render(file, node.expression, depth);
  }
  if (ts.isConditionalExpression(node)) {
    return [
      ...render(file, node.whenTrue, depth),
      ...render(file, node.whenFalse, depth),
    ].slice(0, MAX_VARIANTS);
  }
  if (ts.isIdentifier(node)) {
    return constValues(file, node, depth) ?? [PIECE];
  }
  if (ts.isTemplateExpression(node)) {
    let variants = [node.head.text];
    for (const span of node.templateSpans) {
      const pieces = render(file, span.expression, depth);
      const next = variants.flatMap((before) =>
        pieces.map((piece) => `${before}${piece}${span.literal.text}`)
      );
      variants =
        next.length > MAX_VARIANTS
          ? variants.map((before) => `${before}${PIECE}${span.literal.text}`)
          : next;
    }
    return variants;
  }
  return [PIECE];
}

/**
 * A hub path quoted inside a string that is itself code: the OpenCode
 * plugin's source, which the agent writes out and OpenCode runs
 * (`cawcoBase + "/api/instances"`).
 */
const EMBEDDED = /["'](\/(?:api|ws|mcp|health)(?=[/?#"']|$)[^\s"'`?#]*)/gu;
/** A route literal of core's former request door, which shipped agents up to nightly 7813 named: its method, then the path as the hub declares it. */
const DOOR_ROUTE = /^(?:GET|POST|PUT|PATCH|DELETE) (\/[^\s\0]*)$/u;

/**
 * A built path as a pattern: each segment a piece touches is `*`; a path
 * that ends in `/`, more joined on after it, ends in `**`, any segments.
 */
const patternOf = (path: string): string => {
  const segments = path.split("/");
  const last = segments.length - 1;
  return segments
    .map((segment, index) => {
      if (segment === "" && index === last && index > 1) {
        return "**";
      }
      return segment.includes(PIECE) ? "*" : segment;
    })
    .join("/");
};

/**
 * The hub paths in one built string: each one's pattern, and how many lines
 * into the string it is (code the agent writes out spans lines).
 */
const hubPathsIn = (built: string): { lines: number; pattern: string }[] => {
  // A route as core's former request door named it (`"GET /api/agents/:machineId"`):
  // each parameter is a segment any value fills.
  const route = DOOR_ROUTE.exec(built)?.[1];
  if (route) {
    return [
      {
        pattern: route
          .split("/")
          .map((segment) => (segment.startsWith(":") ? "*" : segment))
          .join("/"),
        lines: 0,
      },
    ];
  }
  return [...built.matchAll(HUB_PATH), ...built.matchAll(EMBEDDED)].map(
    (match) => ({
      pattern: patternOf(match[1] as string),
      lines: built.slice(0, match.index).split("\n").length - 1,
    })
  );
};

const isLiteral = (
  node: ts.Node
): node is
  ts.StringLiteral | ts.NoSubstitutionTemplateLiteral | ts.TemplateExpression =>
  ts.isStringLiteral(node) ||
  ts.isNoSubstitutionTemplateLiteral(node) ||
  ts.isTemplateExpression(node);

/**
 * The agent's own local-URL helper (delegation.ts `harnessMcpUrl`) builds a
 * URL on this machine's gateway. The gateway relays most of what it is asked
 * to the hub (`/api/delegation/…`, `/mcp/cawco`, `/mcp/fleet/…`), and
 * answers the hosted MCP servers itself (mcp-oauth.ts `hostedRoutes`:
 * mcp-host.ts `HOSTED_PATH`, mcp-gate.ts `GATE_PATH`), which no hub route
 * ever answers.
 */
const LOCAL_URL_HELPER = "harnessMcpUrl";
const GATEWAY_OWN = /^\/mcp\/(?:local|gate)\//u;

/** Whether `node` is an argument of a call to the local-URL helper. */
const isLocalUrl = (node: ts.Node): boolean =>
  ts.isCallExpression(node.parent) &&
  ts.isIdentifier(node.parent.expression) &&
  node.parent.expression.text === LOCAL_URL_HELPER &&
  node.parent.arguments.includes(node as ts.Expression);

/**
 * The hub's typed client (`@cawco/hub/client`): a client is built by
 * `hubClient(…)` and typed `HubClient`. Its routes alone, for an address
 * handed on, are `hubRoutes` (read by the `hubPath` function), and were
 * `hubPath` itself in the agent's own hub-client.ts of nightly 7813, read by
 * `["~path"]`.
 */
const CLIENT_MAKER = "hubClient";
const CLIENT_TYPE = "HubClient";
const ROUTES_ONLY = new Set(["hubRoutes", "hubPath"]);
/** Eden's member that answers a chain's path: no segment, the chain's end. */
const PATH_MEMBER = "~path";
/** The members that send a request at the end of a client's chain (Eden treaty2's methods), not path segments. */
const EDEN_METHODS = new Set([
  "get",
  "post",
  "put",
  "delete",
  "patch",
  "query",
  "options",
  "head",
  "connect",
  "subscribe",
]);

/** The function or variable `statements` declare by `name`. */
const declaredIn = (
  statements: readonly ts.Statement[],
  name: string
): ts.VariableDeclaration | ts.FunctionDeclaration | undefined => {
  for (const statement of statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) {
      return statement;
    }
    const declared = ts.isVariableStatement(statement)
      ? statement.declarationList.declarations.find(
          (one) => ts.isIdentifier(one.name) && one.name.text === name
        )
      : undefined;
    if (declared) {
      return declared;
    }
  }
};

/** The declaration `name` binds where `at` reads it: a parameter, a variable or a function, the nearest scope's, outward. */
const bindingAt = (
  at: ts.Node,
  name: string
):
  | ts.ParameterDeclaration
  | ts.VariableDeclaration
  | ts.FunctionDeclaration
  | undefined => {
  for (let scope = at.parent; scope; scope = scope.parent) {
    const bound =
      (ts.isFunctionLike(scope)
        ? scope.parameters.find(
            (one) => ts.isIdentifier(one.name) && one.name.text === name
          )
        : undefined) ??
      (ts.isBlock(scope) || ts.isSourceFile(scope)
        ? declaredIn(scope.statements, name)
        : undefined);
    if (bound) {
      return bound;
    }
  }
};

/** Whether `type` is written as the client's type. */
const namesClientType = (type: ts.TypeNode | undefined): boolean =>
  type !== undefined &&
  ts.isTypeReferenceNode(type) &&
  ts.isIdentifier(type.typeName) &&
  type.typeName.text === CLIENT_TYPE;

/** Whether `node` makes a client: `hubClient(…)`. */
const makesClient = (node: ts.Node): boolean =>
  ts.isCallExpression(node) &&
  ts.isIdentifier(node.expression) &&
  node.expression.text === CLIENT_MAKER;

/**
 * Whether the untyped parameter `parameter` is handed a client: its function
 * is an argument of a call to a function of the same file whose parameter
 * there is typed `(client: HubClient) => …` (binary-update.ts `askHub`,
 * host-lfs.ts `askHub`).
 */
const handedClient = (parameter: ts.ParameterDeclaration): boolean => {
  const fn = parameter.parent;
  const call = fn.parent;
  if (!(
    (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) &&
    fn.parameters.indexOf(parameter) === 0 &&
    ts.isCallExpression(call) &&
    ts.isIdentifier(call.expression)
  )) {
    return false;
  }
  const callee = bindingAt(call, call.expression.text);
  const declared =
    callee && ts.isVariableDeclaration(callee) ? callee.initializer : callee;
  if (!(
    declared &&
    (ts.isFunctionDeclaration(declared) ||
      ts.isArrowFunction(declared) ||
      ts.isFunctionExpression(declared))
  )) {
    return false;
  }
  const taking = declared.parameters[call.arguments.indexOf(fn)]?.type;
  return (
    taking !== undefined &&
    ts.isFunctionTypeNode(taking) &&
    namesClientType(taking.parameters[0]?.type)
  );
};

/** Whether `node` is a client, or the client's routes, that a chain of the hub's routes starts from. */
const isClientRoot = (node: ts.Node): boolean => {
  if (makesClient(node)) {
    return true;
  }
  if (!ts.isIdentifier(node)) {
    return false;
  }
  if (ROUTES_ONLY.has(node.text)) {
    return (
      ts.isPropertyAccessExpression(node.parent) &&
      node.parent.expression === node
    );
  }
  // Only where it is read: not a declaration's own name, nor a member's.
  if (
    (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) ||
    (ts.isParameter(node.parent) && node.parent.name === node) ||
    (ts.isVariableDeclaration(node.parent) && node.parent.name === node)
  ) {
    return false;
  }
  const bound = bindingAt(node, node.text);
  if (!bound || ts.isFunctionDeclaration(bound)) {
    return false;
  }
  if (namesClientType(bound.type)) {
    return true;
  }
  if (ts.isVariableDeclaration(bound)) {
    return bound.initializer !== undefined && makesClient(bound.initializer);
  }
  return bound.type === undefined && handedClient(bound);
};

/** The chain goes no further: `up` is not a member or a call of it. */
const STOP = Symbol("stop");
/** The chain ends at `up`: a method that sends it, or Eden's `["~path"]`. */
const END = Symbol("end");

/** What `up`, read off `at`, adds to a chain whose last segment is `last`: a segment, its end, or nothing. */
const edenStep = (
  at: ts.Node,
  up: ts.Node,
  last: string | undefined
): string | typeof STOP | typeof END => {
  if (ts.isPropertyAccessExpression(up) && up.expression === at) {
    return up.name.text;
  }
  if (ts.isElementAccessExpression(up) && up.expression === at) {
    const key = up.argumentExpression;
    if (!(ts.isStringLiteral(key) || ts.isNoSubstitutionTemplateLiteral(key))) {
      return "*";
    }
    return key.text === PATH_MEMBER ? END : key.text;
  }
  if (ts.isCallExpression(up) && up.expression === at) {
    return last !== undefined && EDEN_METHODS.has(last) ? END : "*";
  }
  return STOP;
};

/**
 * The route a chain on a client names, as a path pattern: each member a segment (`.api.lfs`, `["binary-updates"]`), each
 * call with a path's parameter (`projects({ id })`) a segment any value fills
 * (`*`), as Eden treaty2 builds the path, up to the method that sends it
 * (`.get(…)`), which is no segment. A member Eden does not know by its name
 * (`[key]`) is any segment.
 */
const edenRoute = (root: ts.Expression): string | undefined => {
  const segments: string[] = [];
  let at: ts.Node = root;
  for (;;) {
    const up: ts.Node = at.parent;
    const step = edenStep(at, up, segments.at(-1));
    if (step === STOP) {
      break;
    }
    if (step === END) {
      // The method that sends it is no segment.
      if (ts.isCallExpression(up)) {
        segments.pop();
      }
      break;
    }
    segments.push(step);
    at = up;
  }
  return segments.length ? `/${segments.join("/")}` : undefined;
};

/** The hub paths a string or template builds, when `node` is one (a template's own pieces are read with it, not again alone). */
const builtCalls = (
  file: ts.SourceFile,
  node: ts.Node
): { lines: number; pattern: string }[] => {
  if (!isLiteral(node) || ts.isTemplateSpan(node.parent)) {
    return [];
  }
  const local = isLocalUrl(node);
  return render(file, node, 0)
    .filter((built) => !(local && GATEWAY_OWN.test(built)))
    .flatMap(hubPathsIn);
};

/** Every hub call the agent's source builds. */
export const agentCalls = (files: SourceFile[]): AgentCalls => {
  const calls: AgentCalls = new Map();
  const record = (path: string, pattern: string, line: number): void => {
    if (NOT_HUB.some((one) => one.file === path && one.pattern === pattern)) {
      return;
    }
    const sites = calls.get(pattern) ?? [];
    sites.push(`${path}:${line}`);
    calls.set(pattern, sites);
  };
  for (const { path, text } of files) {
    const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      const line =
        file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
      for (const { pattern, lines } of builtCalls(file, node)) {
        record(path, pattern, line + lines);
      }
      const route =
        ts.isExpression(node) && isClientRoot(node)
          ? edenRoute(node)
          : undefined;
      if (route) {
        record(path, route, line);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return calls;
};

const git = (cwd: string, args: string[], stdin?: string): Buffer => {
  const run = Bun.spawnSync(["git", ...args], {
    env: process.env,
    cwd,
    stdin: stdin === undefined ? undefined : new TextEncoder().encode(stdin),
    stderr: "pipe",
  });
  if (run.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")}: ${run.stderr.toString().trim()}`);
  }
  return run.stdout;
};

/** Blobs read once a process, by id: shipped builds share most of the agent. */
const blobs = new Map<string, string>();

/** The agent's source as `commit` holds it. */
export const agentSourceAt = (cwd: string, commit: string): SourceFile[] => {
  // From the repository's root whatever `cwd` is: ls-tree reads a path from where it runs.
  const listed = git(cwd, [
    "ls-tree",
    "-r",
    "--full-tree",
    commit,
    "--",
    AGENT_SOURCE,
  ])
    .toString()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [meta, path] = line.split("\t") as [string, string];
      return { path, sha: meta.split(" ")[2] as string };
    })
    .filter(({ path }) => path.endsWith(".ts") && !TEST_FILE.test(path));
  const unread = [...new Set(listed.map(({ sha }) => sha))].filter(
    (sha) => !blobs.has(sha)
  );
  if (unread.length) {
    const out = git(cwd, ["cat-file", "--batch"], `${unread.join("\n")}\n`);
    let at = 0;
    while (at < out.length) {
      const end = out.indexOf(10, at);
      const [sha, , size] = out.subarray(at, end).toString().split(" ");
      const start = end + 1;
      const length = Number(size);
      blobs.set(sha as string, out.subarray(start, start + length).toString());
      at = start + length + 1;
    }
  }
  return listed.map(({ path, sha }) => ({
    path,
    text: blobs.get(sha) ?? "",
  }));
};

/** A hub route as its table lists it: a method and an Elysia path (`:param`, `*`). */
export interface HubRoute {
  method: string;
  path: string;
}

/**
 * The routes that answer `pattern`. A segment of the hub's that is a
 * parameter takes anything; a `*` of the agent's (a value not known from its
 * source) takes any segment of the hub's. A catch-all route at the root (the
 * dashboard's pages) answers nothing an agent asks.
 */
export const routesFor = (routes: HubRoute[], pattern: string): HubRoute[] => {
  const asked = pattern.split("/").filter(Boolean);
  return routes.filter(({ path }) => {
    const served = path.split("/").filter(Boolean);
    if (served[0] === "*") {
      return false;
    }
    for (const [index, segment] of served.entries()) {
      if (segment === "*") {
        return index > 0;
      }
      const wanted = asked[index];
      // The agent joins more on after this: any segments the hub's has left.
      if (wanted === "**") {
        return true;
      }
      if (
        wanted === undefined ||
        !(segment.startsWith(":") || wanted === "*" || wanted === segment)
      ) {
        return false;
      }
    }
    return served.length === asked.length;
  });
};
