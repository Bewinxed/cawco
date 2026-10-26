/**
 * {@link CONTROL_PLACE_PUSH}: a project's place, already a git repository,
 * pushed to the hub's own remote of the project with this machine's
 * credential, for the hub to publish to GitHub with a token only it holds
 * (hub project-settings.ts `create_repo`). A place with no origin gets the
 * hub's remote as its origin, as a workspace's cut gives it; one whose
 * origin is anywhere else is refused, so nothing goes where the person did
 * not point it. A dry run reads the branch, the commit and its tree's files
 * and bytes, and pushes nothing.
 */
import { type PlacePush, WORKSPACE_GIT_TIMEOUT_MS } from "@cawco/core";
import { useHubCredentialHelper } from "./git-credential";
import { hubGitEnv, hubRepo, isHubRemote } from "./move";
import { publishCheck } from "./place-repo";
import { gitUntil } from "./workspace";

const LINE = /\r?\n/u;
/** `git ls-tree -r -l` line: mode, type, object, size, then a tab and the path. */
const TREE_SIZE = /^\S+ blob \S+\s+(\d+)\t/u;

export const placePush = async (
  path: unknown,
  projectId: unknown,
  dryRun?: unknown
): Promise<PlacePush> => {
  if (typeof projectId !== "string" || !projectId) {
    throw new Error("A place is pushed for its project: name the project.");
  }
  const deadline = Date.now() + WORKSPACE_GIT_TIMEOUT_MS;
  const git = gitUntil(deadline);
  // A place's path is absolute: the hub stores no other (db placePathOn).
  const asked = String(path);
  const root = await git(asked, "rev-parse", "--show-toplevel").catch(
    (error: Error) => {
      throw new Error(
        `${asked} is not a git repository yet, so there is nothing to publish: ${error.message}`,
        { cause: error }
      );
    }
  );
  const branch = await git(root, "symbolic-ref", "--short", "HEAD").catch(
    () => {
      throw new Error(
        `${root} is on no branch (a detached HEAD), so CawCo does not know which branch to publish.`
      );
    }
  );
  const commit = await git(root, "rev-parse", "HEAD").catch(() => {
    throw new Error(
      `${root} has no commit yet, so there is nothing to publish.`
    );
  });
  const sizes = (await git(root, "ls-tree", "-r", "-l", "HEAD"))
    .split(LINE)
    .flatMap((line) => {
      const size = TREE_SIZE.exec(line);
      return size ? [Number(size[1])] : [];
    });
  // A publish takes the whole history, so every commit HEAD reaches is read
  // by the credential scan: a key a later commit took out is still in it.
  const { leftOut, refused } = await publishCheck(root, deadline);
  if (refused.length > 0) {
    throw new Error(
      `CawCo does not publish ${root}: its commits hold what reads as a credential: ${refused
        .map((one) => `${one.path} (${one.why})`)
        .join("; ")}. Take them out of its history first.`
    );
  }
  const read = {
    root,
    branch,
    commit,
    files: sizes.length,
    bytes: sizes.reduce((sum, size) => sum + size, 0),
    leftOut,
  };
  const origin = await git(root, "remote", "get-url", "origin").catch(
    () => undefined
  );
  if (origin && !isHubRemote(origin)) {
    throw new Error(
      `${root}'s origin is ${origin}, not the hub's remote, so CawCo does not publish it.`
    );
  }
  if (dryRun === true) {
    return { ...read, pushed: false };
  }
  if (!origin) {
    await git(root, "remote", "add", "origin", hubRepo(projectId));
    console.info(
      `[place-push] ${root} had no origin: the hub's remote of project ${projectId} is its origin now`
    );
  }
  useHubCredentialHelper(root);
  await gitUntil(deadline, hubGitEnv(origin || hubRepo(projectId)))(
    root,
    "push",
    "--quiet",
    "origin",
    `HEAD:refs/heads/${branch}`
  );
  console.info(
    `[place-push] ${root}: ${branch} at ${commit.slice(0, 9)} pushed to the hub's remote of ${projectId}`
  );
  return { ...read, pushed: true };
};
