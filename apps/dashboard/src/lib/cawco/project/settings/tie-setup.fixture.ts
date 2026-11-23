/**
 * What the Settings view's states files answer the tie's setup with (its
 * sign-ins, a GitHub sign-in's repositories, Linear's teams, the GitHub
 * Projects) and the sign-ins with a key a large-file server takes: the
 * stories' mock data at the view's `setup` and `keys` props.
 */

import type { GhRepo, GhRepoList, GhRepoOwner } from "@cawco/core/connections";
import {
  DAY_MS as DAY,
  HOUR_MS as HOUR,
  MINUTE_MS as MINUTE,
} from "@cawco/core/time";
import { avatar, repo } from "#lib/cawco/spawn/location-mock.js";
import type { SetupConnection, TieSetup } from "./changes";

const GITHUB_CONNECTIONS: SetupConnection[] = [
  { name: "Lantern GitHub App", account: "lantern-studio" },
  { name: "Mara's token", account: "mara-dev" },
];

const LINEAR_CONNECTIONS: SetupConnection[] = [
  { name: "Lantern Linear", account: "lantern-studio" },
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
  "connection:Lantern GitHub App": STUDIO_REPOS,
  "connection:Mara's token": [
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

/** What a GitHub sign-in answers the repository picker's list with (core `GhRepoList`), by the picker's `connection:<name>` key. */
const githubReposOf = (key: string): GhRepoList => ({
  kind: "listed",
  repos: REPOS_BY_CONNECTION[key] ?? [],
});

const LINEAR_TEAMS = [
  { id: "LAN", label: "Lantern Web (LAN)" },
  { id: "ENG", label: "Platform (ENG)" },
  { id: "DES", label: "Design Systems (DES)" },
  { id: "OPS", label: "Infrastructure (OPS)" },
];

const GITHUB_PROJECTS = [
  { id: "proj-7", name: "Lantern roadmap", linked: true },
  { id: "proj-12", name: "Q4 launch", linked: false },
];

/** The tie's setup as every read answers it at once. */
export const TIE_SETUP: TieSetup = {
  connections: {
    github: { state: "read", value: GITHUB_CONNECTIONS },
    linear: { state: "read", value: LINEAR_CONNECTIONS },
  },
  teams: {
    "Lantern Linear": { state: "read", value: LINEAR_TEAMS },
  },
  projects: Object.fromEntries(
    [...GITHUB_CONNECTIONS].flatMap((conn) =>
      STUDIO_REPOS.map((one) => [
        `${conn.name} ${one.nameWithOwner}`,
        {
          state: "read" as const,
          value: { projects: GITHUB_PROJECTS, refused: null },
        },
      ])
    )
  ),
  read: () => undefined,
  repos: {
    list: (key) =>
      Promise.resolve({ kind: "answered", value: githubReposOf(key) }),
    look: (_key, _url) =>
      Promise.resolve({ kind: "answered", value: { kind: "not-found" } }),
  },
};

/** The fleet's sign-ins with a key a large-file server takes. */
export const LARGE_FILE_KEYS: SetupConnection[] = [
  { name: "Lantern LFS key", account: "lantern-studio" },
  { name: "Mara deploy key", account: "mara-dev" },
];
