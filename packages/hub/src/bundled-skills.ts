/**
 * The skills CawCo ships itself (Projects spec §5.4, D14), carried to every
 * machine by fleet sync like the workflow skills it makes
 * (workflows/skills.ts). Their files live in `packages/hub/skills/` and, in
 * the standalone binary, among its embedded assets (`build-binary.ts`).
 *
 * - {@link BUNDLED_SKILLS} reach every session on every machine:
 *   `decision-page` (§5.8), the planning skills and the design skills,
 *   `design-explore` among them: every agent's design sheet is written by it.
 * - {@link TEMPLATE_SKILLS} are each project template's starter skills: bound
 *   to every project made from that template (`projects.template`) and
 *   placed at each of its checkouts and workspaces, as a project's own skills
 *   are (D15, project-placements.ts).
 *
 * An operator's own skill of the same name is theirs to keep: the fleet
 * payload sends theirs and leaves this one out.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { FleetSkillPayload, SkillFile } from "@cawco/core";
import { hashFiles } from "@cawco/core/file-hash";
import { runtimeTree, standalone } from "@cawco/core/runtime";
import type { StagesTemplate } from "./stages";

export const BUNDLED_SKILLS = [
  "decision-page",
  "grill",
  "to-tasks",
  "triage",
  "screen",
  "restyle",
  "drift",
  "design-explore",
  "design-system",
] as const;

/**
 * Each template's starter skills, by the work its stages run. A skill in
 * {@link BUNDLED_SKILLS} is never one too: it already reaches every
 * session, and a second, project-bound copy would list it twice.
 */
export const TEMPLATE_SKILLS: Record<StagesTemplate, readonly string[]> = {
  code: ["review-attempt"],
  launch: ["launch-plan"],
  seo: ["seo-brief"],
  brand: ["brand-extract"],
  // design-explore and design-system reach every session (BUNDLED_SKILLS).
  design: [],
  social: ["social-post"],
  outreach: ["outreach-message"],
};

const filesUnder = (root: string, dir = root): SkillFile[] =>
  readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        return filesUnder(root, path);
      }
      return entry.isFile()
        ? [
            {
              path: relative(root, path).split("\\").join("/"),
              contentBase64: readFileSync(path).toString("base64"),
              executable: false,
            },
          ]
        : [];
    });

/** Read once per process: the files change only with a new CawCo. */
const loaded = new Map<string, FleetSkillPayload>();

const skillNamed = (name: string): FleetSkillPayload => {
  let skill = loaded.get(name);
  if (!skill) {
    const root = standalone
      ? runtimeTree(`skills/${name}`)
      : fileURLToPath(new URL(`../skills/${name}`, import.meta.url));
    const files = filesUnder(root);
    skill = { name, hash: hashFiles(files), files };
    loaded.set(name, skill);
  }
  return skill;
};

/** The skills every machine gets. */
export const bundledSkills = (): FleetSkillPayload[] =>
  BUNDLED_SKILLS.map(skillNamed);

/** Each project's template starter skills, bound to that project. */
export const starterSkills = (
  projects: readonly { id: string; template: StagesTemplate | null }[]
): FleetSkillPayload[] =>
  projects.flatMap(({ id, template }) =>
    template
      ? TEMPLATE_SKILLS[template].map((name) => ({
          ...skillNamed(name),
          projectId: id,
          scope: "project" as const,
        }))
      : []
  );
