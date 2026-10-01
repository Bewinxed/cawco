/**
 * Adding a machine, the dashboard's half. One module for every place that
 * does it — the Connect a machine dialog (SSH and Command) and the machines
 * popover's pairing panel — so they read the same addresses, show the same
 * command, and notice a new machine the same way.
 */
import type { JoinInfo, SshJoinJob, SshJoinRequest } from "@cawco/core";
import { cawco, type Machine } from "../client.svelte";

/** The one-liner a machine runs to join: the hub's install script, piped to sh. */
export const installCommand = (hubUrl: string): string =>
  `curl -fsSL ${hubUrl}/install.sh | sh`;

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

const dialog = $state({ open: false });

/** The Connect a machine dialog, mounted once in the shell and opened from anywhere. */
export const addMachine = {
  get open(): boolean {
    return dialog.open;
  },
  set open(value: boolean) {
    dialog.open = value;
  },
  show(): void {
    dialog.open = true;
  },
};

const ssh = $state<{
  job: SshJoinJob | null;
  request: SshJoinRequest | null;
  refused: string | null;
}>({ job: null, request: null, refused: null });

/**
 * The SSH add in flight, or the last one. Held here rather than in the dialog
 * so closing the dialog mid-install and opening it again finds the same run:
 * the hub keeps installing either way.
 */
export const sshJoin = {
  get job(): SshJoinJob | null {
    return ssh.job;
  },
  get request(): SshJoinRequest | null {
    return ssh.request;
  },
  /** Why the hub refused to start one (a bad target, an unlisted address). */
  get refused(): string | null {
    return ssh.refused;
  },
  async start(request: SshJoinRequest): Promise<void> {
    ssh.request = request;
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
    if (!response.ok) {
      ssh.refused =
        (await response.text()) || `The hub answered ${response.status}.`;
      return;
    }
    ssh.job = (await response.json()) as SshJoinJob;
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
