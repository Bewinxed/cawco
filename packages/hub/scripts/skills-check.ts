/**
 * `bun run skills:check`: every skill CawCo ships (src/bundled-skills.ts,
 * BUNDLED_SKILLS and each template's TEMPLATE_SKILLS) read as the agent reads
 * it. Prints `<name> ok` per skill; exits 1 on the first-found problems:
 *
 * 1. SKILL.md exists, its frontmatter parses as YAML (as each harness's
 *    skill loader reads it), its `name` is its folder's name, and its
 *    `description` is 1 to 1024 characters (Claude Code's limit) with no
 *    trailing space.
 * 2. Every `artifact_create(` call it writes names `does` in the same code
 *    span (or, outside one, on the same line), as `does:` or as the
 *    shorthand field `{ kind, does, ask }`: the hub refuses a create without it.
 * 3. No `artifact_create(` call carries `about`: the field is `ask`.
 * 4. No markdown file of it holds a phrase src/skill-text-rules.ts bans
 *    (the design graph's old names, a verdict card, a width number, a frame
 *    per width, a pick through ask, an animated mockup, a weight budget).
 * 5. The skills that route a design (`DESIGN_GRAPH_NAMED`) name the design
 *    graph, and so does artifact_create's `kind`, which every session loads.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { artifactCreate } from "../src/artifacts/tools";
import { BUNDLED_SKILLS, TEMPLATE_SKILLS } from "../src/bundled-skills";
import { skillTextProblems } from "../src/skill-text-rules";

// Read at run time beyond its imports; check.ts keys the check on them.
export const checkReads = ["packages/hub/"];

/** Claude Code's longest skill description. */
const DESCRIPTION_LIMIT = 1024;
const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/u;
const CALL = "artifact_create(";
const ABOUT = /\babout\b/u;
/** `does` as a field: `does: "judge"`, or the shorthand `{ kind, does, ask }`. */
const DOES = /\bdoes\s*[:,}]/u;

const ROOT = join(import.meta.dir, "../skills");
/** The leading word every text that routes a design holds. */
const DESIGN_GRAPH = /design graph/iu;
/** The skills that route a design to the person: each names the design graph. */
const DESIGN_GRAPH_NAMED = [
  "show",
  "design-graph",
  "decision-page",
  "design-explore",
  "screen",
];

/** Every markdown file under `dir`, by its path. */
const markdownUnder = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return markdownUnder(path);
    }
    return entry.name.endsWith(".md") ? [path] : [];
  });

/** The frontmatter block parsed as YAML, the way each harness's skill loader reads it. */
const frontmatterOf = (
  block: string
): { fields: Record<string, unknown> } | { error: string } => {
  try {
    const parsed: unknown = Bun.YAML.parse(block);
    return parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
      ? { fields: parsed as Record<string, unknown> }
      : { error: "it is not a mapping" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
};

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

/** Skill `name`'s words against the design graph's rules (checks 4 and 5); `text` is its SKILL.md. */
const wordingProblems = (name: string, text: string): string[] => {
  const problems = markdownUnder(join(ROOT, name)).flatMap((path) =>
    skillTextProblems(readFileSync(path, "utf8")).map(
      (broken) => `skill ${name}: ${relative(join(ROOT, name), path)} ${broken}`
    )
  );
  if (DESIGN_GRAPH_NAMED.includes(name) && !DESIGN_GRAPH.test(text)) {
    problems.push(
      `skill ${name}: it routes a design and never names the design graph`
    );
  }
  return problems;
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
  const frontmatter = frontmatterOf(head[1] ?? "");
  if ("error" in frontmatter) {
    return [
      `skill ${name}: its frontmatter does not parse as YAML: ${frontmatter.error}`,
    ];
  }
  const { fields } = frontmatter;
  const problems: string[] = [];
  if (fields.name !== name) {
    problems.push(
      `skill ${name}: its frontmatter name is ${JSON.stringify(fields.name ?? null)}, not its folder's`
    );
  }
  const description =
    typeof fields.description === "string" ? fields.description : "";
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
  problems.push(...wordingProblems(name, text));
  return problems;
};

const names = [
  ...new Set([...BUNDLED_SKILLS, ...Object.values(TEMPLATE_SKILLS).flat()]),
];
let failed = false;
if (!DESIGN_GRAPH.test(artifactCreate.input.kind.description ?? "")) {
  failed = true;
  console.error("artifact_create's kind never names the design graph");
}
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
