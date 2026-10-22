/**
 * First setup of a binary install. The installer script has already verified
 * the release signature and the archive's checksum and placed the executable;
 * this registers it with the service manager, brings the machine up, and tells
 * the person what is missing and offers to install it.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import { join } from "node:path";
import { probeCapabilities } from "@cawco/agent/capabilities";
import { CAWCO_ENV, INSTALL_JOINED, INSTALL_STEP_PREFIX } from "@cawco/core";
import {
  type BinaryInstallation,
  binaryRoot,
  currentDirectory,
  currentExecutable,
  installationPath,
  readInstallation,
  recordInstall,
  updateStatePath,
  versionExecutable,
  writeJsonAtomic,
} from "@cawco/core/binary-installation";
import type {
  BinaryUpdatePolicy,
  BinaryUpdateState,
} from "@cawco/core/binary-updates";
import { writeWrapper } from "@cawco/core/binary-wrapper";
import { machineId } from "@cawco/core/machine-id";
import { runtimeVersion } from "@cawco/core/runtime";
import { askYes, closeAsking } from "./ask";
import { awaitJoined } from "./await-joined";
import { keepJoinedHub } from "./joined-hub";
import {
  awaitFirstMachineReady,
  dashboardUrl,
  requireLinger,
  service,
  systemdActive,
} from "./service";

/** Tools offered at install: what CawCo uses, none of it required to start. */
const OFFERED = ["git", "claude", "opencode", "pi"] as const;

export interface BinaryInstallOptions {
  /** Ask in this terminal before installing a missing tool. */
  ask: boolean;
  hubUrl: string;
  policy: BinaryUpdatePolicy;
  releaseHost?: string;
  role: BinaryInstallation["role"];
}

/** A binary install's units, with the keeper's for `keeper`'s build, run from its folder. */
export const binaryLayout = (keeper: string) => ({
  root: currentDirectory(),
  executable: currentExecutable(),
  wrapper: `${binaryRoot()}/run`,
  keeper: { version: keeper, executable: versionExecutable(keeper) },
});

/** Asks whether to run `id`'s install command: a yes runs it; a no, no answer, or no terminal says it was skipped. */
async function runAllowed(id: string): Promise<boolean> {
  const yes = await askYes("Run that command now? [y/N] ");
  switch (yes.kind) {
    case "answered":
      if (yes.value) {
        return true;
      }
      console.log(`${id}: skipped. CawCo works without it.`);
      return false;
    case "unanswered":
      console.log(
        yes.reason === "timeout"
          ? `${id}: skipped, nobody answered within ${Math.round(yes.after / 1000)}s. CawCo works without it.`
          : `${id}: skipped, the terminal's input ended. CawCo works without it.`
      );
      return false;
    case "not asked":
      console.log(`${id}: skipped. CawCo works without it.`);
      return false;
    default: {
      const unhandled: never = yes;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
}

/** Says what is missing and offers each fix; a no, or no terminal, installs nothing. */
async function offerTools(ask: boolean): Promise<boolean> {
  let installed = false;
  try {
    const { items } = await probeCapabilities();
    for (const item of items) {
      if (item.available) {
        console.log(
          `${item.id}: found${item.version ? ` ${item.version}` : ""}`
        );
        continue;
      }
      const command = item.installCommand;
      console.log(
        `${item.id}: not installed. ${item.reason ?? ""}${command ? `\n  To install it: ${command}` : ""}`
      );
      if (!(
        command &&
        ask &&
        (OFFERED as readonly string[]).includes(item.id)
      )) {
        continue;
      }
      // biome-ignore lint/performance/noAwaitInLoops: one prompt at a time, each reading its own line
      if (!(await runAllowed(item.id))) {
        continue;
      }
      // A folder of its own, for the installer script the command downloads
      // before it runs it (core ToolInstallMethod `command`), gone after.
      const dir = await mkdtemp(join(tmpdir(), "cawco-install-"));
      const child = Bun.spawn(["/bin/sh", "-c", command], {
        cwd: dir,
        stdio: ["inherit", "inherit", "inherit"],
      });
      const exited = await child.exited;
      await rm(dir, { recursive: true, force: true });
      if (exited === 0) {
        installed = true;
      } else {
        console.error(
          `${item.id}: the install command failed. CawCo is installed.`
        );
      }
    }
  } finally {
    closeAsking();
  }
  return installed;
}

async function bringUp(options: BinaryInstallOptions): Promise<void> {
  const note = (line: string) =>
    console.log(line.endsWith("…") ? `${INSTALL_STEP_PREFIX}${line}` : line);
  if (platform() === "linux") {
    await requireLinger(note);
  }
  // The wrapper every unit starts through; afterwards only a confirmed build replaces it.
  await writeWrapper(binaryRoot());
  await writeJsonAtomic(installationPath(), {
    role: options.role,
    root: binaryRoot(),
    ...(options.role === "hub" ? { dashboardUrl: dashboardUrl() } : {}),
    hubUrl: options.hubUrl,
    installedVersion: runtimeVersion,
    ...(options.releaseHost ? { releaseHost: options.releaseHost } : {}),
  } satisfies BinaryInstallation);
  // The first build in this machine's install order (core `prune` keeps it
  // and the two installed after it); a reinstall puts its build at the end.
  await recordInstall(runtimeVersion);
  await writeJsonAtomic(updateStatePath(), {
    phase: "none",
    installedVersion: runtimeVersion,
    channel: options.policy.channel,
    updatedAt: Date.now(),
    hostsHub: options.role === "hub",
  } satisfies BinaryUpdateState);
  await keepJoinedHub(options.hubUrl);
  // The agent's unit names its hub from this.
  process.env[CAWCO_ENV.hubUrl] = options.hubUrl;
  // An agent already running here (an earlier install whose files a failed
  // run removed, its unit left up) is left running by systemd's `enable
  // --now`: on the build it started with, and on a connection the hub may
  // be holding for the person. It is restarted once its unit names this
  // build. launchd's install boots a loaded agent out and bootstraps it again
  // (service.ts `loadLaunchAgent`); sessiond is never restarted here, its
  // restart ends every session.
  const agentRan = platform() === "linux" && (await systemdActive("agent"));
  await service("install", {
    ids:
      options.role === "hub"
        ? ["hub", "dashboard", "sessiond", "agent"]
        : ["sessiond", "agent"],
    mode: "prod",
    follow: false,
    force: false,
    whenIdle: false,
    note,
    // The installer's `keeper` link names this build: its keeper is the machine's from the start.
    binaryLayout: binaryLayout(runtimeVersion),
  });
  if (agentRan) {
    await service("restart", {
      ids: ["agent"],
      mode: "prod",
      follow: false,
      force: true,
      whenIdle: false,
      note,
      binaryLayout: binaryLayout(runtimeVersion),
    });
  }
  if (options.role === "hub") {
    await awaitFirstMachineReady(options.hubUrl, note);
    const saved = await fetch(`${options.hubUrl}/api/binary-updates/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(options.policy),
    });
    if (!saved.ok) {
      throw new Error(
        `The hub did not save the update settings: ${await saved.text()}`
      );
    }
  } else {
    await awaitJoined(options.hubUrl);
  }
  if (await offerTools(options.ask)) {
    // Nothing runs a session yet, so the agent is restarted to report the new tools.
    await service("restart", {
      ids: ["agent"],
      mode: "prod",
      follow: false,
      force: true,
      whenIdle: false,
      note,
      binaryLayout: binaryLayout(runtimeVersion),
    });
  }
  console.log(`CawCo ${runtimeVersion} is installed.`);
  if (options.role === "agent") {
    console.log(`${INSTALL_JOINED}${await machineId()}`);
  }
}

export async function setupBinary(
  options: BinaryInstallOptions
): Promise<void> {
  try {
    await bringUp(options);
  } catch (error) {
    // A half-installed machine must not read as installed to the next run.
    await rm(installationPath(), { force: true });
    throw error;
  }
}

/** Moves an installed machine to another hub: the agent is re-pointed and restarted, no build is installed. */
export async function rejoinBinary(hubUrl: string): Promise<void> {
  const installed = await readInstallation();
  if (!installed) {
    throw new Error("This machine has no binary installation");
  }
  const note = (line: string) =>
    console.log(line.endsWith("…") ? `${INSTALL_STEP_PREFIX}${line}` : line);
  await writeJsonAtomic(installationPath(), { ...installed, hubUrl });
  await keepJoinedHub(hubUrl);
  // The agent's unit names its hub, so the unit is rewritten before the agent restarts.
  process.env[CAWCO_ENV.hubUrl] = hubUrl;
  // Only the agent's unit is written: no keeper's is touched.
  const layout = binaryLayout(installed.installedVersion);
  const options = {
    ids: ["agent"] as const,
    mode: "prod" as const,
    follow: false,
    force: true,
    whenIdle: false,
    note,
    binaryLayout: layout,
  };
  await service("install", options);
  await service("restart", options);
  await awaitJoined(hubUrl);
  console.log(`${INSTALL_JOINED}${await machineId()}`);
}
