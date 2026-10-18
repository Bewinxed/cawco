<script lang="ts">
  /**
   * The top bar's glass group as the dashboard draws it (BarGroup, with its
   * own Jump, MachinesButton and NeedsCaw on the page's stand-in fleet: two
   * machines, three asks), with Files leading it. `railed` as Shell passes
   * it: the wide bar holds Jump and the machines, the phone's Files and Caw.
   */
  import BarGroup from "#lib/cawco/BarGroup.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import FilesItem from "./FilesItem.svelte";
  import type { Count } from "./fixtures";

  let {
    count,
    take,
    railed,
    open = false,
    onfiles,
  }: {
    count: number;
    take: Count;
    railed: boolean;
    open?: boolean;
    onfiles?: () => void;
  } = $props();
</script>

<Tooltip.Provider>
  <BarGroup {railed}>
    {#snippet lead()}
      <FilesItem {count} {onfiles} {open} {take} />
    {/snippet}
  </BarGroup>
</Tooltip.Provider>
