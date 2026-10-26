/**
 * Every program that calls a CawCo tool names what it reads of the answer
 * (core tool-answer.ts): the words an agent reads, or the hub's record. A
 * tool's answer is a presenter's words; a program that parsed them for a field
 * broke silently when they changed (the stage 2 nightly at 281f78588 grepped
 * `"id"` out of artifact_create's words). So:
 *
 * 1. The tool door (`/api/delegation/call`) is named in code only by the
 *    clients that read an answer by its form (scripts/lib/tool-call.ts,
 *    packages/cli/src/tools.ts) and by what serves or passes it on unread.
 * 2. A script's JSON-RPC `tools/call` to CawCo's MCP endpoint (`/mcp/cawco`)
 *    goes through scripts/lib/tool-call.ts too. A file that only observes
 *    such calls says so: `tool-answer-check: observer`.
 * 3. No script reads `structuredContent`: CawCo's answers carry none.
 * 4. Every `cawco tool` call a script makes through a shell names its form:
 *    `--record` (the record, as one line of JSON), or a `tool answer: words`
 *    comment on it or on the line above. In shell scripts, every `cawco tool`
 *    line; in TypeScript, Bun's shell on `cawco tool …`, the binary as
 *    `${process.execPath} tool …`, or an argv list's `"tool",` (with `--record` among its next
 *    lines, or the mark within the lines above).
 *
 * Run by `bun run check`.
 */
import { Glob } from "bun";

const ROOT = new URL("..", import.meta.url).pathname;

/** Where the door may be named: the two clients, the pi bridge that hands the model the answer as given, the workspace's door that forwards it, the hub's route. */
const DOOR_OWNERS = new Set([
  "scripts/lib/tool-call.ts",
  "packages/cli/src/tools.ts",
  "packages/agent/src/delegation.ts",
  "packages/agent/src/tool-door.ts",
  "packages/hub/src/server.ts",
]);

const DOOR = "/api/delegation/call";
const MCP_ENDPOINT = "/mcp/cawco";
const RPC_CALL = /["']tools\/call["']/u;
const OBSERVER = "tool-answer-check: observer";
const COMMENT = /^\s*(\*|\/\/|\/\*)/u;
const SHELL_CALL = /\bcawco"?\s+tool\s+[a-z_]/u;
/** A TypeScript command that runs the CLI's `tool`: Bun's shell on `cawco tool …`, or the cawco binary as `${process.execPath} tool …`. */
const TS_SHELL_CALL = /(\$`\s*cawco|execPath\})\s+tool\s+(\$\{|[a-z_])/u;
/** An argv list's `"tool",` element: the CLI's tool command, its name and arguments after it. */
const ARGV_TOOL = /^\s*["']tool["'],\s*$/u;
const WORDS_MARK = /(#|\/\/)\s*tool answer:\s*words/u;
/** How far a mark above, or a `--record` below, may stand from the call it names. */
const MARK_REACH = 8;

interface Problem {
  at: string;
  line: number;
  what: string;
}

const scriptFiles = async (patterns: string[]): Promise<string[]> => {
  const found: string[] = [];
  for (const pattern of patterns) {
    for await (const path of new Glob(pattern).scan({ cwd: ROOT })) {
      if (!path.includes("node_modules/")) {
        found.push(path);
      }
    }
  }
  return found.sort();
};

/** Whether a TypeScript line that runs the CLI's `tool` names its form ({@link TS_SHELL_CALL}, {@link ARGV_TOOL}). */
const shellOutNamed = (lines: string[], index: number): boolean => {
  const line = lines[index] ?? "";
  if (line.includes("--record") || WORDS_MARK.test(line)) {
    return true;
  }
  if (
    lines
      .slice(Math.max(0, index - MARK_REACH), index)
      .some((one) => WORDS_MARK.test(one))
  ) {
    return true;
  }
  return (
    ARGV_TOOL.test(line) &&
    lines
      .slice(index + 1, index + 1 + MARK_REACH)
      .some((one) => one.includes("--record"))
  );
};

/** What one line of code does wrong, by the rules above; none when it calls nothing. */
const lineProblems = (
  path: string,
  lines: string[],
  index: number,
  file: { inScripts: boolean; mcpCaller: boolean }
): string[] => {
  const line = lines[index] ?? "";
  const found: string[] = [];
  if (line.includes(DOOR) && !DOOR_OWNERS.has(path)) {
    found.push(
      "calls the tool door itself: go through scripts/lib/tool-call.ts (toolWords or toolRecord) or the CLI's callTool, which name the form read"
    );
  }
  if (!file.inScripts) {
    return found;
  }
  if (file.mcpCaller && RPC_CALL.test(line)) {
    found.push(
      `sends a tools/call to CawCo's MCP endpoint itself: use scripts/lib/tool-call.ts with via: "mcp", or mark the file "${OBSERVER}" if it only watches calls`
    );
  }
  if (
    (TS_SHELL_CALL.test(line) || ARGV_TOOL.test(line)) &&
    !shellOutNamed(lines, index)
  ) {
    found.push(
      "runs `cawco tool` without naming its form: pass --record to read the hub's record, or put a `// tool answer: words` comment above it"
    );
  }
  if (line.includes("structuredContent")) {
    found.push(
      "reads structuredContent, which CawCo's answers no longer carry: read the record with toolRecord"
    );
  }
  return found;
};

const codeChecks = (path: string, text: string): Problem[] => {
  const lines = text.split("\n");
  const inScripts = path.startsWith("scripts/");
  const file = {
    inScripts,
    mcpCaller:
      inScripts &&
      text.includes(MCP_ENDPOINT) &&
      !text.includes(OBSERVER) &&
      path !== "scripts/lib/tool-call.ts",
  };
  return lines.flatMap((line, index) =>
    COMMENT.test(line)
      ? []
      : lineProblems(path, lines, index, file).map((what) => ({
          at: path,
          line: index + 1,
          what,
        }))
  );
};

const shellChecks = (path: string, text: string): Problem[] => {
  const problems: Problem[] = [];
  const lines = text.split("\n");
  for (const [index, line] of lines.entries()) {
    if (line.trimStart().startsWith("#") || !SHELL_CALL.test(line)) {
      continue;
    }
    const above = lines
      .slice(0, index)
      .reverse()
      .find((one) => one.trim() !== "");
    if (
      line.includes("--record") ||
      WORDS_MARK.test(line) ||
      (above !== undefined && WORDS_MARK.test(above))
    ) {
      continue;
    }
    problems.push({
      at: path,
      line: index + 1,
      what: "a `cawco tool` call that names no form: add --record to read the hub's record, or a `# tool answer: words` comment above it",
    });
  }
  return problems;
};

const code = await scriptFiles([
  "scripts/**/*.ts",
  "packages/*/src/**/*.ts",
  "apps/dashboard/src/**/*.ts",
]);
const shell = await scriptFiles(["scripts/**/*.sh"]);
const problems: Problem[] = [];
for (const path of code) {
  if (path === "scripts/tool-answer-check.ts") {
    continue;
  }
  problems.push(...codeChecks(path, await Bun.file(`${ROOT}${path}`).text()));
}
for (const path of shell) {
  problems.push(...shellChecks(path, await Bun.file(`${ROOT}${path}`).text()));
}
if (problems.length > 0) {
  for (const problem of problems) {
    console.error(`${problem.at}:${problem.line}: ${problem.what}`);
  }
  console.error(
    `tool answers: ${problems.length} caller(s) read a CawCo tool's answer without naming its form (scripts/tool-answer-check.ts)`
  );
  process.exit(1);
}
console.log(
  `tool answers: every caller of a CawCo tool in ${code.length + shell.length} files names what it reads`
);
