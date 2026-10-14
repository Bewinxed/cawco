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
import { basename } from "node:path";
import { type PlacePush, WORKSPACE_GIT_TIMEOUT_MS } from "@cawco/core";
import { isSecretFileName } from "@cawco/core/paths";
import { expandHome } from "./fs";
import { useHubCredentialHelper } from "./git-credential";
import { hubGitEnv, hubRepo, isHubRemote } from "./move";
import { publishCheck } from "./place-repo";
import { gitUntil } from "./workspace";

const LINE = /\r?\n/;
/** `git ls-tree -r -l` line: mode, type, object, size, then a tab and the path. */
const TREE_SIZE = /^\S+ blob \S+\s+(\d+)\t/;

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
  const asked = expandHome(String(path));
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
  // What the branch holds now, read by the first commit's rules and the
  // credential scan; and every path its history ever held, by name. A
  // publish takes the history, so a secret committed once is refused even
  // when a later commit took it out.
  const tracked = (await git(root, "ls-tree", "-r", "--name-only", "HEAD"))
    .split(LINE)
    .filter(Boolean);
  const { leftOut, refused } = await publishCheck(root, tracked);
  const held = new Set(tracked);
  const history = [
    ...new Set(
      (await git(root, "log", "--format=", "--name-only", "HEAD"))
        .split(LINE)
        .filter((file) => file && !held.has(file))
    ),
  ].filter((file) => isSecretFileName(basename(file)));
  const barred = [
    ...refused,
    ...history.map((file) => ({
      path: file,
      why: "a secret's name, in an earlier commit",
    })),
  ];
  if (barred.length > 0) {
    throw new Error(
      `CawCo does not publish ${root}: its commits hold what reads as private or secret: ${barred
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
  await gitUntil(deadline, hubGitEnv())(
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
