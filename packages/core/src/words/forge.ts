/** What a forge calls a change request. */

import type { Forge } from "../forge-post";

/** What a pull request is called on each forge: GitLab's is a merge request. */
export const changeRequestWords = (forge: Forge): string =>
  forge === "gitlab" ? "merge request" : "pull request";
