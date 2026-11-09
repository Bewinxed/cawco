/**
 * {@link CONTROL_PLACE_PUSH}: a project's place, already a git repository,
 * pushed to the hub's own remote of the project with this machine's
 * credential, for the hub to publish to GitHub with a token only it holds
 * (hub project-settings.ts `create_repo`). A place with no origin gets the
 * hub's remote of it as its origin, as a workspace's cut gives it
 * (git/hub-remote.ts `hubRepoOf`), and the push names that repository; one whose
 * origin is anywhere else is refused, so nothing goes where the person did
 * not point it. A dry run reads the branch, the commit and its tree's files
 * and bytes, and the hub repository its origin names when it has one, and
 * pushes nothing.
 */

import { hubRepoOfUrl } from "@cawco/core/hub-repo";
import {
  type PlacePush,
  WORKSPACE_GIT_TIMEOUT_MS,
} from "@cawco/core/workspace/controls";
import { hubGitEnv, hubRepo, hubRepoOf, isHubRemote } from "./git/hub-remote";
import { gitUntil } from "./git/run";
import { useHubCredentialHelper } from "./git-credential";
import { publishCheck } from "./place-repo";

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
    // An origin of the hub's names its repository now; one with none is
    // given its repository only by the push, which claims it.
    const named = origin ? hubRepoOfUrl(origin) : undefined;
    return { ...read, pushed: false, ...(named ? { hub: named } : {}) };
  }
  const hub = origin
    ? hubRepoOfUrl(origin)
    : await hubRepoOf(root, projectId, deadline);
  if (!hub) {
    throw new Error(
      `${root}'s origin ${origin} names none of the hub's repositories, so CawCo does not publish it.`
    );
  }
  const remote = origin || hubRepo(hub);
  if (!origin) {
    await git(root, "remote", "add", "origin", remote);
    console.info(
      `[place-push] ${root} had no origin: ${remote}, the hub's remote of it in project ${projectId}, is its origin now`
    );
  }
  useHubCredentialHelper(root);
  await gitUntil(deadline, hubGitEnv(remote))(
    root,
    "push",
    "--quiet",
    "origin",
    `HEAD:refs/heads/${branch}`
  );
  console.info(
    `[place-push] ${root}: ${branch} at ${commit.slice(0, 9)} pushed to ${remote}`
  );
  return { ...read, pushed: true, hub };
};
