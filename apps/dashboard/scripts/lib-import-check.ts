/**
 * Part of `bun run lint`: every `#lib` import in the dashboard names a file
 * that is there. package.json's `"#lib/*": "./src/lib/*"` is Node's subpath
 * import, "a direct static matching and replacement without any special
 * handling for file extensions" (nodejs.org/api/packages.html, Subpath
 * patterns), so the specifier spells the file: a `.ts` module as `.js`, the
 * way TypeScript reads it (`#lib/tokens/tokens.js`), a component as
 * `.svelte`. An extensionless one is no file to TypeScript: what it imports
 * reads as `any`, and a prop typed with it gets no control in a sheet's
 * inspector. Every import already names its file (one spelling per module,
 * as Node's docs advise); this keeps it so, and says the fix.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const DASHBOARD = join(dirname(new URL(import.meta.url).pathname), "..");
const LIB = join(DASHBOARD, "src/lib");
/** An import, export or dynamic import of a `#lib` specifier. */
const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])(#lib(?:\/[^"']*)?)\1/g;
const SOURCE = /\.(?:ts|js|svelte)$/;
/** The forms a module is written in, each as its specifier names it. */
const FORMS: [file: string, specifier: string][] = [
  [".ts", ".js"],
  [".js", ".js"],
  [".svelte", ".svelte"],
  [".svelte.ts", ".svelte.js"],
  ["/index.ts", "/index.js"],
  ["/index.js", "/index.js"],
];

const isFile = (path: string) =>
  statSync(path, { throwIfNoEntry: false })?.isFile() ?? false;

/** Whether `#lib/<rest>` names a file: as written, or a `.js` naming its `.ts`. */
function names(rest: string): boolean {
  const path = join(LIB, rest);
  return (
    isFile(path) || (rest.endsWith(".js") && isFile(`${path.slice(0, -3)}.ts`))
  );
}

/** The specifier that names the file an extensionless `rest` meant, when there is one. */
function fixOf(rest: string): string | undefined {
  const form = FORMS.find(([file]) => isFile(join(LIB, `${rest}${file}`)));
  return form ? `#lib/${rest}${form[1]}` : undefined;
}

const listed = Bun.spawnSync(
  [
    "git",
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
    "--",
    ".",
  ],
  { cwd: DASHBOARD }
);
if (listed.exitCode !== 0) {
  process.stderr.write(listed.stderr.toString());
  process.exit(1);
}

const wrong: string[] = [];
let files = 0;
for (const file of listed.stdout.toString().split("\0")) {
  const path = join(DASHBOARD, file);
  if (!(file && SOURCE.test(file) && existsSync(path))) {
    continue;
  }
  files += 1;
  const text = readFileSync(path, "utf8");
  for (const match of text.matchAll(SPECIFIER)) {
    const specifier = match[2] ?? "";
    // `#lib` alone is the map's own entry, src/lib/index.js.
    const rest = specifier === "#lib" ? "index.js" : specifier.slice(5);
    if (names(rest)) {
      continue;
    }
    const line = text.slice(0, match.index).split("\n").length;
    const fix = fixOf(rest);
    wrong.push(
      `  ${relative(DASHBOARD, path)}:${line}: "${specifier}" names no file. ${
        fix
          ? `Write "${fix}": a #lib import spells its file, a .ts module as .js.`
          : "No file under src/lib answers it."
      }`
    );
  }
}

if (wrong.length > 0) {
  console.error(
    "#lib imports that name no file (package.json maps #lib/* with no extension search, so TypeScript reads them as any):"
  );
  for (const one of wrong) {
    console.error(one);
  }
  process.exit(1);
}
console.log(
  `lib-import:check: ${files} file(s), every #lib import names a file`
);
