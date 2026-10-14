/**
 * The update settings and the actions on a machine's update, in one place.
 * What a machine is doing arrives on the socket as `machine.binaryUpdate`;
 * nothing here polls it. This module does not import the client: callers pass
 * the machines in, so the client can call `loadPolicy` without a cycle.
 */
import { machineLabel } from "@cawco/core";
import type {
  BinaryUpdateChannels,
  BinaryUpdatePolicy,
} from "@cawco/core/binary-updates";
import { SvelteMap, SvelteSet } from "svelte/reactivity";
import { failureClause } from "#lib/cawco/hub-read.js";
import { newId } from "../id";
import { toast } from "../toasts";
import { installable, type UpdateMachine } from "./model";

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
  commanded = new SvelteSet<string>();
  /**
   * What the hub said when it refused an install or a cancel, by machine:
   * said under that machine's row and its Update cell, where it was asked.
   */
  refused = new SvelteMap<
    string,
    { again: () => Promise<void>; reason: string }
  >();

  async loadPolicy(): Promise<void> {
    try {
      const response = await fetch("/api/binary-updates/settings");
      // Its record damaged: the hub's own words, and Reset offered.
      if (response.status === 409) {
        this.policy = null;
        this.damaged = true;
        this.problem = await response.text();
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
      throw new Error(
        (await response.text()) ||
          `The hub answered ${response.status}, so the update policy was not reset. Try again.`
      );
    }
    this.policy = (await response.json()) as BinaryUpdatePolicy;
    this.damaged = false;
    this.problem = null;
    await this.loadChannels();
  }

  async savePolicy(next: BinaryUpdatePolicy): Promise<boolean> {
    const response = await fetch("/api/binary-updates/settings", {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        channel: next.channel,
        autoUpdate: next.autoUpdate,
      }),
    }).catch(() => null);
    if (!response?.ok) {
      toast.error("Couldn't save the setting. Nothing changed.");
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

  async refreshChannels(): Promise<boolean> {
    const response = await fetch("/api/binary-updates/channels", {
      method: "POST",
    }).catch(() => null);
    if (!response?.ok) {
      toast.error(
        "Couldn't reach the release server. Machines keep the build they run."
      );
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
    const again = () => this.installNow(machine);
    if (response.status === 404) {
      this.commanded.delete(machineId);
      this.refused.set(machineId, {
        reason: `${name} is not connected, so nothing was installed. Try again when it is back.`,
        again,
      });
    } else if (response.status === 500) {
      this.commanded.delete(machineId);
      this.refused.set(machineId, {
        reason: `${name} could not start the update. ${await errorText(response)}`,
        again,
      });
    }
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
    const response = await fetch(
      `/api/binary-updates/machines/${machineId}/cancel`,
      { method: "POST" }
    ).catch(() => null);
    if (!response?.ok) {
      this.refused.set(machineId, {
        reason: `The install was not called off: ${response ? await errorText(response) : "the hub did not answer"}.`,
        again: () => this.cancel(machine),
      });
      return;
    }
    this.commanded.delete(machineId);
  }
}

async function errorText(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { error?: string };
    return parsed.error ?? text;
  } catch {
    return text;
  }
}

export const updates = new Updates();
