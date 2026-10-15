/**
 * The host's `gh`, as CawCo runs it outside every workspace's boundary: the
 * executor reads its token for an unguarded workspace's commands
 * (boundary.ts `ghToken`), and a guarded workspace's git door hands it to one
 * allowed `gh` call at a time and authenticates its origin's fetches and
 * pushes with it (hub-git.ts).
 */
import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  workspaceCacheDir,
  workspaceScratchRoot,
  workspacesDir,
} from "@cawco/core/paths";

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
 * `gh` as the host runs it, by its real path; none when the agent finds
 * none, or finds it where a workspace writes.
 */
export const hostGh = async (): Promise<string | undefined> => {
  const found = Bun.which("gh");
  const real = found ? await realpath(found).catch(() => undefined) : undefined;
  if (
    !real ||
    writableInside().some((dir) => real === dir || real.startsWith(`${dir}/`))
  ) {
    return;
  }
  return real;
};

/** The host's GitHub token (`gh auth token`, from its keyring); none when gh has none or is not here. */
export const hostGhToken = async (): Promise<string | undefined> => {
  const gh = await hostGh();
  if (!gh) {
    return;
  }
  const read = Bun.spawnSync([gh, "auth", "token"], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "ignore",
  });
  const token = read.stdout.toString().trim();
  return read.exitCode === 0 && token ? token : undefined;
};
