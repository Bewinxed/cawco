<script lang="ts">
  /**
   * The Mac readiness act reopened later, from the Mac's row in the machines
   * list or its menu: the same act in a thin dialog titled with the Mac's
   * name, at its first unfinished step, with Close as its only way out.
   * Mounted once in the shell, opened through `macReady.show`.
   */
  import { machineLabel } from "@cawco/core";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  import { cawco } from "../client.svelte";
  import MacReady from "./MacReady.svelte";
  import { macReady } from "./mac-ready.svelte";

  const machineId = $derived(macReady.open);
  const readiness = $derived(macReady.of(machineId));
  const name = $derived.by(() => {
    const row = cawco.machines.find((entry) => entry.machineId === machineId);
    return row ? machineLabel(row.hostname) : (machineId ?? "");
  });
  const actions = $derived(macReady.actions);
</script>

<Dialog.Root
  bind:open={
    () => machineId !== null && readiness !== undefined,
    (value) => {
    if (!value) {
      macReady.close();
    }
  }
  }
>
  <!-- On a phone, the viewport less 24px (DESIGN.md, Breakpoints). -->
  <Dialog.Content class="max-w-[calc(100%-24px)] sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>{name}</Dialog.Title>
      <Dialog.Description>Getting it ready for agents.</Dialog.Description>
    </Dialog.Header>

    {#if machineId && readiness && actions}
      <MacReady
        machineName={name}
        onContinue={(stepId) => actions.continue(machineId, stepId)}
        onOpenSettings={(stepId) => actions.openSettings(machineId, stepId)}
        {readiness}
      />
    {/if}

    <Dialog.Footer>
      <Button onclick={() => macReady.close()}>Close</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
