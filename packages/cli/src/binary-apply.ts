/**
 * The update helper, run by the service manager (not by the agent it replaces)
 * so it outlives the restart it performs. It swaps the `current` pointer
 * atomically, restarts what may be restarted, waits for the new build to
 * register, and puts the old build back if it does not.
 */
import { readdir, readFile, rename, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { machineId } from "@cawco/agent";
import {
  binaryRoot,
  installationPath,
  readInstallation,
  readUpdateState,
  updateStatePath,
  versionDirectory,
  writeJsonAtomic,
} from "@cawco/core/binary-installation";
import type { BinaryUpdateState } from "@cawco/core/binary-updates";
import {
  type ReleaseManifest,
  verifyManifest,
} from "@cawco/core/release-manifest";
import { binaryLayout } from "./binary-install";
import { type ServiceId, service } from "./service";

const HEALTH_TIMEOUT_MS = 45_000;

async function pointCurrentAt(version: string): Promise<void> {
  const temporary = join(binaryRoot(), `current.${process.pid}`);
  await rm(temporary, { force: true });
  await symlink(versionDirectory(version), temporary);
  await rename(temporary, join(binaryRoot(), "current"));
}

async function restart(ids: readonly ServiceId[], keeper: string) {
  // The fence has already answered; this is the service manager's turn.
  await service("restart", {
    ids,
    mode: "prod",
    follow: false,
    force: true,
    whenIdle: false,
    note: (line) => console.log(`update: ${line}`),
    binaryLayout: binaryLayout(keeper),
  });
}

async function awaitRegistered(hubUrl: string, version: string): Promise<void> {
  const id = await machineId();
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    // biome-ignore lint/performance/noAwaitInLoops: a poll; each read must see the hub after the previous one
    const response = await fetch(`${hubUrl}/api/agents`, {
      signal: AbortSignal.timeout(2000),
    }).catch(() => undefined);
    const agents = response?.ok
      ? ((await response.json()) as {
          build?: { version: string };
          machineId: string;
          status: string;
        }[])
      : [];
    if (
      agents.some(
        (row) =>
          row.machineId === id &&
          row.status === "online" &&
          row.build?.version === version
      )
    ) {
      return;
    }
    await Bun.sleep(500);
  }
  throw new Error(
    `The new build did not register with the hub within ${HEALTH_TIMEOUT_MS / 1000}s`
  );
}

/** Keeps the running build, the one it replaced, and the keeper's. */
async function prune(keep: readonly string[]): Promise<void> {
  const versions = join(binaryRoot(), "versions");
  const stale = (await readdir(versions)).filter(
    (name) => !keep.includes(name)
  );
  await Promise.all(
    stale.map((name) =>
      rm(join(versions, name), { recursive: true, force: true })
    )
  );
}

export async function applyBinary(
  version: string,
  held: number
): Promise<void> {
  const installed = await readInstallation();
  if (!installed) {
    throw new Error("This machine has no binary installation");
  }
  const directory = versionDirectory(version);
  const manifest = JSON.parse(
    await readFile(join(directory, "release.json"), "utf8")
  ) as ReleaseManifest;
  const { signature } = JSON.parse(
    await readFile(join(directory, "release.signature.json"), "utf8")
  ) as { signature: string };
  verifyManifest(manifest, signature);
  const before = (await readUpdateState()) as BinaryUpdateState;
  const previous = installed.installedVersion;
  const keeperBefore = installed.sessiondVersion;
  // The keeper moves only when it holds nothing.
  const moveKeeper = held === 0 && keeperBefore !== version;
  const keeperAfter = moveKeeper ? version : keeperBefore;
  const ids: ServiceId[] =
    installed.role === "hub" ? ["hub", "dashboard", "agent"] : ["agent"];
  const write = (state: Partial<BinaryUpdateState>) =>
    writeJsonAtomic(updateStatePath(), {
      ...before,
      ...state,
      updatedAt: Date.now(),
    });
  try {
    await pointCurrentAt(version);
    await writeJsonAtomic(installationPath(), {
      ...installed,
      installedVersion: version,
      sessiondVersion: keeperAfter,
    });
    if (moveKeeper) {
      await service("install", {
        ids: ["sessiond"],
        mode: "prod",
        follow: false,
        force: true,
        whenIdle: false,
        note: (line) => console.log(`update: ${line}`),
        binaryLayout: binaryLayout(keeperAfter),
      });
      await restart(["sessiond"], keeperAfter);
    }
    await restart(ids, keeperAfter);
    await awaitRegistered(installed.hubUrl, version);
    await prune([version, keeperAfter]);
    await write({
      phase: keeperAfter === version ? "installed" : "waiting-sessions",
      installedVersion: version,
      sessiondVersion: keeperAfter,
      heldChildren: keeperAfter === version ? undefined : held,
      availableVersion: version,
      channel: manifest.channel,
      notes: manifest.notes,
      error: undefined,
      unseen: true,
    });
  } catch (error) {
    let message = error instanceof Error ? error.message : String(error);
    try {
      await rollBack();
    } catch (rollbackError) {
      message += ` Putting the previous build back also failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`;
    }
    await write({
      phase: "failed-rolled-back",
      installedVersion: previous,
      sessiondVersion: keeperBefore,
      failedVersion: version,
      availableVersion: version,
      channel: manifest.channel,
      notes: manifest.notes,
      error: message,
      unseen: true,
    });
  }

  async function rollBack(): Promise<void> {
    await pointCurrentAt(previous);
    await writeJsonAtomic(installationPath(), installed);
    if (moveKeeper) {
      await service("install", {
        ids: ["sessiond"],
        mode: "prod",
        follow: false,
        force: true,
        whenIdle: false,
        note: (line) => console.log(`update: ${line}`),
        binaryLayout: binaryLayout(keeperBefore),
      });
      await restart(["sessiond"], keeperBefore);
    }
    await restart(ids, keeperBefore);
  }
}
