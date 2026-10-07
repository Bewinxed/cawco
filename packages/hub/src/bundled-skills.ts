/**
 * The skills CawCo ships itself, carried to every machine by fleet sync like
 * the workflow skills it makes (workflows/skills.ts): `decision-page` (Projects
 * spec §5.8), whose files live in `packages/hub/skills/` and, in the
 * standalone binary, among its embedded assets (`build-binary.ts`).
 *
 * An operator's own skill of the same name is theirs to keep: the fleet
 * payload sends theirs and leaves this one out.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { FleetSkillPayload, SkillFile } from "@cawco/core";
import { materializeTree, standalone } from "@cawco/core/runtime";
import { hashFiles } from "./skills";

export const BUNDLED_SKILLS = ["decision-page"] as const;

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

let loaded: FleetSkillPayload[] | undefined;

/** Read once per process: the files change only with a new CawCo. */
export const bundledSkills = (): FleetSkillPayload[] => {
  loaded ??= BUNDLED_SKILLS.map((name) => {
    const root = standalone
      ? materializeTree(`skills/${name}`)
      : fileURLToPath(new URL(`../skills/${name}`, import.meta.url));
    const files = filesUnder(root);
    return { name, hash: hashFiles(files), files };
  });
  return loaded;
};
