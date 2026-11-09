/**
 * `bun scripts/stale-references-check.ts` (part of `bun run check`): a
 * comment or doc that names a file of the repository or a symbol names one
 * that is there, so a move or a rename cannot leave a stale mention behind.
 * Read in every comment of the code (a component's markup and style
 * comments too), in the lint configs and in ARCHITECTURE.md and README.md:
 *
 * - **path**: a path anchored at the repository: `apps/<member>/…` or
 *   `packages/<member>/…` (a workspace member's own folder), `<member>/src/…`
 *   or `<member>/scripts/…`, `#lib/…` or `$lib/…` (the dashboard's lib),
 *   and `scripts/…` or `site/…` (here, beside the comment's file, or under
 *   any member). A `.js` names its `.ts` as an import does.
 * - **member file**: a file named after its member, the house's short form
 *   (`core heavy-slots.ts`, `preview overlay/pins.ts`, `the dashboard's
 *   \`reload.svelte.ts\``): some file of that member ends in it. One under a
 *   folder the member has none of is another project's, and not read.
 * - **link**: a JSDoc `@link` to a name names an identifier the code holds
 *   (this file's, the repository's, or the platform's); one to a member of
 *   an interface, class, enum or object type this module declares, a member
 *   it has; and one to `import("<module>").Name`, a name that module
 *   declares.
 *
 * A path anchored nowhere (`src/x.ts`, `lib/modem.js`, `.claude/settings.json`)
 * can name another project's file, a build's output or a scratch repo's, so
 * it is not read; nor a bare name in backticks with no member before it (of
 * 30 such names that are no file here, 27 named a build's output, an
 * upstream source or a scratch project's file). Another project's path is
 * written from its repository (`anomalyco/opencode/packages/core/…`), so it
 * is anchored nowhere here.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import ts from "typescript";
import { commentsOf, parsed } from "./lib/parse-source";
import { ROOT, repoFiles } from "./lib/repo-files";
import { fileAt, packages, targetOf } from "./lib/workspace-imports";

const files = repoFiles();
const present = new Set(files);

/** Each workspace member by its folder's last name (`core`, `dashboard`), with its folder. */
const members = new Map(
  [...packages.values()]
    .filter((pkg) => pkg.dir !== ".")
    .map((pkg) => [pkg.dir.split("/").at(-1) as string, pkg.dir])
);
const MEMBER = [...members.keys()].join("|");
const EXT = "ts|tsx|mts|cts|js|mjs|cjs|svelte|json|jsonc|md|css|grit|sh|html";
const SEGMENTS = String.raw`[\w.+@$\[\]-]+(?:/[\w.+@$\[\]-]+)*`;
const ANCHORED = new RegExp(
  String.raw`(?<![\w./@$#~-])((?:apps|packages)/(?:${MEMBER})/${SEGMENTS}\.(?:${EXT})|(?:${MEMBER})/(?:src|scripts)/${SEGMENTS}\.(?:${EXT})|[#$]lib/${SEGMENTS}\.(?:${EXT})|(?:scripts|site)/${SEGMENTS}\.(?:${EXT}))(?![\w/-])`,
  "gu"
);
const MEMBER_FILE = new RegExp(
  String.raw`(?<![\w./@-])(${MEMBER})(?:'s)?\s+\x60?((?:[\w.+-]+/)*[\w.+-]+\.(?:ts|tsx|js|mjs|svelte|css|grit|sh))\x60?(?![\w/-])`,
  "gu"
);
const LINK = /\{@link(?:code|plain)?\s+([^}\s|]+)/gu;
const IMPORTED_LINK = /^import\((["'])([^"']+)\1\)\.([\w$]+)/u;
const CODE = /\.(?:[cm]?[jt]sx?|svelte)$/u;
const READ =
  /^(?:(?:apps\/(?:dashboard|cawrier)|packages|scripts|site)\/.*\.(?:[cm]?[jt]sx?|svelte|css|grit|jsonc)|biome\.jsonc|knip\.ts|golar\.config\.ts|ARCHITECTURE\.md|README\.md)$/u;
const LIB_ALIAS = /^[#$]lib\//u;
const MEMBER_FOLDER = /^(?:apps|packages)\//u;
const LOOSE = /^(?:scripts|site)\//u;
const URL_SCHEME = /^[a-z][\w+.-]*:/iu;
const CALL_PARENS = /\(\)$/u;
/** A link's name from its member: `Name.member`, `Name#member`, `Name~inner`. */
const MEMBER_SEPARATOR = /[.#~]/u;
/** A JSDoc line's leading ` * `. */
const GUTTER = /^[ \t]*\*[ \t]?/gmu;
/** Planted mistakes and pages copied as they were, which name what they named. */
const SKIPPED = /\/fixtures\//u;

/** The files a path may be written for: a script's `.js` names its `.ts`, a module named without `.ts`. */
const forms = (path: string): string[] => [
  path,
  ...(path.endsWith(".js") ? [`${path.slice(0, -3)}.ts`] : []),
  ...(path.endsWith(".svelte") ? [`${path}.ts`] : []),
];
const filesBySuffix = (suffix: string): boolean =>
  files.some((file) => file === suffix || file.endsWith(`/${suffix}`));

/** Whether an anchored path names a file or folder that is there. */
const pathIsThere = (file: string, path: string): boolean => {
  let full = path.replace(LIB_ALIAS, "apps/dashboard/src/lib/");
  const [head] = full.split("/");
  if (head !== undefined && members.has(head) && !MEMBER_FOLDER.test(full)) {
    full = `${members.get(head)}/${full.slice(head.length + 1)}`;
  }
  const loose = LOOSE.test(full);
  return forms(full).some((form) => {
    if (present.has(form) || files.some((f) => f.startsWith(`${form}/`))) {
      return true;
    }
    if (!loose) {
      return false;
    }
    for (let dir = dirname(file); dir !== "."; dir = dirname(dir)) {
      if (present.has(join(dir, form))) {
        return true;
      }
    }
    return filesBySuffix(form);
  });
};

/**
 * Whether some file of `member` is `path` or ends in it (`proxy.ts`,
 * `preview/proxy.ts`). A path whose first folder the member has none of is
 * read as another project's (`core config/discovery.ts`, OpenCode's), and
 * passes.
 */
const inMember = (member: string, path: string): boolean => {
  const own = files.filter((file) =>
    file.startsWith(`${members.get(member)}/`)
  );
  const slash = path.indexOf("/");
  if (
    slash >= 0 &&
    !own.some((file) => file.includes(`/${path.slice(0, slash + 1)}`))
  ) {
    return true;
  }
  return own.some((file) => file.endsWith(`/${path}`));
};

/** Every identifier in a syntax tree. */
const identifiers = (source: ts.SourceFile): Set<string> => {
  const found = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
      found.add(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
};

/** The names a module declares at its top. */
const declared = (source: ts.SourceFile): Set<string> => {
  const found = new Set<string>();
  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const item of statement.declarationList.declarations) {
        if (ts.isIdentifier(item.name)) {
          found.add(item.name.text);
        }
      }
    } else if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement) ||
        ts.isModuleDeclaration(statement)) &&
      statement.name &&
      ts.isIdentifier(statement.name)
    ) {
      found.add(statement.name.text);
    } else if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const item of statement.exportClause.elements) {
        found.add(item.name.text);
      }
    }
  }
  return found;
};

const code = files.filter((file) => CODE.test(file) && !SKIPPED.test(file));
const sources = new Map(
  code.map((file) => [
    file,
    parsed(file, readFileSync(join(ROOT, file), "utf8")),
  ])
);
const everywhere = new Set<string>();
const own = new Map<string, Set<string>>();
for (const [file, source] of sources) {
  const names = identifiers(source);
  own.set(file, names);
  for (const name of names) {
    everywhere.add(name);
  }
}
/** The platform's names: TypeScript's libraries, Node's and Bun's types. */
for (const dir of [
  "typescript/lib",
  "@types/node",
  ".bun/node_modules/bun-types",
]) {
  const at = join(ROOT, "node_modules", dir);
  for (const name of readdirSync(at).filter((n) => n.endsWith(".d.ts"))) {
    for (const match of readFileSync(join(at, name), "utf8").matchAll(
      /\b(?:interface|class|type|var|const|function|namespace|enum|let|module)\s+([A-Za-z_$][\w$]*)/gu
    )) {
      everywhere.add(match[1] as string);
    }
  }
}

/** A member's name as its declaration spells it (`#field` keeps its `#`). */
const memberName = (name: ts.PropertyName | undefined): string | undefined =>
  name &&
  (ts.isIdentifier(name) ||
    ts.isPrivateIdentifier(name) ||
    ts.isStringLiteral(name))
    ? name.text
    : undefined;

/**
 * The members of `name` when this module declares it as an interface or a
 * class that extends nothing, an enum, or an object type: what a link to one
 * of its members may name. Undefined for anything whose members come from
 * elsewhere too.
 */
const membersOf = (
  source: ts.SourceFile | undefined,
  name: string
): Set<string> | undefined => {
  for (const statement of source?.statements ?? []) {
    if (
      (ts.isInterfaceDeclaration(statement) ||
        ts.isClassDeclaration(statement)) &&
      statement.name?.text === name &&
      !statement.heritageClauses?.length
    ) {
      return new Set(
        statement.members.flatMap((item) => memberName(item.name) ?? [])
      );
    }
    if (ts.isEnumDeclaration(statement) && statement.name.text === name) {
      return new Set(
        statement.members.flatMap((item) => memberName(item.name) ?? [])
      );
    }
    if (
      ts.isTypeAliasDeclaration(statement) &&
      statement.name.text === name &&
      ts.isTypeLiteralNode(statement.type)
    ) {
      return new Set(
        statement.type.members.flatMap((item) => memberName(item.name) ?? [])
      );
    }
  }
};

/** Why a link names nothing, when it does. */
const staleLink = (file: string, target: string): string | undefined => {
  const imported = IMPORTED_LINK.exec(target);
  if (imported) {
    const specifier = imported[2] ?? "";
    const name = imported[3] ?? "";
    const path = targetOf(file, specifier);
    const module = path === undefined ? undefined : fileAt(path, present);
    const source = module === undefined ? undefined : sources.get(module);
    if (!source) {
      return `${specifier} is no module here`;
    }
    return declared(source).has(name)
      ? undefined
      : `${module} declares no ${name}`;
  }
  if (URL_SCHEME.test(target)) {
    return;
  }
  const [head, member] = target
    .replace(CALL_PARENS, "")
    .split(MEMBER_SEPARATOR);
  if (!head) {
    return;
  }
  if (!(own.get(file)?.has(head) || everywhere.has(head))) {
    return `no ${head} in the code`;
  }
  const declaredMembers = member
    ? membersOf(sources.get(file), head)
    : undefined;
  if (member && declaredMembers && !declaredMembers.has(member)) {
    return `${head} has no member ${member}`;
  }
};

const stale: string[] = [];
const lineAt = (text: string, at: number): number =>
  text.slice(0, at).split("\n").length;
for (const file of files.filter((f) => READ.test(f) && !SKIPPED.test(f))) {
  const text = readFileSync(join(ROOT, file), "utf8");
  for (const comment of commentsOf(file, text)) {
    const words = comment.text.replace(GUTTER, "");
    // The gutter goes from the starts of lines alone, so lines still count.
    const first = lineAt(text, comment.at);
    const where = (index: number): string =>
      `${file}:${first + words.slice(0, index).split("\n").length - 1}`;
    for (const match of words.matchAll(ANCHORED)) {
      const path = match[1] as string;
      if (!pathIsThere(file, path)) {
        stale.push(`${where(match.index ?? 0)} ${path}: no such file`);
      }
    }
    for (const match of words.matchAll(MEMBER_FILE)) {
      const member = match[1] ?? "";
      const name = match[2] ?? "";
      if (!forms(name).some((form) => inMember(member, form))) {
        stale.push(
          `${where(match.index ?? 0)} ${member} ${name}: ${member} has no such file`
        );
      }
    }
    if (!CODE.test(file)) {
      continue;
    }
    for (const match of words.matchAll(LINK)) {
      const why = staleLink(file, match[1] as string);
      if (why) {
        stale.push(`${where(match.index ?? 0)} {@link ${match[1]}}: ${why}`);
      }
    }
  }
}

if (stale.length > 0) {
  process.stdout.write(
    `stale-references: ${stale.length} mention(s) of what is not there; name where it went, or drop it:\n${stale.map((line) => `  ${line}`).join("\n")}\n`
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    "stale-references: every file and link a comment names is there\n"
  );
}
