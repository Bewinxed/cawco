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
import { toast } from "svelte-sonner";
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
   * Queues the install on a machine: it runs when the machine is idle. The
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
        body: "{}",
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

  /**
   * Landings acknowledged here, by `machineId:at`: seen before the socket
   * says so. Keyed by the landing, never by `updatedAt`, which moves with
   * every write the machine makes.
   */
  seen = new SvelteSet<string>();

  /**
   * How many Home update cards are on screen. While one is, the card is the
   * landing's surface and the toast does not say it too.
   */
  cards = $state(0);

  /** The machines with the optimistic `seen` marks applied. */
  withSeen<T extends UpdateMachine>(machines: T[]): T[] {
    return machines.map((machine) => {
      const state = machine.binaryUpdate;
      return state?.landed &&
        this.seen.has(`${machine.machineId}:${state.landed.at}`)
        ? { ...machine, binaryUpdate: { ...state, landed: undefined } }
        : machine;
    });
  }

  /**
   * A person saw the machine's landing: it is cleared on the machine, so it
   * is gone from every tab and device, not only this one.
   */
  async acknowledge(machine: UpdateMachine): Promise<void> {
    const landing = machine.binaryUpdate?.landed;
    if (!landing) {
      return;
    }
    this.seen.add(`${machine.machineId}:${landing.at}`);
    await fetch(
      `/api/binary-updates/machines/${machine.machineId}/acknowledge`,
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ at: landing.at }),
      }
    ).catch(() => null);
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
