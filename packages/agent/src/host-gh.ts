/**
 * The host's `gh`, and any program the host runs with its own sign-ins, as
 * CawCo runs them outside every workspace's boundary: the GitHub door signs
 * a workspace's gh requests with gh's token (github-door.ts), an approved
 * held request is made with it (upstream-posts.ts), and the forge adapters
 * sign in with it, or start gitea-mcp (forges/). No workspace is ever handed
 * a token.
 */
import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  workspaceCacheDir,
  workspaceScratchRoot,
  workspacesDir,
} from "@cawco/core/paths";
import { hostEnvironment } from "@cawco/core/session-env";

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
 * The host's GitHub token (`gh auth token`, from its keyring); none when gh
 * has none or is not here. gh runs with the host's environment as it is now
 * (core `hostEnvironment`), as the GitHub adapter runs it (forges/github.ts).
 */
export const hostGhToken = async (): Promise<string | undefined> => {
  const gh = await hostGh();
  if (!gh) {
    return;
  }
  // Not spawnSync: gh reads its token from the login keychain, and a
  // spawnSync would wait on the keychain on the agent's JS thread.
  const read = Bun.spawn([gh, "auth", "token"], {
    env: hostEnvironment(),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "ignore",
  });
  const [out] = await Promise.all([
    new Response(read.stdout).text(),
    read.exited,
  ]);
  const token = out.trim();
  return read.exitCode === 0 && token ? token : undefined;
};
