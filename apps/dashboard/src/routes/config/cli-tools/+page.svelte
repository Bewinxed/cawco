<script lang="ts">
  import { cawco } from "#lib/cawco/client.svelte.js";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { configStore } from "#lib/cawco/config/store.svelte.js";
  import { orderMachines } from "#lib/cawco/rail.svelte.js";
  import ToolMatrix from "#lib/cawco/ToolMatrix.svelte";

  /**
   * The CLIs each machine carries, machine by machine. Require one on every
   * machine and the hub puts it there — on the machines online now, and on the
   * rest as they come back.
   */
  const store = configStore();
  const section = sectionOf("cli-tools");
  const machines = $derived(orderMachines(cawco.machines));
</script>

<SectionFrame
  problem={store.tools.error}
  purpose={section.purpose}
  ready={store.tools.value !== null}
  title={section.label}
>
  {#if store.tools.value}
    <ToolMatrix
      catalog={store.tools.value.catalog}
      {machines}
      policies={store.tools.value.policies}
    />
  {/if}
</SectionFrame>
