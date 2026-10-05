/**
 * The machine's side of binary updates: learn of the channel's build from the
 * hub, verify and stage it, and apply it through a service-manager-owned helper
 * when `mayReplaceMachineServices` allows. One code path, whether it runs on
 * the idle tick (auto-update on) or because a person pressed "Install now".
 */
import { rename, rm } from "node:fs/promises";
import { join } from "node:path";
import type { AgentBusyReport, UpdateReport } from "@cawco/core";
import {
  archiveMatches,
  type SignedRelease,
} from "@cawco/core/binary-distribution";
import {
  binaryRoot,
  readInstallation,
  readUpdateState,
  updateStatePath,
  versionDirectory,
  writeJsonAtomic,
} from "@cawco/core/binary-installation";
import type {
  BinaryUpdatePolicy,
  BinaryUpdateState,
} from "@cawco/core/binary-updates";
import { verifyManifest } from "@cawco/core/release-manifest";
import { runtimeVersion } from "@cawco/core/runtime";
import { sessiondEndpoint } from "@cawco/core/sessiond";
import { SessiondClient } from "./sessiond-client";

const POLL_MS = 60_000;
/** An update that says it is installing for longer than this has lost its helper. */
const INSTALL_STALE_MS = 10 * 60_000;

/**
 * Whether this machine's services may be replaced right now. The retirement
 * fence replaces this one body when its reviewed branch lands.
 */
export async function mayReplaceMachineServices(
  readBusy: () => Promise<AgentBusyReport>
): Promise<boolean> {
  const busy = await readBusy();
  return busy.ready && busy.busy === 0;
}

/** The session keeper's held children and what it speaks, read now. */
async function readKeeper(): Promise<{
  capabilities: readonly string[];
  held: number;
}> {
  const client = await SessiondClient.connect(
    process.env.CAWCO_SESSIOND_ENDPOINT ?? sessiondEndpoint()
  );
  try {
    return {
      held: client.procs.filter((proc) => proc.alive).length,
      capabilities: client.capabilities,
    };
  } finally {
    client.close();
  }
}

async function launchApplyHelper(version: string, held: number) {
  const executable = process.execPath;
  const args = ["binary-apply", version, "--held", String(held)];
  const forwarded = Object.entries(process.env).filter(
    ([key, value]) => key.startsWith("CAWCO_") && value !== undefined
  ) as [string, string][];
  if (process.platform === "linux") {
    const child = Bun.spawn(
      [
        "systemd-run",
        "--user",
        "--collect",
        `--unit=cawco-binary-apply-${Date.now()}`,
        "--property=Type=exec",
        ...forwarded.map(([key, value]) => `--setenv=${key}=${value}`),
        executable,
        ...args,
      ],
      { stdout: "pipe", stderr: "pipe" }
    );
    if ((await child.exited) !== 0) {
      throw new Error(
        `The update helper could not start: ${(await new Response(child.stderr).text()).trim()}`
      );
    }
    return;
  }
  const label = `dev.cawco.binary-apply.${Date.now()}`;
  const plist = join(binaryRoot(), `${label}.plist`);
  const text = (value: string) =>
    `<string>${value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</string>`;
  await Bun.write(
    plist,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key>${text(label)}
<key>ProgramArguments</key><array>${[executable, ...args].map(text).join("")}</array>
<key>EnvironmentVariables</key><dict>${forwarded.map(([key, value]) => `<key>${key}</key>${text(value)}`).join("")}</dict>
<key>RunAtLoad</key><true/>
</dict></plist>
`
  );
  const child = Bun.spawn(
    ["launchctl", "bootstrap", `gui/${process.getuid?.()}`, plist],
    { stdout: "pipe", stderr: "pipe" }
  );
  if ((await child.exited) !== 0) {
    throw new Error(
      `The update helper could not start: ${(await new Response(child.stderr).text()).trim()}`
    );
  }
}

export class BinaryUpdater {
  #state: BinaryUpdateState = {
    phase: "none",
    installedVersion: runtimeVersion,
    channel: "stable",
    updatedAt: Date.now(),
    unseen: false,
  };
  #policy: BinaryUpdatePolicy = { channel: "stable", autoUpdate: false };
  #staged: string | undefined;
  /** `commanded`: a person asked for this build, so it applies at the first moment allowed. */
  readonly #flags: { commanded: boolean } = { commanded: false };
  #running: Promise<void> | undefined;
  #timer: ReturnType<typeof setInterval> | undefined;
  readonly #readBusy: () => Promise<AgentBusyReport>;
  readonly #report: (state: BinaryUpdateState) => void;

  constructor(
    readBusy: () => Promise<AgentBusyReport>,
    report: (state: BinaryUpdateState) => void
  ) {
    this.#readBusy = readBusy;
    this.#report = report;
  }

  get state(): BinaryUpdateState {
    return this.#state;
  }

  /** Starts only on a binary install; a source checkout has nothing to update. */
  async start(): Promise<void> {
    if (!(await readInstallation())) {
      return;
    }
    await this.#load();
    this.#timer = setInterval(() => this.tick(), POLL_MS);
    this.#timer.unref();
    await this.tick();
  }

  stop(): void {
    if (this.#timer) {
      clearInterval(this.#timer);
    }
  }

  /** The hub's push: remember it and act on it without holding the hub's call. */
  configure(policy: BinaryUpdatePolicy): BinaryUpdateState {
    this.#policy = policy;
    setTimeout(() => this.tick(), 0);
    return this.#state;
  }

  async acknowledge(): Promise<BinaryUpdateState> {
    await this.#load();
    await this.#set({ unseen: false });
    return this.#state;
  }

  /** The command behind "Install now": stage the offered build, then apply it. */
  async installNow(): Promise<UpdateReport> {
    const from = this.#state.installedVersion;
    this.#flags.commanded = true;
    // A pass already in flight began before the command: let it end, then run one that sees it.
    await this.#running;
    await this.tick();
    const to = this.#state.availableVersion;
    return {
      from,
      to,
      built: false,
      changed: ["hub", "dashboard", "agent"],
      installed: this.#state.phase === "installing",
      pulled: to ? `signed release ${to}` : "no newer release",
      restarted: [],
      ...(this.#state.phase === "installing"
        ? {}
        : { skipped: `update is ${this.#state.phase}` }),
    };
  }

  async #load(): Promise<void> {
    const saved = await readUpdateState();
    this.#state = {
      ...(saved ?? this.#state),
      installedVersion: runtimeVersion,
    };
    this.#report(this.#state);
  }

  async #set(update: Partial<BinaryUpdateState>): Promise<void> {
    this.#state = { ...this.#state, ...update, updatedAt: Date.now() };
    await writeJsonAtomic(updateStatePath(), this.#state);
    this.#report(this.#state);
  }

  /** One pass of load, check and (when allowed) stage and apply; callers share a pass in flight. */
  tick(): Promise<void> {
    this.#running ??= this.#pass().finally(() => {
      this.#running = undefined;
    });
    return this.#running;
  }

  async #pass(): Promise<void> {
    try {
      await this.#load();
      await this.#check();
    } catch (error) {
      this.#flags.commanded = false;
      await this.#set({
        phase: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async #check(): Promise<void> {
    const installation = await readInstallation();
    if (!installation) {
      return;
    }
    const hub = installation.hubUrl;
    const settings = await fetch(`${hub}/api/binary-updates/settings`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!settings.ok) {
      throw new Error(`The hub's update settings answered ${settings.status}`);
    }
    this.#policy = (await settings.json()) as BinaryUpdatePolicy;
    const offer = await fetch(`${hub}/api/binary-updates/release`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!offer.ok) {
      throw new Error(
        `The hub has no ${this.#policy.channel} build: ${offer.status}`
      );
    }
    const release = (await offer.json()) as SignedRelease;
    verifyManifest(release.manifest, release.signature);
    if (release.manifest.channel !== this.#policy.channel) {
      throw new Error("The hub offered a build from another channel");
    }
    await this.#set({ channel: this.#policy.channel });
    if (
      this.#state.phase === "installing" &&
      Date.now() - this.#state.updatedAt > INSTALL_STALE_MS
    ) {
      await this.#set({
        phase: "failed",
        error: "The update helper did not report back",
      });
    }
    if (release.manifest.version === runtimeVersion) {
      this.#staged = undefined;
      this.#flags.commanded = false;
      if (
        ["failed", "available", "downloading", "ready"].includes(
          this.#state.phase
        )
      ) {
        await this.#set({
          phase: "none",
          availableVersion: undefined,
          notes: undefined,
          error: undefined,
        });
      }
      await this.#advanceKeeper(installation.sessiondVersion);
      return;
    }
    const failedBefore = this.#state.failedVersion === release.manifest.version;
    if (
      !["installing", "waiting-sessions", "ready"].includes(this.#state.phase)
    ) {
      await this.#set({
        phase: failedBefore ? "failed-rolled-back" : "available",
        availableVersion: release.manifest.version,
        notes: release.manifest.notes,
      });
    }
    if (this.#flags.commanded || (this.#policy.autoUpdate && !failedBefore)) {
      await this.#stage(release, hub);
      await this.#apply(release);
    }
  }

  /** Download through the hub, verify, extract and try the candidate binary. */
  async #stage(release: SignedRelease, hub: string): Promise<void> {
    const { manifest } = release;
    if (this.#staged === manifest.version) {
      return;
    }
    const target = `${process.platform}-${process.arch}`;
    const artifact = manifest.artifacts.find((row) => row.target === target);
    if (!artifact) {
      throw new Error(`This release has no build for ${target}`);
    }
    await this.#set({ phase: "downloading" });
    const response = await fetch(
      `${hub}/api/binary-updates/artifacts/${encodeURIComponent(manifest.version)}/${encodeURIComponent(artifact.archive)}`,
      { signal: AbortSignal.timeout(600_000) }
    );
    if (!response.ok) {
      throw new Error(`The hub could not supply the build: ${response.status}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!archiveMatches(manifest, target, bytes)) {
      throw new Error(
        "The downloaded build does not match the signed manifest"
      );
    }
    const directory = versionDirectory(manifest.version);
    const work = `${directory}.partial`;
    await rm(work, { recursive: true, force: true });
    const archive = join(binaryRoot(), `${manifest.version}.tar.gz`);
    await Bun.write(archive, bytes);
    await Bun.$`mkdir -p ${work} && tar -xzf ${archive} -C ${work} cawco`.quiet();
    await rm(archive, { force: true });
    const binary = join(work, "cawco");
    const extracted = await Bun.file(binary).bytes();
    if (
      extracted.byteLength !== artifact.binarySize ||
      new Bun.CryptoHasher("sha256").update(extracted).digest("hex") !==
        artifact.binarySha256
    ) {
      throw new Error(
        "The extracted binary does not match the signed manifest"
      );
    }
    await Bun.$`chmod 700 ${binary}`.quiet();
    await writeJsonAtomic(join(work, "release.json"), manifest);
    await writeJsonAtomic(join(work, "release.signature.json"), {
      signature: release.signature,
    });
    await rm(directory, { recursive: true, force: true });
    await rename(work, directory);
    this.#staged = manifest.version;
    await this.#set({ phase: "ready" });
  }

  async #apply(release: SignedRelease): Promise<void> {
    if (!(await mayReplaceMachineServices(this.#readBusy))) {
      await this.#set({ phase: "ready" });
      return;
    }
    const keeper = await readKeeper();
    if (
      keeper.held > 0 &&
      !keeper.capabilities.includes(release.manifest.sessiondProtocol)
    ) {
      // The new agent could not speak to the keeper that holds the sessions:
      // the whole machine's update waits, and nothing is ended to make room.
      await this.#set({ phase: "waiting-sessions", heldChildren: keeper.held });
      return;
    }
    await this.#set({ phase: "installing", heldChildren: undefined });
    this.#flags.commanded = false;
    await launchApplyHelper(release.manifest.version, keeper.held);
  }

  /** The keeper advances only once it holds nothing. */
  async #advanceKeeper(keeperVersion: string): Promise<void> {
    if (keeperVersion === runtimeVersion) {
      if (this.#state.phase === "waiting-sessions") {
        await this.#set({ phase: "installed", heldChildren: undefined });
      }
      return;
    }
    const keeper = await readKeeper();
    if (keeper.held > 0) {
      await this.#set({
        phase: "waiting-sessions",
        heldChildren: keeper.held,
        sessiondVersion: keeperVersion,
      });
      return;
    }
    if (await mayReplaceMachineServices(this.#readBusy)) {
      await this.#set({ phase: "installing", heldChildren: undefined });
      await launchApplyHelper(runtimeVersion, 0);
    }
  }
}

let latest: BinaryUpdateState | undefined;
export const latestBinaryUpdate = (): BinaryUpdateState | undefined => latest;
export const reportBinaryUpdate = (state: BinaryUpdateState): void => {
  latest = state;
};
