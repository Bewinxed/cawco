/**
 * What a machine's agent calls on its hub, read from the agent's source at
 * any commit: every string the agent builds a hub path from (`/api/…`,
 * `/ws…`, `/mcp…`, `/health`), as a path pattern, with where it is built.
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

/**
 * Strings in the agent that name a path on something other than its hub,
 * by file and pattern: none of them is a hub route a hub must keep.
 */
const NOT_HUB: { file: string; pattern: string; why: string }[] = [
  {
    file: "packages/agent/src/harnesses/opencode-server.ts",
    pattern: "/api/session/active",
    why: "the OpenCode server's own route, asked of the server the agent runs",
  },
  {
    file: "packages/agent/src/harnesses/opencode.ts",
    pattern: "/api/model",
    why: "the OpenCode server's own model list, read from the server the agent runs (opencode.ts `catalogRows`)",
  },
  {
    file: "packages/agent/src/harnesses/opencode.ts",
    pattern: "/api/model/default",
    why: "the OpenCode server's own default model, read from the server the agent runs",
  },
  {
    file: "packages/agent/src/harnesses/opencode.ts",
    pattern: "/api/integration",
    why: "the OpenCode server's own list of integrations, read from the server the agent runs",
  },
  {
    file: "packages/agent/src/harnesses/opencode-session.ts",
    pattern: "/mcp",
    why: "an MCP server's own endpoint as OpenCode's config names it",
  },
  {
    file: "packages/agent/src/mcp-host.ts",
    pattern: "/mcp/local/<name>",
    why: "words in an error, naming the agent's own local MCP route",
  },
  {
    file: "packages/agent/src/session.ts",
    pattern: "/mcp/local/*",
    why: "the agent's own local MCP route (mcp-host.ts), served on this machine",
  },
  {
    file: "packages/agent/src/mcp-gate.ts",
    pattern: "/mcp/gate/**",
    why: "a workspace session's MCP gate, on the agent's own gateway port (mcp-gate.ts `GATE_PREFIX`)",
  },
  {
    file: "packages/agent/src/mcp-gate.ts",
    pattern: "/mcp/gate/*/**",
    why: "a gate's server path, on the agent's own gateway port (mcp-gate.ts `gatePath`)",
  },
  {
    file: "packages/agent/src/browser/shield.ts",
    pattern: "/*",
    why: "neko's REST, on the browser container's loopback port",
  },
  {
    file: "packages/agent/src/browser/container-host.ts",
    pattern: "/health",
    why: "neko's health, on the browser container's loopback port",
  },
  {
    file: "packages/agent/src/browser/container-host.ts",
    pattern: "/api/login",
    why: "neko's sign-in, on the browser container's loopback port",
  },
  {
    file: "packages/agent/src/forges/github.ts",
    pattern: "/api/v3",
    why: "a GitHub Enterprise host's API base",
  },
];

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
const hubPathsIn = (built: string): { lines: number; pattern: string }[] =>
  [...built.matchAll(HUB_PATH), ...built.matchAll(EMBEDDED)].map((match) => ({
    pattern: patternOf(match[1] as string),
    lines: built.slice(0, match.index).split("\n").length - 1,
  }));

const isLiteral = (
  node: ts.Node
): node is
  ts.StringLiteral | ts.NoSubstitutionTemplateLiteral | ts.TemplateExpression =>
  ts.isStringLiteral(node) ||
  ts.isNoSubstitutionTemplateLiteral(node) ||
  ts.isTemplateExpression(node);

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
      // A template's own pieces are read with it, not again alone.
      if (isLiteral(node) && !ts.isTemplateSpan(node.parent)) {
        const line =
          file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
        for (const built of render(file, node, 0)) {
          for (const { pattern, lines } of hubPathsIn(built)) {
            record(path, pattern, line + lines);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return calls;
};

const git = (cwd: string, args: string[], stdin?: string): Buffer => {
  const run = Bun.spawnSync(["git", ...args], {
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
