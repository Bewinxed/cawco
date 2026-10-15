/**
 * `bun install`'s `prepare` step: copies the repository's git hooks
 * (scripts/git-hooks/pre-push) into the hooks directory git reads by default
 * (`git rev-parse --git-path hooks`, shared by every worktree of the clone).
 *
 * Copied, not pointed at with `core.hooksPath`: CawCo runs no git in a
 * repository whose own config sets a key past the ones a checkout needs
 * (packages/core/src/safe-git.ts `repositoryConfigProblem`), so that key would
 * stop every workspace made from this clone. Each install copies them again,
 * so a changed hook arrives with the next `bun install`. Outside a git
 * checkout there is nothing to install into.
 */
import { chmod, copyFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const HOOKS = ["pre-push"];
const root = resolve(import.meta.dir, "../..");

const where = Bun.spawnSync(["git", "rev-parse", "--git-path", "hooks"], {
  cwd: root,
  stdout: "pipe",
  stderr: "pipe",
});
if (where.exitCode === 0) {
  const dir = resolve(root, where.stdout.toString().trim());
  await mkdir(dir, { recursive: true });
  for (const hook of HOOKS) {
    const target = join(dir, hook);
    // biome-ignore lint/performance/noAwaitInLoops: one small file at a time
    await copyFile(join(import.meta.dir, hook), target);
    await chmod(target, 0o755);
  }
  console.log(`git hooks installed in ${dir}: ${HOOKS.join(", ")}`);
} else {
  console.log("not a git checkout: no git hooks installed");
}
