/**
 * `bun run torph:build`, by hand: builds torph at {@link COMMIT} and leaves
 * its npm tarball at vendor/torph-<short sha>.tgz, the file the dashboard's
 * `torph` dependency names (vendor/README.md says why).
 *
 * That commit is not on npm (0.1.4 is the newest there), and no install
 * from git reaches it: the repository is a private pnpm workspace whose
 * package sits in packages/torph, its `dist/` is git-ignored, and no
 * `prepare` script builds it. So the build is torph's own, as its release
 * runs it: a clone at the commit, its lockfile installed with the pnpm its
 * root `packageManager` names, packages/torph's `build` script, `npm pack`.
 * Nothing in torph is changed.
 *
 * Goes away, with vendor/, when torph 0.1.5 ships on npm.
 */
import { mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";

const COMMIT = "862ffcb38cfd5d43930afdbaa17f1fba83566e76";
const REPO = "https://github.com/lochie/torph.git";
const VENDOR = join(import.meta.dir, "..", "vendor");
const OUT = join(VENDOR, `torph-${COMMIT.slice(0, 7)}.tgz`);

const scratch = await mkdtemp(join(tmpdir(), "torph-"));
try {
  await $`git init -q ${scratch}`;
  await $`git -C ${scratch} fetch -q --depth 1 ${REPO} ${COMMIT}`;
  await $`git -C ${scratch} checkout -q FETCH_HEAD`;

  const root: unknown = JSON.parse(
    await readFile(join(scratch, "package.json"), "utf8")
  );
  if (!(
    typeof root === "object" &&
    root !== null &&
    "packageManager" in root &&
    typeof root.packageManager === "string"
  )) {
    throw new Error(`torph at ${COMMIT} names no packageManager`);
  }
  const pnpm = root.packageManager;
  await $`bunx ${pnpm} install --frozen-lockfile`.cwd(scratch);

  const pkg = join(scratch, "packages/torph");
  await $`bunx ${pnpm} run build`.cwd(pkg);
  // Packed straight into vendor/: the scratch folder may be another file system.
  const packed = (
    await $`bunx npm pack --silent --pack-destination ${VENDOR}`.cwd(pkg).text()
  ).trim();
  await rename(join(VENDOR, packed), OUT);
  console.info(`torph at ${COMMIT}: ${OUT}`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
