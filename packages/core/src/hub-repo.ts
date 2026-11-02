/**
 * Which of a project's repositories a hub git path names (hub
 * git-remote.ts). A project holds one repository per source repository its
 * delegates are cut from: its main one at `/git/<projectId>.git`, the URL
 * every project has had, and each other at `/git/<projectId>.<root>.git`,
 * keyed by the repository's root commit (the root its HEAD reaches by
 * first parents), so two unrelated repositories in one project never share
 * a `main`. The root is the key because every clone of a repository, on any
 * machine, has it, and two unrelated repositories never do.
 */

/** A root commit: a sha1 or sha256 object name. */
const ROOT = "[0-9a-f]{40}|[0-9a-f]{64}";

/** A repository's segment of a `/git/` path: `<projectId>.git` or `<projectId>.<root>.git`. */
const SEGMENT = new RegExp(
  `^([A-Za-z0-9][A-Za-z0-9_-]{0,127})(?:\\.(${ROOT}))?\\.git$`,
  "u"
);

/** One of a project's repositories on the hub: its main one when `root` is absent. */
export interface HubRepoKey {
  readonly projectId: string;
  readonly root?: string;
}

/** The path segment of `key`'s repository, which is also its bare repository's folder name. */
export const hubRepoSegment = ({ projectId, root }: HubRepoKey): string =>
  root ? `${projectId}.${root}.git` : `${projectId}.git`;

/** The repository a path segment names, or undefined for one that names none. */
export const parseHubRepoSegment = (
  segment: string
): HubRepoKey | undefined => {
  const match = SEGMENT.exec(segment);
  if (!match) {
    return;
  }
  const [, projectId = "", root] = match;
  return root ? { projectId, root } : { projectId };
};

/**
 * The hub's remote of a project's repository as any address names it:
 * `/git/<project uuid>[.<root>].git`. The project id is a uuid here, so a
 * `/git/<name>.git` on any other host is not taken for the hub's.
 */
const HUB_REMOTE_PATH = new RegExp(
  `^/git/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\\.(${ROOT}))?(?:\\.git)?/?$`,
  "iu"
);

/**
 * The repository a remote URL names when it is the hub's, by its path alone
 * (machines reach the hub by different addresses); undefined for any other
 * URL, and for git's scp-like form, which the hub never answers at.
 */
export const hubRepoOfUrl = (url: string): HubRepoKey | undefined => {
  let path: string;
  try {
    path = new URL(url.trim()).pathname;
  } catch {
    return;
  }
  const match = HUB_REMOTE_PATH.exec(path);
  if (!match) {
    return;
  }
  const [, projectId = "", root] = match;
  return root
    ? { projectId: projectId.toLowerCase(), root: root.toLowerCase() }
    : { projectId: projectId.toLowerCase() };
};
