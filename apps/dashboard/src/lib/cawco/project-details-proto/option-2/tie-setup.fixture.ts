/**
 * Local round-1 fixture data for Stage 1's inline tracker tie setup and
 * Stage 2's large-file key connections. Keeps the prototype interactive
 * without inventing hub calls or touching files outside option-2/.
 */

import type { GhRepo, GhRepoList, GhRepoOwner } from "@cawco/core/connections";
import {
  DAY_MS as DAY,
  HOUR_MS as HOUR,
  MINUTE_MS as MINUTE,
} from "@cawco/core/time";
import { avatar, repo } from "#lib/cawco/spawn/location-mock.js";

export interface FixtureConnection {
  account: string;
  id: string;
  name: string;
}

export interface FixtureTarget {
  id: string;
  label: string;
}

export interface FixtureGithubProject {
  id: string;
  name: string;
}

export const GITHUB_CONNECTIONS: readonly FixtureConnection[] = [
  { id: "gh-app", name: "Lantern GitHub App", account: "lantern-studio" },
  { id: "gh-token", name: "Mara's token", account: "mara-dev" },
];

export const LINEAR_CONNECTIONS: readonly FixtureConnection[] = [
  { id: "lin-app", name: "Lantern Linear", account: "lantern-studio" },
];

const LANTERN: GhRepoOwner = {
  login: "lantern-studio",
  kind: "org",
  avatarUrl: avatar("L", "#be123c"),
};
const MARA: GhRepoOwner = {
  login: "mara-dev",
  kind: "user",
  avatarUrl: avatar("M", "#0f766e"),
};

/** The studio's repositories, latest updated first: the project's own leads. */
const STUDIO_REPOS: GhRepo[] = [
  repo(
    LANTERN,
    "lantern-web",
    "Lantern's web app: the booking flow, the venue pages and the account area",
    true,
    12 * MINUTE
  ),
  repo(
    LANTERN,
    "lantern-api",
    "The API behind web and iOS: bookings, venues, payments",
    true,
    2 * HOUR
  ),
  repo(LANTERN, "lantern-ios", "The iOS app, SwiftUI", true, 5 * HOUR),
  repo(
    LANTERN,
    "lantern-design-kit",
    "Tokens, icons and the component library both apps draw from",
    false,
    20 * HOUR
  ),
  repo(
    LANTERN,
    "lantern-docs",
    "Public docs and the API reference",
    false,
    2 * DAY
  ),
  repo(
    LANTERN,
    "lantern-infra",
    "Terraform for the hosting, the queues and the CDN",
    true,
    3 * DAY
  ),
  repo(LANTERN, "lantern-cli", null, false, 6 * DAY),
  repo(
    LANTERN,
    "lantern-marketing",
    "lanternstudio.app and the launch pages",
    false,
    9 * DAY
  ),
  repo(
    LANTERN,
    "lantern-sdk",
    "TypeScript client for the public API",
    false,
    14 * DAY
  ),
  repo(
    LANTERN,
    "lantern-workers",
    "Background jobs: reminders, payouts, nightly reports",
    true,
    21 * DAY
  ),
];

/** What each GitHub connection's account can reach: the studio's app sees the studio's; Mara's token sees hers as well. */
const REPOS_BY_CONNECTION: Readonly<Record<string, GhRepo[]>> = {
  "gh-app": STUDIO_REPOS,
  "gh-token": [
    ...STUDIO_REPOS,
    repo(
      MARA,
      "field-kit",
      "Notes and scripts from venue visits",
      false,
      4 * DAY
    ),
    repo(
      MARA,
      "cawco-scripts",
      "Mara's CawCo routines and helpers",
      true,
      30 * DAY
    ),
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
};

/**
 * What a GitHub connection answers the repository picker's list with, as a
 * machine's gh answers `ghRepos` (core `GhRepoList`): the picker is
 * mounted with the connection's id where it takes a machine's.
 */
export const githubReposOf = (connectionId: string): GhRepoList => ({
  kind: "listed",
  repos: REPOS_BY_CONNECTION[connectionId] ?? [],
});

export const LINEAR_TEAMS: readonly FixtureTarget[] = [
  { id: "LAN", label: "Lantern Web (LAN)" },
  { id: "ENG", label: "Platform (ENG)" },
  { id: "DES", label: "Design Systems (DES)" },
  { id: "OPS", label: "Infrastructure (OPS)" },
];

export const GITHUB_PROJECTS: readonly FixtureGithubProject[] = [
  {
    id: "proj-7",
    name: "Lantern roadmap",
  },
  {
    id: "proj-12",
    name: "Q4 launch",
  },
];

/** Key-bearing connections eligible to sign in to a declared large-file server. */
export const LARGE_FILE_KEY_CONNECTIONS: readonly FixtureConnection[] = [
  { id: "key-studio-s3", name: "Lantern LFS key", account: "lantern-studio" },
  { id: "key-mara-ssh", name: "Mara deploy key", account: "mara-dev" },
];
