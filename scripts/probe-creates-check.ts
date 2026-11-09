/**
 * Part of `bun run check`: every `artifact_create` a probe makes names its
 * `title`, which the tool requires (hub artifacts/tools.ts `artifactCreate`,
 * since bff305589). Three specs in a day broke on the host with "title is
 * required" (graph-stage, decision-restart, setup-send) because nothing
 * here refused a create without one. The probes reach the tool through many
 * helpers (`ToolCalls.call`, a spec's own `call(CREATE, …)`, `calls.ask`
 * with `{ name, input }`), each typed with a plain `object` input, so no one
 * type holds them; this reads the call sites instead.
 *
 * Over scripts/probe-kit/ and scripts/scratch-fleet.ts, an object literal is
 * a create's input when it is:
 *
 * 1. the argument after the tool's name in a call: a string ending in
 *    `artifact_create`, or a module constant holding one;
 * 2. the `input` of a literal whose `name` is the tool's name; or
 * 3. a literal with both `kind` and `does` in a file that names the tool,
 *    outside a `.api(…)` or `.sessionApi(…)` call (Eden's client, which holds
 *    it to what its route takes, and that takes no title of necessity).
 *
 * Each must hold `title`, or a spread (`{ ...input }`, whose own literal is
 * read where it is written). A leg that proves the refusal writes
 * `title: undefined`, which JSON leaves out.
 *
 * The release pipeline's shell proofs (scripts/binary/*.sh) call the tool as
 * a session does, `cawco tool artifact_create … '<json>'`: each such command,
 * its continued lines joined, must name a `"title"` key. Two of
 * prove-stage2.sh's (the sshadd rig's preview and the workspace rigs'
 * `ws_preview_open`) went without one and failed the ship of 7f23cb06e at
 * stage 2 with "title is required".
 *
 *   bun scripts/probe-creates-check.ts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = join(import.meta.dir, "..");
/** A probe's call through Eden: `fleet.api(…)` and `fleet.sessionApi(…)`. */
const HUB_CALLS = /^(?:api|sessionApi)/u;
const TOOL = /artifact_create$/u;
const NAMES_TOOL = /artifact_create/u;

const filesUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === "node_modules" || name === "fixtures"
        ? []
        : filesUnder(path);
    }
    return path.endsWith(".ts") ? [path] : [];
  });

const keyOf = (property: ts.ObjectLiteralElementLike): string | null => {
  const { name } = property;
  if (!name) {
    return null;
  }
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;
};

/** Each module constant holding a string, by its name. */
const stringsOf = (source: ts.SourceFile): Map<string, string> => {
  const strings = new Map<string, string>();
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    for (const one of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(one.name) &&
        one.initializer &&
        ts.isStringLiteralLike(one.initializer)
      ) {
        strings.set(one.name.text, one.initializer.text);
      }
    }
  }
  return strings;
};

/** The places in `file` where a create's input literal names no title. */
export const untitledCreates = (file: string, text: string): string[] => {
  if (!NAMES_TOOL.test(text)) {
    return [];
  }
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const strings = stringsOf(source);
  const isTool = (node: ts.Node | undefined): boolean => {
    if (!node) {
      return false;
    }
    if (ts.isStringLiteralLike(node)) {
      return TOOL.test(node.text);
    }
    return ts.isIdentifier(node) && TOOL.test(strings.get(node.text) ?? "");
  };
  const inputs = new Set<ts.ObjectLiteralExpression>();
  const insideApi = (node: ts.Node): boolean => {
    for (let up = node.parent; up; up = up.parent) {
      if (
        ts.isCallExpression(up) &&
        ts.isPropertyAccessExpression(up.expression) &&
        HUB_CALLS.test(up.expression.name.text)
      ) {
        return true;
      }
      // The arrow handed to `.api((hub) => …)` holds the call; any other function ends the search.
      if (
        ts.isFunctionLike(up) &&
        !(ts.isArrowFunction(up) && up.parent && ts.isCallExpression(up.parent))
      ) {
        return false;
      }
    }
    return false;
  };
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      node.arguments.forEach((argument, at) => {
        const next = node.arguments[at + 1];
        if (isTool(argument) && next && ts.isObjectLiteralExpression(next)) {
          inputs.add(next);
        }
      });
    }
    if (ts.isObjectLiteralExpression(node)) {
      const named = new Map(
        node.properties.flatMap((property) => {
          const key = keyOf(property);
          return key ? [[key, property] as const] : [];
        })
      );
      const name = named.get("name");
      const input = named.get("input");
      if (
        name &&
        ts.isPropertyAssignment(name) &&
        isTool(name.initializer) &&
        input &&
        ts.isPropertyAssignment(input) &&
        ts.isObjectLiteralExpression(input.initializer)
      ) {
        inputs.add(input.initializer);
      }
      if (named.has("kind") && named.has("does") && !insideApi(node)) {
        inputs.add(node);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...inputs].flatMap((literal) => {
    const titled = literal.properties.some(
      (property) =>
        ts.isSpreadAssignment(property) || keyOf(property) === "title"
    );
    if (titled) {
      return [];
    }
    const { line } = source.getLineAndCharacterOfPosition(literal.getStart());
    return [`${relative(ROOT, file)}:${line + 1}`];
  });
};

const SHELL_CREATE = /\btool\s+artifact_create\b/u;
const SHELL_TITLE = /\\?"title\\?"\s*:/u;
const SHELL_COMMENT = /^\s*#/u;

/** The lines in a shell `file` whose `cawco tool artifact_create` command names no title key. */
export const untitledShellCreates = (file: string, text: string): string[] => {
  const lines = text.split("\n");
  const refused: string[] = [];
  lines.forEach((line, at) => {
    if (!SHELL_CREATE.test(line) || SHELL_COMMENT.test(line)) {
      return;
    }
    let command = line;
    for (let next = at; lines[next]?.trimEnd().endsWith("\\"); next += 1) {
      command += `\n${lines[next + 1] ?? ""}`;
    }
    if (!SHELL_TITLE.test(command)) {
      refused.push(`${relative(ROOT, file)}:${at + 1}`);
    }
  });
  return refused;
};

/** Planted shell creates after a comment: the first two calls (lines 2 and 4) name no title, the last two do. */
const PLANTED_SHELL = `# a comment naming tool artifact_create is no call
cawco tool artifact_create \\
  "{\\"kind\\":\\"preview\\",\\"does\\":\\"try\\",\\"name\\":\\"a\\"}"
f() { cawco tool artifact_create --record '{"kind":"preview","does":"try","name":"b"}'; }
cawco tool artifact_create \\
  "{\\"kind\\":\\"preview\\",\\"title\\":\\"Titled\\",\\"name\\":\\"c\\"}"
g() { cawco tool artifact_create --record '{\\"title\\":\\"Titled\\",\\"name\\":\\"d\\"}'; }`;

const shellFilesUnder = (dir: string): string[] =>
  readdirSync(dir)
    .filter((name) => name.endsWith(".sh"))
    .map((name) => join(dir, name));

/** Planted mistakes, one of each form, and a titled create beside them: the check finds the first three and nothing else. */
const PLANTED = `const CREATE = "mcp__cawco__artifact_create";
await calls.call(fleet, session, CREATE, { kind: "page", name: "a", ask: "x" });
calls.ask("1", { name: "artifact_create", input: { kind: "page", name: "b" } });
const input = { kind: "page", does: "pick", name: "c" };
await call(CREATE, { kind: "page", does: "pick", title: "Titled", name: "d" });
await fleet.api((hub) => hub.api.instances({ id: "s" }).artifacts.post({ kind: "page", does: "pick", name: "e" }));`;

if (import.meta.main) {
  const planted = untitledCreates(join(ROOT, "planted.ts"), PLANTED);
  if (planted.join() !== "planted.ts:2,planted.ts:3,planted.ts:4") {
    console.error(
      `probe-creates: the planted mistakes read as ${planted.join(", ") || "none"}, not lines 2, 3 and 4`
    );
    process.exit(1);
  }
  const plantedShell = untitledShellCreates(
    join(ROOT, "planted.sh"),
    PLANTED_SHELL
  );
  if (plantedShell.join() !== "planted.sh:2,planted.sh:4") {
    console.error(
      `probe-creates: the planted shell mistakes read as ${plantedShell.join(", ") || "none"}, not lines 2 and 4`
    );
    process.exit(1);
  }
  const shells = shellFilesUnder(join(ROOT, "scripts/binary"));
  const files = [
    ...filesUnder(join(ROOT, "scripts/probe-kit")),
    join(ROOT, "scripts/scratch-fleet.ts"),
    ...shells,
  ];
  const refused = files.flatMap((file) => {
    const text = readFileSync(file, "utf8");
    return file.endsWith(".sh")
      ? untitledShellCreates(file, text)
      : untitledCreates(file, text);
  });
  if (refused.length > 0) {
    console.error(
      `probe-creates: ${refused.length} artifact_create input(s) name no title, which the tool requires (write the title; a leg proving the refusal writes \`title: undefined\`):`
    );
    for (const at of refused) {
      console.error(`  ${at}`);
    }
    process.exit(1);
  }
  console.log(
    `probe-creates: every artifact_create input in ${files.length} probe files names its title`
  );
}
