import { shortSha } from "./short-id";

/**
 * A commit or tree `sha` as git abbreviates it in the repository at `repo`:
 * the length git finds unique there (`git rev-parse --short`), which is what
 * its own output and the forge's pages write. Where git does not know the
 * object (not fetched, another repository), {@link shortSha} names it.
 */
export const gitShort = (repo: string, sha: string): string => {
  const run = Bun.spawnSync(["git", "-C", repo, "rev-parse", "--short", sha], {
    env: process.env,
    stderr: "ignore",
  });
  const said = run.exitCode === 0 ? run.stdout.toString().trim() : "";
  return said === "" ? shortSha(sha) : said;
};
