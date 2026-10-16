/**
 * First setup of a binary install. The installer script has already verified
 * the release signature and the archive's checksum and placed the executable;
 * this registers it with the service manager, brings the machine up, and tells
 * the person what is missing and offers to install it.
 */
import { rm } from "node:fs/promises";
import { hostname, platform } from "node:os";
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
  currentDirectory,
  currentExecutable,
  installationPath,
  readInstallation,
  updateStatePath,
  versionExecutable,
  writeJsonAtomic,
} from "@cawco/core/binary-installation";
import type {
  BinaryUpdatePolicy,
  BinaryUpdateState,
} from "@cawco/core/binary-updates";
import { writeWrapper } from "@cawco/core/binary-wrapper";
import { type Bounded, readWithin } from "@cawco/core/bounded";
import { machineId } from "@cawco/core/machine-id";
import { machineFetch } from "@cawco/core/machine-key";
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
const OFFERED = ["git", "claude", "opencode", "pi"] as const;
const JOIN_TIMEOUT_MS = 90_000;
/** How long a machine waits for the person to admit it, once the hub says it requires paired devices. */
const ADMISSION_TIMEOUT_MS = 10 * 60_000;
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

/** A binary install's units, with the keeper's for `keeper`'s build, run from its folder. */
export const binaryLayout = (keeper: string) => ({
  root: currentDirectory(),
  executable: currentExecutable(),
  wrapper: `${binaryRoot()}/run`,
  keeper: { version: keeper, executable: versionExecutable(keeper) },
});

/**
 * This machine's own row, as this machine (core machine-key.ts): a hub that
 * requires paired devices answers it to the admitted machine, and tells one
 * it has not admitted yet that it must pair. Within 5 s, body and all.
 */
const readOwnRow = (
  hubUrl: string,
  id: string
): Promise<Bounded<{ pairing: string | null; row?: AgentRow }>> =>
  readWithin(5000, async (signal) => {
    const response = await machineFetch(
      `${hubUrl}/api/agents/${encodeURIComponent(id)}`,
      { signal }
    );
    const pairing = response.headers.get("x-cawco-pairing");
    if (!response.ok) {
      await response.body?.cancel();
      return { pairing };
    }
    try {
      return { pairing, row: (await response.json()) as AgentRow };
    } catch {
      return { pairing };
    }
  });

async function awaitJoined(hubUrl: string): Promise<void> {
  const id = await machineId();
  let deadline = Date.now() + JOIN_TIMEOUT_MS;
  let waiting = false;
  while (Date.now() < deadline) {
    // biome-ignore lint/performance/noAwaitInLoops: a poll; each read must see the hub after the previous one
    const answer = await readOwnRow(hubUrl, id).catch(() => undefined);
    // Neither an unanswered read nor a refused one ends the wait: the poll asks again.
    switch (answer?.kind) {
      case undefined:
      case "unanswered":
        break;
      case "answered":
        if (answer.value.pairing === "required" && !waiting) {
          waiting = true;
          deadline = Date.now() + ADMISSION_TIMEOUT_MS;
          console.log(
            `${INSTALL_STEP_PREFIX}waiting to be admitted: this hub requires paired devices. Admit ${hostname()} on the dashboard's Machines list.`
          );
        }
        if (answer.value.row?.status === "online") {
          return;
        }
        break;
      default: {
        const unhandled: never = answer;
        throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
      }
    }
    await Bun.sleep(1000);
  }
  if (waiting) {
    throw new Error(
      `The agent started, and ${hubUrl} still waits for the person to admit this machine after ${ADMISSION_TIMEOUT_MS / 60_000} minutes. Admit it on the dashboard's Machines list; it connects the moment it is admitted.`
    );
  }
  const lan = process.platform === "darwin" && LOCAL_NETWORK_URL.test(hubUrl);
  throw new Error(
    `The agent started, but ${hubUrl} has not listed this machine online after ${JOIN_TIMEOUT_MS / 1000}s.` +
      (lan
        ? " macOS does not let a background service reach local-network addresses (10.x, 172.16-31.x, 192.168.x). Join with the hub's Tailscale address instead."
        : "")
  );
}

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
      const child = Bun.spawn(["/bin/sh", "-c", command], {
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
    // The installer's `keeper` link names this build: its keeper is the machine's from the start.
    binaryLayout: binaryLayout(runtimeVersion),
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
  // The agent's unit names its hub, so the unit is rewritten before the agent restarts.
  await discoverHub({ hub: hubUrl });
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
