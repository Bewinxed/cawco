import { hostEnvironment } from "./session-env";

/**
 * The bytes the folders at `paths` take on disk, together: THE ONE reading
 * of a folder's size, a held workspace's copy's and a prune's. One `du -sk`
 * over them all (POSIX, on Linux and macOS alike), which walks the trees in
 * C; a folder it cannot read counts 0, and no paths spawn nothing.
 */
export const folderBytes = async (
  paths: readonly string[]
): Promise<number> => {
  if (paths.length === 0) {
    return 0;
  }
  const du = Bun.spawn(["du", "-sk", ...paths], {
    env: hostEnvironment(),
    stdout: "pipe",
    stderr: "ignore",
  });
  const [out] = await Promise.all([new Response(du.stdout).text(), du.exited]);
  return out
    .split("\n")
    .reduce((sum, line) => sum + (Number(line.split("\t")[0]) || 0) * 1024, 0);
};
