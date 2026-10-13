<script lang="ts" module>
  import type { AskHereRequest } from "./ask-here.svelte";
  import { Asker } from "./confirm.svelte";

  /** One question about the machines at a time, under the row it is about. */
  const machineAsks = new Asker<AskHereRequest>();
</script>

<script lang="ts">
  /**
   * Right-click on a machine's heading — what you can do to the box, not to
   * a session. What it asks stands under the row (`AskHere`).
   */
  import { machineLabel } from "@cawco/core";
  import type { Snippet } from "svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as ContextMenu from "#lib/components/ui/context-menu/index.js";
  import {
    IconDownload,
    IconKey,
    IconPlus,
    IconRefresh,
    IconTrash,
  } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import AskHere from "./AskHere.svelte";
  import type { AskItem } from "./ask-here.svelte";
  import {
    cawco,
    loadCatalog,
    type Machine,
    removeMachine,
  } from "./client.svelte";
  import { resolveSessionTitle } from "./links";
  import { sessionStatus, statusWord } from "./SessionMark.svelte";
  import UnlockKeychain from "./UnlockKeychain.svelte";
  import { updates } from "./updates/updates.svelte";

  let { machine, children }: { machine: Machine; children: Snippet } = $props();

  /** Only macOS has a keychain that locks; offering it elsewhere is noise. */
  const isMac = $derived(/darwin|mac/i.test(machine.os));
  /**
   * The keychain workaround is offered only to the machine that is actually
   * stuck behind one. Signing an account in is Configure → Accounts' work.
   */
  const stuck = $derived(machine.auth === "unreadable-credentials");
  let unlocking = $state(false);
  /**
   * What the machine reports about its update: "Install update now" while a
   * build waits (it queues until the machine is idle). Everything after the
   * press, a failure included, is said on the machine's row (MachinesList).
   */
  const phase = $derived(
    machine.status === "online" ? machine.binaryUpdate?.phase : undefined
  );

  const count = (n: number, noun: string) =>
    `${n} ${noun}${n === 1 ? "" : "s"}`;

  /** Its sessions, as the rail nests them, each with its last word. */
  const sessionsOn = (machineId: string): AskItem[] =>
    cawco.instances
      .filter((row) => row.machineId === machineId)
      .map((row) => {
        const status = sessionStatus(row);
        return {
          id: row.id,
          parentId: row.parentInstanceId ?? null,
          title: resolveSessionTitle({
            title: row.title,
            cwd: row.cwd,
            id: row.id,
          }),
          lead: {
            kind: "session" as const,
            place: row.cwd || row.machineId,
            status,
          },
          status: statusWord(row, status),
        };
      });

  /**
   * Forgets a machine the fleet no longer has — offered only while it is
   * offline, because a connected agent would register straight back. The
   * question stands under the machine's row, in the page (nothing elsewhere
   * breaks while it does): its sessions are what the removal reaches, named;
   * what stays is said too: spend happened, and the machine itself is
   * untouched.
   */
  async function askRemove() {
    const { machineId, hostname } = machine;
    // Every project keeps its folder on the hub: only its places here go.
    const projects = cawco.projects.filter((row) =>
      row.places.some((place) => place.machineId === machineId)
    ).length;
    const sessions = sessionsOn(machineId).length;
    const removed =
      sessions > 0
        ? `${sessions === 1 ? "Its session is" : "Its sessions are"} removed from the fleet`
        : "It has no sessions to remove";
    await machineAsks.ask({
      at: machineId,
      title: `Remove ${machineLabel(hostname)}?`,
      body: `${removed}${projects ? `, and ${count(projects, "project")} ${projects === 1 ? "loses its folders" : "lose their folders"} on it; the projects stay` : ""}. Its spend history stays. If its agent starts again, it rejoins the fleet.`,
      confirmLabel: "Remove machine",
      destructive: true,
      items: () => sessionsOn(machineId),
      pendingLabel: "Removing…",
      run: () => removeMachine(machineId),
    });
  }

  // Back online, it would register straight back: the question goes.
  $effect(() => {
    if (
      machine.status === "online" &&
      machineAsks.pending?.at === machine.machineId
    ) {
      machineAsks.dismiss();
    }
  });
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
<AskHere asker={machineAsks} at={machine.machineId} class="machine-ask" />

{#if isMac}
  <UnlockKeychain {machine} bind:open={unlocking} />
{/if}
