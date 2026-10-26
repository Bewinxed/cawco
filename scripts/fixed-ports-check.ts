/**
 * `bun scripts/fixed-ports-check.ts` (part of `bun run check`): no port
 * CawCo listens on at a fixed number lies in Linux's ephemeral range,
 * 32768–60999 ("The default values are 32768 and 60999 respectively",
 * kernel Documentation/networking/ip-sysctl.rst, `ip_local_port_range`),
 * where any socket the kernel gives a port to (a `port: 0` listener, an
 * outgoing connection) can hold it first. On 2026-10-26 an agent's loop
 * watch echo took the MCP gateway's port that way, while the gateway sat in
 * that range, and the agent stayed up without it (7c27d1a31).
 * `ip_local_reserved_ports` would fence a port off from those picks, but it
 * is a root step on each machine, not CawCo's to take.
 *
 * Every `*_PORT` and `*_PORTS` constant in packages/ is read: each number in
 * its value (a `{ first, last }` object as the range it is), never inside a
 * function in it. One in the range fails, unless {@link ALLOWED} holds it
 * with why. Every other one must also lie outside the stage ports (agent
 * stage.ts `STAGE_PORTS`), which a stage hashes into. Prints
 * `file:line: NAME = value`; exits 1 on any.
 */
import { join } from "node:path";
import ts from "typescript";

const ROOT = join(import.meta.dir, "..");
const EPHEMERAL = { first: 32_768, last: 60_999 } as const;
const STAGE = { file: "packages/agent/src/stage.ts", name: "STAGE_PORTS" };
const NAMED = /_PORTS?$/u;
/** A key naming a `[first, last]` span. */
const RANGE_KEY = /range$/iu;

/** Ports in {@link EPHEMERAL} CawCo keeps on purpose, each with why. */
const ALLOWED: { first: number; last: number; why: string }[] = [
  {
    first: 59_000,
    last: 59_100,
    why: "neko's own UDP fallback range (agent browser/container-host.ts), inside its container's network namespace, where no host socket's kernel-picked port lands; CawCo always sets a mux, so neko never falls back to it",
  },
];

interface Found {
  at: string;
  first: number;
  last: number;
  name: string;
}

const listed =
  await Bun.$`git ls-files --cached --others --exclude-standard -- ${"packages/*.ts"}`
    .cwd(ROOT)
    .quiet();
const files = listed.stdout
  .toString()
  .split("\n")
  .filter(
    (path) =>
      path && !path.includes("node_modules/") && !path.endsWith(".test.ts")
  );

interface Span {
  first: number;
  last: number;
}

/** A literal number. */
const numberOf = (node: ts.Node | undefined): number | undefined =>
  node && ts.isNumericLiteral(node) ? Number(node.text) : undefined;

/** `{ first: a, last: b }`, or `[a, b]` under a key that ends in `range`, as the span it is. */
const spanOf = (node: ts.Node): Span | undefined => {
  if (ts.isObjectLiteralExpression(node)) {
    const read = (key: string): number | undefined =>
      numberOf(
        node.properties.find(
          (one): one is ts.PropertyAssignment =>
            ts.isPropertyAssignment(one) &&
            ts.isIdentifier(one.name) &&
            one.name.text === key
        )?.initializer
      );
    const first = read("first");
    const last = read("last");
    return first === undefined || last === undefined
      ? undefined
      : { first, last };
  }
  if (
    ts.isArrayLiteralExpression(node) &&
    node.elements.length === 2 &&
    ts.isPropertyAssignment(node.parent) &&
    ts.isIdentifier(node.parent.name) &&
    RANGE_KEY.test(node.parent.name.text)
  ) {
    const first = numberOf(node.elements[0]);
    const last = numberOf(node.elements[1]);
    return first === undefined || last === undefined
      ? undefined
      : { first, last };
  }
};

/** The ports a constant's value names, each span whole, never inside a function in it. */
const portsIn = (node: ts.Node, out: Span[]): void => {
  if (ts.isFunctionLike(node)) {
    return;
  }
  const span = spanOf(node);
  if (span) {
    out.push(span);
    return;
  }
  const port = numberOf(node);
  if (port !== undefined) {
    out.push({ first: port, last: port });
    return;
  }
  ts.forEachChild(node, (child) => portsIn(child, out));
};

const found: Found[] = [];
let stage: Found | undefined;
await Promise.all(
  files.map(async (file) => {
    const text = await Bun.file(join(ROOT, file)).text();
    if (!text.includes("_PORT")) {
      return;
    }
    const source = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true
    );
    const visit = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        NAMED.test(node.name.text) &&
        node.initializer
      ) {
        const at = `${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
        const name = node.name.text;
        const value = ts.isAsExpression(node.initializer)
          ? node.initializer.expression
          : node.initializer;
        const spans: Span[] = [];
        portsIn(value, spans);
        for (const span of spans) {
          const one = { at, name, ...span };
          found.push(one);
          if (file === STAGE.file && name === STAGE.name) {
            stage = one;
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  })
);

const overlaps = (
  a: { first: number; last: number },
  b: { first: number; last: number }
): boolean => a.first <= b.last && b.first <= a.last;
const spelled = (one: { first: number; last: number }): string =>
  one.first === one.last ? `${one.first}` : `${one.first}–${one.last}`;

const ephemeral = found.filter(
  (one) =>
    overlaps(one, EPHEMERAL) &&
    !ALLOWED.some(
      (allowed) => one.first >= allowed.first && one.last <= allowed.last
    )
);
const inStage = stage
  ? found.filter(
      (one) =>
        one !== stage &&
        !one.at.startsWith(`${STAGE.file}:`) &&
        overlaps(one, stage as Found)
    )
  : [];

if (!stage) {
  console.log(
    `${STAGE.name} is not a { first, last } constant in ${STAGE.file} any more: say here where the stage ports are.`
  );
  process.exit(1);
}
if (ephemeral.length > 0 || inStage.length > 0) {
  if (ephemeral.length > 0) {
    console.log(
      `A fixed port in Linux's ephemeral range (${EPHEMERAL.first}–${EPHEMERAL.last}) can be taken first by any socket the kernel picks a port for. Move it below ${EPHEMERAL.first}, or add it to ALLOWED in scripts/fixed-ports-check.ts with why:\n${ephemeral
        .map((one) => `  ${one.at}: ${one.name} = ${spelled(one)}`)
        .join("\n")}`
    );
  }
  if (inStage.length > 0) {
    console.log(
      `A fixed port inside the stage ports (${STAGE.file} ${STAGE.name}, ${spelled(stage)}) can be the one a stage hashes to. Move it out of that range:\n${inStage
        .map((one) => `  ${one.at}: ${one.name} = ${spelled(one)}`)
        .join("\n")}`
    );
  }
  process.exit(1);
}
console.log(
  `fixed ports: ${found.length} read in ${files.length} files; none in ${EPHEMERAL.first}–${EPHEMERAL.last} but ${ALLOWED.map(spelled).join(", ")}, none in the stage ports ${spelled(stage)}`
);
