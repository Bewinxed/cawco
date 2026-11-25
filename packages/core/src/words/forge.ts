/** What a forge calls a change request. */

import type { ForgeId } from "@cawco/providers/provider";

/** What a pull request is called on each forge: GitLab's is a merge request. */
export const changeRequestWords = (forge: ForgeId): string =>
  forge === "gitlab" ? "merge request" : "pull request";
