/**
 * The skills CawCo itself ships to every machine (§5.8 of the Projects spec):
 * today, `decision-page`, the kit any session uses to write a decision page.
 * Their files live in `packages/hub/skills/<name>/` (embedded in a release
 * binary as `skills/<name>/…`), and fleet sync carries them like a fleet
 * skill, so any session on any machine and harness finds them.
 *
 * Each is hub-owned the way a workflow's stub skill is (`workflowId`, and the
 * `cawco-workflow` marker in its SKILL.md): a machine never overwrites an
 * operator's own skill of the same name with it, and reports the collision.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { FleetSkillPayload, SkillFile } from "@cawco/core";
import { materializeTree, standalone } from "@cawco/core/runtime";
import { hashFiles } from "./skills";

const SHIPPED = ["decision-page"] as const;

const folder = (name: string): string =>
  standalone
    ? materializeTree(`skills/${name}`)
    : Bun.fileURLToPath(new URL(`../skills/${name}`, import.meta.url));

const walk = (root: string, dir = root): SkillFile[] =>
  readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry): SkillFile[] => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        return walk(root, path);
      }
      if (!entry.isFile()) {
        return [];
      }
      return [
        {
          path: relative(root, path).split(sep).join("/"),
          contentBase64: readFileSync(path).toString("base64"),
          // biome-ignore lint/suspicious/noBitwiseOperators: the execute bits of a file mode are a mask.
          executable: (statSync(path).mode & 0o111) !== 0,
        },
      ];
    });

let loaded: FleetSkillPayload[] | undefined;

/** Every shipped skill with its files, read once per process; one that cannot be read is left out and logged. */
export const shippedSkills = (): FleetSkillPayload[] => {
  loaded ??= SHIPPED.flatMap((name) => {
    try {
      const files = walk(folder(name));
      return [
        {
          name,
          workflowId: `cawco-${name}`,
          hash: hashFiles(files),
          files,
        },
      ];
    } catch (error) {
      console.error(`[hub] shipped skill ${name} could not be read`, error);
      return [];
    }
  });
  return loaded;
};
