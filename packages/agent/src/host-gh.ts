/**
 * The host's `gh`, and any program the host runs with its own sign-ins, as
 * CawCo runs them outside every workspace's boundary: the GitHub door signs
 * a workspace's gh requests with gh's token (github-door.ts), an approved
 * held request is made with it (upstream-posts.ts), and the forge adapters
 * sign in with it, or start gitea-mcp (forges/). No workspace is ever handed
 * a token; the hub is, for a `gh` connection made from this machine's gh
 * (core `CONTROL_GH_TOKEN`), and seals it as it seals every connection's.
 */
import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { GhAccount } from "@cawco/core";
import {
  workspaceCacheDir,
  workspaceScratchRoot,
  workspacesDir,
} from "@cawco/core/paths";
import { hostEnvironment } from "@cawco/core/session-env";
import { z } from "zod";

/** Where a workspace writes, so nothing run on the host is found there. */
const writableInside = (): string[] => [
  workspaceCacheDir(),
  workspacesDir(),
  workspaceScratchRoot(),
  join(homedir(), ".worktrees"),
  "/tmp",
  "/private/tmp",
  "/var/folders",
  "/private/var/folders",
];

/**
 * The program `name` as the host runs it, by its real path; none when the
 * agent finds none on its PATH, or finds it where a workspace writes, since
 * the host runs it with its own sign-ins (gh, a forge's gitea-mcp).
 */
export const hostProgram = async (
  name: string
): Promise<string | undefined> => {
  // The PATH as it is now: Bun.which alone reads the one the process began with.
  const found = Bun.which(name, { PATH: process.env.PATH ?? "" });
  const real = found ? await realpath(found).catch(() => undefined) : undefined;
  if (
    !real ||
    writableInside().some((dir) => real === dir || real.startsWith(`${dir}/`))
  ) {
    return;
  }
  return real;
};

/** `gh` as the host runs it ({@link hostProgram}). */
export const hostGh = (): Promise<string | undefined> => hostProgram("gh");

/**
 * What the host's gh prints for `args`, when it exits 0; none when gh is not
 * here or refuses. gh runs with the host's environment as it is now (core
 * `hostEnvironment`).
 */
export const ghSays = async (args: string[]): Promise<string | undefined> => {
  const gh = await hostGh();
  if (!gh) {
    return;
  }
  // Not spawnSync: gh reads its token from the login keychain, and a
  // spawnSync would wait on the keychain on the agent's JS thread.
  const read = Bun.spawn([gh, ...args], {
    env: hostEnvironment(),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "ignore",
  });
  const [out] = await Promise.all([
    new Response(read.stdout).text(),
    read.exited,
  ]);
  return read.exitCode === 0 ? out : undefined;
};

/** The host's GitHub token (`gh auth token`, from its keyring); none when gh has none or is not here. */
export const hostGhToken = async (): Promise<string | undefined> =>
  (await ghSays(["auth", "token"]))?.trim() || undefined;

/**
 * One account's token, as `gh auth token --hostname <host> --user <login>`
 * reads it (cli.github.com/manual/gh_auth_token): what a hub's `gh`
 * connection signs in with, read each time it is asked so a new `gh auth
 * login` here is what the next read finds. Refused when gh has none.
 */
export const ghAccountToken = async (
  host: string,
  login: string
): Promise<{ token: string }> => {
  const token = (
    await ghSays(["auth", "token", "--hostname", host, "--user", login])
  )?.trim();
  if (!token) {
    throw new Error(`gh here has no sign-in for ${login} on ${host}`);
  }
  return { token };
};

const SCOPE_SEPARATOR = /\s*,\s*/u;

/**
 * The accounts the host's gh is signed in to, as `gh auth status --json
 * hosts` lists them, each one gh checked with GitHub (`state` "success"),
 * its scopes as GitHub's `X-OAuth-Scopes` header gave them ("repo, read:org",
 * cli/cli pkg/cmd/auth/status). The JSON form "will always exit with zero
 * regardless of any authentication issues" (`gh auth status --help`). None
 * when gh is not here, signed in to nothing, or too old to answer JSON.
 */
export const ghAccounts = async (): Promise<GhAccount[]> => {
  const out = await ghSays(["auth", "status", "--json", "hosts"]);
  let read: { hosts?: Record<string, unknown> };
  try {
    read = z
      .object({ hosts: z.record(z.string(), z.unknown()).optional() })
      .parse(JSON.parse(out ?? "{}"));
  } catch {
    return [];
  }
  return Object.values(read.hosts ?? {}).flatMap((entries) =>
    (Array.isArray(entries) ? entries : []).flatMap((entry) => {
      const one = entry as Partial<{
        active: boolean;
        host: string;
        login: string;
        scopes: string;
        state: string;
      }>;
      return one.state === "success" && one.host && one.login
        ? [
            {
              host: one.host,
              login: one.login,
              active: one.active === true,
              scopes: (one.scopes ?? "")
                .split(SCOPE_SEPARATOR)
                .map((scope) => scope.trim())
                .filter(Boolean),
            },
          ]
        : [];
    })
  );
};
