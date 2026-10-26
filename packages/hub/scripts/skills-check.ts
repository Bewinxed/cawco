/**
 * `bun run skills:check`: every skill CawCo ships (src/bundled-skills.ts,
 * BUNDLED_SKILLS and each template's TEMPLATE_SKILLS) read as the agent reads
 * it. Prints `<name> ok` per skill; exits 1 on the first-found problems:
 *
 * 1. SKILL.md exists, its frontmatter `name` is its folder's name, and its
 *    `description` is 1 to 1024 characters (Claude Code's limit) with no
 *    trailing space.
 * 2. Every `artifact_create(` call it writes names `does` in the same code
 *    span (or, outside one, on the same line), as `does:` or as the
 *    shorthand field `{ kind, does, ask }`: the hub refuses a create without it.
 * 3. No `artifact_create(` call carries `about`: the field is `ask`.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BUNDLED_SKILLS, TEMPLATE_SKILLS } from "../src/bundled-skills";

/** Claude Code's longest skill description. */
const DESCRIPTION_LIMIT = 1024;
const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/u;
const CALL = "artifact_create(";
const LEADING_SPACE = /^ /u;
const ABOUT = /\babout\b/u;
/** `does` as a field: `does: "judge"`, or the shorthand `{ kind, does, ask }`. */
const DOES = /\bdoes\s*[:,}]/u;

const ROOT = join(import.meta.dir, "../skills");

/** The `key: value` lines of a frontmatter block. */
const fieldsOf = (block: string): Map<string, string> =>
  new Map(
    block.split("\n").flatMap((line) => {
      const at = line.indexOf(":");
      return at > 0
        ? [
            [
              line.slice(0, at).trim(),
              line.slice(at + 1).replace(LEADING_SPACE, ""),
            ],
          ]
        : [];
    })
  );

/** The code span holding `at` on `line` (between backticks), else the whole line. */
const spanAround = (line: string, at: number): string => {
  const ticks = [...line.matchAll(/`/gu)].map((match) => match.index ?? 0);
  for (let index = 0; index + 1 < ticks.length; index += 2) {
    const open = ticks[index] as number;
    const close = ticks[index + 1] as number;
    if (open < at && at < close) {
      return line.slice(open + 1, close);
    }
  }
  return line;
};

/** What is wrong with skill `name`, one line each. */
const problemsOf = (name: string): string[] => {
  const file = join(ROOT, name, "SKILL.md");
  if (!existsSync(file)) {
    return [`skill ${name}: no SKILL.md`];
  }
  const text = readFileSync(file, "utf8");
  const head = FRONTMATTER.exec(text);
  if (!head) {
    return [`skill ${name}: SKILL.md has no frontmatter`];
  }
  const problems: string[] = [];
  const fields = fieldsOf(head[1] ?? "");
  if (fields.get("name") !== name) {
    problems.push(
      `skill ${name}: its frontmatter name is ${JSON.stringify(fields.get("name") ?? null)}, not its folder's`
    );
  }
  const description = fields.get("description") ?? "";
  if (description.length < 1 || description.length > DESCRIPTION_LIMIT) {
    problems.push(
      `skill ${name}: its description is ${description.length} characters; 1 to ${DESCRIPTION_LIMIT}`
    );
  } else if (description.endsWith(" ")) {
    problems.push(`skill ${name}: its description ends with a space`);
  }
  const lines = text.split("\n");
  for (const [index, line] of lines.entries()) {
    let at = line.indexOf(CALL);
    while (at >= 0) {
      const call = spanAround(line, at);
      if (ABOUT.test(call)) {
        problems.push(`skill ${name}: about is gone; the field is ask`);
      }
      if (!DOES.test(call)) {
        problems.push(
          `skill ${name}: artifact_create without does at line ${index + 1}`
        );
      }
      at = line.indexOf(CALL, at + CALL.length);
    }
  }
  return problems;
};

const names = [
  ...new Set([...BUNDLED_SKILLS, ...Object.values(TEMPLATE_SKILLS).flat()]),
];
let failed = false;
for (const name of names) {
  const problems = problemsOf(name);
  if (problems.length === 0) {
    console.log(`${name} ok`);
  } else {
    failed = true;
    for (const problem of problems) {
      console.error(problem);
    }
  }
}
process.exit(failed ? 1 : 0);
