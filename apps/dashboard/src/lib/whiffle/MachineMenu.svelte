<script lang="ts" module>
  import { SvelteMap } from "svelte/reactivity";

  /**
   * An update this tab started on a machine, which the fleet board's build
   * chip reads. `since` is the daemon start the machine reported as the
   * update began: a restarted agent reports a new one, and until it does the
   * chip reads "Updating…". `said` is what the update did, in one line.
   */
  export interface MachineUpdate {
    said?: string;
    since: number | undefined;
    /** The update ran and restarted nothing: there is no new build to wait for. */
    settled: boolean;
  }
  export const machineUpdates = new SvelteMap<string, MachineUpdate>();

  /** The chip reads "Updating…": the update runs, or its restart has not reported yet. */
  export function isUpdating(machine: {
    build?: { startedAt: number };
    machineId: string;
  }): boolean {
    const update = machineUpdates.get(machine.machineId);
    return Boolean(
      update && !update.settled && machine.build?.startedAt === update.since
    );
  }
</script>

<script lang="ts">
  /** Right-click on a machine's heading — what you can do to the box, not to a session. */
  import { UPDATE_WHIFFLE, type UpdateReport } from "@whiffle/core";
  import type { Snippet } from "svelte";
  import { goto } from "$app/navigation";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as ContextMenu from "$lib/components/ui/context-menu";
  import { UPDATE_TIMEOUT_MS } from "$lib/config";
  import { IconDownload, IconKey, IconPlus, IconRefresh } from "$lib/icons";
  import { loadCatalog, type Machine, machineControl } from "./client.svelte";
  import MachineLogin from "./MachineLogin.svelte";
  import UnlockKeychain from "./UnlockKeychain.svelte";

  let { machine, children }: { machine: Machine; children: Snippet } = $props();

  /** Only macOS has a keychain that locks; offering it elsewhere is noise. */
  const isMac = $derived(/darwin|mac/i.test(machine.os));
  /**
   * The keychain workaround is offered only to the machine that is actually
   * stuck behind one. Logging in is offered always — it is the fix, and it
   * leaves the machine holding a token that no lock can hide.
   */
  const stuck = $derived(machine.auth === "unreadable-credentials");
  let unlocking = $state(false);
  let loggingIn = $state(false);
  /** Why the last update failed, said on its menu item. */
  let updateFailed = $state<string | null>(null);

  /** What an {@link UpdateReport} amounts to, in one line. */
  function said(report: UpdateReport): string {
    const moved =
      report.to === report.from
        ? `${machine.hostname} was already on ${report.from}`
        : `${machine.hostname}: ${report.from} → ${report.to}`;
    const restarted =
      report.restarted.length > 0
        ? `, restarted ${report.restarted.join(", ")}`
        : "";
    return report.skipped
      ? `${moved}${restarted} — ${report.skipped}`
      : `${moved}${restarted}`;
  }

  /**
   * Brings the machine onto the current checkout: pull, install, rebuild,
   * restart. This is the only thing that moves the Claude Code its sessions
   * run — the harness spawns the agent SDK's own pinned build, so the `claude`
   * on the machine's PATH is not what any session ever launches, and updating
   * it moved nothing. The agent is restarted too, but only once it is idle:
   * sessions already running keep the build they launched with either way.
   *
   * The item spins while it runs and says a failure on itself; the machine's
   * build chip on the board reads "Updating…" from the start until the
   * restarted agent reports its new build, and carries what the update did.
   */
  async function updateMachine() {
    updateFailed = null;
    const { machineId } = machine;
    machineUpdates.set(machineId, {
      since: machine.build?.startedAt,
      settled: false,
    });
    try {
      const report = await machineControl<UpdateReport>(
        machineId,
        UPDATE_WHIFFLE,
        [{ restartAgent: true }],
        UPDATE_TIMEOUT_MS
      );
      machineUpdates.set(machineId, {
        since: machineUpdates.get(machineId)?.since,
        settled: !report.restarted.includes("agent"),
        said: said(report),
      });
    } catch (err) {
      machineUpdates.delete(machineId);
      updateFailed = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }
</script>

<ContextMenu.Root>
  <ContextMenu.Trigger class="contents">
    {@render children()}
  </ContextMenu.Trigger>

  <ContextMenu.Content>
    <ContextMenu.PendingItem
      icon={IconRefresh}
      label="Reload sessions"
      pendingLabel="Reloading…"
      run={() => loadCatalog(machine.machineId)}
    />
    <!-- The form reads `machine` out of the query and preselects it. -->
    <ContextMenu.Item
      onSelect={() => goto(`/session?machine=${machine.machineId}`)}
    >
      <IconPlus />
      New session here
    </ContextMenu.Item>
    <ContextMenu.Item
      onSelect={() => {
        loggingIn = true;
      }}
    >
      <IconKey />
      Log in…
    </ContextMenu.Item>
    {#if isMac && stuck}
      <ContextMenu.Item
        onSelect={() => {
          unlocking = true;
        }}
      >
        <IconKey />
        Unlock keychain…
      </ContextMenu.Item>
    {/if}
    <ContextMenu.PendingItem
      icon={IconDownload}
      label="Update this machine"
      pendingLabel="Updating…"
      run={updateMachine}
    >
      {#if updateFailed}
        <span
          class="ml-auto max-w-56 truncate text-meta text-destructive"
          title={updateFailed}>{updateFailed}</span
        >
      {/if}
    </ContextMenu.PendingItem>

    <ContextMenu.Separator />

    <ContextMenu.CopyItem text={machine.machineId} what="Machine id">
      Copy machine id
    </ContextMenu.CopyItem>
    <ContextMenu.CopyItem text={machine.hostname} what="Hostname">
      Copy hostname
    </ContextMenu.CopyItem>
  </ContextMenu.Content>
</ContextMenu.Root>

<MachineLogin {machine} bind:open={loggingIn} />
{#if isMac}
  <UnlockKeychain {machine} bind:open={unlocking} />
{/if}
