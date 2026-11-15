<script lang="ts">
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { configStore } from "#lib/cawco/config/store.svelte.js";
  import OutOfDate from "#lib/cawco/OutOfDate.svelte";
  import { orderMachines } from "#lib/cawco/rail.svelte.js";
  import { boardStore } from "#lib/cawco/stores/board.svelte.js";
  import {
    toolUpdatesStore,
    updateAllOf,
    writeToolUpdates,
  } from "#lib/cawco/stores/tool-updates.svelte.js";
  import ToolMatrix from "#lib/cawco/ToolMatrix.svelte";

  /**
   * The CLIs each machine carries, machine by machine. Require one on every
   * machine and the hub puts it there — on the machines online now, and on the
   * rest as they come back. First, what isn't at the version CawCo runs and
   * the fleet's one choice for it (OutOfDate).
   */
  const store = configStore();
  const section = sectionOf("cli-tools");
  const machines = $derived(orderMachines(boardStore.machines));
</script>

<SectionFrame
  problem={store.tools.error}
  ready={store.tools.value !== null}
  {section}
>
  {#if store.tools.value}
    {#if machines.length > 0 && store.tools.value.catalog.length > 0}
      <OutOfDate
        catalog={store.tools.value.catalog}
        {machines}
        releases={toolUpdatesStore.releases}
        updateAll={updateAllOf}
        updates={toolUpdatesStore.updates}
        write={writeToolUpdates}
      />
    {/if}
    <ToolMatrix
      catalog={store.tools.value.catalog}
      {machines}
      policies={store.tools.value.policies}
      releases={toolUpdatesStore.releases}
      updates={toolUpdatesStore.updates}
    />
  {/if}
</SectionFrame>
