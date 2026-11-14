/**
 * Part of `bun run check`: every request body a shell script sends the hub
 * is one its route takes. The hub refuses a field its route doesn't take
 * (hub server.ts `normalize: false`, unknown-fields.ts), and the release
 * rigs reach it from shell, where no type holds the body: the nightly from
 * b67643b96 failed stage 2 because e2e-test.sh still sent `checks` on a
 * work item, which the hub stopped taking in 5566833f4 and, until it was
 * strict, dropped.
 *
 * Over every tracked `.sh` file outside artifacts/ (evaluation rigs that
 * call no hub), each send is read where it is written:
 * - a `curl` (or a helper passing its arguments on to one, as
 *   e2e-test.sh's `hub_api` does) with `-d`/`--data…`, its method from
 *   `-X` (POST without), its path the word that holds `/api/`;
 * - a call of a helper whose own send takes its body from a positional
 *   argument (`ws_post`, `put_session_limits`), read at each call;
 * - a body given as a variable is read at each of its assignments in the
 *   same function.
 * Each expansion (`$x`, `$(…)`) stands as a string inside a JSON string and
 * as `null` outside one; a path's expansions stand for any segment. The body
 * is matched against the hub's own routes (a hub built in this process,
 * hub-in-process.ts) and its fields against the route's body schema (hub
 * unknown-fields.ts `fieldsNotTaken`).
 *
 * And every `cawco tool <name> … '<json>'` a script runs (a session's tool,
 * through the CLI's door): its arguments, the first JSON object after the
 * tool's name, are matched against that tool's input schema (hub
 * tool-inputs.ts), its expansions read as above,
 * and a tool no session is listed is named.
 *
 * It fails naming each field a route or tool doesn't take, each body it
 * cannot read (unless listed in {@link UNREAD} with why), and each path no
 * hub route answers.
 *
 *   bun scripts/shell-bodies-check.ts
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hubInProcess } from "../packages/hub/scripts/hub-in-process";
import { ROOT, repoFiles } from "./lib/repo-files";

// Read at run time beyond its imports; check.ts keys the check on them.
export const checkReads = ["**/*.sh", "packages/", "mocks/"];

/** An expansion's stand-in in a word's text. */
const SUB = "\u0000";

/** Bodies this cannot read, by `file:body`, each with where its fields were checked by hand. */
const UNREAD: Record<string, string> = {
  "scripts/binary/e2e-test.sh:@/shared/rule.json":
    "written by e2e-test.sh's staging (`JSON.stringify({name, enabled, pattern, matchKind, caseSensitive, wholeWord, watch, reply, timing, repeat, scope})`), every one a field of POST /api/rules",
};

interface Word {
  end: number;
  /** The positional or variable it is, whole (`"$2"`, `"$body"`), if it is one alone. */
  only?: string;
  /** Its text, quotes removed, each expansion as {@link SUB}. */
  text: string;
}

const BLANK = /[ \t]/u;
const STOP = /[\n;|&()<>]/u;
/** A special parameter's one character after `$` (`$1`, `$@`, `$?`). */
const SPECIAL = /[0-9@*#?$!-]/u;
const NAME_CHAR = /\w/u;
/** What a backslash escapes inside double quotes. */
const QUOTED_ESCAPE = /["\\$`\n]/u;
/** A word that is one positional or variable alone. */
const ONLY = /^"?\$\{?(\w+)\}?"?$/u;

/** Where the single-quoted string opening at `i` ends (past its quote). */
const singleEnd = (src: string, i: number): number => {
  const close = src.indexOf("'", i + 1);
  return close < 0 ? src.length : close + 1;
};

/** Where the `$(…)` or `${…}` opening at `i` (its `$`) ends: its brackets balanced, quotes skipped. */
const groupEnd = (src: string, i: number): number => {
  const open = src[i + 1];
  const close = open === "(" ? ")" : "}";
  let depth = 0;
  let j = i + 1;
  while (j < src.length) {
    const c = src[j];
    if (c === "\\") {
      j += 2;
      continue;
    }
    if (c === "'") {
      j = singleEnd(src, j);
      continue;
    }
    if (c === '"') {
      j = quotedEnd(src, j);
      continue;
    }
    if (c === open) {
      depth += 1;
    } else if (c === close) {
      depth -= 1;
      if (depth === 0) {
        return j + 1;
      }
    }
    j += 1;
  }
  return src.length;
};

/** Where the expansion starting at `src[i] === "$"` ends. */
const expansionEnd = (src: string, i: number): number => {
  const next = src[i + 1] ?? "";
  if (next === "(" || next === "{") {
    return groupEnd(src, i);
  }
  if (SPECIAL.test(next)) {
    return i + 2;
  }
  let j = i + 1;
  while (NAME_CHAR.test(src[j] ?? "")) {
    j += 1;
  }
  return j;
};

/** Where the double-quoted string starting at `src[i] === '"'` ends (past its closing quote). */
function quotedEnd(src: string, i: number): number {
  let j = i + 1;
  while (j < src.length) {
    const c = src[j];
    if (c === '"') {
      return j + 1;
    }
    if (c === "\\") {
      j += 2;
    } else if (c === "$") {
      j = expansionEnd(src, j);
    } else {
      j += 1;
    }
  }
  return src.length;
}

/** A double-quoted string's text, from its opening quote at `i` to `end` (past its close). */
const quotedText = (src: string, i: number, end: number): string => {
  let text = "";
  let j = i + 1;
  while (j < end - 1) {
    const c = src[j] ?? "";
    if (c === "\\" && QUOTED_ESCAPE.test(src[j + 1] ?? "")) {
      text += src[j + 1];
      j += 2;
    } else if (c === "$") {
      text += SUB;
      j = expansionEnd(src, j);
    } else {
      text += c;
      j += 1;
    }
  }
  return text;
};

/** One piece of a word at `i`: its text and where the word goes on. */
const pieceAt = (src: string, i: number): { next: number; text: string } => {
  const c = src[i] ?? "";
  if (c === "\\") {
    return { text: src[i + 1] ?? "", next: i + 2 };
  }
  if (c === "'") {
    const end = singleEnd(src, i);
    return { text: src.slice(i + 1, end - 1), next: end };
  }
  if (c === '"') {
    const end = quotedEnd(src, i);
    return { text: quotedText(src, i, end), next: end };
  }
  if (c === "$") {
    return { text: SUB, next: expansionEnd(src, i) };
  }
  return { text: c, next: i + 1 };
};

const ends = (src: string, i: number): boolean =>
  i >= src.length || BLANK.test(src[i] ?? "") || STOP.test(src[i] ?? "");

/** The shell word at `i` (blanks and line continuations before it skipped), or null at the command's end. */
const wordAt = (src: string, start: number): Word | null => {
  let i = start;
  while (BLANK.test(src[i] ?? "") || (src[i] === "\\" && src[i + 1] === "\n")) {
    i += src[i] === "\\" ? 2 : 1;
  }
  if (ends(src, i)) {
    return null;
  }
  const from = i;
  let text = "";
  while (!ends(src, i)) {
    const piece = pieceAt(src, i);
    text += piece.text;
    i = piece.next;
  }
  const only = ONLY.exec(src.slice(from, i))?.[1];
  return { text, end: i, ...(only ? { only } : {}) };
};

/** The words of the command starting at `i`, to its end. */
const wordsFrom = (src: string, i: number): Word[] => {
  const words: Word[] = [];
  let at = i;
  for (;;) {
    const one = wordAt(src, at);
    if (!one) {
      return words;
    }
    words.push(one);
    at = one.end;
  }
};

/** `text` as JSON, each expansion a string inside one and `null` outside; null when it is not JSON. */
const bodyOf = (text: string): unknown => {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const c of text) {
    if (escaped) {
      escaped = false;
    } else if (inString && c === "\\") {
      escaped = true;
    } else if (c === '"') {
      inString = !inString;
    }
    if (c !== SUB) {
      out += c;
    } else if (inString) {
      out += "x";
    } else {
      out += "null";
    }
  }
  try {
    return JSON.parse(out);
  } catch {
    return null;
  }
};

const BODY_FLAG = /^(-d|--data|--data-raw|--data-binary)$/u;
const METHOD_FLAG = /^(-X|--request)$/u;
const CURL = /\bcurl\b/gu;
const CURL_ONE = /\bcurl\b/u;
const FUNCTION = /^\s*(?:function\s+)?([A-Za-z_][\w-]*)\s*\(\)\s*\{/u;
const FUNCTION_END = /^\}/u;
const POSITIONAL = /^\d$/u;
/** A URL ending in a positional (`http://127.0.0.1:3456$1`): the path is that argument. */
const URL_POSITIONAL = /:\d+\$\{?(\d)\}?"?\s/u;
/** Curl's arguments passed on from a positional: `"${@:2}"`. */
const REST = /"\$\{@:(\d+)\}"/u;
const EXPORTED = /export -f/u;
const API = "/api/";

/** A function that sends a body from its positional arguments, read off its definition. */
interface Helper {
  /** The positional its body is, or none: it passes `"${@:from}"` on to curl. */
  body?: number;
  /** Its curl arguments from this positional on, as a call gives them. */
  from?: number;
  method: string;
  /** Its path, a literal or the positional it is. */
  path: string | number;
}

interface Sent {
  body?: Word;
  method: string;
  path?: string;
}

interface Send {
  body: Word;
  file: string;
  /** The function it is written in, for a variable body's assignments. */
  inFunction: string | null;
  line: number;
  method: string;
  path: string;
}

const apiPath = (text: string | undefined): string | undefined =>
  text?.includes(API) ? text.slice(text.indexOf(API)) : undefined;

/** A send's method, path and body from a curl's words. */
const curlSend = (words: Word[]): Sent => {
  let method: string | undefined;
  let body: Word | undefined;
  let path: string | undefined;
  words.forEach((one, k) => {
    const before = words[k - 1]?.text ?? "";
    if (METHOD_FLAG.test(before)) {
      method = one.text;
    } else if (BODY_FLAG.test(before)) {
      body = one;
    } else if (path === undefined) {
      path = apiPath(one.text);
    }
  });
  return {
    method: method ?? (body ? "POST" : "GET"),
    ...(body ? { body } : {}),
    ...(path ? { path } : {}),
  };
};

/** Each function's name and the lines it spans. */
const functionsOf = (lines: string[]) =>
  lines.flatMap((text, from) => {
    const name = FUNCTION.exec(text)?.[1];
    if (!name) {
      return [];
    }
    let to = from;
    if (!text.trimEnd().endsWith("}")) {
      while (to < lines.length && !FUNCTION_END.test(lines[to] ?? "")) {
        to += 1;
      }
    }
    return [{ name, from, to }];
  });

/** What a call of `helper` sends, from its words after the name. */
const helperSend = (helper: Helper, args: Word[]): Sent => {
  const path =
    typeof helper.path === "number" ? args[helper.path - 1]?.text : helper.path;
  if (helper.body === undefined) {
    return {
      ...curlSend(args.slice((helper.from ?? 1) - 1)),
      ...(path ? { path } : {}),
    };
  }
  const body = args[helper.body - 1];
  return {
    method: helper.method,
    ...(path ? { path } : {}),
    ...(body ? { body } : {}),
  };
};

const callOf = (name: string, flags = "u") =>
  new RegExp(`(?<![\\w-])${name}(?![\\w-])`, flags);

/** What the one-line function `line` sends: through curl, or through a helper already known. */
const definedSend = (
  line: string,
  name: string,
  known: Map<string, Helper>
): { at: number; sent: Sent } | null => {
  const curlAt = line.search(CURL_ONE);
  if (curlAt >= 0) {
    return { at: curlAt, sent: curlSend(wordsFrom(line, curlAt + 4)) };
  }
  for (const [other, helper] of known) {
    const at = other === name ? -1 : line.search(callOf(other));
    if (at >= 0) {
      return {
        at,
        sent: helperSend(helper, wordsFrom(line, at + other.length)),
      };
    }
  }
  return null;
};

/** A helper's path: a literal holding /api/, or the positional the URL ends in, or that the call's first word is. */
const helperPath = (
  line: string,
  at: number,
  sent: Sent
): string | number | undefined => {
  const literal = apiPath(sent.path);
  if (literal) {
    return literal;
  }
  const positional =
    URL_POSITIONAL.exec(line)?.[1] ??
    wordsFrom(line, line.indexOf(" ", at)).find((one) => one.only)?.only;
  return positional && POSITIONAL.test(positional)
    ? Number(positional)
    : undefined;
};

/**
 * The helpers `src` defines: a one-line function whose `curl`, or a call of
 * a helper already known, takes its body (`"$2"`) or its curl arguments
 * (`"${@:2}"`) from its positionals, its path a literal or one of them.
 * Read until no new one is found, so a helper of a helper counts.
 */
const helpersOf = (src: string, known: Map<string, Helper>): boolean => {
  let grew = false;
  for (const line of src.split("\n")) {
    const name = FUNCTION.exec(line)?.[1];
    const found =
      name && !known.has(name) ? definedSend(line, name, known) : null;
    const path = found ? helperPath(line, found.at, found.sent) : undefined;
    if (!(name && found && path !== undefined)) {
      continue;
    }
    const { sent } = found;
    const restFrom = REST.exec(line)?.[1];
    if (POSITIONAL.test(sent.body?.only ?? "")) {
      known.set(name, {
        body: Number(sent.body?.only),
        method: sent.method,
        path,
      });
      grew = true;
    } else if (!sent.body && restFrom) {
      known.set(name, { from: Number(restFrom), method: sent.method, path });
      grew = true;
    }
  }
  return grew;
};

const files = repoFiles(["*.sh"]).filter(
  (one) => !one.startsWith("artifacts/")
);
const sources = new Map(
  files.map((file) => [file, readFileSync(join(ROOT, file), "utf8")])
);
const helpers = new Map<string, Helper>();
let grew = true;
while (grew) {
  grew = [...sources.values()]
    .map((src) => helpersOf(src, helpers))
    .some(Boolean);
}

/** A file's lines, its functions, and the line an offset stands on. */
const linesOf = (src: string) => {
  const lines = src.split("\n");
  const spans = functionsOf(lines);
  const starts = [0];
  [...src].forEach((c, i) => {
    if (c === "\n") {
      starts.push(i + 1);
    }
  });
  const lineOf = (offset: number) => {
    let line = 0;
    while (line + 1 < starts.length && (starts[line + 1] ?? 0) <= offset) {
      line += 1;
    }
    return line;
  };
  const fnAt = (line: number) =>
    spans.find((one) => one.from <= line && line <= one.to)?.name ?? null;
  return { lines, lineOf, fnAt };
};

/** A send to keep: one with a path and a body that is not a helper's own positional. */
const kept = (sent: Sent): sent is Sent & { body: Word; path: string } =>
  Boolean(sent.body && apiPath(sent.path)) &&
  !POSITIONAL.test(sent.body?.only ?? "");

/** Every send in `src`: each curl outside a helper's definition, and each call of a helper. */
const sendsOf = (file: string, src: string): Send[] => {
  const { lines, lineOf, fnAt } = linesOf(src);
  const at = (offset: number, sent: Sent & { body: Word; path: string }) => {
    const line = lineOf(offset);
    return {
      file,
      line: line + 1,
      method: sent.method,
      path: apiPath(sent.path) ?? sent.path,
      body: sent.body,
      inFunction: fnAt(line),
    };
  };
  const curls = [...src.matchAll(CURL)].flatMap((found) => {
    const offset = found.index ?? 0;
    const text = lines[lineOf(offset)] ?? "";
    const own = FUNCTION.exec(text)?.[1];
    const sent = curlSend(wordsFrom(src, offset + 4));
    return text.trimStart().startsWith("#") ||
      (own && helpers.has(own)) ||
      !kept(sent)
      ? []
      : [at(offset, sent)];
  });
  const calls = [...helpers].flatMap(([name, helper]) =>
    [...src.matchAll(callOf(name, "gu"))].flatMap((found) => {
      const offset = found.index ?? 0;
      const text = lines[lineOf(offset)] ?? "";
      // Its own definition, a comment, or its export: no call.
      if (
        text.trimStart().startsWith("#") ||
        FUNCTION.exec(text)?.[1] === name ||
        EXPORTED.test(text)
      ) {
        return [];
      }
      const sent = helperSend(helper, wordsFrom(src, offset + name.length));
      return kept(sent) ? [at(offset, sent)] : [];
    })
  );
  return [...curls, ...calls];
};

const sends = [...sources].flatMap(([file, src]) => sendsOf(file, src));

/** A `cawco tool <name>` command, the CLI's door to a session's tool. */
const TOOL_CALL = /\bcawco"?\s+tool\s+([a-z][a-z0-9_]*)/gu;
/** A shell expansion as written, escaped (\`\\$x\`) or not, braced or not. */
const EXPANSION = /\\?\$(?:\{[^}]*\}|\w+|[0-9@*#?$!-])/gu;

interface ToolSend {
  file: string;
  line: number;
  /** Its arguments' text, each expansion as {@link SUB}; null when it has none to read. */
  text: string | null;
  tool: string;
}

/** The JSON object starting at `text[from]`, its braces balanced, strings skipped; null when it never closes. */
const objectAt = (text: string, from: number): string | null => {
  let depth = 0;
  let inString = false;
  for (let i = from; i < text.length; i += 1) {
    const c = text[i];
    if (inString) {
      if (c === "\\") {
        i += 1;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
    } else if (c === "{") {
      depth += 1;
    } else if (c === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(from, i + 1);
      }
    }
  }
  return null;
};

/**
 * Each `cawco tool` command in `src`, with the first JSON object after its
 * name on its line (continued lines joined): read through one level of
 * quoting, as a command nested in a string (`ws_exec "… cawco tool x '{…}'"`)
 * is run, its escaped quotes and expansions unescaped.
 */
const toolSendsOf = (file: string, src: string): ToolSend[] => {
  const joined = src.replace(/\\\n/gu, "  ");
  // A continuation joined keeps its two characters: an offset is the source's.
  const lineAt = (offset: number) => src.slice(0, offset).split("\n").length;
  return [...joined.matchAll(TOOL_CALL)].flatMap((found) => {
    const offset = found.index ?? 0;
    const start = joined.lastIndexOf("\n", offset) + 1;
    if (joined.slice(start, offset).trimStart().startsWith("#")) {
      return [];
    }
    const end = joined.indexOf("\n", offset);
    const rest = joined
      .slice(offset + found[0].length, end < 0 ? undefined : end)
      .replaceAll('\\"', '"')
      .replace(EXPANSION, SUB);
    const open = rest.indexOf("{");
    return [
      {
        file,
        line: lineAt(offset),
        tool: found[1] as string,
        text: open < 0 ? null : objectAt(rest, open),
      },
    ];
  });
};

const toolSends = [...sources].flatMap(([file, src]) => toolSendsOf(file, src));

/** A variable body's values: each assignment of it in the function the send is in. */
const assignmentsOf = (send: Send, name: string): Word[] => {
  const lines = (sources.get(send.file) ?? "").split("\n");
  const span = functionsOf(lines).find((one) => one.name === send.inFunction);
  const assignment = new RegExp(`(?:^|[\\s;(])(?:local\\s+)?${name}=`, "u");
  return lines
    .slice(span?.from ?? 0, (span?.to ?? lines.length - 1) + 1)
    .flatMap((text) => {
      const hit = assignment.exec(text);
      const word = hit ? wordAt(text, hit.index + hit[0].length) : null;
      return word ? [word] : [];
    });
};

const home = mkdtempSync(join(tmpdir(), "shell-bodies-"));
const { hub } = await hubInProcess(join(home, "hub.db"), home);
const { fieldsNotTaken } = await import("../packages/hub/src/unknown-fields");
const { toolInputs } = await import("../packages/hub/scripts/tool-inputs");
const tools = await toolInputs();
interface Route {
  hooks?: { body?: unknown };
  method: string;
  path: string;
}
const { routes } = hub as unknown as { routes: Route[] };

const segments = (path: string) =>
  path.split("?")[0]?.split("/").filter(Boolean) ?? [];

/** How far `route` is from `asked`'s segments: a literal before a parameter, as the router takes them; null when it can't be it. */
const distance = (route: Route, asked: string[]): number | null => {
  const own = segments(route.path);
  if (own.length !== asked.length) {
    return null;
  }
  let score = 0;
  for (const [k, mine] of own.entries()) {
    const theirs = asked[k] ?? "";
    const param = mine.startsWith(":") || mine === "*";
    if (theirs.includes(SUB)) {
      score += param ? 0 : 2;
    } else if (param) {
      score += 1;
    } else if (mine !== theirs) {
      return null;
    }
  }
  return score;
};

/** The routes `path` reaches by `method`. */
const routesOf = (method: string, path: string): Route[] => {
  const asked = segments(path);
  const scored = routes.flatMap((route) => {
    const score = route.method === method ? distance(route, asked) : null;
    return score === null ? [] : [{ route, score }];
  });
  const best = Math.min(...scored.map((one) => one.score));
  return scored.filter((one) => one.score === best).map((one) => one.route);
};

const shownText = (text: string) => text.replaceAll(SUB, "$…");

/** What is wrong with one body `body` of `send`, to `matched`. */
const bodyProblems = (send: Send, body: Word, matched: Route[]): string[] => {
  const where = `${send.file}:${send.line}`;
  const shown = `${send.method} ${send.path.replaceAll(SUB, "*")}`;
  if (body.text.startsWith("@")) {
    return UNREAD[`${send.file}:${body.text}`]
      ? []
      : [
          `${where}: ${shown} sends the file ${body.text}, which this does not read: list it in UNREAD with where its fields were checked`,
        ];
  }
  const value = bodyOf(body.text);
  if (value === null) {
    return [
      `${where}: ${shown} sends a body this cannot read as JSON: ${shownText(body.text).slice(0, 120)}`,
    ];
  }
  return matched.flatMap((route) => {
    const fields = route.hooks?.body
      ? fieldsNotTaken(route.hooks.body, value)
      : [];
    return fields.length > 0
      ? [
          `${where}: ${shown} sends ${fields.map((one) => `\`${one}\``).join(", ")}, which ${route.method} ${route.path} doesn't take`,
        ]
      : [];
  });
};

if (process.argv.includes("--list")) {
  for (const send of sends) {
    console.log(
      `${send.file}:${send.line} ${send.method} ${send.path.replaceAll(SUB, "*")} ${send.body.only ? `$${send.body.only}` : shownText(send.body.text).slice(0, 90)}`
    );
  }
}
const failures = sends.flatMap((send) => {
  const matched = routesOf(send.method, send.path);
  if (matched.length === 0) {
    return [
      `${send.file}:${send.line}: ${send.method} ${send.path.replaceAll(SUB, "*")} reaches no hub route`,
    ];
  }
  const bodies = send.body.only
    ? assignmentsOf(send, send.body.only)
    : [send.body];
  return bodies.flatMap((body) => bodyProblems(send, body, matched));
});
const toolFailures = toolSends.flatMap((send) => {
  const where = `${send.file}:${send.line}`;
  const input = tools.get(send.tool);
  if (input === undefined) {
    return [
      `${where}: cawco tool ${send.tool}: no session is listed a tool by that name`,
    ];
  }
  if (send.text === null) {
    return [];
  }
  const value = bodyOf(send.text);
  if (value === null) {
    return [
      `${where}: cawco tool ${send.tool}'s arguments are no JSON this can read: ${shownText(send.text).slice(0, 120)}`,
    ];
  }
  const fields = fieldsNotTaken(input, value);
  return fields.length > 0
    ? [
        `${where}: cawco tool ${send.tool} sends ${fields.map((one) => `\`${one}\``).join(", ")}, which the tool doesn't take`,
      ]
    : [];
});
failures.push(...toolFailures);

/** A planted `cawco tool` call with an argument its tool doesn't take, nested as e2e-test.sh nests one: this must find it, or it reads nothing. */
const PLANTED_TOOL = `ws_exec "cawco tool wait_item --record '{\\"minutes\\":$M,\\"reason\\":\\"x\\",\\"seconds\\":1}'"`;
const [planted] = toolSendsOf("planted.sh", PLANTED_TOOL);
const plantedFields = planted?.text
  ? fieldsNotTaken(tools.get("wait_item"), bodyOf(planted.text))
  : [];
if (plantedFields.join() !== "seconds") {
  failures.push(
    `the planted cawco tool call reads as ${JSON.stringify(plantedFields)}, not \`seconds\`: the tool calls are not read`
  );
}
rmSync(home, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(
    `shell-bodies-check: ${failures.length} problem(s):\n${failures.join("\n")}`
  );
  process.exit(1);
}
console.log(
  `shell-bodies-check: ${sends.length} send(s) and ${toolSends.length} tool call(s) in ${files.length} shell file(s), every field one its route or tool takes`
);
process.exit(0);
