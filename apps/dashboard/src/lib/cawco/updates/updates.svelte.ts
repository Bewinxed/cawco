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
import { SvelteSet } from "svelte/reactivity";
import { newId } from "../id";
import { toast } from "../toasts";
import { installable, type UpdateMachine } from "./model";

const JSON_HEADERS = { "Content-Type": "application/json" };

class Updates {
  policy = $state<BinaryUpdatePolicy | null>(null);
  channels = $state<BinaryUpdateChannels | null>(null);
  /** The settings request failed and there is no policy to show. */
  problem = $state<string | null>(null);
  /** Machines whose install this tab commanded. */
  commanded = new SvelteSet<string>();

  async loadPolicy(): Promise<void> {
    try {
      const response = await fetch("/api/binary-updates/settings");
      if (!response.ok) {
        throw new Error(`the hub answered ${response.status}`);
      }
      this.policy = (await response.json()) as BinaryUpdatePolicy;
      this.problem = null;
    } catch (error) {
      this.problem = `Could not read the update settings — ${error instanceof Error ? error.message : String(error)}.`;
    }
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
      this.commanded.delete(machineId);
      toast.error(
        `${name} is not connected, so nothing was installed. Try again when it is back.`
      );
    } else if (response.status === 500) {
      this.commanded.delete(machineId);
      toast.error(
        `${name} could not start the update. ${await errorText(response)}`
      );
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

  async cancel(machine: UpdateMachine): Promise<void> {
    this.commanded.delete(machine.machineId);
    await fetch(`/api/binary-updates/machines/${machine.machineId}/cancel`, {
      method: "POST",
    }).catch(() => null);
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
