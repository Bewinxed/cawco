/**
 * git filter-repo, carried by every CawCo build: the tool git's own manual
 * points to for rewriting history ("Please use an alternative history
 * filtering tool such as git filter-repo",
 * https://git-scm.com/docs/git-filter-branch), which a project folder's
 * forget runs (project-folder.ts `forgetInFolderHistory`). No hub is
 * expected to have it installed.
 *
 * Its release is one Python script ("All you need to do is download one
 * file: the git-filter-repo script … That's it", its INSTALL.md), run as
 * `python3 git-filter-repo` (the same file's "Simple Installation"). It
 * needs "git >= 2.22.0 at a minimum" and "python3 >= 3.6" (its README):
 * git CawCo needs anyway, and python3 is the one thing a hub may lack.
 *
 * The copy is the pinned release's own files, unchanged, under
 * `packages/hub/vendor/git-filter-repo/`, put there from the release's
 * archive (its sha256 checked) by `bun scripts/git-filter-repo.ts`, and held
 * to each file's sha256 below by `bun run check`. A build embeds that folder
 * as its `git-filter-repo` runtime tree (scripts/build-binary.ts), published
 * to disk at start (core runtime.ts `publishRuntime`), so a fresh install
 * and every update carry it. Its script's sha256 is checked again before
 * each run ({@link filterRepoCommand}).
 */
import { fileURLToPath } from "node:url";
import { runtimeTree, standalone } from "@cawco/core/runtime";
import { findProgram } from "@cawco/core/workspace-needs";

/**
 * The release carried: v2.47.0 is the newest (GitHub's latest release and
 * newest tag, read 2026-11-07). Its archive's sha256 is taken from the
 * downloaded release asset (the release publishes no checksum file), and
 * each file's from that archive.
 */
export const FILTER_REPO = {
  version: "2.47.0",
  archive: {
    url: "https://github.com/newren/git-filter-repo/releases/download/v2.47.0/git-filter-repo-2.47.0.tar.xz",
    sha256: "4662cbe5918196a9f1b5b3e1211a32e61cff1812419c21df4f47c5439f09e902",
  },
  /** Each file carried, from the archive's `git-filter-repo-<version>/`, with its sha256. */
  files: {
    "git-filter-repo":
      "67447413e273fc76809289111748870b6f6072f08b17efe94863a92d810b7d94",
    COPYING: "6447a28bf91a61a316accc25bc8fcdb8cba667bb226cab571107e8110ea2d411",
    "COPYING.mit":
      "b737a7d397697239c1717fd06fc73c23c30a71ef602367b5eb2417bbb1bc0a2e",
  },
} as const;

/** The carried copy's folder: the published runtime tree in a build, the vendored folder in a checkout. */
export const filterRepoDir = (): string =>
  standalone
    ? runtimeTree("git-filter-repo")
    : fileURLToPath(new URL("../vendor/git-filter-repo", import.meta.url));

/** A file's sha256, hex. */
export const sha256Of = async (path: string): Promise<string> =>
  new Bun.CryptoHasher("sha256")
    .update(await Bun.file(path).bytes())
    .digest("hex");

/**
 * The argv that runs the carried git filter-repo: python3 and its script.
 * None when python3 is not on the hub's PATH; refused when the script is
 * not the pinned release's, byte for byte.
 */
export const filterRepoCommand = async (): Promise<string[] | undefined> => {
  const python = findProgram("python3");
  if (!python) {
    return;
  }
  const script = `${filterRepoDir()}/git-filter-repo`;
  const sum = await sha256Of(script).catch(() => "missing");
  if (sum !== FILTER_REPO.files["git-filter-repo"]) {
    throw new Error(
      `The git filter-repo this CawCo carries (${script}) is not release ${FILTER_REPO.version}: its sha256 is ${sum}.`
    );
  }
  return [python, script];
};
