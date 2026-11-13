/**
 * `bun scripts/surface-briefs-check.ts` (part of `bun run check`): every
 * surface brief under apps/dashboard/.impeccable/surfaces/ names files that
 * exist. impeccable reads a brief's `primary_target` and `related_targets`
 * from the brief's project, apps/dashboard, so a path written from the
 * repository's root (`apps/dashboard/src/…`) names nothing: fifteen briefs
 * written that way read as orphaned (`impeccable doctor`'s
 * `surface-brief-orphaned`) though no file had moved.
 *
 * Our own reading of the frontmatter, not `impeccable doctor`: impeccable is
 * no dependency of the repository's (bunx fetches it from the registry),
 * and the merge checks install from the lockfile alone.
 *
 * Exits 1 naming each brief, the target that does not exist and, where one
 * can be found, the path it should be.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { z } from "zod";

// Read at run time beyond its imports; check.ts keys the check on them.
export const checkReads = ["apps/dashboard/.impeccable/surfaces/"];

const ROOT = join(import.meta.dir, "..");
const PROJECT = "apps/dashboard";
const SURFACES = join(PROJECT, ".impeccable/surfaces");
const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/u;

const Brief = z.object({
  primary_target: z.string(),
  related_targets: z.array(z.string()).default([]),
});

/** The project's files, from git: where a moved target may be found by name. */
const projectFiles = (): string[] =>
  Bun.spawnSync(["git", "ls-files", "--", PROJECT], {
    env: process.env,
    cwd: ROOT,
  })
    .stdout.toString()
    .split("\n")
    .filter(Boolean)
    .map((path) => path.slice(PROJECT.length + 1));

let files: string[] | undefined;

/** The path a missing target should be, when one can be found. */
const shouldBe = (target: string): string | undefined => {
  const prefix = `${PROJECT}/`;
  if (
    target.startsWith(prefix) &&
    existsSync(join(ROOT, target.slice(prefix.length)))
  ) {
    return target.slice(prefix.length);
  }
  files ??= projectFiles();
  const named = files.filter((path) => basename(path) === basename(target));
  return named.length === 1 ? named[0] : undefined;
};

const faults: string[] = [];
const briefs = readdirSync(join(ROOT, SURFACES)).filter((name) =>
  name.endsWith(".md")
);
for (const name of briefs) {
  const at = join(SURFACES, name);
  const head = FRONTMATTER.exec(readFileSync(join(ROOT, at), "utf8"));
  const parsed = Brief.safeParse(head ? Bun.YAML.parse(head[1] ?? "") : null);
  if (!parsed.success) {
    faults.push(
      `${at}: its frontmatter names no primary_target (${parsed.error.issues[0]?.message ?? "no frontmatter"}).`
    );
    continue;
  }
  const { primary_target, related_targets } = parsed.data;
  for (const target of [primary_target, ...related_targets]) {
    if (existsSync(join(ROOT, PROJECT, target))) {
      continue;
    }
    const fix = shouldBe(target);
    faults.push(
      `${at}: ${target} does not exist from ${PROJECT}${fix ? `; it should be ${fix}` : "; repoint the brief at the file's new path, or remove the brief if its screen is gone"}.`
    );
  }
}

if (faults.length > 0) {
  console.error(
    `surface-briefs-check: ${faults.length} target(s) name no file. A brief's targets are read from ${PROJECT}, and its file and slug are what \`impeccable surface-brief path <target>\` gives.\n${faults.join("\n")}`
  );
  process.exit(1);
}
console.log(
  `surface-briefs-check: ${briefs.length} briefs, every target exists from ${PROJECT}`
);
