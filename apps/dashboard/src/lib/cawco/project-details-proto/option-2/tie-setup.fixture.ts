/**
 * Local round-1 fixture data for Stage 1's inline tracker tie setup and
 * Stage 2's large-file key connections. Keeps the prototype interactive
 * without inventing hub calls or touching files outside option-2/.
 */

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
  statuses: readonly string[];
}

export const GITHUB_CONNECTIONS: readonly FixtureConnection[] = [
  { id: "gh-app", name: "Lantern GitHub App", account: "lantern-studio" },
  { id: "gh-token", name: "Mara's token", account: "mara-dev" },
];

export const LINEAR_CONNECTIONS: readonly FixtureConnection[] = [
  { id: "lin-app", name: "Lantern Linear", account: "lantern-studio" },
];

/** Project's linked repo first, followed by 11 realistic repositories reachable on the connection. */
export const GITHUB_REPOS: readonly FixtureTarget[] = [
  { id: "lantern-studio/lantern-web", label: "lantern-studio/lantern-web" },
  { id: "lantern-studio/lantern-api", label: "lantern-studio/lantern-api" },
  { id: "lantern-studio/lantern-ios", label: "lantern-studio/lantern-ios" },
  {
    id: "lantern-studio/lantern-design-kit",
    label: "lantern-studio/lantern-design-kit",
  },
  { id: "lantern-studio/lantern-docs", label: "lantern-studio/lantern-docs" },
  { id: "lantern-studio/lantern-infra", label: "lantern-studio/lantern-infra" },
  { id: "lantern-studio/lantern-cli", label: "lantern-studio/lantern-cli" },
  {
    id: "lantern-studio/lantern-marketing",
    label: "lantern-studio/lantern-marketing",
  },
  { id: "lantern-studio/lantern-sdk", label: "lantern-studio/lantern-sdk" },
  {
    id: "lantern-studio/lantern-workers",
    label: "lantern-studio/lantern-workers",
  },
  { id: "mara-dev/field-kit", label: "mara-dev/field-kit" },
  { id: "mara-dev/cawco-scripts", label: "mara-dev/cawco-scripts" },
];

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
    statuses: ["Todo", "In Progress", "In Review", "Done"],
  },
  {
    id: "proj-12",
    name: "Q4 launch",
    statuses: ["Todo", "In Progress", "In Review", "Done"],
  },
];

export const PROJECT_STAGES: readonly string[] = [
  "Backlog",
  "In progress",
  "Review",
  "Done",
];

export const DEFAULT_STAGE_STATUS: Readonly<Record<string, string>> = {
  Backlog: "Todo",
  "In progress": "In Progress",
  Review: "In Review",
  Done: "Done",
};

/** Key-bearing connections eligible to sign in to a declared large-file server. */
export const LARGE_FILE_KEY_CONNECTIONS: readonly FixtureConnection[] = [
  { id: "key-studio-s3", name: "Lantern LFS key", account: "lantern-studio" },
  { id: "key-mara-ssh", name: "Mara deploy key", account: "mara-dev" },
];
