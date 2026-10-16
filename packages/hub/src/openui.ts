/**
 * A view's checks (Projects spec §5.2): a project's view is an OpenUI Lang
 * program over CawCo's component library, reading the project's data only
 * through the view tools, and nothing else.
 *
 * - Parsed with `@openuidev/lang-core`'s `createParser` over the library's
 *   schema (`@cawco/core/views-spec`, generated from the library the
 *   dashboard renders with), so the hub and the renderer read a program the
 *   same way.
 * - A component the library does not have is dropped and reported by name,
 *   never invented: the parser leaves it out, and {@link readView} names it.
 * - Every `Query()` names one of the view tools ({@link VIEW_TOOLS}), as a
 *   string; there are no mutations and no actions.
 * - It cannot run code or reach the network: a URL or markup in a string, an
 *   action step (`@OpenUrl`, `@ToAssistant`, `@Run`, `@Set`, `@Reset`,
 *   `Action`), a function outside the built-ins, or an OpenUI Cloud scripts
 *   section is refused.
 * - Any other mistake the parser reports (a required prop missing, a value
 *   of the wrong type, too many arguments, no root) is refused with its own
 *   sentence, so Caw fixes it rather than the view losing a part silently.
 */
import { VIEW_TOOLS } from "@cawco/core";
import spec from "@cawco/core/views-spec";
import {
  createParser,
  type LibraryJSONSchema,
  type ParseResult,
  tokenize,
} from "@openuidev/lang-core";
import { FolderRefusal } from "./project-folder";

// lang-core's runtime telemetry is opt-in and only `generateSystemPrompt`
// sends it, which the hub never calls (the prompt is generated at build
// time); these turn it off outright for this process all the same.
process.env.OPENUI_TELEMETRY_DISABLED = "1";
process.env.DO_NOT_TRACK = "1";

/** The longest program a view may be. */
export const VIEW_SOURCE_MAX = 64 * 1024;
/** The soonest a Query may refresh itself, in seconds: a view polls the hub no faster. */
const REFRESH_MIN_S = 30;
const MAX_PROBLEMS = 8;

const parser = createParser(spec.schema as LibraryJSONSchema, spec.root);
const TOOLS = new Set<string>(VIEW_TOOLS);

/** A string that points outside the view: a scheme with `//`, a data/script/mail scheme, or a bare `www.` host. */
const URL_LIKE =
  /[a-z][a-z0-9+.-]*:\/\/|(?:^|[\s"'(])(?:data|javascript|vbscript|mailto|blob|file|tel):|(?:^|[\s"'(/])www\.[a-z0-9-]+\./i;
/** Markup in a string: a view's text is plain. */
const MARKUP = /<\s*\/?\s*[a-z!][^>]*>/i;
/** OpenUI Cloud's protocol markers: a scripts section carries code. */
const CLOUD_MARKER = "]]>openui:";
/** Action steps and the plan that runs them: a view only reads. */
const ACTIONS = new Set(["OpenUrl", "ToAssistant", "Run", "Set", "Reset"]);
/** lang-core's token kinds this reads (tokens.ts `T`, a const enum). */
const TOKEN = { Str: 14, Type: 17, BuiltinCall: 35 } as const;

/** Refuses a view with every reason, as the folder refusal its route answers (422) and its tool call reads. */
const refuse = (problems: string[]): never => {
  throw new FolderRefusal(
    422,
    problems.length === 1
      ? (problems[0] ?? "")
      : `The view has ${problems.length} problems:\n- ${problems.slice(0, MAX_PROBLEMS).join("\n- ")}`
  );
};

/** Its strings, action steps and functions that would run code or reach out. */
const unsafe = (source: string): string[] => {
  const found: string[] = [];
  for (const token of tokenize(source)) {
    const value = String(token.v ?? "");
    if (token.t === TOKEN.Str) {
      if (URL_LIKE.test(value)) {
        found.push(
          `“${value.slice(0, 60)}” is a URL: a view cannot reach the network.`
        );
      } else if (MARKUP.test(value)) {
        found.push(
          `“${value.slice(0, 60)}” holds markup: a view's text is plain.`
        );
      }
    } else if (
      (token.t === TOKEN.BuiltinCall && ACTIONS.has(value)) ||
      (token.t === TOKEN.Type && value === "Action")
    ) {
      found.push(
        `${token.t === TOKEN.BuiltinCall ? "@" : ""}${value} is an action: a view only reads, so it has none.`
      );
    }
  }
  return [...new Set(found)];
};

/** Its Queries' tools, each one of the view tools, and none refreshing faster than the hub allows; and no Mutation. */
const toolProblems = (result: ParseResult): string[] => {
  const problems: string[] = [];
  for (const query of result.queryStatements) {
    const tool = query.toolAST;
    if (tool?.k !== "Str") {
      problems.push(
        `${query.statementId} = Query(…) names its tool by an expression: name it as a string, one of ${VIEW_TOOLS.join(", ")}.`
      );
    } else if (!TOOLS.has(tool.v)) {
      problems.push(
        `${query.statementId} = Query("${tool.v}") names a tool views do not have; the tools are ${VIEW_TOOLS.join(", ")}.`
      );
    }
    const refresh = query.refreshAST;
    if (refresh && !(refresh.k === "Num" && refresh.v >= REFRESH_MIN_S)) {
      problems.push(
        `${query.statementId} refreshes every ${refresh.k === "Num" ? `${refresh.v}s` : "computed interval"}: a view refreshes every ${REFRESH_MIN_S} seconds at most often, as a number.`
      );
    }
  }
  for (const mutation of result.mutationStatements) {
    problems.push(
      `${mutation.statementId} = Mutation(…): a view only reads, so it has no mutations.`
    );
  }
  return problems;
};

/** The components the program names that the library does not have, by name, once each. */
const droppedOf = (result: ParseResult): string[] => [
  ...new Set(
    result.meta.errors
      .filter((error) => error.code === "unknown-component")
      .map((error) => error.component)
  ),
];

/** A view's program as the dashboard draws it: what it drops, by name. Never refuses: a hand edit is listed as it is. */
export const readView = (source: string): { dropped: string[] } => ({
  dropped: droppedOf(parser.parse(source)),
});

/**
 * `source` as a view, or a 422 {@link FolderRefusal} with every reason: its
 * size and code first, then its tools, then the parser's other errors. A
 * component the library does not have is not a reason: it is dropped and
 * named in `dropped`.
 */
export const checkView = (
  raw: string
): { dropped: string[]; source: string } => {
  const source = `${raw.trim()}\n`;
  if (source.length > VIEW_SOURCE_MAX) {
    refuse([
      `The view is ${source.length} characters; one is ${VIEW_SOURCE_MAX} at most.`,
    ]);
  }
  if (source.includes(CLOUD_MARKER)) {
    refuse([
      `The view carries OpenUI Cloud markers (${CLOUD_MARKER}…): a view is a program alone, and runs no scripts.`,
    ]);
  }
  const found = unsafe(source);
  if (found.length) {
    refuse(found);
  }
  const result = parser.parse(source);
  const tools = toolProblems(result);
  if (tools.length) {
    refuse(tools);
  }
  const mistakes = result.meta.errors
    .filter((error) => error.code !== "unknown-component")
    .map((error) =>
      error.statementId
        ? `${error.statementId}: ${error.message}`
        : error.message
    );
  if (!result.root && mistakes.length === 0) {
    mistakes.push(
      `The view draws nothing: it needs root = ${spec.root}(…), reaching every part of it.`
    );
  }
  if (mistakes.length) {
    refuse([...new Set(mistakes)]);
  }
  return { source, dropped: droppedOf(result) };
};

/** What Caw reads to write a view: the system prompt generated from the library and the tools. */
export const VIEW_PROMPT: string = spec.prompt;
