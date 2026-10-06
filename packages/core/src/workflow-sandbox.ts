/**
 * Everything that has to touch a program as *code*: writing it where its one
 * allowed import resolves, refusing any other import, typechecking it, and
 * evaluating its `inputs` export inside the sandbox worker.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { materializeTree, standalone } from "./runtime";
import type { Problem, WorkflowGraph, WorkflowInput } from "./workflow";
import { compileWorkflow, inputsFromZodShape } from "./workflow-compile";
import type { WorkerOut, WorkerStart } from "./workflow-worker";

/** The one module a program may import. */
const ALLOWED_IMPORTS = new Set(["zod"]);

/**
 * Programs are written inside this package's own `node_modules` so the bare
 * `zod` specifier resolves exactly as it does for the rest of the fleet, and
 * so nothing a program leaves behind lands in the source tree.
 */
const programDir = (): string => {
  if (standalone) {
    const dir = join(materializeTree("workflow"), "programs");
    mkdirSync(dir, { recursive: true });
    return dir;
  }
  const dir = new URL("../node_modules/.cawco-programs/", import.meta.url)
    .pathname;
  mkdirSync(dir, { recursive: true });
  return dir;
};

/**
 * Defined only in the published package's bundle (scripts/build-binary.ts),
 * where this module is `cli.js` and the worker — bundled on its own — and the
 * ambient declarations sit beside it.
 */
declare const __CAWCO_RELEASE__: boolean | undefined;
const RELEASE = typeof __CAWCO_RELEASE__ === "boolean";

/** The ambient declarations every program is typechecked against. */
const AMBIENT = standalone
  ? join(materializeTree("workflow"), "workflow-globals.d.ts")
  : new URL("./workflow-globals.d.ts", import.meta.url).pathname;

/** Where the hub finds the sandbox worker module. */
function workerPath(): string {
  if (standalone) {
    return "./scripts/binary/workflow-worker.js";
  }
  return RELEASE ? "./workflow-worker.js" : "./workflow-worker.ts";
}
export const WORKER_URL = new URL(workerPath(), import.meta.url).href;

const hashOf = (program: string) =>
  new Bun.CryptoHasher("sha256").update(program).digest("hex").slice(0, 32);

/** Writes the program where it can be imported; answers with its module path. */
export function writeProgram(program: string): string {
  const path = join(programDir(), `${hashOf(program)}.ts`);
  writeFileSync(path, program);
  return path;
}

/** The import specifiers a program declares, whatever the syntax. */
function importsOf(program: string): string[] {
  const file = ts.createSourceFile(
    "program.ts",
    program,
    ts.ScriptTarget.ESNext,
    true
  );
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      found.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        node.expression.getText() === "require")
    ) {
      const [argument] = node.arguments;
      found.push(
        argument && ts.isStringLiteral(argument) ? argument.text : "<computed>"
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

let cachedHost: ts.CompilerHost | undefined;

const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  allowImportingTsExtensions: true,
  types: [],
  ...(standalone ? { baseUrl: materializeTree("workflow") } : {}),
};

/**
 * Typechecks a program in the sandbox's module context. Diagnostics come back
 * as Problems carrying the 1-based line so the caller can pin them onto nodes
 * through `compileWorkflow`'s line map.
 */
export function typecheckProgram(program: string): Problem[] {
  const refusals = importsOf(program).filter(
    (specifier) => !ALLOWED_IMPORTS.has(specifier)
  );
  if (refusals.length) {
    return refusals.map((specifier) => ({
      message: `A workflow program may import zod only; this one imports ${specifier}.`,
      line: 1,
    }));
  }
  const entry = join(programDir(), "__typecheck.ts");
  cachedHost ??= ts.createCompilerHost(COMPILER_OPTIONS, true);
  const host: ts.CompilerHost = {
    ...cachedHost,
    ...(standalone
      ? {
          getDefaultLibFileName: () =>
            join(materializeTree("workflow"), "lib", "lib.esnext.d.ts"),
        }
      : {}),
    getSourceFile: (fileName, languageVersion, onError, shouldCreate) =>
      fileName === entry
        ? ts.createSourceFile(fileName, program, languageVersion, true)
        : (cachedHost as ts.CompilerHost).getSourceFile(
            fileName,
            languageVersion,
            onError,
            shouldCreate
          ),
    fileExists: (fileName) =>
      fileName === entry ||
      (cachedHost as ts.CompilerHost).fileExists(fileName),
    readFile: (fileName) =>
      fileName === entry
        ? program
        : (cachedHost as ts.CompilerHost).readFile(fileName),
  };
  const created = ts.createProgram([AMBIENT, entry], COMPILER_OPTIONS, host);
  return ts
    .getPreEmitDiagnostics(created)
    .filter((diagnostic) => diagnostic.file?.fileName === entry)
    .map((diagnostic) => {
      const line =
        diagnostic.file && diagnostic.start !== undefined
          ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
              .line + 1
          : 1;
      return {
        line,
        message: `Line ${line}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`,
      };
    });
}

/** Runs a worker to completion for one message, then terminates it. */
function askWorker(start: WorkerStart): Promise<WorkerOut> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_URL, { type: "module" });
    const finish = (settle: () => void) => {
      worker.terminate();
      settle();
    };
    worker.addEventListener("message", (event: MessageEvent<WorkerOut>) =>
      finish(() => resolve(event.data))
    );
    worker.addEventListener("error", (event) =>
      finish(() => reject(new Error(String(event.message ?? event))))
    );
    worker.postMessage(start);
  });
}

/**
 * The program's declared inputs, for the launch dialog and the slash stubs.
 * Evaluated in the sandbox — never in the hub's own module graph.
 */
export async function programInputs(program: string): Promise<WorkflowInput[]> {
  const refusals = importsOf(program).filter(
    (specifier) => !ALLOWED_IMPORTS.has(specifier)
  );
  if (refusals.length) {
    throw new Error(
      `A workflow program may import zod only; this one imports ${refusals.join(", ")}.`
    );
  }
  const message = await askWorker({
    mode: "inputs",
    path: writeProgram(program),
    runId: "inputs",
  });
  if (message.type !== "inputs") {
    throw new Error(
      message.type === "failed"
        ? message.failure.message
        : "The sandbox did not return the program's inputs."
    );
  }
  return inputsFromZodShape(
    message.shape as Parameters<typeof inputsFromZodShape>[0]
  );
}

/**
 * The program half of `validateWorkflow`: compile the graph, typecheck the
 * program, and pin every diagnostic back onto the node whose emission owns
 * that line.
 */
export function workflowProgramCheck(graph: WorkflowGraph): Problem[] {
  const compiled = compileWorkflow(graph);
  if (compiled.problems.length) {
    return compiled.problems;
  }
  const nodeAt = (line: number) =>
    Object.entries(compiled.lines).find(
      ([, [first, last]]) => line >= first && line <= last
    )?.[0];
  return typecheckProgram(compiled.program).map((problem) => ({
    ...problem,
    ...(problem.line === undefined
      ? {}
      : { nodeId: nodeAt(problem.line) ?? undefined }),
  }));
}
