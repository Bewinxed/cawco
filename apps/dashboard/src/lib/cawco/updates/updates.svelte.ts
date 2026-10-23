/**
 * The update settings and the actions on a machine's update, in one place.
 * What a machine is doing arrives on the socket as `machine.binaryUpdate`;
 * nothing here polls it. This module does not import the client: callers pass
 * the machines in, so the client can call `loadPolicy` without a cycle.
 */
import { machineLabel, updatesWords } from "@cawco/core";
import type {
  BinaryUpdateChannels,
  BinaryUpdatePolicy,
} from "@cawco/core/binary-updates";
import { SvelteMap, SvelteSet } from "svelte/reactivity";
import { failureClause, hubFailure, hubRefusal } from "#lib/cawco/hub-read.js";
import { newId } from "../id";
import { readJson, writeJson } from "../storage";
import { installable, type Refusal, type UpdateMachine } from "./model";

/** A setting on Configure › Updates whose save the hub can refuse. */
export type UpdateSetting = "channel" | "auto" | "check";

/**
 * What the hub refused of a setting: said under that setting in words,
 * with Try again, until the reader acts on it. `policy` is what was asked
 * for, so Try again asks for it again.
 */
export interface SettingRefusal {
  policy?: BinaryUpdatePolicy;
  reason: string;
}

/**
 * What this tab asked of the machines' updates, kept in the tab's own
 * storage (DESIGN.md, The Work Outlives Its Surface Rule): the installs it
 * commanded, which the panel's installing notice follows, and what the hub
 * refused, said until the reader acts on it. A reload keeps both; the phase
 * each machine stands in comes from the hub.
 */
const KEPT = "cawco:update-commands";

interface Kept {
  commanded: string[];
  refused: [string, Refusal][];
  settings?: [UpdateSetting, SettingRefusal][];
}

const JSON_HEADERS = { "Content-Type": "application/json" };

class Updates {
  policy = $state<BinaryUpdatePolicy | null>(null);
  channels = $state<BinaryUpdateChannels | null>(null);
  /** The settings request failed and there is no policy to show. */
  problem = $state<string | null>(null);
  /**
   * The hub's update policy record is damaged (it answered 409 with its
   * words, in `problem`): updates are off, and Reset is the way out.
   */
  damaged = $state(false);
  /** Machines whose install this tab commanded. */
  readonly commanded: SvelteSet<string>;
  /**
   * What the hub said when it refused an install or a cancel, by machine:
   * said under that machine's row and its Update cell, where it was asked,
   * and in Caw's panel, where the update is parked; kept until the reader
   * acts on it (Retry, or the notice's ✕).
   */
  readonly refused: SvelteMap<string, Refusal>;
  /**
   * What the hub refused of a setting (the channel, automatic updates, the
   * check for new builds), by setting: said under it on Configure ›
   * Updates, never a toast, until a try goes.
   */
  readonly settingRefused: SvelteMap<UpdateSetting, SettingRefusal>;

  constructor() {
    const kept = readJson<Kept>(
      KEPT,
      { commanded: [], refused: [] },
      "session"
    );
    this.commanded = new SvelteSet(kept.commanded);
    this.refused = new SvelteMap(kept.refused);
    this.settingRefused = new SvelteMap(kept.settings ?? []);
  }

  /** Writes what this tab asked to the tab's storage, so a reload keeps it. */
  private keep(): void {
    writeJson(
      KEPT,
      {
        commanded: [...this.commanded],
        refused: [...this.refused],
        settings: [...this.settingRefused],
      },
      "session"
    );
  }

  /** This tab's installs are forgotten: their outcome was said and seen. */
  forgetCommanded(): void {
    this.commanded.clear();
    this.keep();
  }

  /** A refusal acknowledged (the notice's ✕): nothing more is said of it. */
  forgetRefusal(machineIds: readonly string[]): void {
    for (const id of machineIds) {
      this.refused.delete(id);
    }
    this.keep();
  }

  /** A machine's refusal with its way on: what refused runs again. */
  refusalOf(
    machine: UpdateMachine
  ): { again: () => Promise<void>; reason: string } | null {
    const refusal = this.refused.get(machine.machineId);
    return refusal
      ? { reason: refusal.reason, again: () => this.again(machine) }
      : null;
  }

  /** What the hub refused on `machine`, asked again. */
  again(machine: UpdateMachine): Promise<void> {
    return this.refused.get(machine.machineId)?.act === "cancel"
      ? this.cancel(machine)
      : this.installNow(machine);
  }

  async loadPolicy(): Promise<void> {
    try {
      const response = await fetch("/api/binary-updates/settings");
      // Its record damaged: the hub's own words, and Reset offered.
      if (response.status === 409) {
        this.policy = null;
        this.damaged = true;
        this.problem = `${(await hubFailure(response)).detail}.`;
        return;
      }
      if (!response.ok) {
        throw new Error(`the hub answered ${response.status}`);
      }
      this.policy = (await response.json()) as BinaryUpdatePolicy;
      this.damaged = false;
      this.problem = null;
    } catch (error) {
      this.problem = `Could not read the update settings — ${failureClause(error)}.`;
    }
  }

  /**
   * Reset: the hub writes a fresh policy record (the one a new hub starts
   * with) and updates come back on. The hub's refusal is the error.
   */
  async resetPolicy(): Promise<void> {
    const response = await fetch("/api/binary-updates/settings/reset", {
      method: "POST",
    });
    if (!response.ok) {
      throw await hubRefusal(
        response,
        "so the update policy was not reset. Try again."
      );
    }
    this.policy = (await response.json()) as BinaryUpdatePolicy;
    this.damaged = false;
    this.problem = null;
    await this.loadChannels();
  }

  /**
   * Saves the channel or automatic updates. A refusal is kept under the
   * setting it was for (`settingRefused`), in words: what did not change,
   * the hub's why, what stays as it is.
   */
  async savePolicy(
    next: BinaryUpdatePolicy,
    setting: "channel" | "auto"
  ): Promise<boolean> {
    this.settingRefused.delete(setting);
    this.keep();
    const response = await fetch("/api/binary-updates/settings", {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        channel: next.channel,
        autoUpdate: next.autoUpdate,
      }),
    }).catch(() => null);
    if (!response?.ok) {
      const why = response
        ? await errorText(response)
        : "the hub did not answer";
      this.settingRefused.set(setting, {
        policy: next,
        reason:
          setting === "channel"
            ? `The channel was not switched to ${next.channel === "nightly" ? "Nightly" : "Stable"}: ${why}. Machines keep the build they run; Try again to switch.`
            : `Automatic updates were not turned ${next.autoUpdate ? "on" : "off"}: ${why}. Nothing changed; Try again to save it.`,
      });
      this.keep();
      return false;
    }
    this.policy = (await response.json()) as BinaryUpdatePolicy;
    await this.loadChannels();
    return true;
  }

  async loadChannels(): Promise<void> {
    const response = await fetch("/api/binary-updates/channels").catch(
      () => null
    );
    if (response?.ok) {
      this.channels = (await response.json()) as BinaryUpdateChannels;
    }
  }

  /** Asks the release server for new builds; a refusal is kept under Check for updates. */
  async refreshChannels(): Promise<boolean> {
    this.settingRefused.delete("check");
    this.keep();
    const response = await fetch("/api/binary-updates/channels", {
      method: "POST",
    }).catch(() => null);
    if (!response?.ok) {
      const why = response
        ? await errorText(response)
        : "the hub did not answer";
      this.settingRefused.set("check", {
        reason: updatesWords.noNewBuilds(why),
      });
      this.keep();
      return false;
    }
    this.channels = (await response.json()) as BinaryUpdateChannels;
    return true;
  }

  /**
   * Queues the install on a machine: it runs once the machine's work in
   * flight has drained, or when its short drain ends, cutting what is left. The
   * answer is not waited on for state. The hub's own machine restarts the hub
   * mid-request and a long install outlives the request, so a 504 or a
   * dropped connection says nothing.
   */
  async installNow(machine: UpdateMachine): Promise<void> {
    const { machineId } = machine;
    const name = machineLabel(machine.hostname);
    this.commanded.add(machineId);
    this.refused.delete(machineId);
    this.keep();
    let response: Response;
    try {
      response = await fetch(`/api/agents/${machineId}/update`, {
        method: "POST",
        headers: JSON_HEADERS,
        // A press is one command, acted on once even if the request is sent
        // again, and for the build this row showed.
        body: JSON.stringify({
          commandId: newId(),
          version: machine.binaryUpdate?.availableVersion,
        }),
      });
    } catch {
      return;
    }
    if (response.status === 404) {
      this.refuse(machineId, {
        act: "install",
        reason: updatesWords.notConnected(name),
      });
    } else if (response.status === 500) {
      this.refuse(machineId, {
        act: "install",
        reason: `${name} could not start the update: ${await errorText(response)}. It keeps the build it runs; Retry to install it again.`,
      });
    }
  }

  private refuse(machineId: string, refusal: Refusal): void {
    this.commanded.delete(machineId);
    this.refused.set(machineId, refusal);
    this.keep();
  }

  /** Every machine with a build to install; the machine that hosts the hub goes last. */
  async installAll(machines: UpdateMachine[], policy: BinaryUpdatePolicy) {
    const rows = installable(machines, policy);
    const hosts = (machine: UpdateMachine) =>
      machine.binaryUpdate?.hostsHub === true;
    await Promise.all(
      [...rows.filter((m) => !hosts(m)), ...rows.filter(hosts)].map((machine) =>
        this.installNow(machine)
      )
    );
  }

  /** Calls a queued install off; a refusal is said on the machine's row. */
  async cancel(machine: UpdateMachine): Promise<void> {
    const { machineId } = machine;
    this.refused.delete(machineId);
    this.keep();
    const response = await fetch(
      `/api/binary-updates/machines/${machineId}/cancel`,
      { method: "POST" }
    ).catch(() => null);
    if (!response?.ok) {
      // The install it meant to call off goes on: still this tab's to follow.
      this.refused.set(machineId, {
        act: "cancel",
        reason: `The install on ${machineLabel(machine.hostname)} was not called off: ${response ? await errorText(response) : "the hub did not answer"}. It still installs; Retry to call it off.`,
      });
      this.keep();
      return;
    }
    this.commanded.delete(machineId);
    this.keep();
  }
}

/** The hub's refusal in one sentence without its stop (hub-read `hubFailure`). */
async function errorText(response: Response): Promise<string> {
  return (await hubFailure(response)).detail;
}

export const updates = new Updates();
