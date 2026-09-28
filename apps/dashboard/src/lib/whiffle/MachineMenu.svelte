<script lang="ts">
  /** Right-click on a machine's heading — what you can do to the box, not to a session. */
  import { UPDATE_WHIFFLE, type UpdateReport } from "@whiffle/core";
  import type { Snippet } from "svelte";
  import { toast } from "svelte-sonner";
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
   */
  async function updateMachine() {
    const updating = machineControl<UpdateReport>(
      machine.machineId,
      UPDATE_WHIFFLE,
      [{ restartAgent: true }],
      UPDATE_TIMEOUT_MS
    );
    toast.promise(updating, {
      loading: `Updating ${machine.hostname}…`,
      success: said,
      error: (err: unknown) =>
        err instanceof Error ? err.message : String(err),
    });
    await updating.catch(() => {
      // toast.promise above already reported the failure.
    });
  }
</script>

<ContextMenu.Root>
  <ContextMenu.Trigger class="contents">
    {@render children()}
  </ContextMenu.Trigger>

  <ContextMenu.Content>
    <ContextMenu.Item onSelect={() => loadCatalog(machine.machineId)}>
      <IconRefresh />
      Reload sessions
    </ContextMenu.Item>
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
    <ContextMenu.Item
      onSelect={() => {
        // biome-ignore lint/complexity/noVoid: fire-and-forget; toast.promise above already tracks the outcome
        void updateMachine();
      }}
    >
      <IconDownload />
      Update this machine
    </ContextMenu.Item>

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
