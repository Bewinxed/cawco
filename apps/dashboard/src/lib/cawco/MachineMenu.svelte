<script lang="ts">
  /** Right-click on a machine's heading — what you can do to the box, not to a session. */
  import { machineLabel } from "@cawco/core";
  import type { Snippet } from "svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as ContextMenu from "#lib/components/ui/context-menu/index.js";
  import {
    IconAlert,
    IconDownload,
    IconKey,
    IconPlus,
    IconRefresh,
    IconTrash,
  } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import {
    cawco,
    loadCatalog,
    type Machine,
    removeMachine,
  } from "./client.svelte";
  import { confirm } from "./confirm.svelte";
  import ErrorDialog from "./ErrorDialog.svelte";
  import MachineLogin from "./MachineLogin.svelte";
  import UnlockKeychain from "./UnlockKeychain.svelte";
  import { updates } from "./updates/updates.svelte";

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
  /**
   * What the machine reports about its update decides the items: "Install
   * update now" while a build waits (it queues until the machine is idle),
   * "Update failed" while the last one failed, opening the whole error.
   */
  const phase = $derived(
    machine.status === "online" ? machine.binaryUpdate?.phase : undefined
  );
  let readingFailure = $state(false);

  const count = (n: number, noun: string) =>
    `${n} ${noun}${n === 1 ? "" : "s"}`;

  /**
   * Forgets a machine the fleet no longer has — offered only while it is
   * offline, because a connected agent would register straight back. What goes
   * is said by number, and what stays is said too: spend happened, and the
   * machine itself is untouched.
   */
  async function askRemove() {
    const { machineId, hostname } = machine;
    const sessions = cawco.instances.filter(
      (row) => row.machineId === machineId
    ).length;
    // A project with a checkout (or its hub folder) elsewhere moves there
    // and stays; only one that lives nowhere else goes.
    const projects = cawco.projects.filter(
      (row) =>
        row.machineId === machineId &&
        !row.places.some(
          (place) => place.machineId !== machineId && place.kind !== "workspace"
        )
    ).length;
    await confirm({
      title: `Remove ${machineLabel(hostname)}?`,
      body: `Its ${count(sessions, "session")} and ${count(projects, "project")} are removed from the fleet. Its spend history stays. If its agent starts again, it rejoins the fleet.`,
      confirmLabel: "Remove machine",
      destructive: true,
      pendingLabel: "Removing…",
      run: () => removeMachine(machineId),
    });
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
    <!-- The board reads `spawn` out of the query and preselects it. -->
    <ContextMenu.Item
      onSelect={() => goto(`/session?spawn=${machine.machineId}`)}
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
    {#if phase === "available"}
      <ContextMenu.Item onSelect={() => updates.installNow(machine)}>
        <IconDownload />
        Install update now
      </ContextMenu.Item>
    {/if}
    {#if phase === "failed" || phase === "failed-rolled-back"}
      <ContextMenu.Item
        onSelect={() => {
          readingFailure = true;
        }}
        variant="destructive"
      >
        <IconAlert />
        Update failed
      </ContextMenu.Item>
    {/if}

    <ContextMenu.Separator />

    <ContextMenu.CopyItem text={machine.machineId} what="Machine id">
      Copy machine id
    </ContextMenu.CopyItem>
    <ContextMenu.CopyItem text={machine.hostname} what="Hostname">
      Copy hostname
    </ContextMenu.CopyItem>
    {#if machine.status !== "online"}
      <ContextMenu.Separator />
      <ContextMenu.Item onSelect={askRemove} variant="destructive">
        <IconTrash />
        Remove machine…
      </ContextMenu.Item>
    {/if}
  </ContextMenu.Content>
</ContextMenu.Root>

<MachineLogin {machine} bind:open={loggingIn} />
{#if phase === "failed" || phase === "failed-rolled-back"}
  <ErrorDialog
    message={machine.binaryUpdate?.error ?? "The machine did not say why."}
    title="Update failed on {machine.hostname}"
    bind:open={readingFailure}
  />
{/if}
{#if isMac}
  <UnlockKeychain {machine} bind:open={unlocking} />
{/if}
