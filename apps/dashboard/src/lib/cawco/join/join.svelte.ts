/**
 * Adding a machine, the dashboard's half. One module for every place that
 * does it — the Connect a machine dialog (SSH and Command) and the machines
 * popover's pairing panel — so they read the same addresses, show the same
 * command, and notice a new machine the same way.
 */
import {
  type JoinInfo,
  SSH_ADD_RUNNING_HEADER,
  type SshJoinJob,
  type SshJoinRequest,
} from "@cawco/core";
import { hubRefusal } from "#lib/cawco/hub-read.js";
import { cawco, type Machine } from "../client.svelte";
import { devDebug } from "../dev-debug";
import type { JoinWay } from "./ways";

const info = $state<{ value: JoinInfo | null; error: string | null }>({
  value: null,
  error: null,
});

/**
 * What `/api/join` last said: the hub's addresses (Tailscale first), its SSH
 * key and its name. Read again every time a join surface opens, because an
 * address is only worth offering while the hub still has it.
 */
export const joinInfo = {
  get value(): JoinInfo | null {
    return info.value;
  },
  get error(): string | null {
    return info.error;
  },
  async refresh(): Promise<void> {
    const response = await fetch("/api/join").catch(() => undefined);
    if (response?.ok) {
      info.value = (await response.json()) as JoinInfo;
      info.error = null;
      return;
    }
    info.error = response
      ? `The hub answered ${response.status} when asked for its addresses. Reopen this to try again.`
      : "The hub did not answer when asked for its addresses. Check that it is running, then reopen this.";
  },
};

/**
 * Watches the fleet for a machine that was not in it when watching began —
 * the one signal that a machine someone is setting up has checked in. Made
 * fresh each time a join surface opens, so a machine that was already there
 * never reads as new.
 */
export class CheckIn {
  readonly #known: ReadonlySet<string>;

  constructor() {
    this.#known = new Set(cawco.machines.map((row) => row.machineId));
  }

  /** The first machine online now that was not in the fleet at the start. */
  readonly joined: Machine | undefined = $derived(
    cawco.machines.find(
      (row) => row.status === "online" && !this.#known.has(row.machineId)
    )
  );
}

const dialog = $state<{ open: boolean; way: JoinWay }>({
  open: false,
  way: "ssh",
});

/**
 * The Connect a machine dialog, mounted once in the shell and opened from
 * anywhere. `show` opens it on the way it names, or on the one it was left
 * on.
 */
export const addMachine = {
  get open(): boolean {
    return dialog.open;
  },
  set open(value: boolean) {
    dialog.open = value;
  },
  get way(): JoinWay {
    return dialog.way;
  },
  set way(value: JoinWay) {
    dialog.way = value;
  },
  show(way?: JoinWay): void {
    if (way) {
      dialog.way = way;
    }
    dialog.open = true;
  },
};

const ssh = $state<{
  job: SshJoinJob | null;
  refused: string | null;
}>({ job: null, refused: null });
// The motion bench shows a finished join with no hub behind it (dev-debug.ts).
if (import.meta.env.DEV) {
  devDebug({ sshJoin: ssh });
}

/**
 * The SSH add in flight, or the last one. Held here rather than in the dialog
 * so closing the dialog mid-install and opening it again finds the same run:
 * the hub keeps installing either way.
 */
export const sshJoin = {
  get job(): SshJoinJob | null {
    return ssh.job;
  },
  /** Why the hub refused to start one (a bad target, an unlisted address). */
  get refused(): string | null {
    return ssh.refused;
  },
  /** Sent once and kept nowhere: the request carries the password, if one was typed. */
  async start(request: SshJoinRequest): Promise<void> {
    ssh.refused = null;
    const response = await fetch("/api/machines/ssh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }).catch(() => undefined);
    if (!response) {
      ssh.refused =
        "The hub did not answer, so nothing was started. Check that it is running, then try again.";
      return;
    }
    // An add of that machine already runs (this dialog's own, from before a
    // reload, or another screen's): its progress is shown, nothing new starts.
    const running = response.headers.get(SSH_ADD_RUNNING_HEADER);
    if (response.status === 409 && running) {
      await response.body?.cancel();
      const read = await fetch(
        `/api/machines/ssh/${encodeURIComponent(running)}`
      ).catch(() => undefined);
      if (read?.ok) {
        ssh.job = (await read.json()) as SshJoinJob;
        return;
      }
      ssh.refused = read
        ? (await hubRefusal(read)).message
        : "The hub did not answer, so the add already running could not be shown. Check that it is running, then try again.";
      return;
    }
    if (!response.ok) {
      ssh.refused = (await hubRefusal(response)).message;
      return;
    }
    ssh.job = (await response.json()) as SshJoinJob;
  },
  /**
   * Stops the run in flight: the hub ends its `ssh` and answers once the run
   * reads `stopped`. A refusal (it ended meanwhile) is said like a start's.
   */
  async stop(): Promise<void> {
    const current = ssh.job;
    if (current?.state !== "running") {
      return;
    }
    const response = await fetch(
      `/api/machines/ssh/${encodeURIComponent(current.id)}/stop`,
      { method: "POST" }
    ).catch(() => undefined);
    if (ssh.job?.id !== current.id) {
      return;
    }
    if (response?.ok) {
      ssh.job = (await response.json()) as SshJoinJob;
      return;
    }
    ssh.refused = response
      ? (await hubRefusal(response)).message
      : "The hub did not answer, so the add was not stopped. Check that it is running, then Stop again.";
  },
  /** One read of the run in flight; the dialog calls it every second while it is open. */
  async poll(): Promise<void> {
    const current = ssh.job;
    if (current?.state !== "running") {
      return;
    }
    const response = await fetch(
      `/api/machines/ssh/${encodeURIComponent(current.id)}`
    ).catch(() => undefined);
    if (ssh.job?.id !== current.id) {
      return;
    }
    if (response?.ok) {
      ssh.job = (await response.json()) as SshJoinJob;
    } else if (response?.status === 404) {
      // The hub restarted and its in-memory runs went with it. The install on
      // the machine may well have finished; the fleet board is where it shows.
      ssh.job = { ...current, state: "failed", problem: null };
      ssh.refused =
        "The hub restarted during the install and lost track of it. If the machine shows up in the fleet, it joined; if not, Retry.";
    }
  },
  /** Back to the form: a finished run is dropped, a running one cannot be. */
  reset(): void {
    if (ssh.job?.state !== "running") {
      ssh.job = null;
    }
    ssh.refused = null;
  },
};
