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
