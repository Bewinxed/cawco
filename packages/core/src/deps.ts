/**
 * The JavaScript package managers and lockfiles a checkout installs with: a
 * place's stage clone installs by its project's own manager (agent
 * stage-install.ts). A workspace's cut installs nothing: its delegate runs
 * its project's install. The landing gate installs nothing of its own: a
 * project declares its install as a step of its gate (hub gate-file.ts).
 */

/** The JavaScript package managers a checkout installs with, each named by its lockfile ({@link LOCKFILES}) or its `packageManager`. */
export const PACKAGE_MANAGERS = ["npm", "pnpm", "yarn", "bun"] as const;
export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

/** The lockfiles a checkout installs from, most specific first. */
export const LOCKFILES = [
  "bun.lock",
  "bun.lockb",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
] as const;
