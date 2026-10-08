/**
 * First setup of a binary install. The installer script has already verified
 * the release signature and the archive's checksum and placed the executable;
 * this registers it with the service manager, brings the machine up, and tells
 * the person what is missing and offers to install it.
 */
import { rm } from "node:fs/promises";
import { platform } from "node:os";
import { probeCapabilities } from "@cawco/agent/capabilities";
import {
  type AgentRow,
  CAWCO_ENV,
  INSTALL_JOINED,
  INSTALL_STEP_PREFIX,
} from "@cawco/core";
import {
  type BinaryInstallation,
  binaryRoot,
  installationPath,
  readInstallation,
  updateStatePath,
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
import { discoverHub } from "./discover";
import {
  awaitFirstMachineReady,
  dashboardUrl,
  requireLinger,
  service,
} from "./service";

/** Tools offered at install: what CawCo uses, none of it required to start. */
const OFFERED = ["git", "opencode", "pi"] as const;
const JOIN_TIMEOUT_MS = 90_000;
const LOCAL_NETWORK_URL =
  /^https?:\/\/(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

export interface BinaryInstallOptions {
  /** Ask in this terminal before installing a missing tool. */
  ask: boolean;
  hubUrl: string;
  policy: BinaryUpdatePolicy;
  releaseHost?: string;
  role: BinaryInstallation["role"];
}

export const binaryLayout = () => ({
  executable: `${binaryRoot()}/current/cawco`,
  wrapper: `${binaryRoot()}/run`,
});

async function awaitJoined(hubUrl: string): Promise<void> {
  const id = await machineId();
  const deadline = Date.now() + JOIN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    // biome-ignore lint/performance/noAwaitInLoops: a poll; each read must see the hub after the previous one
    const agents = await fetch(`${hubUrl}/api/agents`, {
      signal: AbortSignal.timeout(5000),
    })
      .then((response) =>
        response.ok ? (response.json() as Promise<AgentRow[]>) : []
      )
      .catch(() => [] as AgentRow[]);
    if (agents.some((a) => a.machineId === id && a.status === "online")) {
      return;
    }
    await Bun.sleep(1000);
  }
  const lan = process.platform === "darwin" && LOCAL_NETWORK_URL.test(hubUrl);
  throw new Error(
    `The agent started, but ${hubUrl} has not listed this machine online after ${JOIN_TIMEOUT_MS / 1000}s.` +
      (lan
        ? " macOS does not let a background service reach local-network addresses (10.x, 172.16-31.x, 192.168.x). Join with the hub's Tailscale address instead."
        : "")
  );
}

/** Says what is missing and offers each fix; a no, or no terminal, installs nothing. */
async function offerTools(ask: boolean): Promise<boolean> {
  let installed = false;
  try {
    for (const item of probeCapabilities().items) {
      if (item.available) {
        console.log(
          `${item.id}: found${item.version ? ` ${item.version}` : ""}`
        );
        continue;
      }
      console.log(
        `${item.id}: not installed. ${item.reason ?? ""}\n  To install it: ${item.installCommand}`
      );
      if (!(ask && (OFFERED as readonly string[]).includes(item.id))) {
        continue;
      }
      // biome-ignore lint/performance/noAwaitInLoops: one prompt at a time, each reading its own line
      if (!(await askYes("Run that command now? [y/N] "))) {
        console.log(`${item.id}: skipped. CawCo works without it.`);
        continue;
      }
      const child = Bun.spawn(["/bin/sh", "-c", item.installCommand], {
        stdio: ["inherit", "inherit", "inherit"],
      });
      if ((await child.exited) === 0) {
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
  await writeJsonAtomic(updateStatePath(), {
    phase: "none",
    installedVersion: runtimeVersion,
    channel: options.policy.channel,
    updatedAt: Date.now(),
    hostsHub: options.role === "hub",
  } satisfies BinaryUpdateState);
  // Saved the way `up` saves a hub it was told, so the agent unit finds it.
  await discoverHub({ hub: options.hubUrl });
  process.env[CAWCO_ENV.hubUrl] = options.hubUrl;
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
    binaryLayout: binaryLayout(),
  });
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
      binaryLayout: binaryLayout(),
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
  // The agent's unit names its hub, so the unit is rewritten before the agent restarts.
  await discoverHub({ hub: hubUrl });
  process.env[CAWCO_ENV.hubUrl] = hubUrl;
  const layout = binaryLayout();
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
