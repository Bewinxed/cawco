/**
 * The delegate types a template supplies: every one its stages run (`runs:
 * <type>`, stages.ts) and every one its starter skills file tasks with, as
 * the files a project made from it keeps in `delegates/`
 * (project-delegate-types.ts). Applying a template writes the ones the
 * project lacks (tasks.ts `applyTemplate`), whichever way the project was
 * made, so every stage a template names and every task its skills file can
 * start. A project whose stages run, or whose template's skills file, one of
 * these types that resolves to nothing (made before this, or its stages.md
 * written by hand or by Caw) is given the file by the hub, at start and
 * after each change to its folder (tasks.ts `fillTypes`). Caw's setup tunes
 * their briefs to the person's words; it never writes them from nothing
 * (setup.ts).
 *
 * - code, outreach: none.
 * - launch: `writer` (make runs it), `designer` (launch-plan files it).
 * - social: `writer`.
 * - seo: `seo`, `writer`.
 * - brand: `brand`.
 * - design: `explorer`, `builder`.
 */
import { STAGES_TEMPLATES, type StagesTemplate } from "@cawco/core";
import { skillText, TEMPLATE_SKILLS } from "./bundled-skills";
import { type Stages, templateStages } from "./stages";

/** Every type a template stage runs, as its file: front matter and brief. */
const TYPE_FILES: Record<string, string> = {
  brand: `---
harness: claude
model: claude-opus-5-5
effort: medium
lands: none
deny: [mcp__claude-in-chrome__*]
---
Read the task's brand source (a site, a voice doc, a deck, past posts) whole and draw out its voice, words and visual rules into the task's outputs, quoting the source for every line and naming each place it contradicts itself. Load the brand-extract skill and follow it. You draw out what the source shows; the person decides what becomes the brand.
`,
  seo: `---
harness: claude
model: claude-opus-5-5
effort: medium
lands: none
deny: [mcp__claude-in-chrome__*]
---
Turn the task's topic into an SEO brief in the task's outputs: the search intent, what the top results cover and miss, the title and meta description, an outline, the internal links, the sources to cite and the measure to check four weeks after publishing. Load the seo-brief skill and follow it.
`,
  writer: `---
harness: claude
model: claude-opus-5-5
effort: medium
lands: none
deny: [mcp__claude-in-chrome__*]
---
Draft the task's piece (a post, an article, a launch piece) in the project's voice into the task's outputs, from its brief and the brand kit and voice notes in the project's knowledge, every acceptance line checked before it goes to review. Load the project's skill for the piece when it has one: social-post for a post, seo-brief for an article from a brief, launch-plan for a launch piece.
`,
  designer: `---
harness: claude
model: claude-opus-5-5
effort: medium
lands: none
deny: [mcp__claude-in-chrome__*]
---
Make the task's piece's images and pages (a launch visual, a landing page, a post's image) in the project's brand into the task's outputs, from its brief and the brand kit in the project's knowledge, every acceptance line checked before it goes to review. Load the launch-plan skill for the piece's place in the launch.
`,
  explorer: `---
harness: claude
model: claude-opus-5-5
effort: medium
deny: [mcp__claude-in-chrome__*]
---
Explore the task's design brief: two to four distinct directions as variants of the real component or page, on one design sheet the person judges and picks from. Load the design-explore skill and follow it; build nothing past the sheet.
`,
  builder: `---
harness: claude
model: claude-opus-5-5
effort: medium
deny: [mcp__claude-in-chrome__*]
---
Build the direction the person picked for the task, in the project's design system: the real component or page, every state the sheet showed, checked in the running app before it is handed in.
`,
};

/** The types a project's stages run, each once, in stage order. */
export const runsOf = (stages: Stages): string[] => [
  ...new Set(
    stages.stages.flatMap((stage) =>
      stage.hooks.runs ? [stage.hooks.runs] : []
    )
  ),
];

/**
 * The types a template's starter skills (bundled-skills.ts
 * `TEMPLATE_SKILLS`) file tasks with, by skill. launch-plan, step 2: "Each
 * piece names its delegate type (`writer` for words, `designer` for images
 * and pages)". The others file none of their own: seo-brief and
 * brand-extract name only the types their stages run, review-attempt,
 * social-post and outreach-message file no typed task.
 */
const SKILL_TYPES: Partial<Record<string, readonly string[]>> = {
  "launch-plan": ["writer", "designer"],
};

/** The types a template's starter skills file tasks with. */
export const skillTypes = (name: StagesTemplate | null): string[] =>
  name
    ? TEMPLATE_SKILLS[name].flatMap((skill) => SKILL_TYPES[skill] ?? [])
    : [];

/** The types a template supplies: every one its stages run, and every one its skills file tasks with. */
export const templateTypes = (name: StagesTemplate): string[] => [
  ...new Set([...runsOf(templateStages(name)), ...skillTypes(name)]),
];

/**
 * The files of `types` a template defines, as `delegates/<type>.md`, leaving
 * out the ones `own` (the names already in the project's `delegates/`)
 * holds: a project's own file is never written over.
 */
export const typeFiles = (
  types: readonly string[],
  own: ReadonlySet<string>
): { content: string; path: string }[] =>
  types.flatMap((type) => {
    const content = TYPE_FILES[type];
    return content && !own.has(`${type}.md`)
      ? [{ path: `delegates/${type}.md`, content }]
      : [];
  });

// Every type a template supplies has its file, and every type a skill is
// said to file is named in that skill's own words, or the hub does not start.
for (const name of STAGES_TEMPLATES) {
  const missing = templateTypes(name).filter((type) => !TYPE_FILES[type]);
  if (missing.length > 0) {
    throw new Error(
      `The ${name} template supplies ${missing.join(", ")}, and template-types.ts has no file for ${missing.length > 1 ? "them" : "it"}.`
    );
  }
}
for (const [skill, types] of Object.entries(SKILL_TYPES)) {
  const words = skillText(skill);
  const unsaid = (types ?? []).filter((type) => !words.includes(`\`${type}\``));
  if (unsaid.length > 0) {
    throw new Error(
      `template-types.ts says ${skill} files ${unsaid.join(", ")}, and its SKILL.md names no such type.`
    );
  }
}
