/**
 * A decision page's program (Projects spec §5.8): an OpenUI Lang program
 * over CawCo's decision library (`@cawco/core/decisions-library`), which a
 * session passes to `artifact_create` as `program` (or writes as `page.oui`
 * beside its media) and revises with `artifact_update`'s `statements`,
 * merged by name with lang-core's `mergeStatements`.
 *
 * - Parsed with lang-core's parser over the library's generated schema
 *   (`@cawco/core/decisions-spec`), as the page's host draws it.
 * - A component the library does not have is dropped and named, never
 *   drawn; any other mistake the parser reports is refused in its own words.
 * - Picks are kept by id, so ids are checked: every decision's is lowercase
 *   and its own on the page, every option's its own in its decision, and an
 *   `after` on the same page names a decision the page has.
 * - It cannot run code or reach the network: no Query, Mutation, `$state`
 *   or action step, and no URL or markup in its words (a Diagram's Mermaid
 *   is Pele's to escape, its links and images off).
 * - Its words are drawn in the house's sans face, so a character that face
 *   doesn't draw (core house-faces.ts, read from the face's own files) is
 *   refused, named with its card and its string: a stand-in glyph or an
 *   emoji would show as an empty box or in a face that isn't the house's.
 *
 * The host page around it ({@link programHost}) is the hub's: the program
 * in a script tag the host bundle reads (agent `decision-host/`), served at
 * the artifact's route with the overlay, whose page hash is the program's.
 */

import { type ProgramRead, readProgram } from "@cawco/core/decisions";
import { AFTER_REF, DECISION_ID } from "@cawco/core/decisions-library";
import spec from "@cawco/core/decisions-spec";
import { named, SANS_FAMILY, undrawn } from "@cawco/core/house-faces";
import {
  createParser,
  type ElementNode,
  type LibraryJSONSchema,
  mergeStatements,
  tokenize,
} from "@openuidev/lang-core";

process.env.OPENUI_TELEMETRY_DISABLED = "1";
process.env.DO_NOT_TRACK = "1";

/** The program's file beside the page, in the artifact's folder and the project's `decisions/<name>/`. */
export const PROGRAM_FILE = "page.oui";

/** The longest program a page may be. Our bound: 21 cards with their media are about 20 KiB. */
export const PROGRAM_MAX = 128 * 1024;

/** Where the host page's bundle is served on every preview origin (core decision-host.ts). */
export const DECISION_ASSETS = "/__cawco/decision/";

const MAX_PROBLEMS = 8;
const parser = createParser(spec.schema as LibraryJSONSchema, spec.root);

const URL_LIKE =
  /[a-z][a-z0-9+.-]*:\/\/|(?:^|[\s"'(])(?:data|javascript|vbscript|mailto|blob|file|tel):|(?:^|[\s"'(/])www\.[a-z0-9-]+\./iu;
const MARKUP = /<\s*\/?\s*[a-z!][^>]*>/iu;
const CLOUD_MARKER = "]]>openui:";
const ACTIONS = new Set(["OpenUrl", "ToAssistant", "Run", "Set", "Reset"]);
/** lang-core's token kinds this reads (tokens.ts `T`, a const enum). */
const TOKEN = { Type: 17, BuiltinCall: 35 } as const;
const STATEMENT = /^([A-Za-z_$][\w$]*)\s*=/u;

/** What a program is once checked: its text, what it says, and the components it drops. */
export interface CheckedProgram {
  dropped: string[];
  program: string;
  read: ProgramRead;
}

/** A program that could not be kept, every reason in a sentence. */
export class ProgramRefusal extends Error {
  readonly status = 422 as const;
}

const refuse = (problems: string[]): never => {
  const unique = [...new Set(problems)];
  throw new ProgramRefusal(
    unique.length === 1
      ? (unique[0] ?? "")
      : `The program has ${unique.length} problems:\n- ${unique.slice(0, MAX_PROBLEMS).join("\n- ")}`
  );
};

const isElement = (value: unknown): value is ElementNode =>
  typeof value === "object" &&
  value !== null &&
  (value as { type?: unknown }).type === "element";

/** Why one of its words can't stand: a URL or markup; null when it can. A Diagram's Mermaid is Pele's to escape. */
const wordProblem = (
  value: string,
  prop: string,
  component: string
): string | null => {
  if (component === "Diagram" && prop === "mermaid") {
    return null;
  }
  if (URL_LIKE.test(value)) {
    return `“${value.slice(0, 60)}” is a URL: a decision page reaches no network; show the thing with Image, Canvas or Preview.`;
  }
  return MARKUP.test(value)
    ? `“${value.slice(0, 60)}” holds markup: a page's words are plain.`
    : null;
};

/** Its words that point outside the page or hold markup. */
const unsafeWords = (root: ElementNode | null): string[] => {
  const found: string[] = [];
  const look = (value: unknown, prop: string, component: string): void => {
    if (typeof value === "string") {
      const problem = wordProblem(value, prop, component);
      if (problem) {
        found.push(problem);
      }
    } else if (Array.isArray(value)) {
      for (const each of value) {
        look(each, prop, component);
      }
    } else if (isElement(value)) {
      for (const [name, held] of Object.entries(value.props)) {
        look(held, name, value.typeName);
      }
    }
  };
  look(root, "", "");
  return found;
};

/** Props that name things rather than draw words: ids, references, files, and a component's look. */
const UNDRAWN_PROPS = new Set([
  "id",
  "after",
  "file",
  "alt",
  "artifact",
  "stories",
  "variant",
  "tone",
  "justify",
  "align",
]);
/** The components whose props a fault names by the prop alone ("its label"). */
const CARD_PARTS = new Set(["Decisions", "Section", "Decision", "Option"]);
const EXCERPT = 60;

/** Where a string stands, as a fault names it: its card and option, or the page's title or a Section's. */
interface WordsAt {
  decision?: string;
  option?: string;
  section?: string;
}

/** `value` cut to {@link EXCERPT} characters around `at`. */
const excerpt = (value: string, at: number): string => {
  if (value.length <= EXCERPT) {
    return value;
  }
  const start = Math.max(0, Math.min(at - 20, value.length - EXCERPT));
  return `${start > 0 ? "…" : ""}${value.slice(start, start + EXCERPT)}${start + EXCERPT < value.length ? "…" : ""}`;
};

/** Why one string can't stand in the house face: the characters it lacks, where the string is, and what to write; null when it can. */
const glyphProblem = (
  value: string,
  prop: string,
  component: string,
  at: WordsAt
): string | null => {
  const missing = undrawn(value);
  const [first] = missing;
  if (!first) {
    return null;
  }
  const where = [
    at.decision ? `Decision "${at.decision}"` : null,
    at.option ? `option "${at.option}"` : null,
    !at.decision && at.section ? `Section "${at.section}"` : null,
  ].filter(Boolean);
  const what = CARD_PARTS.has(component)
    ? `its ${prop}`
    : `a ${component}'s ${prop}`;
  const lead =
    where.length > 0 ? `${where.join(", ")}: ${what}` : `The page's ${prop}`;
  const chars = missing.map(named).join(", ");
  return `${lead} “${excerpt(value, value.indexOf(first))}” holds ${chars}, which ${SANS_FAMILY}, the page's face, doesn't draw: it would show as an empty box or in another face. Say what it stands for in words (an icon by its name, like "paperclip"), or leave it out.`;
};

/** Where an element's words stand: in its own card, option or Section, else where it stands itself. */
const within = (element: ElementNode, at: WordsAt): WordsAt => {
  const { id, title } = element.props;
  if (element.typeName === "Decision" && typeof id === "string") {
    return { decision: id };
  }
  if (element.typeName === "Option" && typeof id === "string") {
    return { ...at, option: id };
  }
  if (element.typeName === "Section" && typeof title === "string") {
    return { section: title };
  }
  return at;
};

/** Its strings that hold a character the house face can't draw, each named with its card. */
const undrawnWords = (root: ElementNode | null): string[] => {
  const found: string[] = [];
  const look = (
    value: unknown,
    prop: string,
    component: string,
    at: WordsAt
  ): void => {
    if (typeof value === "string") {
      const problem = UNDRAWN_PROPS.has(prop)
        ? null
        : glyphProblem(value, prop, component, at);
      if (problem) {
        found.push(problem);
      }
    } else if (Array.isArray(value)) {
      for (const each of value) {
        look(each, prop, component, at);
      }
    } else if (isElement(value)) {
      const inside = within(value, at);
      for (const [name, held] of Object.entries(value.props)) {
        look(held, name, value.typeName, inside);
      }
    }
  };
  look(root, "", "", {});
  return found;
};

/** A decision's own id and its options': lowercase, each its own; each option with its cost, and one recommended with its why. */
const cardProblems = (
  card: ProgramRead["cards"][number],
  seen: Set<string>
): string[] => {
  const problems: string[] = [];
  if (!DECISION_ID.test(card.id)) {
    problems.push(
      `Decision "${card.id}": an id is lowercase letters, digits and dashes, like "lead-mode".`
    );
  } else if (seen.has(card.id)) {
    problems.push(
      `Two decisions have the id "${card.id}": each needs its own, since its pick is kept by it.`
    );
  }
  seen.add(card.id);
  if (card.options.length < 2) {
    problems.push(
      `Decision "${card.id}" offers ${card.options.length === 1 ? "one option" : "no options"}: give it 2 to 5.`
    );
  }
  const options = new Set<string>();
  for (const option of card.options) {
    if (!DECISION_ID.test(option.id)) {
      problems.push(
        `Decision "${card.id}", option "${option.id}": an id is lowercase letters, digits and dashes.`
      );
    } else if (options.has(option.id)) {
      problems.push(
        `Decision "${card.id}" has two options "${option.id}": each needs its own id.`
      );
    }
    options.add(option.id);
    if (!option.cost.trim()) {
      problems.push(
        `Decision "${card.id}", option "${option.id}" has no cost: say what picking it costs them, in one line.`
      );
    }
  }
  // The interview's shape: exactly one recommended, and why it, on every card (multiple ones too).
  const recommended = card.options.filter((option) => option.recommended);
  if (recommended.length === 0) {
    problems.push(
      `Decision "${card.id}" recommends nothing: mark exactly one option recommended, and say why in the decision's why.`
    );
  } else if (recommended.length > 1) {
    problems.push(
      `Decision "${card.id}" recommends ${recommended.length} options: mark exactly one.`
    );
  } else if (!card.why.trim()) {
    problems.push(
      `Decision "${card.id}" has no why: one sentence on why its recommended option.`
    );
  }
  return problems;
};

/** A decision's `after`s: each an id or `page#id`, one on this page a decision it has, never itself. */
const afterProblems = (
  card: ProgramRead["cards"][number],
  ids: Set<string>
): string[] =>
  card.after.flatMap((ref) => {
    const found = AFTER_REF.exec(ref);
    if (!found) {
      return [
        `Decision "${card.id}" is after "${ref}": name a decision by its id, or "page#id" on another page.`,
      ];
    }
    if (found[1]) {
      return [];
    }
    if (found[2] === card.id) {
      return [`Decision "${card.id}" can't come after itself.`];
    }
    return ids.has(found[2] ?? "")
      ? []
      : [
          `Decision "${card.id}" is after "${ref}", which this page does not have; on another page, write "page#${ref}".`,
        ];
  });

/**
 * The artifact an id names, whole: the artifacts service's resolver
 * (service.ts `whole`, handles.ts), throwing in words when it names none or
 * several.
 */
export type ArtifactNamed = (asked: string) => string;

/** What its Images name: a file each. */
const mediaProblems = (read: ProgramRead): string[] =>
  read.images.flatMap((file) =>
    file && !file.includes("..")
      ? []
      : [
          `Image("${file}"): name a file in your work folder, or an absolute path.`,
        ]
  );

/**
 * `program` with each Canvas and Preview naming its artifact by its whole
 * id, as `artifact` resolves the id written (a handle, a name), and why one
 * names none. With no resolver (a check of the program alone) the ids
 * stand as written.
 */
const wholeArtifacts = (
  program: string,
  read: ProgramRead,
  artifact: ArtifactNamed | undefined
): { problems: string[]; program: string } => {
  const problems: string[] = [];
  let whole = program;
  for (const { component, id } of artifact ? read.artifacts : []) {
    let full: string;
    try {
      full = (artifact as ArtifactNamed)(id);
    } catch (error) {
      problems.push(
        `${component}("${id}"): ${error instanceof Error ? error.message : String(error)}`
      );
      continue;
    }
    if (full !== id) {
      whole = whole
        .replaceAll(JSON.stringify(id), JSON.stringify(full))
        .replaceAll(`'${id}'`, `'${full}'`);
    }
  }
  return { problems, program: whole };
};

/** Its ids, `after`s and media, as picks and the graph need them. */
const idProblems = (read: ProgramRead): string[] => {
  const seen = new Set<string>();
  const problems = read.cards.flatMap((card) => cardProblems(card, seen));
  return [
    ...problems,
    ...read.cards.flatMap((card) => afterProblems(card, seen)),
    ...mediaProblems(read),
  ];
};

/** The opener each closer ends. */
const CLOSES: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
/** The closer each opener needs. */
const CLOSERS: Record<string, string> = { "(": ")", "[": "]", "{": "}" };

/** Where a line and column fall in `text`, 1-based, at offset `at`. */
const lineAt = (text: string, at: number): { column: number; line: number } => {
  const before = text.slice(0, at).split("\n");
  return { line: before.length, column: (before.at(-1)?.length ?? 0) + 1 };
};

/** An opener `text` leaves open: a quote, or a bracket. */
interface Unclosed {
  at: number;
  char: string;
  quote: boolean;
}

/**
 * What `text` leaves open at its end, by lang-core's `autoClose` scan
 * (statements.ts): an open string first, else the innermost open bracket;
 * null when everything closes.
 */
const unclosedIn = (text: string): Unclosed | null => {
  const open: Unclosed[] = [];
  let quote: Unclosed | null = null;
  let escaped = false;
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at] ?? "";
    if (escaped) {
      escaped = false;
    } else if (quote) {
      escaped = char === "\\";
      quote = char === quote.char ? null : quote;
    } else if (char === '"' || char === "'") {
      quote = { at, char, quote: true };
    } else if (CLOSERS[char]) {
      open.push({ at, char, quote: false });
    } else if (CLOSES[char] && open.at(-1)?.char === CLOSES[char]) {
      open.pop();
    }
  }
  return quote ?? open.at(-1) ?? null;
};

/**
 * Why `text` does not parse whole: the string or call it leaves open, named
 * by its statement and where it opens; null when everything closes.
 * lang-core's parse closes them for a streaming reply and only flags
 * `meta.incomplete`: a kept page is no stream, so it is refused instead.
 */
export const unclosedProblem = (text: string): string | null => {
  const left = unclosedIn(text);
  if (!left) {
    return null;
  }
  const [statement] = text
    .slice(0, left.at)
    .split("\n")
    .flatMap((each) => STATEMENT.exec(each)?.[1] ?? [])
    .slice(-1);
  const { line, column } = lineAt(text, left.at);
  const what = left.quote
    ? `the string opened at line ${line}, column ${column} is never closed: end it with ${left.char}`
    : `the ${left.char} opened at line ${line}, column ${column} is never closed: close it with ${CLOSERS[left.char]}`;
  return statement
    ? `${statement}: ${what}.`
    : `${what[0]?.toUpperCase()}${what.slice(1)}.`;
};

/**
 * `raw` as a decision page's program, or a {@link ProgramRefusal} with every
 * reason: its size and code first, then the parser's mistakes, then its ids,
 * each Canvas's and Preview's resolved whole by `artifact` when given.
 */
export const checkProgram = (
  raw: string,
  artifact?: ArtifactNamed
): CheckedProgram => {
  const program = `${raw.trim()}\n`;
  if (program.length > PROGRAM_MAX) {
    refuse([
      `The program is ${Math.round(program.length / 1024)} KiB; a decision page's is ${PROGRAM_MAX / 1024} KiB at most. Split the page.`,
    ]);
  }
  if (program.includes(CLOUD_MARKER)) {
    refuse([
      "The program carries OpenUI Cloud markers: a decision page is a program alone, and runs no scripts.",
    ]);
  }
  const actions = tokenize(program)
    .filter(
      (token) =>
        (token.t === TOKEN.BuiltinCall && ACTIONS.has(String(token.v))) ||
        (token.t === TOKEN.Type && token.v === "Action")
    )
    .map((token) => `@${token.v} is an action: a decision page runs none.`);
  if (actions.length > 0) {
    refuse(actions);
  }
  const unclosed = unclosedProblem(program);
  if (unclosed) {
    refuse([unclosed]);
  }
  const result = parser.parse(program);
  const problems: string[] = [];
  for (const query of result.queryStatements) {
    problems.push(
      `${query.statementId} = Query(…): a decision page holds your words and the person's picks, never data.`
    );
  }
  for (const mutation of result.mutationStatements) {
    problems.push(
      `${mutation.statementId} = Mutation(…): a decision page runs none.`
    );
  }
  if (Object.keys(result.stateDeclarations).length > 0) {
    problems.push(
      "A decision page keeps no $variables: the person's picks are kept by decision id."
    );
  }
  for (const error of result.meta.errors) {
    if (error.code !== "unknown-component") {
      problems.push(
        error.statementId
          ? `${error.statementId}: ${error.message}`
          : error.message
      );
    }
  }
  if (!result.root && problems.length === 0) {
    problems.push(
      `The program draws nothing: it needs root = ${spec.root}(…), reaching every part of it.`
    );
  }
  if (problems.length > 0) {
    refuse(problems);
  }
  const unsafe = [...unsafeWords(result.root), ...undrawnWords(result.root)];
  if (unsafe.length > 0) {
    refuse(unsafe);
  }
  const read = readProgram(result.root);
  const whole = wholeArtifacts(program, read, artifact);
  const ids = [...idProblems(read), ...whole.problems];
  if (ids.length > 0) {
    refuse(ids);
  }
  return {
    program: whole.program,
    read:
      whole.program === program
        ? read
        : readProgram(parser.parse(whole.program).root),
    dropped: [
      ...new Set(
        result.meta.errors
          .filter((error) => error.code === "unknown-component")
          .map((error) => error.component)
          .filter((name): name is string => !!name)
      ),
    ],
  };
};

/** A program read without checks: what the hub draws from a page it already keeps. */
export const readKept = (program: string): ProgramRead =>
  readProgram(parser.parse(program).root);

/** Each statement of a program by its name, as written. */
const statementsOf = (program: string): Map<string, string> => {
  const found = new Map<string, string>();
  let name: string | null = null;
  for (const line of program.split("\n")) {
    const [, statement] = STATEMENT.exec(line) ?? [];
    if (statement) {
      name = statement;
      found.set(name, line.trim());
    } else if (name && line.trim()) {
      found.set(name, `${found.get(name)}\n${line.trim()}`);
    }
  }
  return found;
};

/** What a revision changed, by statement name: new ones, rewritten ones, and those it dropped (unreachable now). */
export interface StatementChange {
  added: string[];
  removed: string[];
  replaced: string[];
}

/**
 * `statements` merged into `existing` by name (lang-core `mergeStatements`:
 * the same name replaces, a new name is added, what nothing reaches is
 * dropped), and what that changed. Statements that leave a string or call
 * open are refused as written ({@link unclosedProblem}), before the merge
 * can carry the open tail into a statement of the page's.
 */
export const mergeProgram = (
  existing: string,
  statements: string
): { change: StatementChange; merged: string } => {
  const unclosed = unclosedProblem(statements);
  if (unclosed) {
    refuse([unclosed]);
  }
  const merged = `${mergeStatements(existing, statements, "root").trim()}\n`;
  const before = statementsOf(existing);
  const after = statementsOf(merged);
  return {
    merged,
    change: {
      added: [...after.keys()].filter((name) => !before.has(name)),
      replaced: [...after.keys()].filter(
        (name) => before.has(name) && before.get(name) !== after.get(name)
      ),
      removed: [...before.keys()].filter((name) => !after.has(name)),
    },
  };
};

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};
const escaped = (value: string): string =>
  value.replaceAll(/[&<>"]/gu, (char) => ESCAPES[char] ?? char);

/** A file an Image names, as the page keeps it: its address beside the page, and its bytes. */
export interface ProgramFile {
  bytes: Uint8Array;
  /** `files/<n>-<name>`, from the page's folder. */
  path: string;
}

/** A program built into its page: what it is, what it says, the files its Images show, and the host page around it. */
export interface BuiltProgram extends CheckedProgram {
  files: ProgramFile[];
  html: string;
}

/** What an Image's file reads as: its bytes, or why it can't be read, in a sentence. */
export type ImageRead = { bytes: Uint8Array } | { problem: string };

const FILE_NAME = /[^A-Za-z0-9._-]+/gu;

/**
 * `raw` checked and built: each Canvas's and Preview's artifact resolved
 * whole by `artifact`, each file its Images name read with `image`
 * (refused, every reason at once, when one can't be), and the host page
 * around the program naming each by its address beside the page.
 */
export const buildProgram = async (
  raw: string,
  image: (file: string) => Promise<ImageRead>,
  artifact: ArtifactNamed
): Promise<BuiltProgram> => {
  const checked = checkProgram(raw, artifact);
  const names = [...new Set(checked.read.images)];
  const reads = await Promise.all(names.map(image));
  const problems = reads.flatMap((read, index) =>
    "problem" in read ? [`Image("${names[index]}"): ${read.problem}`] : []
  );
  if (problems.length > 0) {
    refuse(problems);
  }
  const files = names.map((name, index) => ({
    path: `files/${index}-${(name.split("/").at(-1) ?? "image").replace(FILE_NAME, "-")}`,
    bytes: (reads[index] as { bytes: Uint8Array }).bytes,
  }));
  const addresses = Object.fromEntries(
    names.map((name, index) => [name, files[index]?.path ?? ""])
  );
  return {
    ...checked,
    files,
    html: programHost(checked.program, checked.read.title, addresses),
  };
};

/** A JSON value in a script tag, nothing in it able to close the tag. */
export const scriptJson = (id: string, value: unknown): string =>
  `<script type="application/json" id="${id}">${JSON.stringify(value).replaceAll("<", "\\u003c")}</script>`;

/** The house faces' sheet on every preview origin (core decision-host.ts): a program's page links it, an HTML page's kit CSS imports it. */
export const FACES_SHEET = `${DECISION_ASSETS}faces.css`;
/** The plain CawCo icon every decision page names (core decision-host.ts `icon.png`): a page in a tab of its own asks for no `/favicon.ico`, which its origin doesn't serve. */
export const PAGE_ICON = `${DECISION_ASSETS}icon.png`;

/** The page the hub serves for a program: the house faces, its host bundle, the program and its files' addresses in script tags, nothing else. */
export const programHost = (
  program: string,
  title: string,
  files: Record<string, string>
): string =>
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escaped(title || "Decision page")}</title>
<link rel="icon" type="image/png" href="${PAGE_ICON}">
<link rel="stylesheet" href="${FACES_SHEET}">
<link rel="stylesheet" href="${DECISION_ASSETS}host.css">
<script type="module" src="${DECISION_ASSETS}host.js"></script>
</head>
<body>
<div id="decision-root"></div>
<script type="text/openui" id="cawco-program">${program.replaceAll("</", "<\\/")}</script>
${scriptJson("cawco-files", files)}
</body>
</html>
`;
